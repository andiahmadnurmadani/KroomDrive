/**
 * SSH Connection Pool
 * Manages persistent SFTP/SSH connections per server.
 * Supports two connection types:
 *   - direct    → standard SSH via IP:port
 *   - cloudflare → SSH over Cloudflare Tunnel (WebSocket proxy)
 */
const { Client } = require('ssh2');
const WebSocket = require('ws');
const db = require('./db');

// Cache: serverId → { client, sftp, lastUsed, ready }
const pool = new Map();
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup idle connections
setInterval(() => {
  const now = Date.now();
  for (const [serverId, entry] of pool.entries()) {
    if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
      console.log(`[SSH] Closing idle connection to server ${serverId}`);
      try { entry.client.end(); } catch (_) {}
      pool.delete(serverId);
    }
  }
}, 60_000);

/**
 * Build SSH connect config from server record.
 * Handles both direct and Cloudflare tunnel connections.
 */
async function buildConnectConfig(server) {
  const cfg = {
    username: server.username,
    readyTimeout: 20000,
  };

  // Auth: private key takes priority over password
  if (server.private_key) {
    cfg.privateKey = server.private_key;
  } else if (server.password) {
    cfg.password = server.password;
  }

  const connType = server.conn_type || 'direct';

  if (connType === 'cloudflare') {
    // ── Cloudflare Tunnel: uses cloudflared as ProxyCommand ───────────────
    // Equivalent to: ssh -o ProxyCommand="cloudflared access ssh --hostname %h" user@host
    // ssh2 doesn't support ProxyCommand natively, so we spawn cloudflared as
    // a child process and pipe its stdio as the socket for ssh2.
    const tunnelUrl = server.tunnel_url;
    if (!tunnelUrl) throw new Error('tunnel_url is required for Cloudflare tunnel connections');

    // Strip protocol prefix to get bare hostname
    const hostname = tunnelUrl
      .replace(/^https?:\/\//, '')
      .replace(/^wss?:\/\//, '')
      .replace(/\/.*$/, '')
      .trim();

    if (!hostname) throw new Error(`Invalid tunnel_url: "${tunnelUrl}"`);

    // Check cloudflared is available
    const { execSync } = require('child_process');
    try {
      execSync('cloudflared --version', { stdio: 'ignore', timeout: 5000 });
    } catch (_) {
      throw new Error(
        'cloudflared is not installed or not in PATH on the backend server. ' +
        'Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
      );
    }

    // Spawn cloudflared access ssh as a proxy process
    const { spawn } = require('child_process');
    const cfArgs = ['access', 'ssh', '--hostname', hostname];

    // If Service Tokens are configured, pass them as env vars
    const cfEnv = { ...process.env };
    if (server.cf_service_token_id)     cfEnv.CF_ACCESS_CLIENT_ID     = server.cf_service_token_id;
    if (server.cf_service_token_secret) cfEnv.CF_ACCESS_CLIENT_SECRET = server.cf_service_token_secret;

    const cfProc = spawn('cloudflared', cfArgs, {
      env: cfEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Collect stderr for diagnostics
    let cfStderr = '';
    cfProc.stderr.on('data', d => { cfStderr += d.toString(); });

    // Wait briefly for cloudflared to start and establish the connection
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // cloudflared started OK (stdio is ready) — resolve even without explicit signal
        resolve(undefined);
      }, 800);

      cfProc.on('error', (err) => {
        clearTimeout(timer);
        if (err.message.includes('ENOENT')) {
          reject(new Error('cloudflared not found in PATH. Install it on the backend server.'));
        } else {
          reject(new Error(`cloudflared failed to start: ${err.message}`));
        }
      });

      cfProc.on('close', (code) => {
        clearTimeout(timer);
        reject(new Error(
          `cloudflared exited early (code ${code}). ${cfStderr.slice(0, 200) || 'Check hostname and Cloudflare Access policy.'}`
        ));
      });
    });

    // Use the cloudflared process stdio as the SSH socket
    // ssh2 accepts any Duplex stream as `sock`
    cfg.sock = cfProc.stdout;

    // Pipe SSH client stdin into cloudflared stdin
    // ssh2 will write to cfg.sock, but for a child process we need a duplex wrapper
    const { Duplex } = require('stream');
    const duplexSock = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        cfProc.stdin.write(chunk, cb);
      },
      final(cb) {
        cfProc.stdin.end(cb);
      },
    });

    cfProc.stdout.on('data', d => duplexSock.push(d));
    cfProc.stdout.on('end', () => duplexSock.push(null));
    cfProc.stdout.on('error', e => duplexSock.destroy(e));

    cfg.sock = duplexSock;
    cfg._cfProc = cfProc; // keep reference to kill on close
  } else {
    // ── Direct connection ─────────────────────────────────────────────────
    cfg.host = server.host;
    cfg.port = server.port || 22;
  }

  return cfg;
}

/**
 * Get or create an SFTP session for a given server.
 */
function getSftp(serverId) {
  return new Promise(async (resolve, reject) => {
    // Return cached connection if alive
    const cached = pool.get(serverId);
    if (cached && cached.ready) {
      cached.lastUsed = Date.now();
      return resolve({ sftp: cached.sftp, client: cached.client, server: cached.server });
    }

    // Fetch server config from DB
    const server = db.prepare('SELECT * FROM servers WHERE id = ? AND enabled = 1').get(serverId);
    if (!server) return reject(new Error('Server not found or disabled'));

    let connectConfig;
    try {
      connectConfig = await buildConnectConfig(server);
    } catch (e) {
      return reject(e);
    }

    const client = new Client();

    client.on('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          client.end();
          return reject(new Error(`SFTP init failed: ${err.message}`));
        }
        const entry = { client, sftp, server, lastUsed: Date.now(), ready: true };
        pool.set(serverId, entry);
        resolve({ sftp, client, server });
      });
    });

    client.on('error', (err) => {
      pool.delete(serverId);
      if (connectConfig._cfProc) {
        try { connectConfig._cfProc.kill(); } catch (_) {}
      }
      reject(new Error(`SSH connection error: ${err.message}`));
    });

    client.on('close', () => {
      pool.delete(serverId);
      if (connectConfig._cfProc) {
        try { connectConfig._cfProc.kill(); } catch (_) {}
      }
    });

    client.connect(connectConfig);
  });
}

/**
 * Execute a shell command on a server via SSH exec channel.
 * @param {string} serverId
 * @param {string} command
 * @returns {Promise<string>} stdout output
 */
function execCommand(serverId, command) {
  return new Promise(async (resolve, reject) => {
    let client;
    try {
      const conn = await getSftp(serverId);
      client = conn.client;
    } catch (e) {
      return reject(e);
    }

    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let errOut = '';
      stream.on('data', (d) => { out += d; });
      stream.stderr.on('data', (d) => { errOut += d; });
      stream.on('close', (code) => {
        if (code !== 0 && errOut) return reject(new Error(errOut.trim()));
        resolve(out.trim());
      });
    });
  });
}

/**
 * Invalidate a cached connection (force reconnect next time).
 */
function invalidate(serverId) {
  const entry = pool.get(serverId);
  if (entry) {
    try { entry.client.end(); } catch (_) {}
    pool.delete(serverId);
  }
}

/**
 * Test connectivity to a server without adding to pool.
 * @returns {Promise<void>}
 */
async function testConnection(host, port, username, password, privateKey, connType, tunnelUrl, cfTokenId, cfTokenSecret) {
  const fakeServer = {
    host, port: port || 22, username, password, private_key: privateKey,
    conn_type: connType || 'direct',
    tunnel_url: tunnelUrl,
    cf_service_token_id: cfTokenId,
    cf_service_token_secret: cfTokenSecret,
  };

  const cfg = await buildConnectConfig(fakeServer);

  return new Promise((resolve, reject) => {
    const client = new Client();

    const timer = setTimeout(() => {
      client.end();
      if (cfg._cfProc) { try { cfg._cfProc.kill(); } catch (_) {} }
      reject(new Error(connType === 'cloudflare'
        ? 'Connection timed out (20s). Verify cloudflared is installed, the hostname is correct, and the Access policy allows this connection.'
        : 'Connection timed out'));
    }, connType === 'cloudflare' ? 20000 : 10000);

    client.on('ready', () => {
      clearTimeout(timer);
      client.end();
      if (cfg._cfProc) { try { cfg._cfProc.kill(); } catch (_) {} }
      resolve();
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      if (cfg._cfProc) { try { cfg._cfProc.kill(); } catch (_) {} }
      reject(new Error(err.message));
    });

    client.connect(cfg);
  });
}

// ─── SFTP Helper Wrappers ───────────────────────────────────────────────────

function sftpReaddir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) return reject(err);
      resolve(list);
    });
  });
}

function sftpStat(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
}

function sftpMkdir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(remotePath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function sftpRename(sftp, oldPath, newPath) {
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function sftpUnlink(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function sftpRmdir(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.rmdir(remotePath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function sftpReadFile(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function sftpWriteFile(sftp, remotePath, buffer) {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on('close', resolve);
    stream.on('error', reject);
    stream.end(buffer);
  });
}

function sftpCreateReadStream(sftp, remotePath) {
  return sftp.createReadStream(remotePath);
}

function sftpCreateWriteStream(sftp, remotePath) {
  return sftp.createWriteStream(remotePath);
}

module.exports = {
  getSftp,
  execCommand,
  invalidate,
  testConnection,
  sftpReaddir,
  sftpStat,
  sftpMkdir,
  sftpRename,
  sftpUnlink,
  sftpRmdir,
  sftpReadFile,
  sftpWriteFile,
  sftpCreateReadStream,
  sftpCreateWriteStream,
};
