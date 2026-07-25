'use strict';

const { User } = require('../models');
const { createAuditLog } = require('../services/audit.service');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, department, jobTitle, avatar } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const oldValues = { firstName: user.firstName, lastName: user.lastName, department: user.department, jobTitle: user.jobTitle };
    await user.update({ firstName, lastName, department, jobTitle, avatar });

    await createAuditLog({
      userId: req.user.id, action: 'PROFILE_UPDATED', resource: 'User',
      resourceId: req.user.id, oldValues, newValues: { firstName, lastName, department, jobTitle },
      ipAddress: req.ip, userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, data: { user } });
  } catch (err) { next(err); }
};

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { isActive: true },
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'department', 'jobTitle', 'avatar'],
      order: [['firstName', 'ASC']],
    });
    return res.json({ success: true, data: { users } });
  } catch (err) { next(err); }
};
