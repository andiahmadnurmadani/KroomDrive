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
  const raw = process.env.CORS_ORIGIN || '*';
  if (raw === '*') return '*';
  // Support comma-separated list
  const origins = raw.split(',').map(o => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}
const corsOrigin = getCorsOrigin();

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
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
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
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
