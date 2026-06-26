const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * Verify JWT and attach user to req.user.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Re-fetch user from DB to ensure they still exist and get fresh role
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Check if a user has permission to access a given remote path.
 * Admins have full access to everything.
 * Returns the matching permission record or null.
 */
function checkPathPermission(userId, role, targetPath) {
  if (role === 'admin') {
    return { can_read: 1, can_write: 1, can_delete: 1, quota_bytes: null };
  }

  // Find the most specific matching permission
  const perms = db.prepare(`
    SELECT up.*, s.root_path, s.server_id
    FROM user_permissions up
    LEFT JOIN storages s ON s.id = up.storage_id
    WHERE up.user_id = ?
    ORDER BY LENGTH(up.path) DESC
  `).all(userId);

  for (const perm of perms) {
    const normPerm = normalizePath(perm.path);
    const normTarget = normalizePath(targetPath);
    if (normTarget === normPerm || normTarget.startsWith(normPerm + '/') || normTarget.startsWith(normPerm + '\\')) {
      return perm;
    }
  }
  return null;
}

function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

module.exports = { requireAuth, requireAdmin, checkPathPermission };
