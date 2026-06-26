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
// Checks if the remote has commits not yet in the local install.
// Returns: { hasUpdate, commits[], currentCommit, remoteCommit, branch }
router.get('/update-check', async (req, res) => {
  try {
    // Verify this is a git repo
    const gitDir = path.join(APP_ROOT, '.git');
    if (!fs.existsSync(gitDir)) {
      return res.json({ hasUpdate: false, error: 'Not a git repository — update check unavailable.' });
    }

    // Fetch latest refs from remote (no merge)
    try {
      runSync('git fetch origin --quiet', { timeout: 15000 });
    } catch (fetchErr) {
      // Fetch failed (offline?) — still return current state
      return res.json({ hasUpdate: false, error: `Could not reach remote: ${fetchErr.message.slice(0, 120)}` });
    }

    const branch = runSync('git rev-parse --abbrev-ref HEAD');
    const currentCommit = runSync('git rev-parse HEAD').slice(0, 7);

    // Check how many commits are behind origin
    let remoteCommit = currentCommit;
    let newCommits = [];
    try {
      remoteCommit = runSync(`git rev-parse origin/${branch}`).slice(0, 7);

      // Get commits that are on origin but not local
      const logRaw = runSync(
        `git log HEAD..origin/${branch} --pretty=format:"%H|%an|%ar|%s" --no-merges`
      );

      if (logRaw) {
        newCommits = logRaw.split('\n').filter(Boolean).map(line => {
          const [hash, author, relTime, ...subjectParts] = line.split('|');
          return {
            hash: hash.slice(0, 7),
            author,
            relTime,
            subject: subjectParts.join('|'),
          };
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
// Performs the full update: git pull → npm install → npm run build → pm2 restart
// Streams progress via Server-Sent Events so the frontend can show live output.
router.post('/update', (req, res) => {
  const gitDir = path.join(APP_ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    return res.status(400).json({ error: 'Not a git repository' });
  }

  // Use SSE to stream update progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, message) => {
    res.write(`data: ${JSON.stringify({ type, message })}\n\n`);
  };

  const runStep = (label, cmd, cwd = APP_ROOT) => {
    return new Promise((resolve, reject) => {
      send('step', `▶ ${label}`);
      const [bin, ...args] = cmd.split(' ');
      const child = spawn(bin, args, { cwd, shell: true });

      child.stdout.on('data', d => send('output', d.toString().trim()));
      child.stderr.on('data', d => send('output', d.toString().trim()));
      child.on('close', code => {
        if (code === 0) {
          send('done', `✓ ${label}`);
          resolve();
        } else {
          reject(new Error(`${label} failed (exit ${code})`));
        }
      });
    });
  };

  (async () => {
    try {
      send('start', 'Starting KroomDrive update…');

      await runStep('Pulling latest changes', 'git pull origin --ff-only');
      await runStep('Installing frontend packages', 'npm install --no-audit --no-fund --prefer-offline');
      await runStep('Installing backend packages', 'npm install --no-audit --no-fund --prefer-offline', path.join(APP_ROOT, 'backend'));
      await runStep('Building frontend', 'npm run build');

      // Try pm2 restart — it might not be available on all systems
      try {
        await runStep('Restarting app (PM2)', 'pm2 restart kroomdrive --update-env');
      } catch (_) {
        send('output', '⚠ PM2 restart skipped (pm2 not found or app not running under PM2)');
        send('output', '  Restart the app manually to apply the update.');
      }

      send('complete', '✅ KroomDrive updated successfully! The page will reload shortly.');
    } catch (e) {
      send('error', `❌ Update failed: ${e.message}`);
    } finally {
      res.end();
    }
  })();
});

module.exports = router;
