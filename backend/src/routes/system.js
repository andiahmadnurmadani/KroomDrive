/**
 * System Routes — App update check & self-update
 * Admin only. Runs git commands on the KroomDrive installation directory.
 */
const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');
const db   = require('../db');

// Root of the KroomDrive installation (two levels up from backend/src)
const APP_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_DIR = path.join(APP_ROOT, 'backend');

router.use(requireAuth);
router.use(requireAdmin);

// ─── Helper: run a shell command synchronously ───────────────────────────────
function runSync(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
  }).trim();
}

// ─── Helper: get git remote URL of the local installation ────────────────────
function getLocalRemoteUrl() {
  try {
    return runSync('git remote get-url origin');
  } catch (_) {
    return '';
  }
}

// ─── Helper: inject token into HTTPS URL ─────────────────────────────────────
function buildCredUrl(remoteUrl, username, token) {
  try {
    if (!remoteUrl.startsWith('http')) return null;
    const u = new URL(remoteUrl);
    u.username = encodeURIComponent(username || 'oauth2');
    u.password = encodeURIComponent(token);
    return u.toString();
  } catch (_) {
    return null;
  }
}

// SSH → HTTPS conversion
function sshToHttps(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const m = url.match(/^git@([^:]+):(.+)$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  const m2 = url.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/);
  if (m2) return `https://${m2[1]}/${m2[2]}`;
  return null;
}

// ─── GET /api/system/update-check ────────────────────────────────────────────
router.get('/update-check', async (req, res) => {
  try {
    const gitDir = path.join(APP_ROOT, '.git');
    if (!fs.existsSync(gitDir)) {
      return res.json({ hasUpdate: false, error: 'Not a git repository — update check unavailable.' });
    }

    // Build fetch command with credentials if available
    const remoteUrl    = getLocalRemoteUrl();
    const httpsUrl     = sshToHttps(remoteUrl);
    const systemCred   = getSystemGitCred();
    const fetchCmd     = buildGitCmdWithCreds('fetch origin --quiet', remoteUrl, httpsUrl, systemCred);

    try {
      runSync(fetchCmd, { timeout: 15000 });
    } catch (fetchErr) {
      return res.json({ hasUpdate: false, error: `Could not reach remote: ${fetchErr.message.slice(0, 200)}` });
    }

    const branch = runSync('git rev-parse --abbrev-ref HEAD');
    const currentCommit = runSync('git rev-parse HEAD').slice(0, 7);

    let remoteCommit = currentCommit;
    let newCommits = [];
    try {
      remoteCommit = runSync(`git rev-parse origin/${branch}`).slice(0, 7);
      const logRaw = runSync(
        `git log HEAD..origin/${branch} --pretty=format:"%H|%an|%ar|%s" --no-merges`
      );
      if (logRaw) {
        newCommits = logRaw.split('\n').filter(Boolean).map(line => {
          const [hash, author, relTime, ...subjectParts] = line.split('|');
          return { hash: hash.slice(0, 7), author, relTime, subject: subjectParts.join('|') };
        });
      }
    } catch (_) {}

    res.json({
      hasUpdate: newCommits.length > 0,
      commits: newCommits,
      currentCommit,
      remoteCommit,
      branch,
      appRoot: APP_ROOT,
      hasCredentials: !!(systemCred),
    });
  } catch (e) {
    res.status(500).json({ hasUpdate: false, error: e.message });
  }
});

// ─── Helper: look up system-level git credentials from DB ────────────────────
// Uses the special server_id='system' for the local KroomDrive repo
function getSystemGitCred() {
  try {
    // Try exact match for system repo first
    const cred = db.prepare(`
      SELECT * FROM git_credentials
      WHERE server_id = 'system'
      LIMIT 1
    `).get();
    if (cred && cred.token) return cred;

    // Fallback: find any credential with matching remote URL pattern
    // stored for any server (user may have saved it via git panel on their repo)
    const remoteUrl = getLocalRemoteUrl();
    if (!remoteUrl) return null;

    // Extract host+path to match against stored tokens
    const httpsUrl = sshToHttps(remoteUrl);
    if (!httpsUrl) return null;

    try {
      const u = new URL(httpsUrl);
      const hostPath = u.hostname + u.pathname.replace(/\.git$/, '');
      const all = db.prepare('SELECT * FROM git_credentials WHERE token IS NOT NULL').all();
      for (const c of all) {
        // Match if the stored repo_path contains the same host/path
        if (c.repo_path && c.repo_path.includes(hostPath.split('/')[0])) {
          return c;
        }
      }
    } catch (_) {}

    return null;
  } catch (_) {
    return null;
  }
}

// ─── Helper: build git command with inline URL credentials ───────────────────
function buildGitCmdWithCreds(gitArgs, remoteUrl, httpsUrl, cred) {
  // Always disable credential.helper to prevent macOS Keychain warnings
  // (-25308 errSecInteractionNotAllowed when running in non-interactive context)
  const noHelper = `-c credential.helper= -c credential.helper=''`;

  if (!cred || !cred.token || !httpsUrl) {
    return `GIT_TERMINAL_PROMPT=0 git ${noHelper} ${gitArgs}`;
  }
  const credUrl = buildCredUrl(httpsUrl, cred.username, cred.token);
  if (!credUrl) {
    return `GIT_TERMINAL_PROMPT=0 git ${noHelper} ${gitArgs}`;
  }
  // Use single-quoted strings to prevent shell interpretation
  const sqEscape = (s) => `'${s.replace(/'/g, "'\\''")}'`;

  // Set credentialed URL, run with no credential helper, restore original
  return [
    `git remote set-url origin ${sqEscape(credUrl)}`,
    `&& { GIT_TERMINAL_PROMPT=0 git ${noHelper} ${gitArgs} 2>&1; _EC=$?; }`,
    `; git remote set-url origin ${sqEscape(remoteUrl)} 2>/dev/null`,
    `; exit \${_EC:-1}`,
  ].join(' ');
}

// ─── POST /api/system/update ──────────────────────────────────────────────────
router.post('/update', (req, res) => {
  const gitDir = path.join(APP_ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    return res.status(400).json({ error: 'Not a git repository' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, message) => {
    try { res.write(`data: ${JSON.stringify({ type, message })}\n\n`); } catch (_) {}
  };

  // Run a shell command, stream stdout/stderr line by line via SSE
  const runStep = (label, shellCmd, cwd = APP_ROOT) => {
    return new Promise((resolve, reject) => {
      send('step', `▶ ${label}`);

      const child = spawn(shellCmd, [], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          PATH: [
            path.join(APP_ROOT, 'node_modules', '.bin'),
            path.join(BACKEND_DIR, 'node_modules', '.bin'),
            process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          ].join(':'),
          CI: 'true',
          GIT_TERMINAL_PROMPT: '0',
          npm_config_yes: 'true',
        },
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${label} timed out after 5 minutes`));
      }, 5 * 60 * 1000);

      child.stdout.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.stderr.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.on('close', code => {
        clearTimeout(timeout);
        if (code === 0) { send('done', `✓ ${label}`); resolve(); }
        else reject(new Error(`${label} failed (exit ${code})`));
      });
      child.on('error', err => { clearTimeout(timeout); reject(err); });
    });
  };

  (async () => {
    try {
      send('start', 'Starting KroomDrive update…');

      // 1. Pull — inject credentials if available
      const remoteUrl  = getLocalRemoteUrl();
      const httpsUrl   = sshToHttps(remoteUrl);
      const systemCred = getSystemGitCred();
      const pullCmd    = buildGitCmdWithCreds('pull origin --ff-only', remoteUrl, httpsUrl, systemCred);

      if (systemCred) {
        send('output', `ℹ Using stored credentials (${systemCred.username || 'token'})`);
      } else {
        send('output', 'ℹ No credentials stored — using existing git config / SSH key');
      }

      await runStep('Pulling latest changes', pullCmd);

      // 2. Install frontend deps — must happen before build so vite exists
      await runStep('Installing frontend packages',
        'npm install --no-audit --no-fund', APP_ROOT);

      // 3. Install backend deps
      await runStep('Installing backend packages',
        'npm install --no-audit --no-fund', BACKEND_DIR);

      // 4. Build frontend — vite path evaluated AFTER install
      const viteBin = path.join(APP_ROOT, 'node_modules', '.bin', 'vite');
      const viteCmd = fs.existsSync(viteBin)
        ? `node "${viteBin}" build`
        : 'npx vite build';

      if (!fs.existsSync(viteBin)) {
        send('output', '⚠ vite not found in node_modules/.bin after install, trying npx…');
      }
      await runStep('Building frontend', viteCmd, APP_ROOT);

      // 5. Restart via PM2
      try {
        await runStep('Restarting app (PM2)', 'pm2 restart kroomdrive --update-env');
      } catch (_) {
        send('output', '⚠ PM2 restart skipped — run: pm2 restart kroomdrive');
      }

      send('complete', '✅ KroomDrive updated successfully! Reloading…');
    } catch (e) {
      send('error', `❌ Update failed: ${e.message}`);
    } finally {
      res.end();
    }
  })();
});

// ─── POST /api/system/git-credentials ────────────────────────────────────────
// Save credentials for the KroomDrive installation repo itself (for update/fetch)
router.post('/git-credentials', async (req, res) => {
  const { username, token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const { v4: uuidv4 } = require('uuid');
    const remoteUrl = getLocalRemoteUrl();

    db.prepare(`
      INSERT INTO git_credentials (id, server_id, repo_path, auth_type, username, token)
      VALUES (?, 'system', ?, 'token', ?, ?)
      ON CONFLICT(server_id, repo_path) DO UPDATE SET
        username = excluded.username,
        token    = excluded.token
    `).run(uuidv4(), remoteUrl || 'system', username || null, token);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/system/git-credentials ─────────────────────────────────────────
router.get('/git-credentials', async (req, res) => {
  try {
    const cred = getSystemGitCred();
    res.json({
      exists: !!cred,
      username: cred?.username || null,
      hasToken: !!(cred?.token),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;


// ─── POST /api/system/update ──────────────────────────────────────────────────
router.post('/update', (req, res) => {
  const gitDir = path.join(APP_ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    return res.status(400).json({ error: 'Not a git repository' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, message) => {
    try { res.write(`data: ${JSON.stringify({ type, message })}\n\n`); } catch (_) {}
  };

  // Run a shell command, stream stdout/stderr line by line via SSE
  const runStep = (label, shellCmd, cwd = APP_ROOT) => {
    return new Promise((resolve, reject) => {
      send('step', `▶ ${label}`);

      const child = spawn(shellCmd, [], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          // Ensure node_modules/.bin is in PATH for any npm scripts that call binaries
          PATH: [
            path.join(APP_ROOT, 'node_modules', '.bin'),
            path.join(BACKEND_DIR, 'node_modules', '.bin'),
            process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          ].join(':'),
          // Prevent npm from opening interactive prompts
          CI: 'true',
          npm_config_yes: 'true',
        },
      });

      // Timeout safety — kill if step takes more than 5 minutes
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${label} timed out after 5 minutes`));
      }, 5 * 60 * 1000);

      child.stdout.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.stderr.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.on('close', code => {
        clearTimeout(timeout);
        if (code === 0) { send('done', `✓ ${label}`); resolve(); }
        else reject(new Error(`${label} failed (exit ${code})`));
      });
      child.on('error', err => { clearTimeout(timeout); reject(err); });
    });
  };

  (async () => {
    try {
      send('start', 'Starting KroomDrive update…');

      // 1. Pull latest code
      await runStep('Pulling latest changes', 'git pull origin --ff-only');

      // 2. Install frontend deps first — vite must exist before build
      await runStep('Installing frontend packages',
        'npm install --no-audit --no-fund', APP_ROOT);

      // 3. Install backend deps
      await runStep('Installing backend packages',
        'npm install --no-audit --no-fund', BACKEND_DIR);

      // 4. Build frontend — evaluate vite path AFTER install completes
      //    so node_modules/.bin/vite is guaranteed to exist
      const viteBin = path.join(APP_ROOT, 'node_modules', '.bin', 'vite');
      let viteCmd;
      if (fs.existsSync(viteBin)) {
        // Use node to invoke vite directly — 100% reliable regardless of PATH
        viteCmd = `node "${viteBin}" build`;
      } else {
        // Last resort: try npx (will download vite if needed)
        send('output', '⚠ vite not found in node_modules/.bin, trying npx…');
        viteCmd = 'npx vite build';
      }
      await runStep('Building frontend', viteCmd, APP_ROOT);

      // 5. Restart via PM2
      try {
        await runStep('Restarting app (PM2)', 'pm2 restart kroomdrive --update-env');
      } catch (_) {
        send('output', '⚠ PM2 restart skipped — restart manually: pm2 restart kroomdrive');
      }

      send('complete', '✅ KroomDrive updated successfully! Reloading…');
    } catch (e) {
      send('error', `❌ Update failed: ${e.message}`);
    } finally {
      res.end();
    }
  })();
});

module.exports = router;
