'use strict';

const { sequelize } = require('../config/database');

const startTime = Date.now();

exports.health = async (req, res) => {
  return res.json({
    status: 'ok',
    service: 'employee-task-api',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
};

exports.ready = async (req, res) => {
  try {
    await sequelize.authenticate();
    return res.json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(503).json({ status: 'not_ready', database: 'disconnected', error: err.message });
  }
};

exports.live = async (req, res) => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

  if (heapUsedMB > 900) {
    return res.status(503).json({ status: 'not_live', reason: 'High memory usage', heapUsedMB });
  }

  return res.json({
    status: 'live',
    memory: { heapUsedMB, heapTotalMB, rss: Math.round(memUsage.rss / 1024 / 1024) },
    uptime: Math.floor((Date.now() - startTime) / 1000),
    pid: process.pid,
  });
};
