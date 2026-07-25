'use strict';

const User = require('./User');
const Task = require('./Task');
const AuditLog = require('./AuditLog');

// ─── Associations ──────────────────────────────────────────────────────────

// User → Tasks (created)
User.hasMany(Task, { foreignKey: 'createdBy', as: 'createdTasks' });
Task.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// User → Tasks (assigned)
User.hasMany(Task, { foreignKey: 'assignedTo', as: 'assignedTasks' });
Task.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignee' });

// User → AuditLogs
User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = { User, Task, AuditLog };
