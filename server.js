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
const { connectDB } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3001",
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

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dbType: process.env.DB_TYPE || 'memory (no DB_TYPE set — data not persisted)',
    environment: process.env.NODE_ENV || 'development',
    envFileLoaded: !dotenvResult.error,
  });
});

// ─── Serve Frontend SPA ───────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🌍 Travel Explorer running at http://localhost:${PORT}`);
    console.log(`📊 DB Type    : ${process.env.DB_TYPE || '⚠️  NOT SET — using in-memory store'}`);
    console.log(`🌱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📄 .env file  : ${dotenvResult.error ? '❌ not found' : '✅ loaded'}\n`);
  });
};

startServer();

module.exports = app;