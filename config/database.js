const mongoose = require('mongoose');

// ─── Database Connection Manager ────────────────────────────────────────────
// Supports: MongoDB, PostgreSQL (via Sequelize), MySQL (via Sequelize)
// Set DB_TYPE in .env to switch between databases.
//
// MongoDB safety guarantees:
//   • URI is validated before any connection attempt
//   • Existing collections are detected — DB is NEVER dropped or recreated
//   • No sync({ force }) or dropDatabase() calls anywhere in this file
//   • autoIndex is disabled in production to prevent index rebuilds on startup

let sequelize = null;

const connectMongoDB = async (uri) => {
  // ── Guard: reject missing or placeholder URIs ──────────────────────────────
  if (!uri || uri === 'undefined' || uri.trim() === '') {
    throw new Error(
      'MONGODB_URI is missing or invalid. ' +
      'Set MONGODB_URI=mongodb://localhost:27017/travel_explorer in your .env file.'
    );
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Disable auto-index in production — indexes should be managed via migrations
      autoIndex: process.env.NODE_ENV !== 'production',
    });

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

    // ── Reconnection / error event listeners ────────────────────────────────
    mongoose.connection.on('disconnected', () =>
      console.warn('⚠️  MongoDB disconnected — attempting to reconnect…')
    );
    mongoose.connection.on('reconnected', () =>
      console.log('✅ MongoDB reconnected.')
    );
    mongoose.connection.on('error', (err) =>
      console.error('❌ MongoDB runtime error:', err.message)
    );

  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('   Check that MongoDB is running and MONGODB_URI is correct in .env');
    process.exit(1);
  }
};

const connectSQL = async (dialect) => {
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
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    });

    await sequelize.authenticate();
    console.log(`✅ ${dialect.toUpperCase()} connected at ${config.host}:${config.port}/${config.database}`);

    // alter:true updates columns without dropping tables — safe for existing data.
    // Never use force:true here — it drops and recreates every table.
    await sequelize.sync({ alter: true });
    console.log('✅ SQL tables synced (alter only — existing data preserved)');
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

module.exports = { connectDB, getSequelize };