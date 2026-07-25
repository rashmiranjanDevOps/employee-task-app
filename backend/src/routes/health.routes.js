'use strict';

const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

router.get('/', healthController.health);
router.get('/ready', healthController.ready);
router.get('/live', healthController.live);

module.exports = router;
