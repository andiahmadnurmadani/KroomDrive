const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({ token });
});

// PUT /api/profile  — update own username/password
router.put('/profile', requireAuth, (req, res) => {
  const { username, password } = req.body;
  const updates = [];
  const params = [];

  if (username && username.trim()) {
    // Check uniqueness
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), req.user.id);
    if (conflict) return res.status(409).json({ error: 'Username already taken' });
    updates.push('username = ?');
    params.push(username.trim());
  }

  if (password && password.length >= 4) {
    updates.push('password = ?');
    params.push(bcrypt.hashSync(password, 10));
  }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

module.exports = router;
