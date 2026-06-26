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
// IMPORTANT: gitArgs must NOT contain shell metacharacters (|, ;, &, >, <, `, $).
// If you need to combine commands, do it in JavaScript by calling gitExec multiple
// times and joining results — don't try to embed pipes/redirects in gitArgs.
async function gitExec(serverId, remotePath, gitArgs) {
  // Sanitize: prevent shell injection in args
  const safeArgs = gitArgs.replace(/[`$;|&<>]/g, '');
  // Always wrap output in 2>&1 so we capture stderr too
  const cmd = `cd -- "${remotePath}" && git ${safeArgs} 2>&1`;
  return execCommand(serverId, cmd);
}

// ─── Build env prefix for private repo auth ──────────────────────────────────
// Returns credential info from DB for a given server + path
function getStoredCred(serverId, remotePath) {
  try {
    return db.prepare(`
      SELECT * FROM git_credentials
      WHERE server_id = ? AND (
        repo_path = ? OR ? LIKE repo_path || '%'
      )
      ORDER BY LENGTH(repo_path) DESC
      LIMIT 1
    `).get(serverId, remotePath, remotePath) || null;
  } catch (_) {
    return null;
  }
}

// Inject credentials into a git HTTPS remote URL
// https://github.com/user/repo.git  →  https://x-access-token:TOKEN@github.com/user/repo.git
// Uses manual string building to avoid URL constructor quirks with token encoding.
function injectCredsIntoUrl(remoteUrl, username, token) {
  if (!remoteUrl || !remoteUrl.startsWith('http')) return null;
  // Match scheme + (optional existing user:pass@) + rest of URL
  const match = remoteUrl.match(/^(https?:\/\/)(?:[^@/]*@)?(.+)$/);
  if (!match) return null;
  const [, scheme, hostPath] = match;

  // GitHub officially recommends 'x-access-token' as username when using a PAT.
  // The username can technically be anything but x-access-token is safest.
  const rawUser = (username || '').trim() || 'x-access-token';
  const rawTok  = (token || '').trim();

  // URL-encode user and token to be safe (rare special chars get encoded properly)
  const u = encodeURIComponent(rawUser);
  const t = encodeURIComponent(rawTok);

  return `${scheme}${u}:${t}@${hostPath}`;
}

// Convert SSH remote URL to HTTPS for token auth
// git@github.com:user/repo.git  →  https://github.com/user/repo.git
function sshToHttps(remoteUrl) {
  if (!remoteUrl) return null;
  // Already HTTPS
  if (remoteUrl.startsWith('https://') || remoteUrl.startsWith('http://')) return remoteUrl;
  // SSH format: git@github.com:user/repo.git
  const sshMatch = remoteUrl.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  // SSH protocol: ssh://git@github.com/user/repo.git
  const sshProtoMatch = remoteUrl.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/);
  if (sshProtoMatch) {
    return `https://${sshProtoMatch[1]}/${sshProtoMatch[2]}`;
  }
  return null;
}

// ─── Patched gitExec that injects credentials via URL rewrite ─────────────────
async function gitExecAuth(serverId, remotePath, gitArgs) {
  const safeArgs = gitArgs.replace(/[`|&<>]/g, '');

  const cred = getStoredCred(serverId, remotePath);

  if (!cred || !cred.token) {
    const cmd = `cd -- "${remotePath}" && GIT_TERMINAL_PROMPT=0 git ${safeArgs} 2>&1`;
    return execCommand(serverId, cmd);
  }

  // Get current remote URL
  let remoteUrl = '';
  try {
    remoteUrl = (await execCommand(serverId, `cd -- "${remotePath}" && git remote get-url origin 2>/dev/null`)).trim();
  } catch (_) {}

  // Convert SSH to HTTPS if needed (token auth requires HTTPS)
  const httpsUrl = sshToHttps(remoteUrl);
  if (!httpsUrl) {
    const cmd = `cd -- "${remotePath}" && GIT_TERMINAL_PROMPT=0 git ${safeArgs} 2>&1`;
    return execCommand(serverId, cmd);
  }

  // Build credentialed URL: https://x-access-token:token@github.com/...
  const credUrl = injectCredsIntoUrl(httpsUrl, cred.username, cred.token);
  if (!credUrl) {
    const cmd = `cd -- "${remotePath}" && GIT_TERMINAL_PROMPT=0 git ${safeArgs} 2>&1`;
    return execCommand(serverId, cmd);
  }

  // Use single-quoted strings to prevent shell interpretation of $, `, etc.
  // Tokens are URL-safe so they won't contain single quotes, but escape just in case.
  const sqEscape = (s) => `'${s.replace(/'/g, "'\\''")}'`;
  const credUrlQ = sqEscape(credUrl);
  const origUrlQ = sqEscape(remoteUrl);

  // Strategy:
  // 1. Save original remote URL
  // 2. Set credentialed URL (no log of the URL itself for security)
  // 3. Run the git operation with credential.helper="" to PREVENT git from
  //    trying to save creds to keychain/store (macOS Keychain returns -25308 error)
  // 4. ALWAYS restore original URL (even if op failed)
  // 5. Exit with the op's exit code
  const cmd = [
    `cd -- "${remotePath}"`,
    `&& git remote set-url origin ${credUrlQ}`,
    `&& { GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c credential.helper='' ${safeArgs} 2>&1; _EC=$?; }`,
    `; git remote set-url origin ${origUrlQ} 2>/dev/null`,
    `; exit \${_EC:-1}`,
  ].join(' ');

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
      cd -- "${remotePath}" 2>/dev/null || exit 1
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
    // Sanitize file path — strip shell-meaningful chars
    const safeFile = file ? `"${String(file).replace(/[`$;|&<>"]/g, '')}"` : '';

    // Try diff vs HEAD first (shows staged + unstaged) — fall back to plain diff if no HEAD
    let output = '';
    try {
      output = await gitExec(serverId, remotePath, `diff HEAD ${safeFile}`);
    } catch (_) {
      output = await gitExec(serverId, remotePath, `diff ${safeFile}`).catch(() => '');
    }
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
    const cmd = `cd -- "${remotePath}" && ${addCmd}git commit -m "${safeMsg}" 2>&1`;
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
    // Get all tags — slice in JS to avoid pipes in shell (sanitizer strips |)
    const output = await gitExec(serverId, remotePath,
      'tag --sort=-creatordate --format="%(refname:short)|%(creatordate:short)|%(subject)"'
    );
    const tags = output.split('\n').filter(Boolean).slice(0, 30).map(line => {
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

    // Aggressively clean: strip ALL whitespace and control chars from token
    const cleanToken = (token || '').replace(/[\s\r\n\t\0]/g, '');
    // Username: trim only
    const cleanUser  = (username || '').trim() || null;

    if (cleanToken.length < 10) {
      return res.status(400).json({ error: 'Token looks too short — paste the full token' });
    }

    db.prepare(`
      INSERT INTO git_credentials (id, server_id, repo_path, auth_type, username, token)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id, repo_path) DO UPDATE SET
        auth_type = excluded.auth_type,
        username  = excluded.username,
        token     = excluded.token
    `).run(uuidv4(), serverId, remotePath, authType, cleanUser, cleanToken);

    res.json({ success: true, tokenLength: cleanToken.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/git/credentials/test — verify credentials work BEFORE saving
router.post('/credentials/test', async (req, res) => {
  const { path: inputPath, username, token } = req.body;
  if (!inputPath || !token) return res.status(400).json({ error: 'path and token required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);

    // Get current remote URL
    const remoteUrl = (await execCommand(serverId, `cd -- "${remotePath}" && git remote get-url origin 2>/dev/null`)).trim();
    if (!remoteUrl) return res.status(400).json({ error: 'No git remote configured for this folder' });

    const httpsUrl = sshToHttps(remoteUrl);
    if (!httpsUrl) return res.status(400).json({ error: 'Cannot convert remote to HTTPS for testing' });

    // Clean token same way we save it
    const cleanToken = token.replace(/[\s\r\n\t\0]/g, '');
    const credUrl = injectCredsIntoUrl(httpsUrl, username, cleanToken);
    if (!credUrl) return res.status(400).json({ error: 'Failed to build credentialed URL' });

    // Test with git ls-remote — quick, doesn't change anything
    // Disable credential.helper to prevent macOS Keychain "failed to store" warnings
    const sqEscape = (s) => `'${s.replace(/'/g, "'\\''")}'`;
    const testCmd = `GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c credential.helper='' ls-remote --heads ${sqEscape(credUrl)} 2>&1`;

    const output = await execCommand(serverId, testCmd);
    const lower = output.toLowerCase();

    if (lower.includes('authentication failed') ||
        lower.includes('invalid username or token') ||
        lower.includes('password authentication') ||
        lower.includes('could not read')) {
      return res.json({ ok: false, error: 'Authentication failed — check your token has repo scope and is not expired' });
    }

    if (lower.includes('repository not found') || lower.includes('not found')) {
      return res.json({ ok: false, error: 'Repository not found — token may lack access to this repo' });
    }

    // Success if we got back ref data
    if (output.match(/[0-9a-f]{40}\s+refs\//)) {
      return res.json({ ok: true, message: 'Token is valid — credentials will work' });
    }

    res.json({ ok: false, error: output.slice(-300) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
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
