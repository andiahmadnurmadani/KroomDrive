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
