const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');

router.get('/getMonitoring/', monitoringController.getMonitoringInfo);
router.get('/getMonitoringTest/', monitoringController.getMonitoringInfoTest);
router.get('/getMonitoringv4/', monitoringController.getMonitoringInfov4);
router.get('/getMarginRatios/', monitoringController.getMarginRatios);
router.get('/getInvestorsMonitoring/', monitoringController.getInvestorsMonitoringInfo);
router.get('/getListOfOrders/:exchangeName/:subaccount/:startDate/:exchangeFee', monitoringController.getListOfOrders);
router.get('/getListOfOrdersV2/:exchangeName', monitoringController.getListOfOrdersV2);
router.get('/getPerformanceReportFromMongoDB', monitoringController.getPerformanceReportFromMongoDB);
router.get('/getConsoleReportFromMongoDB/:hours', monitoringController.getConsoleReportFromMongoDB);
router.get('/getFundingFees/:exchange/:pair', monitoringController.getFundingFees);
router.get('/getGridData/:version/:exchange/:subaccount/:timestamp', monitoringController.getGridData);
router.get('/processAllGrids', monitoringController.processAllGrids);
router.get('/processAllReports', monitoringController.processAllReports);
router.get('/cleanReportFromMongoDB', monitoringController.cleanReportFromMongoDB);
router.get('/masterResearchFunction', monitoringController.masterResearchFunction);
router.get('/poolResearchFunction', monitoringController.poolResearchFunction);
router.get('/masterFundingFee', monitoringController.masterFundingFee);
router.get('/getMonitoringFromMongo', monitoringController.getMonitoringFromMongo);
router.get('/getMonitoringFromMongoV4', monitoringController.getMonitoringFromMongoV4);
router.get('/stopYieldCalc', monitoringController.stopYieldCalc);
router.get('/restartYieldCalc', monitoringController.restartYieldCalc);
router.get('/getYields', monitoringController.getYields);
router.post('/updateOracle/:symbolFuture1/:symbolFuture2/:maturity/:password', monitoringController.updateOracle);

module.exports = router;
