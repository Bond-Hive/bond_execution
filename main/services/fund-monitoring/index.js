const { getMonitoringInfo } = require('./monitoring/mainMonitoringFunction.js')
  , { getInvestorsMonitoringInfo } = require('./monitoring/investorsMonitoring.js')
  , { getMarginRatios } = require('./monitoring/marginRatioCheck.js')
  , { monitoringWebsocketRoutine } = require('./monitoring/streams/webSocketOrders.js')
  , { masterFundingFee } = require('./monitoring/fundingFee.js')
  , { getVaultInfo } = require('./monitoring/queries/web3Queries.js');


//-----------------------------------------------------------------------------

const packageJson = require('./package.json');
const version = packageJson.version;

//-----------------------------------------------------------------------------

module.exports = {
  getMonitoringInfo,
  getMarginRatios,
  getInvestorsMonitoringInfo,
  monitoringWebsocketRoutine,
  masterFundingFee,
  getVaultInfo,
  version
};
