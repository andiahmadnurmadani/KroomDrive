const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { requireAuth, checkPathPermission } = require('../middleware/auth');
const {
  getSftp, execCommand,
  sftpReaddir, sftpStat, sftpMkdir, sftpRename,
  sftpUnlink, sftpRmdir, sftpReadFile, sftpWriteFile,
  sftpCreateReadStream, sftpCreateWriteStream,
} = require('../ssh');
const { detectOS, getCommands, parseDfOutput, parseFolderInfo } = require('../osdetect');

const UPLOAD_DIR = process.env.UPLOAD_TEMP_DIR || './data/uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

router.use(requireAuth);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Resolve a user-supplied path to { serverId, remotePath }.
 * For admin: they can pass prefixed paths like "srv:<serverId>:<remote_path>"
 * For regular users: path must match one of their assigned permissions.
 */
function resolvePath(user, inputPath) {
  // Support explicit server prefix: "srv:<serverId>:<remote_path>"
  // Format: srv:<36-char-uuid>:<absolute-path>
  // Example: srv:abc123-...-xyz:/home/files
  if (inputPath.startsWith('srv:')) {
    const afterPrefix = inputPath.slice(4); // strip "srv:"
    // UUID is exactly 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (afterPrefix.length < 38) throw new Error('Invalid srv: path format');
    const serverId = afterPrefix.slice(0, 36);        // first 36 chars = UUID
    const remotePath = afterPrefix.slice(37) || '/';  // char 37 onward (skip the colon)
    return { serverId, remotePath: remotePath || '/' };
  }

  if (user.role === 'admin') {
    // Admin without prefix: try to find a storage that matches
    const storages = db.prepare('SELECT * FROM storages WHERE enabled = 1').all();
    for (const s of storages) {
      const norm = normalizePath(s.root_path);
      const normInput = normalizePath(inputPath);
      if (normInput === norm || normInput.startsWith(norm + '/') || normInput.startsWith(norm + '\\')) {
        return { serverId: s.server_id, remotePath: inputPath };
      }
    }
    // Fallback: use first available server
    const firstServer = db.prepare('SELECT id FROM servers WHERE enabled = 1 LIMIT 1').get();
    if (!firstServer) throw new Error('No servers configured');
    return { serverId: firstServer.id, remotePath: inputPath };
  }

  // Regular user: find matching permission
  const perms = db.prepare(`
    SELECT up.*, s.server_id
    FROM user_permissions up
    LEFT JOIN storages s ON s.id = up.storage_id
    WHERE up.user_id = ?
    ORDER BY LENGTH(up.path) DESC
  `).all(user.id);

  const normInput = normalizePath(inputPath);
  for (const perm of perms) {
    const normPerm = normalizePath(perm.path);
    if (normInput === normPerm || normInput.startsWith(normPerm + '/') || normInput.startsWith(normPerm + '\\')) {
      return { serverId: perm.server_id, remotePath: inputPath };
    }
  }

  throw new Error('Access denied: path not in your allowed locations');
}

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function getPermForPath(user, inputPath) {
  // Admin always has full access — no permission check needed
  if (user.role === 'admin') {
    return { can_read: 1, can_write: 1, can_delete: 1, quota_bytes: null };
  }
  return checkPathPermission(user.id, user.role, inputPath);
}

// ─── GET /api/list?path= ────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const { sftp } = await getSftp(serverId);
    const entries = await sftpReaddir(sftp, remotePath);

    // For admin using srv: prefix, return paths in same srv: format so navigation works
    const isSrvPath = inputPath.startsWith('srv:');
    const baseRemote = remotePath.replace(/\/+$/, '');

    const files = entries.map(e => {
      const childRemote = `${baseRemote}/${e.filename}`;
      const childPath = isSrvPath
        ? `srv:${serverId}:${childRemote}`
        : childRemote;

      return {
        name: e.filename,
        path: childPath,
        type: e.attrs.isDirectory() ? 'folder' : 'file',
        size: e.attrs.size,
        modified: new Date(e.attrs.mtime * 1000).toISOString(),
      };
    });

    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/search?path=&q= ───────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { path: inputPath, q } = req.query;
  if (!inputPath || !q) return res.status(400).json({ error: 'path and q required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const isSrvPath = inputPath.startsWith('srv:');
    const osType = await detectOS(serverId);
    const cmds = getCommands(osType);
    const output = await execCommand(serverId, cmds.search(remotePath, q));

    const results = output.split('\n').filter(Boolean).map(p => {
      const name = p.split('/').pop();
      const childPath = isSrvPath ? `srv:${serverId}:${p}` : p;
      return {
        name,
        path: childPath,
        type: 'file',
        size: 0,
        modified: null,
      };
    });

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/storage — disk usage stats ────────────────────────────────────
router.get('/storage', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const servers = db.prepare('SELECT id, host, name FROM servers WHERE enabled = 1').all();
    const results = [];

    for (const server of servers) {
      try {
        const osType = await detectOS(server.id);
        const cmds = getCommands(osType);
        const output = await execCommand(server.id, cmds.diskStats());
        const parsed = parseDfOutput(output, osType, server.host);
        results.push(...parsed);
      } catch (_) {
        // Server unreachable — skip silently
      }
    }

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/my-drives — paths assigned to current user ────────────────────
router.get('/my-drives', async (req, res) => {
  if (req.user.role === 'admin') {
    // Admin gets ALL servers with root "/" as entry point
    const servers = db.prepare('SELECT id, name, host FROM servers WHERE enabled = 1 ORDER BY name').all();
    return res.json(servers.map(s => ({
      drive: `srv:${s.id}:/`,
      serverId: s.id,
      serverName: s.name,
      serverHost: s.host,
      isServerRoot: true,
      permissions: { read: true, write: true, delete: true },
    })));
  }

  const perms = db.prepare(`
    SELECT up.path, up.can_read, up.can_write, up.can_delete, s.server_id
    FROM user_permissions up
    LEFT JOIN storages s ON s.id = up.storage_id
    WHERE up.user_id = ?
  `).all(req.user.id);

  res.json(perms.map(p => ({
    drive: p.path,
    serverId: p.server_id,
    permissions: { read: !!p.can_read, write: !!p.can_write, delete: !!p.can_delete },
  })));
});

// ─── GET /api/my-storages ────────────────────────────────────────────────────
router.get('/my-storages', async (req, res) => {
  const perms = db.prepare(`
    SELECT up.path, up.can_read, up.can_write, up.can_delete, up.quota_bytes,
           s.name as storage_name, s.quota_gb
    FROM user_permissions up
    LEFT JOIN storages s ON s.id = up.storage_id
    WHERE up.user_id = ?
  `).all(req.user.id);

  res.json(perms.map(p => ({
    name: p.storage_name || p.path,
    rootPath: p.path,
    permissions: { read: !!p.can_read, write: !!p.can_write, delete: !!p.can_delete },
    quotaGB: p.quota_bytes ? p.quota_bytes / (1024 ** 3) : p.quota_gb || null,
  })));
});

// ─── GET /api/quota ─────────────────────────────────────────────────────────
router.get('/quota', async (req, res) => {
  const perms = db.prepare(`
    SELECT up.path, up.quota_bytes, up.can_read, s.server_id
    FROM user_permissions up
    LEFT JOIN storages s ON s.id = up.storage_id
    WHERE up.user_id = ?
  `).all(req.user.id);

  const results = [];

  for (const perm of perms) {
    let used = 0;
    try {
      if (perm.server_id) {
        const osType = await detectOS(perm.server_id);
        const cmds = getCommands(osType);
        const out = await execCommand(perm.server_id, cmds.dirSize(perm.path));
        used = parseInt(out) || 0;
      }
    } catch (_) {}

    const quota = perm.quota_bytes || null;
    results.push({
      path: perm.path,
      used,
      quota,
      percent: quota ? Math.round((used / quota) * 100) : null,
    });
  }

  res.json(results);
});

// ─── GET /api/folder-size?path= ─────────────────────────────────────────────
router.get('/folder-size', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const osType = await detectOS(serverId);
    const cmds = getCommands(osType);
    const out = await execCommand(serverId, cmds.folderInfo(remotePath));
    const { totalBytes, files, totalGB } = parseFolderInfo(out);
    res.json({ totalBytes, totalGB, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/folder ────────────────────────────────────────────────────────
router.post('/folder', async (req, res) => {
  const { path: inputPath } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const { sftp } = await getSftp(serverId);
    await sftpMkdir(sftp, remotePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/rename ─────────────────────────────────────────────────────────
router.put('/rename', async (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });

  const perm = getPermForPath(req.user, oldPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath: oldRemote } = resolvePath(req.user, oldPath);
    // For rename, newPath might be a bare filename — construct full path
    let newRemote;
    if (newPath.startsWith('srv:')) {
      ({ remotePath: newRemote } = resolvePath(req.user, newPath));
    } else if (newPath.startsWith('/')) {
      newRemote = newPath;
    } else {
      // bare name: place in same directory
      const dir = oldRemote.replace(/\/[^/]+$/, '');
      newRemote = `${dir}/${newPath}`;
    }
    const { sftp } = await getSftp(serverId);
    await sftpRename(sftp, oldRemote, newRemote);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/copy ──────────────────────────────────────────────────────────
router.post('/copy', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const perm = getPermForPath(req.user, from);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  const permTo = getPermForPath(req.user, to);
  if (!permTo || !permTo.can_write) return res.status(403).json({ error: 'Write access denied on destination' });

  try {
    const { serverId, remotePath: fromRemote } = resolvePath(req.user, from);
    const { remotePath: toRemote } = resolvePath(req.user, to);
    const osType = await detectOS(serverId);
    const cmds = getCommands(osType);
    // Use OS-appropriate copy command
    const copyCmd = cmds.dirSize ? `cp -r "${fromRemote}" "${toRemote}"` : `cp -r "${fromRemote}" "${toRemote}"`;
    await execCommand(serverId, `cp -r "${fromRemote}" "${toRemote}"`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/move ──────────────────────────────────────────────────────────
router.post('/move', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const perm = getPermForPath(req.user, from);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath: fromRemote } = resolvePath(req.user, from);
    const { remotePath: toRemote } = resolvePath(req.user, to);
    await execCommand(serverId, `mv "${fromRemote}" "${toRemote}"`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/delete/bulk ───────────────────────────────────────────────────
router.post('/delete/bulk', async (req, res) => {
  const { paths, jobId } = req.body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths array required' });
  }

  for (const p of paths) {
    const perm = getPermForPath(req.user, p);
    if (!perm || !perm.can_delete) return res.status(403).json({ error: `Delete access denied for: ${p}` });
  }

  // Respond immediately, process async with socket progress
  res.json({ success: true, jobId });

  const io = req.app.get('io');
  const userRoom = `user:${req.user.id}`;
  let done = 0;

  for (const inputPath of paths) {
    try {
      const { serverId, remotePath } = resolvePath(req.user, inputPath);
      const osType = await detectOS(serverId);
      const cmds = getCommands(osType);

      // Move to trash instead of hard delete
      const trashDir = `/tmp/.kroomdrive_trash_${req.user.id}`;
      const trashName = `${Date.now()}_${path.basename(remotePath)}`;
      const trashPath = `${trashDir}/${trashName}`;

      await execCommand(serverId, cmds.moveToTrash(remotePath, trashPath, trashDir));

      // Record in trash table
      db.prepare(`
        INSERT INTO trash (id, user_id, server_id, original_path, trash_path, name)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), req.user.id, serverId, inputPath, trashPath, path.basename(remotePath));

      done++;
      const percent = Math.round((done / paths.length) * 100);
      io?.to(userRoom).emit('delete-progress', { jobId, percent, current: inputPath, done, total: paths.length });
    } catch (e) {
      io?.to(userRoom).emit('delete-error', { jobId, error: e.message });
    }
  }

  io?.to(userRoom).emit('delete-done', { jobId });
});

// ─── GET /api/download?path= ─────────────────────────────────────────────────
router.get('/download', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const { sftp } = await getSftp(serverId);

    const filename = remotePath.split('/').pop() || 'download';
    const mimeType = mime.lookup(filename) || 'application/octet-stream';

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', mimeType);

    const stream = sftpCreateReadStream(sftp, remotePath);
    stream.on('error', (e) => res.status(500).json({ error: e.message }));
    stream.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/upload ────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  const { path: uploadDir } = req.body;
  if (!uploadDir) return res.status(400).json({ error: 'path required' });
  if (!req.file) return res.status(400).json({ error: 'file required' });

  const perm = getPermForPath(req.user, uploadDir);
  if (!perm || !perm.can_write) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: 'Write access denied' });
  }

  try {
    const { serverId, remotePath: remoteDir } = resolvePath(req.user, uploadDir);
    const { sftp } = await getSftp(serverId);

    const remotePath = `${remoteDir.replace(/\/+$/, '')}/${req.file.originalname}`;
    const fileBuffer = fs.readFileSync(req.file.path);
    await sftpWriteFile(sftp, remotePath, fileBuffer);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

// ─── POST /api/extract ───────────────────────────────────────────────────────
router.post('/extract', async (req, res) => {
  const { zipPath, targetDir, jobId } = req.body;
  if (!zipPath || !targetDir) return res.status(400).json({ error: 'zipPath and targetDir required' });

  const perm = getPermForPath(req.user, zipPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  res.json({ success: true, jobId });

  const io = req.app.get('io');
  const userRoom = `user:${req.user.id}`;

  try {
    const { serverId, remotePath: remoteZip } = resolvePath(req.user, zipPath);
    const { remotePath: remoteTarget } = resolvePath(req.user, targetDir);
    const osType = await detectOS(serverId);
    const cmds = getCommands(osType);

    io?.to(userRoom).emit('extract-progress', { jobId, percent: 10, current: 'Extracting...', done: 0, total: 100 });
    await execCommand(serverId, cmds.extract(remoteZip, remoteTarget));
    io?.to(userRoom).emit('extract-progress', { jobId, percent: 100, current: 'Done', done: 100, total: 100 });
    io?.to(userRoom).emit('extract-done', { jobId });
  } catch (e) {
    io?.to(userRoom).emit('extract-error', { jobId, error: e.message });
  }
});

// ─── GET /api/trash?drive= ───────────────────────────────────────────────────
router.get('/trash', (req, res) => {
  let items;
  if (req.user.role === 'admin') {
    items = db.prepare('SELECT * FROM trash ORDER BY deleted_at DESC').all();
  } else {
    items = db.prepare('SELECT * FROM trash WHERE user_id = ? ORDER BY deleted_at DESC').all(req.user.id);
  }

  res.json(items.map(i => ({
    name: i.name,
    path: i.trash_path,
    originalPath: i.original_path,
    deletedAt: i.deleted_at,
    id: i.id,
  })));
});

// ─── POST /api/trash/restore ─────────────────────────────────────────────────
router.post('/trash/restore', async (req, res) => {
  const { trashPath } = req.body;
  if (!trashPath) return res.status(400).json({ error: 'trashPath required' });

  const record = db.prepare('SELECT * FROM trash WHERE trash_path = ?').get(trashPath);
  if (!record) return res.status(404).json({ error: 'Trash record not found' });

  // Check ownership
  if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    await execCommand(record.server_id, `mv "${record.trash_path}" "${record.original_path}"`);
    db.prepare('DELETE FROM trash WHERE id = ?').run(record.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/trash/empty ───────────────────────────────────────────────────
router.post('/trash/empty', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const items = db.prepare('SELECT * FROM trash').all();

  for (const item of items) {
    try {
      const osType = await detectOS(item.server_id);
      const cmds = getCommands(osType);
      await execCommand(item.server_id, cmds.remove(item.trash_path));
    } catch (_) {}
  }

  db.prepare('DELETE FROM trash').run();
  res.json({ success: true });
});

// ─── GET /api/file/read?path= ────────────────────────────────────────────────
// Read a text file for the editor
router.get('/file/read', async (req, res) => {
  const { path: inputPath } = req.query;
  if (!inputPath) return res.status(400).json({ error: 'path required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_read) return res.status(403).json({ error: 'Read access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const { sftp } = await getSftp(serverId);
    const buffer = await sftpReadFile(sftp, remotePath);
    const content = buffer.toString('utf8');
    const filename = remotePath.split('/').pop() || '';
    res.json({ content, filename, size: buffer.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/file/write ─────────────────────────────────────────────────────
// Save a file from the editor
router.post('/file/write', async (req, res) => {
  const { path: inputPath, content } = req.body;
  if (!inputPath) return res.status(400).json({ error: 'path required' });
  if (content === undefined) return res.status(400).json({ error: 'content required' });

  const perm = getPermForPath(req.user, inputPath);
  if (!perm || !perm.can_write) return res.status(403).json({ error: 'Write access denied' });

  try {
    const { serverId, remotePath } = resolvePath(req.user, inputPath);
    const { sftp } = await getSftp(serverId);
    const buffer = Buffer.from(content, 'utf8');
    await sftpWriteFile(sftp, remotePath, buffer);
    res.json({ success: true, size: buffer.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.post('/share', requireAdmin, async (req, res) => {
  const { username, path: sharePath, permissions, quotaGB, serverId } = req.body;
  if (!username || !sharePath) return res.status(400).json({ error: 'username and path required' });

  const targetUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  // Find matching storage definition — by serverId + path, or by path prefix
  let storage = null;
  if (serverId) {
    // Try to find a storage on this specific server that covers the path
    storage = db.prepare(`
      SELECT id FROM storages WHERE enabled = 1 AND server_id = ? AND (
        root_path = ? OR ? LIKE root_path || '%'
      ) LIMIT 1
    `).get(serverId, sharePath, sharePath);

    // If no storage covers this path, auto-create a transient one tied to this server
    // so we can record the server_id in user_permissions via storage lookup
    if (!storage) {
      const { v4: uuidv4_inner } = require('uuid');
      const autoId = uuidv4_inner();
      const autoName = `${sharePath.split('/').filter(Boolean).pop() || 'root'} (auto)`;
      db.prepare(`
        INSERT INTO storages (id, name, server_id, root_path, enabled)
        VALUES (?, ?, ?, ?, 1)
      `).run(autoId, autoName, serverId, sharePath);
      storage = { id: autoId };
    }
  } else {
    // Fallback: find by path prefix across all storages
    storage = db.prepare(`
      SELECT id FROM storages WHERE enabled = 1 AND (
        root_path = ? OR ? LIKE root_path || '%'
      ) LIMIT 1
    `).get(sharePath, sharePath);
  }

  const quotaBytes = quotaGB ? Math.round(quotaGB * 1024 ** 3) : null;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO user_permissions (id, user_id, storage_id, path, can_read, can_write, can_delete, quota_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, path) DO UPDATE SET
      storage_id = excluded.storage_id,
      can_read = excluded.can_read,
      can_write = excluded.can_write,
      can_delete = excluded.can_delete,
      quota_bytes = excluded.quota_bytes
  `).run(
    id,
    targetUser.id,
    storage?.id || null,
    sharePath,
    permissions?.read ? 1 : 0,
    permissions?.write ? 1 : 0,
    permissions?.delete ? 1 : 0,
    quotaBytes,
  );

  res.json({ success: true });
});

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = router;
