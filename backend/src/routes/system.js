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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runSync(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
  }).trim();
}

function getLocalRemoteUrl() {
  try { return runSync('git remote get-url origin'); }
  catch (_) { return ''; }
}

// Manual URL credential injection — avoids URL constructor quirks
function buildCredUrl(remoteUrl, username, token) {
  if (!remoteUrl || !remoteUrl.startsWith('http')) return null;
  const match = remoteUrl.match(/^(https?:\/\/)(?:[^@/]*@)?(.+)$/);
  if (!match) return null;
  const [, scheme, hostPath] = match;
  const u = encodeURIComponent((username || '').trim() || 'x-access-token');
  const t = encodeURIComponent((token || '').trim());
  return `${scheme}${u}:${t}@${hostPath}`;
}

function sshToHttps(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const m = url.match(/^git@([^:]+):(.+)$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  const m2 = url.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/);
  if (m2) return `https://${m2[1]}/${m2[2]}`;
  return null;
}

// Find git credentials in DB — tries 'system' server_id first, then any matching host
function findGitCred() {
  try {
    // 1. Exact match for system repo (saved via /api/system/git-credentials)
    const sys = db.prepare(`
      SELECT * FROM git_credentials
      WHERE server_id = 'system' AND token IS NOT NULL
      LIMIT 1
    `).get();
    if (sys && sys.token) return sys;

    // 2. Fallback: match by hostname against any stored credential
    const remoteUrl = getLocalRemoteUrl();
    if (!remoteUrl) return null;
    const httpsUrl = sshToHttps(remoteUrl);
    if (!httpsUrl) return null;

    try {
      const u = new URL(httpsUrl);
      const all = db.prepare('SELECT * FROM git_credentials WHERE token IS NOT NULL').all();
      for (const c of all) {
        if (c.repo_path && c.repo_path.includes(u.hostname)) return c;
      }
    } catch (_) {}
    return null;
  } catch (_) { return null; }
}

// Build a git command that optionally injects credentials transparently
function withCreds(gitArgs) {
  // Suppress macOS Keychain "failed to store" warnings
  const noHelper = `-c credential.helper= -c credential.helper=''`;
  const baseCmd  = `GIT_TERMINAL_PROMPT=0 git ${noHelper} ${gitArgs}`;

  const cred = findGitCred();
  const remoteUrl = getLocalRemoteUrl();
  const httpsUrl  = sshToHttps(remoteUrl);

  if (!cred || !cred.token || !httpsUrl) {
    return baseCmd; // No creds — run as-is (works for public repos / SSH key)
  }

  const credUrl = buildCredUrl(httpsUrl, cred.username, cred.token);
  if (!credUrl) return baseCmd;

  const sq = (s) => `'${s.replace(/'/g, "'\\''")}'`;

  // Temporarily rewrite remote URL with credentials, run command, then restore
  return [
    `git remote set-url origin ${sq(credUrl)}`,
    `&& { ${baseCmd} 2>&1; _EC=$?; }`,
    `; git remote set-url origin ${sq(remoteUrl)} 2>/dev/null`,
    `; exit \${_EC:-1}`,
  ].join(' ');
}

// Try to detect the PM2 process name for KroomDrive
function getPm2ProcessName() {
  try {
    const out = runSync('pm2 jlist 2>/dev/null', { timeout: 5000 });
    const list = JSON.parse(out);
    // Find a process whose script/cwd matches KroomDrive
    const match = list.find(p =>
      (p.pm2_env && (
        p.pm2_env.pm_cwd === APP_ROOT ||
        p.pm2_env.pm_cwd === BACKEND_DIR ||
        (p.pm2_env.pm_cwd || '').includes('kroomdrive') ||
        (p.name || '').toLowerCase().includes('kroomdrive')
      ))
    );
    return match ? match.name : 'kroomdrive';
  } catch (_) {
    return 'kroomdrive';
  }
}

// ─── GET /api/system/update-check ────────────────────────────────────────────
router.get('/update-check', async (req, res) => {
  try {
    if (!fs.existsSync(path.join(APP_ROOT, '.git'))) {
      return res.json({ hasUpdate: false, error: 'Not a git repository — update check unavailable.' });
    }

    try {
      runSync(withCreds('fetch origin --quiet'), { timeout: 15000 });
    } catch (e) {
      return res.json({ hasUpdate: false, error: `Could not reach remote: ${e.message.slice(0, 200)}` });
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
    });
  } catch (e) {
    res.status(500).json({ hasUpdate: false, error: e.message });
  }
});

// ─── POST /api/system/update ──────────────────────────────────────────────────
router.post('/update', (req, res) => {
  if (!fs.existsSync(path.join(APP_ROOT, '.git'))) {
    return res.status(400).json({ error: 'Not a git repository' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, message) => {
    try { res.write(`data: ${JSON.stringify({ type, message })}\n\n`); } catch (_) {}
  };

  const runStep = (label, shellCmd, cwd = APP_ROOT, opts = {}) => {
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
          NPM_CONFIG_LOGLEVEL: 'error',
        },
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${label} timed out after 10 minutes`));
      }, 10 * 60 * 1000);

      child.stdout.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.stderr.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.on('close', code => {
        clearTimeout(timeout);
        if (code === 0) {
          send('done', `✓ ${label}`);
          resolve();
        } else if (opts.ignoreFailure) {
          send('output', `⚠ ${label} returned exit ${code} — continuing anyway`);
          resolve();
        } else {
          reject(new Error(`${label} failed (exit ${code})`));
        }
      });
      child.on('error', err => { clearTimeout(timeout); reject(err); });
    });
  };

  (async () => {
    let stashed = false;
    try {
      send('start', 'Starting KroomDrive update…');

      // Step 1: Check for local changes — stash them to allow clean pull
      let isDirty = false;
      try {
        const status = runSync('git status --porcelain', { timeout: 5000 });
        isDirty = status.trim().length > 0;
      } catch (_) {}

      if (isDirty) {
        send('output', 'ℹ Local changes detected — stashing temporarily');
        try {
          runSync('git stash push --include-untracked -m "kroomdrive-auto-stash"', { timeout: 10000 });
          stashed = true;
        } catch (e) {
          send('output', `⚠ Stash failed: ${e.message.slice(0, 150)} — continuing anyway`);
        }
      }

      // Step 2: Pull (with credentials if needed)
      await runStep('Pulling latest changes', withCreds('pull origin --ff-only'));

      // Step 3: Restore stashed changes if we stashed them
      if (stashed) {
        try {
          runSync('git stash pop', { timeout: 10000 });
          send('output', '✓ Restored local changes');
          stashed = false;
        } catch (e) {
          send('output', `⚠ Could not auto-restore stash. Run manually: git stash pop`);
        }
      }

      // Step 4: Install frontend deps
      await runStep('Installing frontend packages',
        'npm install --no-audit --no-fund', APP_ROOT);

      // Step 5: Install backend deps
      await runStep('Installing backend packages',
        'npm install --no-audit --no-fund', BACKEND_DIR);

      // Step 6: Build frontend
      const viteBin = path.join(APP_ROOT, 'node_modules', '.bin', 'vite');
      const viteCmd = fs.existsSync(viteBin)
        ? `node "${viteBin}" build`
        : 'npx --yes vite build';
      if (!fs.existsSync(viteBin)) {
        send('output', '⚠ vite not found in node_modules/.bin, using npx');
      }
      await runStep('Building frontend', viteCmd, APP_ROOT);

      // Step 7: Restart via PM2 (auto-detect process name)
      const pm2Name = getPm2ProcessName();
      send('output', `ℹ PM2 process name: ${pm2Name}`);
      await runStep(
        `Restarting app (PM2: ${pm2Name})`,
        `pm2 restart ${pm2Name} --update-env 2>/dev/null || pm2 reload ${pm2Name} 2>/dev/null || echo "PM2 not running — start manually"`,
        APP_ROOT,
        { ignoreFailure: true }
      );

      send('complete', '✅ KroomDrive updated successfully! Reloading…');
    } catch (e) {
      // Try to recover stashed changes on failure
      if (stashed) {
        try { runSync('git stash pop', { timeout: 10000 }); } catch (_) {}
      }
      send('error', `❌ Update failed: ${e.message}`);
    } finally {
      res.end();
    }
  })();
});

// ─── Git credentials for system update (still used by gitExecAuth fallback) ──
// We keep these endpoints for backward compat but don't expose them in UI anymore

router.post('/git-credentials', async (req, res) => {
  const { username, token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const { v4: uuidv4 } = require('uuid');
    const remoteUrl = getLocalRemoteUrl();
    const cleanToken = (token || '').replace(/[\s\r\n\t\0]/g, '');
    const cleanUser  = (username || '').trim() || null;

    db.prepare(`
      INSERT INTO git_credentials (id, server_id, repo_path, auth_type, username, token)
      VALUES (?, 'system', ?, 'token', ?, ?)
      ON CONFLICT(server_id, repo_path) DO UPDATE SET
        username = excluded.username,
        token    = excluded.token
    `).run(uuidv4(), remoteUrl || 'system', cleanUser, cleanToken);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/git-credentials', async (req, res) => {
  try {
    const cred = findGitCred();
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
