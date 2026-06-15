const mongoose = require('mongoose');

// ─── Database Connection Manager ────────────────────────────────────────────
// Supports: MongoDB, PostgreSQL (via Sequelize), MySQL (via Sequelize)
// Set DB_TYPE in .env to switch between databases.
//
// MongoDB efficiency & safety guarantees:
//   • A single shared connection (with internal pool) is reused across the
//     whole app — connectMongoDB() is idempotent and safe to call multiple
//     times (e.g. on serverless cold starts or repeated route initialisation)
//   • Pool size is bounded (maxPoolSize / minPoolSize) so the app never opens
//     more sockets to MongoDB than configured
//   • Idle connections beyond minPoolSize are automatically closed after
//     maxIdleTimeMS — freeing unused connections without manual intervention
//   • URI is validated before any connection attempt
//   • Existing collections are detected — DB is NEVER dropped or recreated
//   • No sync({ force }) or dropDatabase() calls anywhere in this file
//   • autoIndex is disabled in production to prevent index rebuilds on startup
//   • disconnectDB() allows graceful shutdown (SIGINT/SIGTERM) to release
//     all pooled connections cleanly

let sequelize = null;

// Mongoose connection readyState values:
//   0 = disconnected | 1 = connected | 2 = connecting | 3 = disconnecting
const READY_STATE = { DISCONNECTED: 0, CONNECTED: 1, CONNECTING: 2, DISCONNECTING: 3 };

// Tracks an in-flight connection attempt so concurrent callers
// (e.g. multiple requests during a cold start) await the SAME promise
// instead of each calling mongoose.connect() separately.
let connectingPromise = null;

const connectMongoDB = async (uri) => {
  // ── Guard: reject missing or placeholder URIs ──────────────────────────────
  if (!uri || uri === 'undefined' || uri.trim() === '') {
    throw new Error(
      'MONGODB_URI is missing or invalid. ' +
      'Set MONGODB_URI=mongodb://localhost:27017/travel_explorer in your .env file.'
    );
  }

  const state = mongoose.connection.readyState;

  // ── Reuse: already connected — do nothing ──────────────────────────────────
  if (state === READY_STATE.CONNECTED) {
    console.log('♻️  Reusing existing MongoDB connection (pool already warm).');
    return mongoose.connection;
  }

  // ── Reuse: a connection attempt is already in progress — await it ──────────
  if (state === READY_STATE.CONNECTING && connectingPromise) {
    console.log('⏳ MongoDB connection already in progress — awaiting it.');
    return connectingPromise;
  }

  try {
    connectingPromise = mongoose.connect(uri, {
      // ── Auto-index: disable in production (managed via migrations) ────────
      autoIndex: process.env.NODE_ENV !== 'production',

      // ── Connection pool sizing ─────────────────────────────────────────────
      // maxPoolSize: hard ceiling on concurrent sockets to MongoDB.
      // minPoolSize: sockets kept warm even when idle, avoiding reconnect
      //              latency on the next request.
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE, 10) || 10,
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE, 10) || 2,

      // ── Free up unused connections ─────────────────────────────────────────
      // Any pooled connection beyond minPoolSize that sits idle for longer
      // than maxIdleTimeMS is automatically closed by the driver.
      maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME_MS, 10) || 30000,

      // ── Timeouts ────────────────────────────────────────────────────────────
      // Fail fast if no server is reachable, rather than hanging indefinitely.
      serverSelectionTimeoutMS: 5000,
      // Close sockets that have been inactive mid-operation for too long.
      socketTimeoutMS: 45000,

      // Force IPv4 — avoids slow IPv6 lookup fallbacks on some hosts.
      family: 4,
    });

    await connectingPromise;

    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    const safeUri = uri.replace(/\/\/([^:]+:[^@]+)@/, '//***:***@'); // mask credentials

    // ── Check whether this database already has collections ─────────────────
    // listCollections() does NOT create, drop, or modify anything.
    // It is purely a read operation used only for informational logging.
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name).join(', ') || 'none yet';

    if (collections.length > 0) {
      console.log(`✅ MongoDB connected: "${dbName}" at ${safeUri}`);
      console.log(`   📂 Existing collections found (${collections.length}): ${collectionNames}`);
      console.log(`   ✔  Database already exists — no initialisation performed.`);
    } else {
      console.log(`✅ MongoDB connected: "${dbName}" at ${safeUri}`);
      console.log(`   🆕 No collections found — new database will be initialised on first write.`);
    }

    console.log(`   🔌 Pool size: min=${process.env.MONGO_MIN_POOL_SIZE || 2}, max=${process.env.MONGO_MAX_POOL_SIZE || 10}, idle timeout=${process.env.MONGO_MAX_IDLE_TIME_MS || 30000}ms`);

    // ── Reconnection / error event listeners (registered once) ──────────────
    if (!mongoose.connection._teListenersAttached) {
      mongoose.connection.on('disconnected', () =>
        console.warn('⚠️  MongoDB disconnected — driver will attempt to reconnect…')
      );
      mongoose.connection.on('reconnected', () =>
        console.log('✅ MongoDB reconnected.')
      );
      mongoose.connection.on('error', (err) =>
        console.error('❌ MongoDB runtime error:', err.message)
      );
      // Mark as attached so repeated connectMongoDB() calls don't stack listeners
      mongoose.connection._teListenersAttached = true;
    }

    return mongoose.connection;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('   Check that MongoDB is running and MONGODB_URI is correct in .env');
    process.exit(1);
  } finally {
    connectingPromise = null;
  }
};

// ─── Graceful disconnect ──────────────────────────────────────────────────────
// Closes the connection (and its entire pool) cleanly. Call this on
// SIGINT/SIGTERM so the process doesn't hold sockets open after exit.
const disconnectDB = async () => {
  const dbType = (process.env.DB_TYPE || '').toLowerCase().trim();

  if (dbType === 'mongodb' && mongoose.connection.readyState !== READY_STATE.DISCONNECTED) {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection pool closed.');
  }

  if (sequelize) {
    await sequelize.close();
    console.log('🔌 SQL connection pool closed.');
  }
};

const connectSQL = async (dialect) => {
  // ── Reuse: an existing Sequelize instance is already authenticated ────────
  if (sequelize) {
    console.log(`♻️  Reusing existing ${dialect.toUpperCase()} connection pool.`);
    return sequelize;
  }

  try {
    const { Sequelize } = require('sequelize');
    const config = dialect === 'postgres'
      ? {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'travel_explorer',
          username: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || '',
        }
      : {
          host: process.env.MYSQL_HOST || 'localhost',
          port: process.env.MYSQL_PORT || 3306,
          database: process.env.MYSQL_DB || 'travel_explorer',
          username: process.env.MYSQL_USER || 'root',
          password: process.env.MYSQL_PASSWORD || '',
        };

    sequelize = new Sequelize(config.database, config.username, config.password, {
      host: config.host,
      port: config.port,
      dialect,
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: parseInt(process.env.SQL_POOL_MAX, 10) || 10,   // ceiling on connections
        min: parseInt(process.env.SQL_POOL_MIN, 10) || 0,    // shrink to 0 when idle
        acquire: 30000,                                       // fail if no conn in 30s
        idle: parseInt(process.env.SQL_POOL_IDLE_MS, 10) || 10000, // free idle conns after 10s
      },
    });

    await sequelize.authenticate();
    console.log(`✅ ${dialect.toUpperCase()} connected at ${config.host}:${config.port}/${config.database}`);
    console.log(`   🔌 Pool size: min=${process.env.SQL_POOL_MIN || 0}, max=${process.env.SQL_POOL_MAX || 10}, idle timeout=${process.env.SQL_POOL_IDLE_MS || 10000}ms`);

    // alter:true updates columns without dropping tables — safe for existing data.
    // Never use force:true here — it drops and recreates every table.
    await sequelize.sync({ alter: true });
    console.log('✅ SQL tables synced (alter only — existing data preserved)');

    return sequelize;
  } catch (err) {
    console.error(`❌ ${dialect} connection error:`, err.message);
    process.exit(1);
  }
};

const connectDB = async () => {
  // ── Treat an unset DB_TYPE as an explicit in-memory choice, not a default ──
  const dbType = (process.env.DB_TYPE || '').toLowerCase().trim();

  if (!dbType) {
    console.warn('');
    console.warn('⚠️  DB_TYPE is not set — falling back to in-memory store.');
    console.warn('   All data will be LOST when the server restarts.');
    console.warn('   To persist data: set DB_TYPE=mongodb and MONGODB_URI in your .env file.');
    console.warn('');
    return; // app still starts — developer has made an explicit (if unintentional) choice
  }

  switch (dbType) {
    case 'mongodb':
      await connectMongoDB(
        process.env.MONGODB_URI || 'mongodb://localhost:27017/travel_explorer'
      );
      break;
    case 'postgres':
    case 'postgresql':
      await connectSQL('postgres');
      break;
    case 'mysql':
      await connectSQL('mysql');
      break;
    default:
      console.warn(`⚠️  Unknown DB_TYPE "${dbType}" — falling back to in-memory store.`);
      console.warn('   Valid options: mongodb, postgres, mysql');
  }
};

const getSequelize = () => sequelize;

module.exports = { connectDB, disconnectDB, getSequelize };