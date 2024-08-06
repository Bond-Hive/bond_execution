'use strict';
const { getLpMonitoring } = require('./lpMonitoring');
const { getV4Monitoring } = require('./v4Monitoring.js');

async function getInvestorsMonitoringInfo(monitorInput) {
  let result = {};
  for (let strategy in monitorInput) {
    switch (monitorInput[strategy].type) {
    case ("lp"):
      result[monitorInput[strategy].name] = await getLpMonitoring(monitorInput[strategy]);
      break;
    case ("v4"):
      result[monitorInput[strategy].name] = await getV4Monitoring(monitorInput[strategy]);
      break;
    default:
      result[monitorInput[strategy].name] = "Strategy does not exist on Monitoring";
    }
    // Need to add unitization module here and calculating %
  }
  return result;
}

module.exports = {
  getInvestorsMonitoringInfo,
};
