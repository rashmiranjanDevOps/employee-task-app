'use strict';

require('dotenv').config();

// ─── Startup environment validation ──────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const app = require('./app');
const { sequelize } = require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

let server;

async function startServer() {
  try {
    // Verify DB connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Run schema sync in all environments.
    // In production use { alter: true } so existing tables are updated
    // without data loss. In dev, alter is also fine; for a full reset
    // set DB_FORCE=true (never in production).
    const force = process.env.DB_FORCE === 'true' && process.env.NODE_ENV !== 'production';
    const alter = process.env.NODE_ENV !== 'production' || process.env.DB_ALTER === 'true';
    await sequelize.sync({ force, alter });
    logger.info({ msg: 'Database schema synchronised', force, alter });

    server = app.listen(PORT, HOST, () => {
      logger.info({
        msg: 'Server started',
        port: PORT,
        host: HOST,
        env: process.env.NODE_ENV,
        pid: process.pid,
      });
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  } catch (err) {
    logger.error({ msg: 'Failed to start server', error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  logger.info({ msg: `Received ${signal}, starting graceful shutdown` });

  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error({ msg: 'Error during server close', error: err.message });
        process.exit(1);
      }
      try {
        await sequelize.close();
        logger.info('Database connection closed');
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (dbErr) {
        logger.error({ msg: 'Error closing database', error: dbErr.message });
        process.exit(1);
      }
    });

    // Force shutdown after 30s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ msg: 'Unhandled Promise Rejection', reason, promise });
});

process.on('uncaughtException', (err) => {
  logger.error({ msg: 'Uncaught Exception', error: err.message, stack: err.stack });
  process.exit(1);
});

startServer();
