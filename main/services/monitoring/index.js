const { getMonitoringInfo } = require('./monitoring/mainMonitoringFunction.js')
  , { setWebSocketPriceMonitorUniversal } = require('./monitoring/initialState/webSocketPriceMonitorUniversal.js')
  , { getInvestorsMonitoringInfo } = require('./monitoring/investorsMonitoring.js')
  , { getMarginRatios } = require('./monitoring/marginRatioCheck.js')
  , { monitoringWebsocketRoutine } = require('./monitoring/streams/webSocketOrders.js')
  , { masterFundingFee } = require('./monitoring/fundingFee.js')
  , { getVaultInfo } = require('./monitoring/queries/web3Queries.js');


//-----------------------------------------------------------------------------


//-----------------------------------------------------------------------------

module.exports = {
  getMonitoringInfo,
  getMarginRatios,
  getInvestorsMonitoringInfo,
  monitoringWebsocketRoutine,
  masterFundingFee,
  getVaultInfo,
  setWebSocketPriceMonitorUniversal,
};
