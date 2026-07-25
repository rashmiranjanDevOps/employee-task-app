'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { len: [1, 255] },
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('todo', 'in_progress', 'in_review', 'completed', 'cancelled'),
    defaultValue: 'todo',
    allowNull: false,
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    allowNull: false,
  },
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  estimatedHours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  actualHours: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('tags');
      try { return raw ? JSON.parse(raw) : []; } catch { return []; }
    },
    set(val) {
      this.setDataValue('tags', val ? JSON.stringify(val) : null);
    },
  },
  attachments: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('attachments');
      try { return raw ? JSON.parse(raw) : []; } catch { return []; }
    },
    set(val) {
      this.setDataValue('attachments', val ? JSON.stringify(val) : null);
    },
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'tasks',
  indexes: [
    { fields: ['assignedTo'] },
    { fields: ['createdBy'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { fields: ['dueDate'] },
    { fields: ['isArchived'] },
  ],
});

// Auto-set completedAt when status changes to completed
Task.beforeUpdate((task) => {
  if (task.changed('status')) {
    if (task.status === 'completed' && !task.completedAt) {
      task.completedAt = new Date();
    } else if (task.status !== 'completed') {
      task.completedAt = null;
    }
  }
});

module.exports = Task;
