'use strict';

const { AuditLog } = require('../models');
const logger = require('../utils/logger');

exports.createAuditLog = async ({ userId, action, resource, resourceId, oldValues, newValues, ipAddress, userAgent, metadata }) => {
  try {
    await AuditLog.create({ userId, action, resource, resourceId, oldValues, newValues, ipAddress, userAgent, metadata });
  } catch (err) {
    // Audit log failures must never crash the main flow
    logger.error({ msg: 'Failed to write audit log', error: err.message, action, resource });
  }
};
