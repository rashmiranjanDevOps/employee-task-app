'use strict';

require('dotenv').config();
const { sequelize } = require('./database');
const logger = require('../utils/logger');

// Import all models to register them
require('../models');

async function migrate() {
  try {
    logger.info('Starting database migration...');
    await sequelize.authenticate();
    logger.info('Database connection verified');

    await sequelize.sync({ alter: process.env.DB_ALTER === 'true', force: process.env.DB_FORCE === 'true' });
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ msg: 'Migration failed', error: err.message, stack: err.stack });
    process.exit(1);
  }
}

migrate();
