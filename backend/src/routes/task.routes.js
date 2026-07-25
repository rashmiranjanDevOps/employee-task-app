'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const taskController = require('../controllers/task.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate);

const taskValidators = [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title required (1-255 chars)'),
  body('status').optional().isIn(['todo', 'in_progress', 'in_review', 'completed', 'cancelled']).withMessage('Invalid status'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  body('dueDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid due date'),
  body('estimatedHours').optional({ values: 'falsy' }).isFloat({ min: 0, max: 9999 }).withMessage('Invalid estimated hours'),
  body('assignedTo').optional({ values: 'falsy' }).isUUID().withMessage('Invalid assignee'),
];

// W1: limit search query length to prevent oversized LIKE queries
const listQueryValidators = [
  query('search').optional().isLength({ max: 200 }).withMessage('Search term too long (max 200 chars)').trim().escape(),
  query('page').optional().isInt({ min: 1 }).withMessage('Invalid page'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
  query('status').optional().isIn(['todo', 'in_progress', 'in_review', 'completed', 'cancelled']).withMessage('Invalid status'),
  query('priority').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'dueDate', 'title', 'status', 'priority']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['ASC', 'DESC']).withMessage('Invalid sort order'),
];

const uuidParam = param('id').isUUID().withMessage('Invalid task ID');

// B1 FIX: /stats MUST be registered before /:id so Express doesn't match
//         "stats" as a UUID parameter.
router.get('/', listQueryValidators, validate, taskController.getTasks);
router.get('/stats', taskController.getStats);
router.get('/:id', uuidParam, validate, taskController.getTask);
router.post('/', taskValidators, validate, taskController.createTask);
router.put('/:id', uuidParam, taskValidators, validate, taskController.updateTask);
router.patch('/:id/assign', uuidParam, body('assignedTo').optional().isUUID(), validate, taskController.assignTask);
router.delete('/:id', uuidParam, validate, taskController.deleteTask);

module.exports = router;
