/**
 * System Routes — App update check & self-update
 * Admin only. Runs git commands on the KroomDrive installation directory.
 */
const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

// Root of the KroomDrive installation (two levels up from backend/src)
const APP_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_DIR = path.join(APP_ROOT, 'backend');

router.use(requireAuth);
router.use(requireAdmin);

// ─── Helper: run a shell command synchronously in APP_ROOT ───────────────────
function runSync(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
  }).trim();
}

// ─── GET /api/system/update-check ────────────────────────────────────────────
router.get('/update-check', async (req, res) => {
  try {
    const gitDir = path.join(APP_ROOT, '.git');
    if (!fs.existsSync(gitDir)) {
      return res.json({ hasUpdate: false, error: 'Not a git repository — update check unavailable.' });
    }

    try {
      runSync('git fetch origin --quiet', { timeout: 15000 });
    } catch (fetchErr) {
      return res.json({ hasUpdate: false, error: `Could not reach remote: ${fetchErr.message.slice(0, 120)}` });
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

    res.json({ hasUpdate: newCommits.length > 0, commits: newCommits, currentCommit, remoteCommit, branch, appRoot: APP_ROOT });
  } catch (e) {
    res.status(500).json({ hasUpdate: false, error: e.message });
  }
});

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

      // Always use shell:true with the full command string — never split manually.
      // This ensures node_modules/.bin is resolved correctly by the shell.
      const child = spawn(shellCmd, [], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          // Prepend node_modules/.bin of the project root so vite/etc. is found
          PATH: `${path.join(APP_ROOT, 'node_modules', '.bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
        },
      });

      child.stdout.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.stderr.on('data', d => {
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send('output', l));
      });
      child.on('close', code => {
        if (code === 0) { send('done', `✓ ${label}`); resolve(); }
        else reject(new Error(`${label} failed (exit ${code})`));
      });
      child.on('error', err => reject(err));
    });
  };

  (async () => {
    try {
      send('start', 'Starting KroomDrive update…');

      // 1. Pull
      await runStep('Pulling latest changes', 'git pull origin --ff-only');

      // 2. Install deps
      await runStep('Installing frontend packages',
        'npm install --no-audit --no-fund --prefer-offline', APP_ROOT);
      await runStep('Installing backend packages',
        'npm install --no-audit --no-fund --prefer-offline', BACKEND_DIR);

      // 3. Build frontend
      // Use node_modules/.bin/vite directly to avoid PATH issues
      const viteCmd = fs.existsSync(path.join(APP_ROOT, 'node_modules', '.bin', 'vite'))
        ? `node "${path.join(APP_ROOT, 'node_modules', '.bin', 'vite')}" build`
        : 'npx --no-install vite build';
      await runStep('Building frontend', viteCmd, APP_ROOT);

      // 4. Restart via PM2
      try {
        await runStep('Restarting app (PM2)', 'pm2 restart kroomdrive --update-env');
      } catch (_) {
        send('output', '⚠ PM2 restart skipped — restart manually if needed.');
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
