const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All routes require auth + admin
router.use(requireAuth, requireAdmin);

// GET /api/users — list all users with their permissions
router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT id, username, role, created_at FROM users ORDER BY created_at DESC
  `).all();

  const result = users.map(u => {
    const paths = db.prepare(`
      SELECT up.id, up.path, up.can_read, up.can_write, up.can_delete, up.quota_bytes,
             up.storage_id, s.name as storage_name
      FROM user_permissions up
      LEFT JOIN storages s ON s.id = up.storage_id
      WHERE up.user_id = ?
    `).all(u.id);

    return {
      _id: u.id,
      username: u.username,
      role: u.role,
      created_at: u.created_at,
      paths: paths.map(p => ({
        path: p.path,
        storageId: p.storage_id,
        permissions: {
          read: !!p.can_read,
          write: !!p.can_write,
          delete: !!p.can_delete,
        },
        quotaBytes: p.quota_bytes,
      })),
    };
  });

  res.json(result);
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const paths = db.prepare(`
    SELECT up.id, up.path, up.can_read, up.can_write, up.can_delete, up.quota_bytes, up.storage_id
    FROM user_permissions up
    WHERE up.user_id = ?
  `).all(user.id);

  res.json({
    _id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
    paths: paths.map(p => ({
      path: p.path,
      storageId: p.storage_id,
      permissions: { read: !!p.can_read, write: !!p.can_write, delete: !!p.can_delete },
      quotaBytes: p.quota_bytes,
    })),
  });
});

// POST /api/users — create user
router.post('/', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Username already exists' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const userRole = role === 'admin' ? 'admin' : 'user';

  db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(id, username, hash, userRole);
  res.status(201).json({ success: true, id });
});

// PUT /api/users/:id/password — reset a user's password (admin only)
router.put('/:id/password', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

// DELETE /api/users/:id
router.delete('/:id', (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

// POST /api/users/:id/storage — assign a storage to a user
router.post('/:id/storage', (req, res) => {
  const { storageId, permissions } = req.body;
  if (!storageId) return res.status(400).json({ error: 'storageId required' });

  const storage = db.prepare('SELECT * FROM storages WHERE id = ?').get(storageId);
  if (!storage) return res.status(404).json({ error: 'Storage not found' });

  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO user_permissions (id, user_id, storage_id, path, can_read, can_write, can_delete)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, path) DO UPDATE SET
        can_read = excluded.can_read,
        can_write = excluded.can_write,
        can_delete = excluded.can_delete,
        storage_id = excluded.storage_id
    `).run(
      id,
      req.params.id,
      storageId,
      storage.root_path,
      permissions?.read ? 1 : 0,
      permissions?.write ? 1 : 0,
      permissions?.delete ? 1 : 0,
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/users/:id/permission — revoke a specific path
router.delete('/:id/permission', (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path required' });

  db.prepare('DELETE FROM user_permissions WHERE user_id = ? AND path = ?').run(req.params.id, path);
  res.json({ success: true });
});

// PUT /api/users/:id/permission — update permissions for a path
router.put('/:id/permission', (req, res) => {
  const { path, permissions } = req.body;
  if (!path) return res.status(400).json({ error: 'path required' });

  db.prepare(`
    UPDATE user_permissions
    SET can_read = ?, can_write = ?, can_delete = ?
    WHERE user_id = ? AND path = ?
  `).run(
    permissions?.read ? 1 : 0,
    permissions?.write ? 1 : 0,
    permissions?.delete ? 1 : 0,
    req.params.id,
    path,
  );
  res.json({ success: true });
});

module.exports = router;
