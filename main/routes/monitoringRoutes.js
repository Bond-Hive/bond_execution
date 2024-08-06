const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');

router.get('/stopYieldCalc', monitoringController.stopYieldCalc);
router.get('/restartYieldCalc', monitoringController.restartYieldCalc);
router.get('/getYields', monitoringController.getYields);
router.post('/updateOracle', monitoringController.updateOracle);
router.post('/transferTreasury', monitoringController.transferTreasury);

module.exports = router;
