'use strict';
const {
  getListenKey,
  keepAliveListenKey
} = require('./binanceApi');
const ReconnectingWebSocket = require('reconnecting-websocket');
const MyWebSocket = require('websocket').w3cwebsocket;


const webSocketBinance = async (exchange, subaccount, symbol, updateSpeed=null) => {
  const uppercaseSubaccount = subaccount.toUpperCase();
  let apiKey = process.env[`BINANCE_${uppercaseSubaccount}_SUBACCOUNT_API`];
  let apiSecret = process.env[`BINANCE_${uppercaseSubaccount}_SUBACCOUNT_SECRET`];

  let ws;
  let listenKey;
  let checkConnectionInterval = null;
  let keepAliveListenKeyInterval = null;
  let shouldReconnect = true;
  const refreshInterval = 50 * 60 * 1000; // Refresh every 50 minutes to be safe
  const checkInterval = 30 * 1000;

  const setupWebsocketListeners = (ws) => {
    ws.addEventListener('open', async () => {
      console.log(`WebSocket for ${subaccount} connected!`);
      checkConnectionInterval = setInterval(checkConnection, checkInterval);
      keepAliveListenKeyInterval = setInterval(() => keepAliveListenKey(listenKey, apiKey), refreshInterval);
    });

    ws.addEventListener('close', () => {
      console.log(`WebSocket for ${subaccount} connection closed!`);
      if (checkConnectionInterval) {
        clearInterval(checkConnectionInterval);
        checkConnectionInterval = null;
      }
      if (keepAliveListenKeyInterval) {
        clearInterval(keepAliveListenKeyInterval);
        keepAliveListenKeyInterval = null;
      }

      if (shouldReconnect) {
        // Reconnect with exponential back-off
        let reconnectInterval = 1000;  // Start with 1 second
        const maxReconnectInterval = 60 * 1000;  // Max 1 minute
        const reconnect = async () => {
          console.log(`Reconnecting WebSocket for ${subaccount}...`);
          await connectToWebsocket();
          if (ws.readyState !== ReconnectingWebSocket.OPEN) {
            // If still not open, wait for a longer period before trying again
            reconnectInterval *= 2;
            if (reconnectInterval > maxReconnectInterval) {
              reconnectInterval = maxReconnectInterval;
            }
            setTimeout(reconnect, reconnectInterval);
          } else {
            checkConnectionInterval = setInterval(checkConnection, checkInterval);
            keepAliveListenKeyInterval = setInterval(keepAliveListenKey(listenKey, apiKey), refreshInterval);
          }
        };
        setTimeout(reconnect, reconnectInterval);
      }
    });

    ws.addEventListener('error', (error) => {
      console.error(error);
    });
  };

  const connectToWebsocket = async () => {
    try {
      listenKey = await getListenKey(apiKey, apiSecret);
      ws = new ReconnectingWebSocket(
        streamURL(exchange,symbol,updateSpeed),
        null,
        { WebSocket: MyWebSocket }
      );
      ws.binaryType = 'arraybuffer';
      setupWebsocketListeners(ws);  // Attach the listeners to the new websocket instance
    } catch (err) {
      console.error(`Error while trying to connect to WebSocket: ${err}`);
      throw err;
    }
  };

  const checkConnection = async () => {
    if (ws.readyState !== ReconnectingWebSocket.OPEN) {
      console.log('WebSocket is not open. Attempting to reconnect...');
      await connectToWebsocket();
    }
  };

  await connectToWebsocket();

  // Return the WebSocket instance and a close function
  return {
    ws,
    close: () => {
      shouldReconnect = false;
      ws.close();
    },
  };
};


const streamURL = function (exchange, symbol, updateSpeed) {
  let baseURL;
  let parameters = `stream?streams=${symbol}`;

  switch (exchange) {
    case 'binance':
      baseURL = "wss://stream.binance.com:9443/";
      break;
    case 'binanceusdm':
      baseURL = "wss://fstream.binance.com/";
      break;
    default:
      console.error("Invalid exchange provided");
      return null;
  }

  if (updateSpeed !== null) {
    parameters += `@depth20@${updateSpeed}ms`
  }
  return baseURL + parameters;
};

module.exports = {
  webSocketBinance
};
