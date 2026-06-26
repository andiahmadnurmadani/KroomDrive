/**
 * Git Integration Routes
 * All git operations are executed on the remote server via SSH.
 * Requires git to be installed on the remote server.
 */
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { execCommand } = require('../ssh');

// Re-use path resolution from files.js logic
const db = require('../db');

router.use(requireAuth);

// ─── Helper: resolve path → { serverId, remotePath } ────────────────────────
function resolvePath(user, inputPath) {
  if (inputPath.startsWith('srv:')) {
    const afterPrefix = inputPath.slice(4);
    if (afterPrefix.length < 38) throw new Error('Invalid srv: path format');
    const serverId = afterPrefix.slice(0, 36);
    const remotePath = afterPrefix.slice(37) || '/';
    return { serverId, remotePath: remotePath || '/' };
  }

  if (user.role === 'admin') {
    const storages = db.prepare('SELECT * FROM storages WHERE enabled = 1').all();
    for (const s of storages) {
      const norm = (s.root_path || '').replace(/\/+$/, '');
      const normInput = (inputPath || '').replace(/\/+$/, '');
      if (normInput === norm || normInput.startsWith(norm + '/')) {
        return { serverId: s.server_id, remotePath: inputPath };
      }
    }
    const firstServer = db.prepare('SELECT id FROM servers WHERE enabled = 1 LIMIT 1').get();
    if (!firstServer) throw new Error('No servers configured');
    return { serverId: firstServer.id, remotePath: inputPath };
  }

  const perms = db.prepare(`
    SELECT up.*, s.server_id
    FROM user_permissions up
    LEFT JOIN storages s ON s.id = up.storage_id
    WHERE up.user_id = ?
    ORDER BY LENGTH(up.path) DESC
  `).all(user.id);

  const normInput = (inputPath || '').replace(/\/+$/, '');
  for (const perm of perms) {
    const normPerm = (perm.path || '').replace(/\/+$/, '');
    if (normInput === normPerm || normInput.startsWith(normPerm + '/')) {
      return { serverId: perm.server_id, remotePath: inputPath };
    }
  }
  throw new Error('Access denied');
}

// ─── Permission helper ───────────────────────────────────────────────────────
function getPermForPath(user, inputPath) {
  if (user.role === 'admin') return { can_read: 1, can_write: 1 };
  const { checkPathPermission } = require('../middleware/auth');
  return checkPathPermission(user.id, user.role, inputPath);
}

// ─── Safe git exec: always runs inside the repo directory ────────────────────
async function gitExec(serverId, remotePath, gitArgs) {
  // Sanitize: prevent shell injection in args
  const safeArgs = gitArgs.replace(/[`$;|&<>]/g, '');
  const cmd = `cd "${remotePath}" && git ${safeArgs} 2>&1`;
  return execCommand(serverId, cmd);
}

// ─── Build env prefix for private repo auth ──────────────────────────────────
// Returns a shell env prefix like: GIT_ASKPASS=... GIT_USERNAME=... or empty string
function getCredentialEnv(serverId, remotePath) {
  try {
    const cred = db.prepare(`
      SELECT * FROM git_credentials
      WHERE server_id = ? AND (
        repo_path = ? OR ? LIKE repo_path || '%'
      )
      ORDER BY LENGTH(repo_path) DESC
      LIMIT 1
    `).get(serverId, remotePath, remotePath);

    if (!cred) return '';

    if (cred.auth_type === 'token' && cred.token) {
      // For HTTPS remotes: git will use GIT_ASKPASS to supply credentials
      // We write a tiny helper script and use it
      const user = (cred.username || 'oauth2').replace(/'/g, '');
      const tok  = cred.token.replace(/'/g, '').replace(/"/g, '');
      // Use git config credential helper inline approach
      return `GIT_USERNAME='${user}' GIT_PASSWORD='${tok}' GIT_TERMINAL_PROMPT=0 `;
    }
    return '';
  } catch (_) {
    return '';
  }
}

// ─── Patched gitExec that injects credentials ────────────────────────────────
async function gitExecAuth(serverId, remotePath, gitArgs) {
  const safeArgs = gitArgs.replace(/[`$;|&<>]/g, '');
  const envPrefix = getCredentialEnv(serverId, remotePath);

  let cmd;
  if (envPrefix) {
    // Configure inline credential helper that echoes the stored credentials
    cmd = `cd "${remotePath}" && git -c credential.helper='!f() { echo username=$GIT_USERNAME; echo password=$GIT_PASSWORD; }; f' ${safeArgs} 2>&1`;
    cmd = `${envPrefix}${cmd}`;
  } else {
    cmd = `cd "${remotePath}" && git ${safeArgs} 2>&1`;
  }

  return execCommand(serverId, cmd);
}

// ─── GET /api/git/info?path= ─────────────────────────────────────────────────
// Returns full git repo info: branch, remote, status, last commit, ahead/behind
router.get('/info', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);

    // Run all git info queries in parallel as one compound command
    const script = `
      cd "${remotePath}" 2>/dev/null || exit 1
      echo "---BRANCH---"
      git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""
      echo "---REMOTE_URL---"
      git remote get-url origin 2>/dev/null || echo ""
      echo "---REMOTE_NAME---"
      git remote 2>/dev/null | head -1 || echo ""
      echo "---LAST_COMMIT---"
      git log -1 --pretty=format:"%H|%an|%ae|%ar|%s" 2>/dev/null || echo ""
      echo "---STATUS---"
      git status --porcelain 2>/dev/null || echo ""
      echo "---AHEAD_BEHIND---"
      git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "0\t0"
      echo "---STASH---"
      git stash list 2>/dev/null | wc -l | tr -d ' ' || echo "0"
      echo "---TAGS---"
      git describe --tags --abbrev=0 2>/dev/null || echo ""
    `.trim();

    const output = await execCommand(serverId, script.replace(/\n\s*/g, '; '));
    const sections = output.split('---');

    const get = (name) => {
      const idx = sections.findIndex(s => s.trim() === name);
      return idx >= 0 ? (sections[idx + 1] || '').trim() : '';
    };

    const branch   = get('BRANCH');
    const remoteUrl = get('REMOTE_URL');
    const remoteName = get('REMOTE_NAME') || 'origin';
    const lastCommitRaw = get('LAST_COMMIT');
    const statusRaw = get('STATUS');
    const aheadBehind = get('AHEAD_BEHIND');
    const stashCount = parseInt(get('STASH')) || 0;
    const latestTag  = get('TAGS');

    // Parse last commit
    let lastCommit = null;
    if (lastCommitRaw) {
      const [hash, author, email, relTime, ...subjectParts] = lastCommitRaw.split('|');
      lastCommit = { hash, shortHash: hash.slice(0, 7), author, email, relTime, subject: subjectParts.join('|') };
    }

    // Parse status
    const changedFiles = statusRaw
      ? statusRaw.split('\n').filter(Boolean).map(line => ({
          status: line.slice(0, 2).trim(),
          file: line.slice(3),
        }))
      : [];

    // Parse ahead/behind
    const [ahead = 0, behind = 0] = aheadBehind.split(/\s+/).map(Number);

    // Detect repo host (GitHub/GitLab/Bitbucket)
    let repoHost = null;
    let repoSlug = null;
    let repoWebUrl = null;
    if (remoteUrl) {
      const ghMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
      const glMatch = remoteUrl.match(/gitlab\.com[:/](.+?)(?:\.git)?$/);
      const bbMatch = remoteUrl.match(/bitbucket\.org[:/](.+?)(?:\.git)?$/);
      if (ghMatch) { repoHost = 'github'; repoSlug = ghMatch[1]; repoWebUrl = `https://github.com/${ghMatch[1]}`; }
      else if (glMatch) { repoHost = 'gitlab'; repoSlug = glMatch[1]; repoWebUrl = `https://gitlab.com/${glMatch[1]}`; }
      else if (bbMatch) { repoHost = 'bitbucket'; repoSlug = bbMatch[1]; repoWebUrl = `https://bitbucket.org/${bbMatch[1]}`; }
    }

    res.json({
      isGitRepo: !!branch,
      branch,
      remoteName,
      remoteUrl,
      repoHost,
      repoSlug,
      repoWebUrl,
      lastCommit,
      changedFiles,
      ahead,
      behind,
      stashCount,
      latestTag,
      isDirty: changedFiles.length > 0,
    });
  } catch (e) {
    // Not a git repo or git not installed
    res.json({ isGitRepo: false, error: e.message });
  }
});

// ─── GET /api/git/log?path=&limit= ───────────────────────────────────────────
router.get('/log', async (req, res) => {
  const { path: inputPath, limit = '20' } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const output = await gitExec(
      serverId, remotePath,
      `log -${safeLimit} --pretty=format:"%H|%an|%ae|%ar|%ad|%s" --date=short`
    );

    const commits = output.split('\n').filter(Boolean).map(line => {
      const [hash, author, email, relTime, date, ...subjectParts] = line.split('|');
      return { hash, shortHash: hash?.slice(0, 7), author, email, relTime, date, subject: subjectParts.join('|') };
    });

    res.json(commits);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/git/branches?path= ────────────────────────────────────────────
router.get('/branches', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const [localOut, remoteOut] = await Promise.all([
      gitExec(serverId, remotePath, 'branch --format="%(refname:short)"').catch(() => ''),
      gitExec(serverId, remotePath, 'branch -r --format="%(refname:short)"').catch(() => ''),
    ]);

    const local  = localOut.split('\n').filter(Boolean);
    const remote = remoteOut.split('\n').filter(Boolean);

    res.json({ local, remote });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/pull ───────────────────────────────────────────────────────
router.post('/pull', async (req, res) => {
  const { path: inputPath, remote = 'origin', branch } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const args = branch
      ? `pull ${remote} ${branch}`
      : `pull ${remote}`;
    const output = await gitExecAuth(serverId, remotePath, args);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/push ───────────────────────────────────────────────────────
router.post('/push', async (req, res) => {
  const { path: inputPath, remote = 'origin', branch, force = false } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const forceFlag = force ? ' --force' : '';
    const args = branch
      ? `push ${remote} ${branch}${forceFlag}`
      : `push ${remote}${forceFlag}`;
    const output = await gitExecAuth(serverId, remotePath, args);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/fetch ─────────────────────────────────────────────────────
router.post('/fetch', async (req, res) => {
  const { path: inputPath, remote = 'origin' } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const output = await gitExecAuth(serverId, remotePath, `fetch ${remote} --prune`);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/checkout ───────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const { path: inputPath, branch } = req.body;
  if (!inputPath || !branch) return res.status(400).json({ error: 'path and branch required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    // Sanitize branch name
    const safeBranch = branch.replace(/[^a-zA-Z0-9/_.\-]/g, '');
    const output = await gitExec(serverId, remotePath, `checkout ${safeBranch}`);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/status ────────────────────────────────────────────────────
router.post('/status', async (req, res) => {
  const { path: inputPath } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const output = await gitExec(serverId, remotePath, 'status');
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/stash ─────────────────────────────────────────────────────
router.post('/stash', async (req, res) => {
  const { path: inputPath, action = 'save', message } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    let args;
    if (action === 'save') {
      args = message ? `stash push -m "${message.replace(/"/g, '')}"` : 'stash';
    } else if (action === 'pop') {
      args = 'stash pop';
    } else if (action === 'list') {
      args = 'stash list';
    } else if (action === 'drop') {
      args = 'stash drop';
    } else {
      return res.status(400).json({ error: 'Invalid stash action' });
    }
    const output = await gitExec(serverId, remotePath, args);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/git/diff?path=&file= ───────────────────────────────────────────
// Get diff for a specific file or all changed files
router.get('/diff', async (req, res) => {
  const { path: inputPath, file } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const safeFile = file ? `"${String(file).replace(/"/g, '')}"` : '';
    // Show both staged and unstaged diffs
    const output = await gitExec(serverId, remotePath,
      `diff HEAD ${safeFile} 2>/dev/null || diff ${safeFile}`
    );
    res.json({ output: output || '(no diff)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/commit ─────────────────────────────────────────────────────
router.post('/commit', async (req, res) => {
  const { path: inputPath, message, addAll = true } = req.body;
  if (!inputPath || !message) return res.status(400).json({ error: 'path and message required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const safeMsg = message.replace(/"/g, '\\"').replace(/`/g, '');
    const addCmd  = addAll ? 'git add -A && ' : '';
    const cmd = `cd "${remotePath}" && ${addCmd}git commit -m "${safeMsg}" 2>&1`;
    const output = await execCommand(serverId, cmd);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/branch/create ─────────────────────────────────────────────
router.post('/branch/create', async (req, res) => {
  const { path: inputPath, branch, checkout = true } = req.body;
  if (!inputPath || !branch) return res.status(400).json({ error: 'path and branch required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const safeBranch = branch.replace(/[^a-zA-Z0-9/_.\-]/g, '');
    const args = checkout ? `checkout -b ${safeBranch}` : `branch ${safeBranch}`;
    const output = await gitExec(serverId, remotePath, args);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/git/branch ───────────────────────────────────────────────────
router.delete('/branch', async (req, res) => {
  const { path: inputPath, branch, force = false } = req.body;
  if (!inputPath || !branch) return res.status(400).json({ error: 'path and branch required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const safeBranch = branch.replace(/[^a-zA-Z0-9/_.\-]/g, '');
    const flag = force ? '-D' : '-d';
    const output = await gitExec(serverId, remotePath, `branch ${flag} ${safeBranch}`);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/git/tags?path= ──────────────────────────────────────────────────
router.get('/tags', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const output = await gitExec(serverId, remotePath,
      'tag --sort=-creatordate --format="%(refname:short)|%(creatordate:short)|%(subject)" 2>/dev/null | head -30'
    );
    const tags = output.split('\n').filter(Boolean).map(line => {
      const [name, date, ...msgParts] = line.split('|');
      return { name, date, message: msgParts.join('|') };
    });
    res.json(tags);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/git/reset ──────────────────────────────────────────────────────
// Hard reset to HEAD (discard all local changes)
router.post('/reset', async (req, res) => {
  const { path: inputPath, mode = 'hard', ref = 'HEAD' } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  // Only allow safe modes
  if (!['hard', 'soft', 'mixed'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid reset mode' });
  }

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const safeRef = ref.replace(/[^a-zA-Z0-9_.\-~^]/g, '');
    const output = await gitExec(serverId, remotePath, `reset --${mode} ${safeRef}`);
    res.json({ success: true, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/git/remotes?path= ───────────────────────────────────────────────
router.get('/remotes', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const output = await gitExec(serverId, remotePath, 'remote -v');
    const remotes = {};
    output.split('\n').filter(Boolean).forEach(line => {
      const [name, url, type] = line.split(/\s+/);
      if (!remotes[name]) remotes[name] = { fetch: '', push: '' };
      if (type === '(fetch)') remotes[name].fetch = url;
      if (type === '(push)')  remotes[name].push  = url;
    });
    res.json(Object.entries(remotes).map(([name, urls]) => ({ name, ...urls })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Credential management ────────────────────────────────────────────────────

// GET /api/git/credentials?path= — check if credentials exist for this repo
router.get('/credentials', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const cred = db.prepare(`
      SELECT id, auth_type, username, created_at,
             CASE WHEN token IS NOT NULL AND token != '' THEN 1 ELSE 0 END as has_token
      FROM git_credentials
      WHERE server_id = ? AND (repo_path = ? OR ? LIKE repo_path || '%')
      ORDER BY LENGTH(repo_path) DESC LIMIT 1
    `).get(serverId, remotePath, remotePath);

    res.json(cred
      ? { exists: true, authType: cred.auth_type, username: cred.username, hasToken: !!cred.has_token, id: cred.id }
      : { exists: false }
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/git/credentials — save or update credentials for a repo
router.post('/credentials', async (req, res) => {
  const { path: inputPath, authType = 'token', username, token } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });
  if (!token && authType === 'token') return res.status(400).json({ error: 'token required for token auth' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const { v4: uuidv4 } = require('uuid');

    db.prepare(`
      INSERT INTO git_credentials (id, server_id, repo_path, auth_type, username, token)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id, repo_path) DO UPDATE SET
        auth_type = excluded.auth_type,
        username  = excluded.username,
        token     = excluded.token
    `).run(uuidv4(), serverId, remotePath, authType, username || null, token || null);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/git/credentials — remove credentials for a repo
router.delete('/credentials', async (req, res) => {
  const { path: inputPath } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    db.prepare('DELETE FROM git_credentials WHERE server_id = ? AND repo_path = ?').run(serverId, remotePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
