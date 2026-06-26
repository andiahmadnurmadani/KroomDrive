const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { testConnection, invalidate } = require('../ssh');
const { detectOS, invalidateOSCache } = require('../osdetect');

// All routes require admin
router.use(requireAuth, requireAdmin);

// Helper to emit server-updated event to all connected clients
function emitServerUpdated(req) {
  const io = req.app.get('io');
  if (io) io.emit('server-updated');
}

// GET /api/servers
router.get('/', (req, res) => {
  const servers = db.prepare(`
    SELECT id, name, host, port, username, enabled, os_type, conn_type, tunnel_url, created_at
    FROM servers ORDER BY name
  `).all();
  res.json(servers);
});

// GET /api/servers/:id
router.get('/:id', (req, res) => {
  const server = db.prepare(`
    SELECT id, name, host, port, username, enabled, created_at FROM servers WHERE id = ?
  `).get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server);
});

// POST /api/servers — create server
router.post('/', async (req, res) => {
  const { name, host, port, username, password, privateKey,
          connType, tunnelUrl, cfTokenId, cfTokenSecret, testConn } = req.body;

  if (!name || !username) {
    return res.status(400).json({ error: 'name and username required' });
  }
  if ((connType || 'direct') === 'direct' && !host) {
    return res.status(400).json({ error: 'host required for direct connections' });
  }
  if (connType === 'cloudflare' && !tunnelUrl) {
    return res.status(400).json({ error: 'tunnel_url required for Cloudflare tunnel connections' });
  }

  if (testConn) {
    try {
      await testConnection(host, port || 22, username, password, privateKey,
                           connType, tunnelUrl, cfTokenId, cfTokenSecret);
    } catch (e) {
      return res.status(400).json({ error: `Connection test failed: ${e.message}` });
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO servers (id, name, host, port, username, password, private_key,
                         conn_type, tunnel_url, cf_service_token_id, cf_service_token_secret)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name,
    host || tunnelUrl || '',
    port || 22,
    username,
    password || null,
    privateKey || null,
    connType || 'direct',
    tunnelUrl || null,
    cfTokenId || null,
    cfTokenSecret || null
  );

  emitServerUpdated(req);
  res.status(201).json({ success: true, id });
});

// PUT /api/servers/:id — update server
router.put('/:id', async (req, res) => {
  const { name, host, port, username, password, privateKey, enabled,
          connType, tunnelUrl, cfTokenId, cfTokenSecret, testConn } = req.body;

  if (testConn) {
    const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    const testHost     = host      ?? existing?.host;
    const testPort     = port      ?? existing?.port;
    const testUser     = username  ?? existing?.username;
    const testPass     = password  ?? existing?.password;
    const testKey      = privateKey ?? existing?.private_key;
    const testConnType = connType  ?? existing?.conn_type;
    const testTunnel   = tunnelUrl ?? existing?.tunnel_url;
    const testCfId     = cfTokenId ?? existing?.cf_service_token_id;
    const testCfSec    = cfTokenSecret ?? existing?.cf_service_token_secret;

    try {
      await testConnection(testHost, testPort, testUser, testPass, testKey,
                           testConnType, testTunnel, testCfId, testCfSec);
    } catch (e) {
      return res.status(400).json({ error: `Connection test failed: ${e.message}` });
    }
  }

  const updates = [];
  const params = [];

  if (name !== undefined)          { updates.push('name = ?');                     params.push(name); }
  if (host !== undefined)          { updates.push('host = ?');                     params.push(host); }
  if (port !== undefined)          { updates.push('port = ?');                     params.push(port); }
  if (username !== undefined)      { updates.push('username = ?');                 params.push(username); }
  if (password !== undefined)      { updates.push('password = ?');                 params.push(password || null); }
  if (privateKey !== undefined)    { updates.push('private_key = ?');              params.push(privateKey || null); }
  if (enabled !== undefined)       { updates.push('enabled = ?');                  params.push(enabled ? 1 : 0); }
  if (connType !== undefined)      { updates.push('conn_type = ?');                params.push(connType); }
  if (tunnelUrl !== undefined)     { updates.push('tunnel_url = ?');               params.push(tunnelUrl || null); }
  if (cfTokenId !== undefined)     { updates.push('cf_service_token_id = ?');      params.push(cfTokenId || null); }
  if (cfTokenSecret !== undefined) { updates.push('cf_service_token_secret = ?');  params.push(cfTokenSecret || null); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  invalidate(req.params.id);
  emitServerUpdated(req);
  res.json({ success: true });
});

// DELETE /api/servers/:id
router.delete('/:id', (req, res) => {
  invalidate(req.params.id);
  invalidateOSCache(req.params.id);
  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  emitServerUpdated(req);
  res.json({ success: true });
});

// POST /api/servers/:id/test — test connectivity
router.post('/:id/test', async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    await testConnection(
      server.host, server.port, server.username, server.password, server.private_key,
      server.conn_type, server.tunnel_url, server.cf_service_token_id, server.cf_service_token_secret
    );
    res.json({ success: true, message: 'Connection successful' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/servers/:id/detect-os — force OS re-detection
router.post('/:id/detect-os', async (req, res) => {
  const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    invalidateOSCache(req.params.id);
    // Reset persisted os_type so detectOS runs fresh
    db.prepare("UPDATE servers SET os_type = 'unknown' WHERE id = ?").run(req.params.id);
    const osType = await detectOS(req.params.id);
    res.json({ success: true, osType });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
