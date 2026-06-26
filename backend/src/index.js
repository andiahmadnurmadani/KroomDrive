require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

// ─── Init DB (runs migrations + seeds admin) ────────────────────────────────
require('./db');

const app = express();
const server = http.createServer(app);

// ─── CORS helper ─────────────────────────────────────────────────────────────
function getCorsOrigin() {
  const raw = (process.env.CORS_ORIGIN || '*').trim();
  if (raw === '*') return '*';
  // Support comma-separated list of origins
  const origins = raw.split(',').map(o => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

// Dynamic CORS origin function for express-cors — supports exact list, wildcard, or regex
function makeCorsOriginFn(corsOrigin) {
  if (corsOrigin === '*') return '*';

  const allowed = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];

  return function (origin, callback) {
    // Allow requests with no Origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    // Also allow if origin matches without trailing slash
    const normalized = origin.replace(/\/$/, '');
    if (allowed.some(o => o.replace(/\/$/, '') === normalized)) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin '${origin}' not allowed`));
  };
}

const corsOrigin = getCorsOrigin();
const corsOptions = {
  origin: makeCorsOriginFn(corsOrigin),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  // credentials only needed if origin is specific (not wildcard)
  // With wildcard '*', browsers forbid credentials:true — so guard it
  credentials: corsOrigin !== '*',
  optionsSuccessStatus: 200,
};

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    // Socket.IO cors uses the same origin logic
    origin: corsOrigin === '*' ? '*' : makeCorsOriginFn(corsOrigin),
    methods: ['GET', 'POST'],
    credentials: corsOrigin !== '*',
  },
  transports: ['websocket', 'polling'],
});

// Make io available to route handlers via app
app.set('io', io);

io.on('connection', (socket) => {
  // Join user-specific room based on JWT so progress events are private
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`user:${decoded.id}`);
      socket.data.userId = decoded.id;
    } catch (_) {
      // unauthenticated socket — still allowed for connection but no room
    }
  }
  socket.on('disconnect', () => {});
});

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const serverRoutes  = require('./routes/servers');
const storageRoutes = require('./routes/storages');
const fileRoutes    = require('./routes/files');
const gitRoutes     = require('./routes/git');

app.use('/api', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/storages', storageRoutes);
app.use('/api', fileRoutes);
app.use('/api/git', gitRoutes);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Static Frontend (production) ────────────────────────────────────────────
// When NODE_ENV=production, serve the built frontend from ../dist
// This means only one port is needed — nginx/Cloudflare proxies everything here
const DIST_DIR = path.resolve(__dirname, '../../dist');
const fs = require('fs');
if (process.env.NODE_ENV === 'production' && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { maxAge: '1d', etag: true }));
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`🌐 Serving frontend from: ${DIST_DIR}`);
} else if (process.env.NODE_ENV === 'production') {
  console.warn(`⚠️  Frontend dist not found at ${DIST_DIR}. Run 'npm run build' in the project root.`);
}

// ─── 404 Handler (API only in dev, or if dist missing) ───────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 KroomDrive Backend running on http://localhost:${PORT}`);
  console.log(`📦 SQLite DB: ${path.resolve(process.env.DB_PATH || './data/kroomdrive.db')}`);
  console.log(`\n📋 API Endpoints:`);
  console.log(`   POST   /api/login`);
  console.log(`   GET    /api/servers        (admin)`);
  console.log(`   POST   /api/servers        (admin)`);
  console.log(`   POST   /api/servers/:id/test`);
  console.log(`   GET    /api/storages       (admin)`);
  console.log(`   POST   /api/storages       (admin)`);
  console.log(`   GET    /api/users          (admin)`);
  console.log(`   POST   /api/users          (admin)`);
  console.log(`   GET    /api/list?path=`);
  console.log(`   GET    /api/storage`);
  console.log(`   GET    /api/my-drives`);
  console.log(`   GET    /api/quota`);
  console.log(`   POST   /api/folder`);
  console.log(`   PUT    /api/rename`);
  console.log(`   POST   /api/copy`);
  console.log(`   POST   /api/move`);
  console.log(`   POST   /api/delete/bulk`);
  console.log(`   GET    /api/download?path=`);
  console.log(`   POST   /api/upload`);
  console.log(`   POST   /api/extract`);
  console.log(`   GET    /api/trash`);
  console.log(`   POST   /api/trash/restore`);
  console.log(`   POST   /api/trash/empty`);
  console.log(`   POST   /api/share         (admin)`);
});
