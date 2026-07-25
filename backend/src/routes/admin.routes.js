'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const adminController = require('../controllers/admin.controller');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate, isAdmin);

const uuidParam = param('id').isUUID().withMessage('Invalid user ID');

router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.listUsers);
router.get('/users/:id', uuidParam, validate, adminController.getUser);
router.put('/users/:id', uuidParam, [
  body('role').optional().isIn(['admin', 'user']),
  body('isActive').optional().isBoolean(),
], validate, adminController.updateUser);
router.delete('/users/:id', uuidParam, validate, adminController.deleteUser);
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
