'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  resource: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  resourceId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  oldValues: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('oldValues');
      try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    set(val) {
      this.setDataValue('oldValues', val ? JSON.stringify(val) : null);
    },
  },
  newValues: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('newValues');
      try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    set(val) {
      this.setDataValue('newValues', val ? JSON.stringify(val) : null);
    },
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  userAgent: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('metadata');
      try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
    },
    set(val) {
      this.setDataValue('metadata', val ? JSON.stringify(val) : null);
    },
  },
}, {
  tableName: 'audit_logs',
  updatedAt: false,
  indexes: [
    { fields: ['userId'] },
    { fields: ['action'] },
    { fields: ['resource'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = AuditLog;
