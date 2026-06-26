const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { execCommand } = require('../ssh');
const { detectOS, getCommands } = require('../osdetect');

// All routes require auth + admin
router.use(requireAuth, requireAdmin);

// GET /api/storages — list all logical storages with users + real quota usage
router.get('/', async (req, res) => {
  const storages = db.prepare(`
    SELECT s.*, srv.name as server_name, srv.host
    FROM storages s
    LEFT JOIN servers srv ON srv.id = s.server_id
    ORDER BY s.name
  `).all();

  // For each storage, fetch assigned users + real disk usage via SSH
  const results = await Promise.all(storages.map(async (s) => {
    // Get all users assigned to this storage (via user_permissions)
    const assignedUsers = db.prepare(`
      SELECT u.id, u.username, up.can_read, up.can_write, up.can_delete,
             up.quota_bytes, up.path
      FROM user_permissions up
      JOIN users u ON u.id = up.user_id
      WHERE up.storage_id = ?
      ORDER BY u.username
    `).all(s.id);

    // Also find users assigned to a sub-path under this storage
    const subPathUsers = db.prepare(`
      SELECT u.id, u.username, up.can_read, up.can_write, up.can_delete,
             up.quota_bytes, up.path
      FROM user_permissions up
      JOIN users u ON u.id = up.user_id
      WHERE up.storage_id IS NULL
        AND up.path LIKE ? || '%'
      ORDER BY u.username
    `).all(s.root_path);

    // Merge, deduplicate by user id
    const userMap = new Map();
    for (const u of [...assignedUsers, ...subPathUsers]) {
      if (!userMap.has(u.id)) userMap.set(u.id, u);
    }
    const users = Array.from(userMap.values());

    // Get real disk usage via SSH (non-blocking — skip if server unreachable)
    let usedBytes = null;
    try {
      if (s.server_id) {
        const osType = await detectOS(s.server_id);
        const cmds = getCommands(osType);
        const out = await execCommand(s.server_id, cmds.dirSize(s.root_path));
        usedBytes = parseInt(out) || null;
      }
    } catch (_) {
      // server unreachable — leave null
    }

    const quotaBytes = s.quota_gb ? s.quota_gb * (1024 ** 3) : null;

    return {
      _id: s.id,
      name: s.name,
      rootPath: s.root_path,
      serverId: s.server_id,
      serverName: s.server_name,
      serverHost: s.host,
      quotaGB: s.quota_gb,
      quotaBytes,
      usedBytes,
      usedPercent: (quotaBytes && usedBytes !== null)
        ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
        : null,
      enabled: !!s.enabled,
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        path: u.path,
        permissions: {
          read: !!u.can_read,
          write: !!u.can_write,
          delete: !!u.can_delete,
        },
        quotaGB: u.quota_bytes ? u.quota_bytes / (1024 ** 3) : null,
      })),
    };
  }));

  res.json(results);
});

// POST /api/storages — create storage definition
router.post('/', (req, res) => {
  const { name, rootPath, serverId, quotaGB } = req.body;
  if (!name || !rootPath || !serverId) {
    return res.status(400).json({ error: 'name, rootPath, serverId required' });
  }

  const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO storages (id, name, server_id, root_path, quota_gb)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, serverId, rootPath, quotaGB || null);

  res.status(201).json({ success: true, id });
});

// PUT /api/storages/:id
router.put('/:id', (req, res) => {
  const { name, rootPath, quotaGB, enabled } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (rootPath !== undefined) { updates.push('root_path = ?'); params.push(rootPath); }
  if (quotaGB !== undefined) { updates.push('quota_gb = ?'); params.push(quotaGB || null); }
  if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE storages SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// DELETE /api/storages/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM storages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
