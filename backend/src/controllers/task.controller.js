'use strict';

const { Op } = require('sequelize');
const { Task, User } = require('../models');
const { createAuditLog } = require('../services/audit.service');
const logger = require('../utils/logger');

const TASK_INCLUDE = [
  { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
  { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'email', 'avatar'] },
];

const TASK_SORTABLE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'dueDate', 'title', 'status', 'priority',
]);

exports.getTasks = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, status, priority, assignedTo,
      search, sortBy = 'createdAt', sortOrder = 'DESC',
    } = req.query;

    const where = { isArchived: false };
    const andConditions = [];

    // Non-admins only see their tasks
    if (req.user.role !== 'admin') {
      andConditions.push({ [Op.or]: [{ assignedTo: req.user.id }, { createdBy: req.user.id }] });
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTo) where.assignedTo = assignedTo;
    if (search) {
      andConditions.push({
        [Op.or]: [
          { title: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (andConditions.length > 0) {
      where[Op.and] = andConditions;
    }

    const safeSortBy = TASK_SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Task.findAndCountAll({
      where,
      include: TASK_INCLUDE,
      order: [[safeSortBy, safeSortOrder]],
      limit: parseInt(limit),
      offset,
    });

    return res.json({
      success: true,
      data: {
        tasks: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id, { include: TASK_INCLUDE });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== 'admin' && task.assignedTo !== req.user.id && task.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    return res.json({ success: true, data: { task } });
  } catch (err) {
    next(err);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    const { title, description, status, priority, assignedTo, dueDate, estimatedHours, tags } = req.body;

    if (assignedTo) {
      const assignee = await User.findByPk(assignedTo);
      if (!assignee) return res.status(404).json({ success: false, error: 'Assigned user not found' });
    }

    const task = await Task.create({
      title, description, status, priority, assignedTo,
      dueDate, estimatedHours, tags,
      createdBy: req.user.id,
    });

    const fullTask = await Task.findByPk(task.id, { include: TASK_INCLUDE });

    await createAuditLog({
      userId: req.user.id,
      action: 'TASK_CREATED',
      resource: 'Task',
      resourceId: task.id,
      newValues: { title, status, priority, assignedTo },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info({ msg: 'Task created', taskId: task.id, createdBy: req.user.id });

    return res.status(201).json({ success: true, data: { task: fullTask } });
  } catch (err) {
    next(err);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== 'admin' && task.createdBy !== req.user.id && task.assignedTo !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const allowedFields = ['title', 'description', 'status', 'priority', 'assignedTo', 'dueDate', 'estimatedHours', 'actualHours', 'tags'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const oldValues = task.toJSON();
    await task.update(updates);

    const updatedTask = await Task.findByPk(task.id, { include: TASK_INCLUDE });

    await createAuditLog({
      userId: req.user.id,
      action: 'TASK_UPDATED',
      resource: 'Task',
      resourceId: task.id,
      oldValues: { ...oldValues, tags: oldValues.tags },
      newValues: updates,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, data: { task: updatedTask } });
  } catch (err) {
    next(err);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== 'admin' && task.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await task.update({ isArchived: true });

    await createAuditLog({
      userId: req.user.id,
      action: 'TASK_DELETED',
      resource: 'Task',
      resourceId: task.id,
      oldValues: { title: task.title },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, message: 'Task archived successfully' });
  } catch (err) {
    next(err);
  }
};

exports.assignTask = async (req, res, next) => {
  try {
    const { assignedTo } = req.body;
    const task = await Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.user.role !== 'admin' && task.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Only task creator or admin can reassign' });
    }

    if (assignedTo) {
      const assignee = await User.findByPk(assignedTo);
      if (!assignee) return res.status(404).json({ success: false, error: 'Assignee not found' });
    }

    const previousAssignedTo = task.assignedTo;
    await task.update({ assignedTo });
    const updatedTask = await Task.findByPk(task.id, { include: TASK_INCLUDE });

    await createAuditLog({
      userId: req.user.id,
      action: 'TASK_ASSIGNED',
      resource: 'Task',
      resourceId: task.id,
      oldValues: { assignedTo: previousAssignedTo },
      newValues: { assignedTo },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, data: { task: updatedTask } });
  } catch (err) {
    next(err);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const where = { isArchived: false };
    if (req.user.role !== 'admin') {
      where[Op.or] = [{ assignedTo: req.user.id }, { createdBy: req.user.id }];
    }

    const [total, todo, inProgress, inReview, completed, cancelled] = await Promise.all([
      Task.count({ where }),
      Task.count({ where: { ...where, status: 'todo' } }),
      Task.count({ where: { ...where, status: 'in_progress' } }),
      Task.count({ where: { ...where, status: 'in_review' } }),
      Task.count({ where: { ...where, status: 'completed' } }),
      Task.count({ where: { ...where, status: 'cancelled' } }),
    ]);

    const overdue = await Task.count({
      where: {
        ...where,
        status: { [Op.notIn]: ['completed', 'cancelled'] },
        dueDate: { [Op.lt]: new Date() },
      },
    });

    return res.json({
      success: true,
      data: {
        stats: { total, todo, inProgress, inReview, completed, cancelled, overdue },
      },
    });
  } catch (err) {
    next(err);
  }
};
