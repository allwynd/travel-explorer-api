// ─── Load & validate environment variables FIRST ─────────────────────────────
const dotenvResult = require('dotenv').config();

if (dotenvResult.error) {
  console.warn('');
  console.warn('⚠️  WARNING: No .env file found.');
  console.warn('   Copy .env.example to .env and set DB_TYPE=mongodb to persist data.');
  console.warn('   Running without a .env means data will be LOST on every restart.');
  console.warn('');
}

if (!process.env.DB_TYPE) {
  console.warn('');
  console.warn('⚠️  WARNING: DB_TYPE is not set in your environment.');
  console.warn('   Falling back to in-memory store — all data lost on restart.');
  console.warn('   Set DB_TYPE=mongodb (and MONGODB_URI) in your .env to persist data.');
  console.warn('');
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const { connectDB, disconnectDB } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = (process.env.FRONTEND_URLS || '').split(',').map(url => url.trim()).filter(url => url);
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/trips', require('./routes/trips'));
app.use('/expenses', require('./routes/expenses'));
app.use('/plan', require('./routes/plan'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbType = (process.env.DB_TYPE || '').toLowerCase().trim();

  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const mongoState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState];

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dbType: process.env.DB_TYPE || 'memory (no DB_TYPE set — data not persisted)',
    environment: process.env.NODE_ENV || 'development',
    envFileLoaded: !dotenvResult.error,
    ...(dbType === 'mongodb' ? {
      mongoConnection: mongoState,
      mongoPoolMax: parseInt(process.env.MONGO_MAX_POOL_SIZE, 10) || 10,
      mongoPoolMin: parseInt(process.env.MONGO_MIN_POOL_SIZE, 10) || 2,
    } : {}),
  });
});

// ─── Serve Frontend SPA ───────────────────────────────────────────────────────
app.get('/api/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
let server;

const startServer = async () => {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`\n🌍 Travel Explorer running at http://localhost:${PORT}`);
    console.log(`📊 DB Type    : ${process.env.DB_TYPE || '⚠️  NOT SET — using in-memory store'}`);
    console.log(`🌱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📄 .env file  : ${dotenvResult.error ? '❌ not found' : '✅ loaded'}\n`);
  });
};

startServer();

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
// On SIGINT (Ctrl+C) or SIGTERM (e.g. `kill`, container stop, nodemon restart),
// stop accepting new requests, then close the DB connection pool so no sockets
// are left open. Without this, MongoDB/Postgres/MySQL pools can linger as
// orphaned connections after the process exits, especially during frequent
// nodemon restarts in development.
let shuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n👋 Received ${signal} — shutting down gracefully…`);

  // Stop accepting new HTTP connections
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('🛑 HTTP server closed.');
  }

  // Release all pooled DB connections
  try {
    await disconnectDB();
  } catch (err) {
    console.error('Error while closing DB connections:', err.message);
  }

  console.log('✅ Shutdown complete.\n');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;