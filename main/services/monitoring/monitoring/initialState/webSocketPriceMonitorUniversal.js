let webSocketPriceMonitorUniversal;

const setWebSocketPriceMonitorUniversal = function (webSocketPriceMonitorUniversalInstance) {
  webSocketPriceMonitorUniversal = webSocketPriceMonitorUniversalInstance;
}

const getWebSocketPriceMonitorUniversal = function () {
  if (!webSocketPriceMonitorUniversal) {
    throw new Error('WebSocketPriceMonitorUniversal not set');
  }
  return webSocketPriceMonitorUniversal;
}

module.exports = {
  setWebSocketPriceMonitorUniversal,
  getWebSocketPriceMonitorUniversal
};