const env = require('../configEnv/configEnv.js');
const civfund = require('@civfund/fund-libraries');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const mongoDBUrl = env.MONGODB_URL;
const BigNumber = require('bignumber.js');
const crypto = require('crypto');
const { addDays, isBefore } = require('date-fns');
const proxyRequest = require('../libraries/proxyRequest.js');
const { BinanceWebSocketClient } = require('./bnbPrice.js');

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let webSocketMap = {};

const {
  getListenKey,
  keepAliveListenKey,
} = require('../libraries/binanceApi.js');

const {
  createOrdersModel,
  summarySchema
} = require('../libraries/ordersDatabase.js');

const getDatabaseUrl = (url, dbName) => {
  let originalString = url;
  // Find the position of the last '/' character in the original string
  let lastSlashIndex = originalString.lastIndexOf('/');
  // Find the position of the '?' character in the original string
  let questionMarkIndex = originalString.indexOf('?');
  // Extract the substring before and after the '/' character
  let stringBeforeSlash = originalString.substring(0, lastSlashIndex + 1);
  // Concatenate the new database name with the string after the slash
  let newStringAfterSlash = dbName;
  // Concatenate the final string
  let finalString = stringBeforeSlash + newStringAfterSlash + originalString.substring(questionMarkIndex);

  return finalString;
};

const monitoringWebsocketRoutine = async (monitoringInfoFile, websocketInfoFile) => {
  const websocketInfo = JSON.parse(JSON.stringify(websocketInfoFile));

  // Validate the two files for exchanges, assets (Pairs) and start Date is good for monitoring file, otherwise throws error
  validateInputs(monitoringInfoFile, websocketInfoFile);

  //Looping through each exchange in websocket info files
  for (const exchange in websocketInfo) {
    const dbName = `${exchange}-Orders`;
    try {
      await mongoose.connect(getDatabaseUrl(mongoDBUrl, dbName));
      console.log('Connected to MongoDB successfully!');
    } catch (err) {
      console.error(`Error connecting to MongoDB: ${err}`);
      throw err;  // Optionally re-throw the error if you want the function to terminate here
    }
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'MongoDB connection error:'));

    const subaccountNames = Object.keys(websocketInfo[exchange]);

    for (const subaccount of subaccountNames) {
      console.log('PROCESSING ', subaccount);
      const subaccountInfo = websocketInfo[exchange][subaccount];
      const assets = subaccountInfo.assets;
      const reconciliationCallInterval = subaccountInfo.reconciliationCallInterval; // in hours
      const reconciliationLookbackDuration = subaccountInfo.reconciliationLookbackDuration; // in hours

      // Check if a summary file exists for the subaccount
      let Summary = summarySchema();
      const existingSummary = await Summary.findOne({ subaccountName: subaccount });
      let commencementDate = subaccountInfo.commencementDate;
      let firstTime = true;

      if (!existingSummary) {
        console.error('No summary file found for', subaccount);
        await initializeSummaryFile(subaccount, commencementDate);

        // Delete all existing collections under the database if they are empty
        try {
          const collections = await mongoose.connection.db.listCollections().toArray();

          for (const collection of collections) {
            const count = await mongoose.connection.db.collection(collection.name).countDocuments();
            if (count === 0) {
              await mongoose.connection.db.dropCollection(collection.name);
            }
          }
        } catch (error) {
          console.error('Error deleting empty collections:', error);
        }
      } else {
        commencementDate = new Date(existingSummary.lastTradeAdded).toISOString().slice(0, -8);
        firstTime = false;
      }

      // Run trade reconciliation and save the historical trades
      const executeTradesRecon = (asset) => {
        tradesRecon(exchange, dbName, subaccount, asset, null, reconciliationLookbackDuration);
      }

      const scheduleTradesRecon = async () => {
        for (const asset of assets) {
          // Start the schedule
          const initialDelay = calculateInitialDelayForReconciliation();
          // Adjust this if tradesRecon requires different parameters
          setTimeout(async () => {
            await tradesRecon(exchange, dbName, subaccount, asset, commencementDate, null, firstTime);
            setInterval(() => executeTradesRecon(asset), reconciliationCallInterval * 60 * 60 * 1000); // Run every hour
          }, initialDelay);

          await sleep(5000); // Sleep for 5 sec before processing the next asset
        }
      }

      // Start the process
      scheduleTradesRecon();

      // Open the WebSocket for the subaccount
      await webSocketOrdersBinance(subaccount, websocketInfoFile);
    }
  }
};

function calculateInitialDelayForReconciliation() {
  const now = new Date();
  const currentMinutes = now.getUTCMinutes();
  const currentSeconds = now.getUTCSeconds();
  const currentMilliseconds = now.getUTCMilliseconds();

  // Calculate the delay to start at xx:11
  let delayInMinutes;
  if (currentMinutes >= 11) {
    // If we're past xx:11, schedule for xx:11 in the next hour
    delayInMinutes = 60 - currentMinutes + 11;
  } else {
    // Otherwise, schedule for xx:11 this hour
    delayInMinutes = 11 - currentMinutes;
  }

  const delay = delayInMinutes * 60 * 1000 - currentSeconds * 1000 - currentMilliseconds; // Convert minutes to milliseconds
  return delay;
}

const webSocketOrdersBinance = async (subaccount) => {
  console.log('WEBSOCKET FUNCTION CALLED FOR ', subaccount)
  const bnbStream = new BinanceWebSocketClient('wss://stream.binance.com:9443/ws', 'bnbusdt');
  const uppercaseSubaccount = subaccount.toUpperCase();
  let apiKey = env[`BINANCE_${uppercaseSubaccount}_SUBACCOUNT_API`];
  let apiSecret = env[`BINANCE_${uppercaseSubaccount}_SUBACCOUNT_SECRET`];
  let Orders = createOrdersModel(subaccount);
  let Summary = summarySchema();
  const dbName = `binanceusdm-Orders`;

  let listenKey;
  const refreshInterval = 50 * 60 * 1000; // Refresh every 50 minutes to be safe
  const checkInterval = 5 * 60 * 1000; // Check Every 10 minutes
  const keepAlive = async (subaccount, listenKey, apiKey) => {
    if (webSocketMap[subaccount]) {
      const currentTime = new Date().getTime();
      // COmpare timestamps
      const lastRefreshedListenKey = webSocketMap[subaccount].lastRefreshedListenKey || null;

      if ((Number(currentTime) > Number(lastRefreshedListenKey) + refreshInterval)) {
        console.log('ListenKey for ', subaccount, ' has expired. Attempting to refresh...');
        try {
          webSocketMap[subaccount].lastRefreshedListenKey = new Date().getTime();
          await keepAliveListenKey(subaccount, listenKey, apiKey);
          // SetTimeout to run the function again
          setTimeout(() => keepAlive(subaccount, listenKey, apiKey), refreshInterval);
          console.log('Successfully refreshed listenKey for ', subaccount);
        } catch (error) {
          console.error('Error while trying to refresh listenKey for ', subaccount);
        }
      }
    }
  };

  const setupWebsocketListeners = () => {
    if (webSocketMap[subaccount]) {
      webSocketMap[subaccount]._openListener = async () => {
        setTimeout(() => keepAlive(subaccount, listenKey, apiKey), refreshInterval);
        console.log(`WebSocket for ${subaccount} connected from open event!`);
      };
      webSocketMap[subaccount]._messageListener = async (response) => {
        let message = JSON.parse(response.data);
        if (!mongoose.connection.readyState) { // Check if the connection is open
          try {
            await mongoose.connect(getDatabaseUrl(mongoDBUrl, dbName));
            console.log('Connected to MongoDB successfully!');
          } catch (err) {
            console.error(`Error connecting to MongoDB: ${err}`);
            throw err;  // Optionally re-throw the error if you want the function to terminate here
          }
        }

        if (message.e === 'ORDER_TRADE_UPDATE') {
          let orderUpdate = message.o;
          if (message.o.X === 'FILLED') {
            console.log('Message from', subaccount)

            let orderIdString = new BigNumber(orderUpdate.i).toString();
            let shortOrderIdString = orderIdString.slice(0, 14);

            let similarOrders = await Orders.find({ transactTime: orderUpdate.T });

            for (let order of similarOrders) {
              if (order.orderId.slice(0, 14) === shortOrderIdString &&
                order.clientOrderId === orderUpdate.c &&
                parseFloat(order.price) === parseFloat(orderUpdate.ap) &&
                parseFloat(order.executedQty) === parseFloat(orderUpdate.z)) {
                console.log(`Order ${shortOrderIdString} already exists, skipping.`);
                return;
              }
            }

            let fees = orderUpdate.N === 'BNB' ? (parseFloat(orderUpdate.n) * parseFloat(bnbStream.getPrice())).toString() : orderUpdate.n;

            let newOrder = new Orders({
              symbol: orderUpdate.s,
              orderId: orderIdString,
              clientOrderId: orderUpdate.c,
              transactTime: orderUpdate.T,
              price: orderUpdate.ap,
              origQty: orderUpdate.q,
              executedQty: orderUpdate.z,
              originalFees: orderUpdate.n,
              fees: fees,
              feesAsset: orderUpdate.N,
              status: orderUpdate.X,
              timeInForce: orderUpdate.f,
              type: orderUpdate.o,
              side: orderUpdate.S,
              originalPrice: orderUpdate.p,
              stopPrice: orderUpdate.sp,
            });
            try {
              await newOrder.save();
              // await PartialOrders.deleteOne({ orderId: orderIdString });
            } catch (error) {
              console.error(error);
            }
            let currentTime = new Date().toISOString();
            await Summary.updateOne({ subaccountName: subaccount }, { lastTradeAdded: currentTime }).exec();
          }
        }
      };
      webSocketMap[subaccount]._closeListener = async (event) => {
        console.log(`WebSocket for ${subaccount} connection closed with code ${event.code}: ${event.reason}`);
        const currentServerTime = new Date().toISOString();
        if (webSocketMap[subaccount]) {
          webSocketMap[subaccount].startReconTime = currentServerTime;
        }
      };
      webSocketMap[subaccount]._errorListener = (error) => {
        console.log('Error on websocket for ', subaccount)
        console.error(error.message || 'N/A');
        console.error(error.code || 'N/A');
      };

      webSocketMap[subaccount].addEventListener('open', webSocketMap[subaccount]._openListener);
      webSocketMap[subaccount].addEventListener('message', webSocketMap[subaccount]._messageListener);
      webSocketMap[subaccount].addEventListener('close', webSocketMap[subaccount]._closeListener);
      webSocketMap[subaccount].addEventListener('error', webSocketMap[subaccount]._errorListener);
    }
  };

  const connectToWebsocket = async () => {
    console.log("Connecting to websocket called for ", subaccount);
    if (!webSocketMap[subaccount]) {
      try {
        listenKey = await getListenKey(subaccount, apiKey, apiSecret);

        if (listenKey) {
          webSocketMap[subaccount] = new WebSocket(
            `wss://fstream.binance.com/ws/${listenKey}`
          );

          setupWebsocketListeners(webSocketMap[subaccount]);
          console.log('Websocket setup completed for ', subaccount)
          return true;
        } else return false;
      } catch (err) {
        console.error(`Error while trying to connect to WebSocket for ${subaccount}`);
        console.error(`Error Message: ${err.message || 'N/A'}`);
        console.error(`Error Code: ${err.code || 'N/A'}`);
        return false;
      }
    } else return false;
  };

  const closeWebSocket = async (subaccount) => {
    if (webSocketMap[subaccount]) {
      console.log(`Closing WebSocket for ${subaccount}`);

      // Remove all listeners
      webSocketMap[subaccount].removeEventListener('open', webSocketMap[subaccount]._openListener);
      webSocketMap[subaccount].removeEventListener('message', webSocketMap[subaccount]._messageListener);
      webSocketMap[subaccount].removeEventListener('close', webSocketMap[subaccount]._closeListener);
      webSocketMap[subaccount].removeEventListener('error', webSocketMap[subaccount]._errorListener);

      //const closeSocket = await closeListenKey(subaccount, apiKey, apiSecret);

      webSocketMap[subaccount].terminate();
      console.log(`WebSocket for ${subaccount} closed successfully!`);

      delete webSocketMap[subaccount];
      console.log('Deleted Websocket succesfully for ', subaccount)
    }
  };

  const checkConnection = async () => {
    if (!webSocketMap[subaccount]) {
      await connectToWebsocket();
    } else if (webSocketMap[subaccount] && webSocketMap[subaccount].readyState !== WebSocket.OPEN) {
      console.log(`WebSocket for ${subaccount} is not open. Attempting to reconnect...`);
      // Record the current server time before closing the WebSocket

      await closeWebSocket(subaccount);
      await connectToWebsocket();
      //await reconcileOnWebSocketError(websocketInfoFile, 'binanceusdm', subaccount, currentServerTime);

      if (webSocketMap[subaccount]) webSocketMap[subaccount].startReconTime = null;
    }
  };

  await connectToWebsocket();
  setInterval(checkConnection, checkInterval);
};

const reconcileOnWebSocketError = async (websocketInfoFile, exchange, subaccount) => {
  // Extract the necessary information from websocketInfoFile for the given subaccount
  const websocketInfo = JSON.parse(JSON.stringify(websocketInfoFile));
  const dbName = `${exchange}-Orders`;
  const assets = websocketInfo[exchange][subaccount].assets;
  // Run trade reconciliation using the provided commencementDate
  for (const asset of assets) {
    await tradesRecon(exchange, dbName, subaccount, asset, /*commencementDate*/null, 6, false);
  }
  console.log(`Reconciliation completed for ${subaccount} after WebSocket error.`);
};

const formatToRequiredDateTradesRecon = (date) => {
  // Extract components of the date
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');

  // Combine components to create the required format
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;
}

const tradesRecon = async function (
  exchangeName,
  dbName,
  subaccount,
  pair,
  startDate = null,
  sinceLastHours = 6,
  firstTime = false
) {
  if (!mongoose.connection.readyState) { // Check if the connection is open
    try {
      await mongoose.connect(getDatabaseUrl(mongoDBUrl, dbName));
      console.log('Connected to MongoDB successfully!');
    } catch (err) {
      console.error(`Error connecting to MongoDB: ${err}`);
      throw err;  // Optionally re-throw the error if you want the function to terminate here
    }
  }

  const now = new Date();
  const fromDate = startDate
    ? formatToRequiredDateTradesRecon(new Date(startDate))
    : new Date(now.getTime() - sinceLastHours * 60 * 60 * 1000).toISOString();

  let totalTradesAdded = 0;
  const tradesAdded = await processSubaccount(subaccount, exchangeName, fromDate, pair, startDate);
  totalTradesAdded += tradesAdded;

  // Delete duplicate orders for the subaccount
  let Orders = createOrdersModel(subaccount);
  let query = startDate ? { transactTime: { $gt: Date.parse(startDate) } } : {};
  let existingOrders = await Orders.find(query);

  let ordersMap = new Map();
  let deletedCount = 0;

  for (const order of existingOrders) {
    const orderKey = order.orderId.toString().slice(0, 14) + order.transactTime + order.clientOrderId + parseFloat(order.price) + parseFloat(order.executedQty);
    if (!ordersMap.has(orderKey)) {
      let isCloseDupe = false;

      // Check for close duplicates in transactTime with the same clientOrderId
      for (const existingOrder of ordersMap.values()) {
        const isSameClientOrderId = order.clientOrderId === existingOrder.clientOrderId;
        const isCloseTransactTime = Math.abs(order.transactTime - existingOrder.transactTime) <= 5000; // 5 seconds

        if (isSameClientOrderId && isCloseTransactTime) {
          // Close duplicate found
          await Orders.deleteOne({ _id: order._id });
          deletedCount++;
          isCloseDupe = true;
          break;
        }
      }

      // If no close duplicate found, add to map
      if (!isCloseDupe) {
        ordersMap.set(orderKey, order);
      }
    } else {
      // Absolute duplicate found
      await Orders.deleteOne({ _id: order._id });
      deletedCount++;
    }
  }

  // Update summary object, for sumOfOrders

  if ((totalTradesAdded > 0 || deletedCount > 0) && (!firstTime)) {
    let Summary = summarySchema();
    await Summary.updateOne({ subaccountName: subaccount }, { recentErrorInReconciliation: true }).exec();
    console.error(`totalTradesAdded:${totalTradesAdded} | deletedCount ${deletedCount}`)
  }

  console.log(`Duplicate orders deleted for ${subaccount}:`, deletedCount);
  console.log(`Total trades added: ${totalTradesAdded}`);
};


const dupeFunction = async function (
  exchange,
  subaccount,
  startDate = null,
  sinceLastHours = 24,
) {
  const dbName = `${exchange}-Orders`;
  const collectionName = `${subaccount.toLowerCase()}_accounts`;
  let mongoDBModel = "trades";
  let now = new Date();
  let query = startDate
    ? { transactTime: { $gt: Date.parse(startDate) } }
    : { transactTime: { $gt: now.getTime() - sinceLastHours * 60 * 60 * 1000 } };
  let existingOrders = await civfund.dbMongoose.findAllQuery(dbName, collectionName, query, mongoDBModel);
  let ordersMap = new Map();
  let deletedCount = 0;

  for (const order of existingOrders) {
    const orderKey = order.orderId.toString().slice(0, 14) + order.transactTime + order.clientOrderId + parseFloat(order.price) + parseFloat(order.executedQty);
    if (!ordersMap.has(orderKey)) {
      let isCloseDupe = false;

      // Check for close duplicates in transactTime with the same clientOrderId
      for (const existingOrder of ordersMap.values()) {
        const isSameClientOrderId = order.clientOrderId === existingOrder.clientOrderId;
        const isCloseTransactTime = Math.abs(order.transactTime - existingOrder.transactTime) <= 5000; // 5 seconds

        if (isSameClientOrderId && isCloseTransactTime) {
          // Close duplicate found
          await civfund.dbMongoose.deleteOne(dbName, collectionName, "_id", order._id, mongoDBModel);
          deletedCount++;
          isCloseDupe = true;
          break;
        }
      }

      // If no close duplicate found, add to map
      if (!isCloseDupe) {
        ordersMap.set(orderKey, order);
      }
    } else {
      // Absolute duplicate found
      await civfund.dbMongoose.deleteOne(dbName, collectionName, "_id", order._id, mongoDBModel);
      deletedCount++;
    }
  }
  return deletedCount;
};

const processSubaccount = async function (subaccount, exchangeName, fromDate, pair, startDate) {
  const cex = civfund.initializeCcxt(exchangeName, subaccount);
  const Orders = createOrdersModel(subaccount);
  let tradesAdded = 0;
  const modifiedPair = removeSlash(pair);
  const allTrades = await getOrdersClientOrderAPI(cex, modifiedPair, fromDate);
  const sortedTrades = Object.values(allTrades).sort((a, b) => a.timestamp - b.timestamp);
  const existingOrders = await Orders.find({ transactTime: { $gte: Date.parse(fromDate) } });

  let existingOrdersMap = new Map();
  for (const order of existingOrders) {
    const orderKey = order.orderId.toString().slice(0, 14) + order.clientOrderId + parseFloat(order.price) + parseFloat(order.executedQty);
    existingOrdersMap.set(orderKey, order);
  }

  for (const trade of sortedTrades) {
    let tradeKey = '';
    if (trade.id && trade.timestamp && trade.amount) {
      tradeKey = new BigNumber(trade.id).toString().slice(0, 14) + trade.clientOrderId + parseFloat(trade.avgPrice ?? trade.average) + parseFloat(trade.amount);
    } else if (trade.orderId && trade.time && trade.executedQty) {
      tradeKey = new BigNumber(trade.orderId).toString().slice(0, 14) + trade.clientOrderId + parseFloat(trade.avgPrice ?? trade.average) + parseFloat(trade.executedQty);
    }

    if (!existingOrdersMap.has(tradeKey) && (trade.status == 'closed' || trade.status == 'FILLED')) {
      let Summary = summarySchema();
      let currentTime = new Date().toISOString();
      await Summary.updateOne({ subaccountName: subaccount }, { lastTradeAdded: currentTime }).exec();
      await saveNewOrder(Orders, trade, startDate);
      tradesAdded++;
    }
  }

  return tradesAdded;
}


function removeSlash(inputString) {
  return inputString.replace(/\//g, '');
}

async function getOrdersClientOrderAPI(cex, symbol, sinceDate, recvWindow = 50000) {
  let startTime = Date.parse(sinceDate);
  let trades = [];
  const BASE_URL = 'https://fapi.binance.com';
  const ENDPOINT = '/fapi/v1/allOrders';

  const now = Date.now();
  while (isBefore(startTime, now)) {
    let endTime = addDays(startTime, 7).valueOf(); // Add 7 days using date-fns

    if (endTime > now) {
      endTime = now;
    }

    let done = false;
    let lastTradeId = null;
    while (!done) {
      const params = {
        symbol,
        startTime,
        endTime,
        limit: 1000,
        timestamp: Date.now(),
        recvWindow,
      };

      if (lastTradeId) {
        params.orderId = lastTradeId + 1;
        delete params.startTime;
        delete params.endTime;
      }

      const queryParams = new URLSearchParams(params).toString();
      const signature = crypto
        .createHmac('sha256', cex.secret)
        .update(queryParams)
        .digest('hex');

      params.signature = signature;

      try {
        const response = await proxyRequest(BASE_URL + ENDPOINT, params, cex.apiKey);
        trades.push(...response.body);
        lastTradeId = response.body[response.body.length - 1]?.orderId;
        if (response.body.length < 1000) {
          done = true;
        } else {
          lastTradeId = response.body[response.body.length - 1]?.orderId;
          endTime = response.body[response.body.length - 1]?.updateTime + 1; // Update endTime
        }
      } catch (error) {
        console.error(error);
        throw new Error(`Failed to fetch trades between ${new Date(startTime)} and ${new Date(endTime)}`);
      }
    }

    startTime = endTime;
  }

  // Following code to checks if latest order in last 30mins, other check for orders in the last hour and add if required avoiding duplicate orders with same orderId 
  let lastTradeIdTime = trades[trades.length - 1]?.updateTime;
  const currentTimestamp = Date.now(); // Convert milliseconds to seconds
  const isWithinLastHalfHour = (currentTimestamp - lastTradeIdTime) <= 1800000;
  if (!isWithinLastHalfHour) { // To check for trades if nothing is present from the last half hour
    let lastHourTradeResults = await getTradesFromLastHour(cex, symbol, trades);
    const combinedArray = JSON.parse(JSON.stringify(trades.concat(lastHourTradeResults)));
    trades = combinedArray;
  }
  return trades;
}

const fetchAllOrders = async function (cex, pair, fromDate) {
  let allTrades = {};
  let date = Date.parse(fromDate);
  let checkEmpty;

  do {
    let result = await cex.fetchOrders(pair, date, undefined, undefined);
    for (let trade of result) {
      allTrades[trade.id] = trade;
      date = parseFloat(trade.timestamp) + 1;
    }
    do {
      checkEmpty = await cex.fetchOrders(pair, date, undefined, undefined);
      if (checkEmpty.length === 0) {
        date = date + Number(7 * 24 * 60 * 60 * 1000);
      }
    } while (!(date > (new Date() - Number(7 * 24 * 60 * 60 * 1000))) && checkEmpty.length === 0);
  } while (!(checkEmpty.length === 0));

  let sortedTrades = Object.values(allTrades).sort((a, b) => a.timestamp - b.timestamp);
  // Add last hour check routine
  let lastTradeIdTime = sortedTrades[sortedTrades.length - 1]?.timestamp;
  const currentTimestamp = Date.now();
  const fromDateWithinLastHour = (currentTimestamp - Date.parse(fromDate)) <= 60 * 60000;
  const isWithinLastHour = (currentTimestamp - lastTradeIdTime) <= 60 * 60000;
  if (!isWithinLastHour && !fromDateWithinLastHour) {
    let lastHourTradeResults = await getTradesFromLastHour(cex, pair, sortedTrades);
    sortedTrades = sortedTrades.concat(lastHourTradeResults);
  }

  return sortedTrades;
}

const getTradesFromLastHour = async function (cex, symbol, trades) {
  let tradesFromLastHour = [];
  let date = Date.now() - 3600000;
  let listOfTrades = await cex.fetchMyTrades(symbol, date, undefined, undefined);
  for (let trade in listOfTrades) {
    if (checkProperty(trades, 'id', listOfTrades[trade].info.orderId)) {
      //Do nothing
    } else {
      let tradeResult = await cex.fetchOrder(listOfTrades[trade].info.orderId, symbol);
      tradesFromLastHour.push(tradeResult);
    }
  }
  return tradesFromLastHour;
};

function checkProperty(array, propertyName, propertyValue) {
  return array.some(obj => obj[propertyName] == propertyValue);
}

function cleanSymbol(symbol) {
  return symbol.split(':')[0].replace('/', '');
}

const saveNewOrder = async function (Orders, trade, startDate) {
  const cleanedSymbol = cleanSymbol(trade.symbol);

  const newOrder = new Orders({
    symbol: cleanedSymbol,
    orderId: BigNumber((trade.orderId ?? trade.id).toString()),
    clientOrderId: trade.clientOrderId,
    transactTime: trade.time ?? trade.timestamp,
    price: trade.avgPrice ?? trade.average, // only avgPrice
    origQty: trade.origQty ?? trade.amount, // 
    executedQty: trade.executedQty ?? trade.filled,
    fees: Number(trade.cumQuote ?? trade.cost) * 0.0004,
    feesAsset: 'USDT',
    status: trade.status === 'closed' ? 'FILLED' : trade.status,
    timeInForce: trade.timeInForce,
    type: trade.type.toUpperCase(),
    side: trade.side.toUpperCase(),
    originalPrice: trade.price,
    stopPrice: trade.stopPrice ?? "0",
  });

  await newOrder.save();
  if (!startDate) {
    console.log(`New trade added: ${JSON.stringify(newOrder)}`);
  }
};

const initializeSummaryFile = async (subaccount, commencementDate) => {
  try {
    const startDate = new Date();
    const Summary = summarySchema(); // Create an instance of the model here
    const summary = new Summary({ // Use the instance to create a new document
      startDate: commencementDate,
      lastTradeAdded: startDate,
      subaccountName: subaccount,
    });

    await summary.save();
    return startDate;
  } catch (error) {
    console.error('Error initializing summary file:', error);
  }
};

const validateInputs = (monitoringInfo, websocketInfo) => {
  // Create an object of all the required assets (cexSymbol) and cexSubaccount under each exchange
  const requiredExchanges = {};

  for (const obj in monitoringInfo) {
    for (const tranche in monitoringInfo[obj]['tranches']) {
      const cex = monitoringInfo[obj]['tranches'][tranche]['cex'];

      for (const cexId in cex) {
        const exchange = cex[cexId]['cex'];

        if (!Object.prototype.hasOwnProperty.call(requiredExchanges, exchange)) {
          requiredExchanges[exchange] = {
            assets: new Set(),
            subaccounts: new Set(),
          };
        }

        requiredExchanges[exchange].assets.add(cex[cexId]['cexSymbol']);
        requiredExchanges[exchange].subaccounts.add(cex[cexId]['cexSubaccount']);
      }
    }
  }
  // Compare the requiredExchanges object with the websocketInfo object
  for (const exchange in requiredExchanges) {
    if (Object.prototype.hasOwnProperty.call(websocketInfo, exchange)) {
      for (const asset of requiredExchanges[exchange].assets) {
        let assetFound = false;
        for (const subaccount of requiredExchanges[exchange].subaccounts) {
          if (websocketInfo[exchange][subaccount] && websocketInfo[exchange][subaccount]['assets'].includes(asset)) {
            assetFound = true;
            break;
          }
        }

        if (!assetFound) {
          console.error(`Error: Asset not present for ${asset} in ${exchange}`);
        }
      }

      for (const subaccount of requiredExchanges[exchange].subaccounts) {
        if (!websocketInfo[exchange][subaccount]) {
          console.error(`Error: CEX Subaccount not present for ${subaccount} in ${exchange}`);
        }
      }
    } else {
      console.error(`Error: Exchange not present in websocketInfo: ${exchange}`);
    }
  }
}

// Export the script as module
module.exports = {
  monitoringWebsocketRoutine,
  fetchAllOrders,
  dupeFunction
};
