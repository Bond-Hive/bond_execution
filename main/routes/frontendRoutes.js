const express = require('express');
const router = express.Router();
const frontendController = require('../controllers/frontendController.js');

router.get('/getPerformanceChartData/:strategyName/', frontendController.getPerformanceData);
router.get('/getData/:strategyName/', frontendController.getDataFrontend);
router.get('/', frontendController.alive);

module.exports = router;
