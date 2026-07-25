'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', [
  body('firstName').optional().trim().isLength({ min: 1, max: 100 }).withMessage('First name must be 1-100 chars'),
  body('lastName').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Last name must be 1-100 chars'),
  body('department').optional().trim().isLength({ max: 100 }).withMessage('Department max 100 chars'),
  body('jobTitle').optional().trim().isLength({ max: 100 }).withMessage('Job title max 100 chars'),
  // S3 FIX: validate avatar is a proper https URL to prevent SSRF
  body('avatar')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['https'], require_protocol: true })
    .isLength({ max: 500 })
    .withMessage('Avatar must be a valid HTTPS URL (max 500 chars)'),
], validate, userController.updateProfile);
router.get('/', userController.listUsers);

module.exports = router;
