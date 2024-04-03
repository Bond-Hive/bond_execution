'use strict';
const civfund = require('@civfund/fund-libraries');
const {
  webSocketBinance
} = require('../../main/services/libraries/Websocket');

///////////////////////////// Main Functions ///////////////////////////

const enterDeltaHedge = async function(
  spotExchange,
  futuresExchange,
  subaccount,
  clientOrderId,
  pairSpot,
  pairFutures = null,
  amount,
  spotDecimals,
  futuresDecimals,
  priceFactor = 1,
  profitPercent = 0, 
  hedgeFactor = 2,
  validationThreshold =5
  ) {
  console.log(`Started enterDeltaHedge for subaccount:${subaccount}, pair: ${pairSpot}, amount: ${amount}`);
  // Create WebSocket instances for both exchanges
  pairFutures = pairFutures === null ? pairSpot : pairFutures;
  let wsSpot; let wsFutures;

  if (spotExchange == 'binance'){
    wsSpot = await webSocketBinance(spotExchange, subaccount, removeSlash(pairSpot),1000);
  } else {
    console.log("exchange not available");
    return "exchange not available"
  }

  if (futuresExchange == 'binanceusdm'){
    wsFutures = await webSocketBinance(futuresExchange, subaccount, removeSlash(pairFutures),500);
  } else {
    console.log("exchange not available");
    return "exchange not available"
  }

  // Store the latest depth for both exchanges
  let latestDepthBinance = null;
  let latestDepthBinanceUSDM = null;
  let validationCount = 0;
  let latestImpliedSpotPrice = 0;
  let latestImpliedFuturesPrice = 0;

  let statusInterval = setInterval(() => {
    console.log("Current enterDeltaHedge status:");
    console.log("Latest spot price:", latestImpliedSpotPrice);
    console.log("Required relative futures price:", latestImpliedSpotPrice * (1 + profitPercent / 100));
    console.log("Latest futures price:", latestImpliedFuturesPrice/priceFactor);
  }, 30000); // 5 minutes in milliseconds

  // Define the processing logic
  const processDepth = () => {
    if (latestDepthBinance && latestDepthBinanceUSDM) {
      // Calculate total bid and ask quantities for top 20 levels and get price
      let {totalQuantity: totalAskQuantityBinance, price: priceBinance} = calculateTotalQuantityAndPrice(latestDepthBinance.asks, amount * hedgeFactor);
      let {totalQuantity: totalBidQuantityBinanceUSDM, price: priceBinanceUSDM} = calculateTotalQuantityAndPrice(latestDepthBinanceUSDM.b, amount * hedgeFactor);
      latestImpliedSpotPrice = priceBinance;
      latestImpliedFuturesPrice = priceBinanceUSDM;
      // Calculate the expected futures price
      let expectedFuturesPrice = priceBinance * (1 + profitPercent / 100);

      // Decision-making based on depth and price
      if (
        totalBidQuantityBinanceUSDM >= amount * hedgeFactor &&
        totalAskQuantityBinance >= amount &&
        (priceBinanceUSDM / priceFactor) > expectedFuturesPrice
      ) {
        validationCount++;
        if (validationCount >= validationThreshold) {
          console.log("Favorable market conditions validated multiple times, consider entering a hedge position");
          console.log("Futures Bid Price:",priceBinanceUSDM/priceFactor);
          console.log("Spot Ask Price:",priceBinance);
          clearInterval(statusInterval);  // Clear the interval when closing the function
          wsSpot.close();
          wsFutures.close();
          console.log("spotExchange",spotExchange);
          console.log("subaccount",subaccount);
          console.log("pairSpot",pairSpot);
          console.log("amount",amount);
          console.log("spotDecimals",spotDecimals);
          console.log("clientOrderId",clientOrderId);

          executeSpotOrderWithWebsocket(
            spotExchange,
            subaccount,
            pairSpot,
            amount,
            spotDecimals,
            'BUY',
            'MARKET',
            clientOrderId
          );
          executeFuturesOrderWithWebsocket(
            futuresExchange,
            subaccount,
            (pairFutures).toLowerCase(),
            amount/priceFactor,
            futuresDecimals,
            'SELL',
            'MARKET',
            clientOrderId
          );
        } else {
          console.log("Favorable condition validated. Awaiting more validations.");
        }
      } else {
        validationCount = 0;
        // console.log("No market conditions validated multiple times, consider exiting a hedge position");
        // console.log("Spot Bid Price:",priceBinance);
        // console.log("Futures Ask Price:",priceBinanceUSDM/priceFactor);
      }
    }
  };

  // Process data from binance WebSocket
  wsSpot.ws.addEventListener('message', (response) => {
    let message = JSON.parse(response.data);
    latestDepthBinance = message.data;  // Update to get data field of the message
    processDepth();
  });

  // Process data from binanceusdm WebSocket
  wsFutures.ws.addEventListener('message', (response) => {
    let message = JSON.parse(response.data);
    latestDepthBinanceUSDM = message.data;  // Update to get data field of the message
    processDepth();
  });

  // For closing websockets and setInterval
  const closeWebSockets = () => {
    wsSpot.close();
    wsFutures.close();
    clearInterval(statusInterval);  // Clear the interval when closing the function
  };
  return closeWebSockets;
};

// enterDeltaHedge('binance','binanceusdm','Test','V2_21','btc/usdt','btc/usdt_240628',0.5,1,5);

// Helper function to calculate total quantity and price at that quantity level
const calculateTotalQuantityAndPrice = (levels, targetQuantity) => {
  let totalQuantity = 0;
  let price = 0;
  for (let i = 0; i < levels.length; i++) {
    totalQuantity += parseFloat(levels[i][1]);
    price = parseFloat(levels[i][0]);
    if (totalQuantity >= targetQuantity) {
      break;
    }
  }
  return {totalQuantity, price};
};


const executeSpotOrderWithWebsocket = async function(
  exchange,
  subaccount,
  pair,
  amount,
  decimals,
  side,
  orderType,
  clientOrderId
  ){
  let cex = await civfund.initializeCcxt(exchange,subaccount);
  civfund.ccxt.ccxtCreateOrderWithNomenclature(
    cex,
    exchange,
    pair,
    orderType,
    side,
    Number(Number(amount).toFixed(decimals)),
    undefined,
    `${clientOrderId}`,
    process.env.CCXT_PASSWORD,
  );
  return "Order Executed";
  // executeSpotOrderWithWebsocket('binance','Test','ETH/USDT',0.005,3,'BUY','MARKET','V2_21');
};


const executeFuturesOrderWithWebsocket = function(
  exchange,
  subaccount,
  pair,
  amount,
  decimals,
  side,
  orderType,
  clientOrderId
  ){

  let priceMonitor = new civfund.PriceMonitor(
    'last',
    pair,
    null,
    exchange,
    subaccount,
    null,
    null,
    false
  );
  
  priceMonitor.binanceCreateOrder(
    subaccount,
    pair,
    orderType,
    side,
    Number(Number(amount).toFixed(decimals)),
    null,
    `${clientOrderId}:0`
  );
  return "Order Executed";
};


// enterDeltaHedge('binance','binanceusdm','Test','V2_21','shib/usdt','1000shib/usdt',1000000,1000,0);

// async function initializeWebSocket() {
//   // Call the function and get the WebSocket instance
//   const ws = await webSocketBinance('binanceusdm','Test','btcusdt',500);

//   // Add an additional event listener
//   ws.addEventListener('message', async (response) => {
//     let message = JSON.parse(response.data);
//     console.log("heading for the incoming trade",response.data);
//   });
// }

// initializeWebSocket();
function removeSlash(symbol) {
  return symbol.replace('/', '').toLowerCase();
}


module.exports = {
  enterDeltaHedge,
};