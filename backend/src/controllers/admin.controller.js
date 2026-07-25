'use strict';

const { Op } = require('sequelize');
const { User, Task, AuditLog } = require('../models');
const { createAuditLog } = require('../services/audit.service');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, activeUsers, totalTasks, completedTasks, overdueTasks] = await Promise.all([
      User.count(),
      User.count({ where: { isActive: true } }),
      Task.count({ where: { isArchived: false } }),
      Task.count({ where: { status: 'completed', isArchived: false } }),
      Task.count({
        where: {
          isArchived: false,
          status: { [Op.notIn]: ['completed', 'cancelled'] },
          dueDate: { [Op.lt]: new Date() },
        },
      }),
    ]);

    const recentActivity = await AuditLog.findAll({
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    return res.json({
      success: true,
      data: { stats: { totalUsers, activeUsers, totalTasks, completedTasks, overdueTasks }, recentActivity },
    });
  } catch (err) { next(err); }
};

exports.listUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const where = {};
    if (search) where[Op.or] = [
      { firstName: { [Op.like]: `%${search}%` } },
      { lastName: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await User.findAndCountAll({
      where, order: [['createdAt', 'DESC']], limit: parseInt(limit), offset,
    });

    return res.json({
      success: true,
      data: { users: rows, pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) } },
    });
  } catch (err) { next(err); }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // W5 FIX: only update fields explicitly provided in the request body
    const ALLOWED_FIELDS = ['firstName', 'lastName', 'role', 'isActive', 'department', 'jobTitle'];
    const updates = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Record safe old values (never include sensitive fields like password/refreshToken)
    const oldValues = {
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      department: user.department,
      jobTitle: user.jobTitle,
    };

    await user.update(updates);

    await createAuditLog({
      userId: req.user.id, action: 'ADMIN_USER_UPDATED', resource: 'User',
      resourceId: user.id, oldValues, newValues: updates,
      ipAddress: req.ip, userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    await user.update({ isActive: false });

    await createAuditLog({
      userId: req.user.id, action: 'ADMIN_USER_DEACTIVATED', resource: 'User',
      resourceId: user.id, oldValues: { isActive: true }, newValues: { isActive: false },
      ipAddress: req.ip, userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
};

exports.getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, action, resource } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resource) where.resource = resource;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    return res.json({
      success: true,
      data: { logs: rows, pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) } },
    });
  } catch (err) { next(err); }
};
