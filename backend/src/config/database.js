'use strict';

const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_POOL_MAX,
  DB_POOL_MIN,
  DB_POOL_ACQUIRE,
  DB_POOL_IDLE,
  NODE_ENV,
} = process.env;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST || 'localhost',
  port: parseInt(DB_PORT || '3306'),
  dialect: 'mysql',
  logging: NODE_ENV === 'development' ? (msg) => logger.debug(msg) : false,
  pool: {
    max: parseInt(DB_POOL_MAX || '10'),
    min: parseInt(DB_POOL_MIN || '2'),
    acquire: parseInt(DB_POOL_ACQUIRE || '30000'),
    idle: parseInt(DB_POOL_IDLE || '10000'),
  },
  dialectOptions: {
    ssl: NODE_ENV === 'production'
      ? { require: true, rejectUnauthorized: false }
      : false,
    connectTimeout: 20000,
  },
  define: {
    timestamps: true,
    underscored: false,
    freezeTableName: false,
  },
  retry: {
    max: 3,
  },
});

module.exports = { sequelize };
