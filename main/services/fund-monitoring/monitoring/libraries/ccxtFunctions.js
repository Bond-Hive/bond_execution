'use strict';
const ccxt = require('ccxt');
const crypto = require('crypto');
const env = require('../configEnv/configEnv.js');
const { addDays, isBefore } = require('date-fns');
const civfund = require('@civfund/fund-libraries');
const { dupeFunction } = require('../streams/webSocketOrders.js');
const proxyRequest = require('../libraries/proxyRequest.js');

// Global cache for subaccounts' error status
const subaccountErrorCache = {};

// Helper function to set an error status in the cache for 30 minutes
const setErrorCache = (subaccountId) => {
  // Clear previous timeout if it exists
  if (subaccountErrorCache[subaccountId]) {
    clearTimeout(subaccountErrorCache[subaccountId].timeout);
  }

  // Set or reset the timeout
  subaccountErrorCache[subaccountId] = {
    error: true,
    timeout: setTimeout(() => {
      delete subaccountErrorCache[subaccountId];
    }, 1800000) // 30 minutes
  };
}

const initializeCCxt = function (cex, subaccount = 'None', apiKey = 'None', secret = 'None', password = 'None') {
  // instantiate ccxt
  const exchangeClass = ccxt[cex];

  // define the cex-specific variables
  let setupVars = {
    apiKey: '',
    secret: ''
  };

  if (cex === 'binanceusdm' && subaccount === 'sandbox') {
    setupVars = {
      apiKey: env.BINANCE_SANDBOX_API,
      secret: env.BINANCE_SANDBOX_SECRET,
    };
  } else if (cex === 'binance' || cex === 'binanceusdm' || cex === 'binancecoinm') {
    if (subaccount === 'None') {
      setupVars = {
        apiKey: env.BINANCE_API,
        secret: env.BINANCE_SECRET,
      };
    } else if (apiKey !== 'None' & secret !== 'None') {
      setupVars = {
        apiKey: apiKey,
        secret: secret,
      };
    } else {
      const key = `BINANCE_${subaccount.toUpperCase()}_SUBACCOUNT_API`;
      const secret = `BINANCE_${subaccount.toUpperCase()}_SUBACCOUNT_SECRET`;
      setupVars = {
        apiKey: env[key],
        secret: env[secret],
      };
    }
  } else if (cex === 'okx') {
    if (subaccount === 'None') {
      setupVars = {
        apiKey: env.OKX_API,
        secret: env.OKX_SECRET,
        password: env.OKX_PASSWORD,
      };
    } else if (apiKey !== 'None' & secret !== 'None' && password !== 'None') {
      setupVars = {
        apiKey: apiKey,
        secret: secret,
        password: password,
      };
    } else {
      const key = `OKX_${subaccount.toUpperCase()}_SUBACCOUNT_API`;
      const secret = `OKX_${subaccount.toUpperCase()}_SUBACCOUNT_SECRET`;
      const password = `OKX_${subaccount.toUpperCase()}_SUBACCOUNT_PASSWORD`;
      setupVars = {
        apiKey: env[key],
        secret: env[secret],
        password: env[password],
      };
    }
  } else {
    throw new Error('Unsupported exchange');
  }

  // add global options by appending them after the 'if' block
  setupVars = {
    ...setupVars,
    options: {
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
  };

  // instantiate the cex inside ccxt
  const exchange = new exchangeClass(setupVars);

  if (subaccount === 'sandbox') {
    exchange.setSandboxMode(true);
  }

  return exchange;
};

const ccxtSumOfOrders = async function (cex, pair, sinceDate, exchangeFees) {
  let date = Date.parse(sinceDate);
  let sumOfOrderValue = 0;
  let sumOfSellOrderQuantity = 0;
  let checkEmpty;

  do {
    const result = await cex.fetchMyTrades(pair, date, undefined, undefined);
    for (const trade of result) {
      // if (!(!((trade.clientOrderId).startsWith(stratOrderPrefix)) && orderNameStratControl)){
      const cost = parseFloat(trade.cost);
      const quantity = parseFloat(trade.amount);
      if (trade.side === 'buy') {
        sumOfOrderValue += cost;
        sumOfSellOrderQuantity -= quantity;
      } else if (trade.side === 'sell') {
        sumOfOrderValue -= cost;
        sumOfSellOrderQuantity += quantity;
      }
      sumOfOrderValue += Math.abs(cost * exchangeFees);
      // }
      date = parseFloat(trade.info.time) + Number(1);
    }
    do { // Reason for this module: Binance returns orders for next 7 days. If no orders executed in 7 days, this will be empty. This module pages through all the 7 day periods till date to check this condition
      checkEmpty = await cex.fetchOrders(pair, date, undefined, undefined);
      if (checkEmpty.length === 0) {
        date = date + Number(7 * 24 * 60 * 60 * 1000);
      }
    } while (!(date > (new Date() - Number(7 * 24 * 60 * 60 * 1000))) && checkEmpty.length === 0);
    // checkEmpty = await cex.fetchOrders(pair, date, undefined, undefined);
  } while (!(checkEmpty.length === 0));
  return { sumOfOrderValue, sumOfSellOrderQuantity };
};

const ccxtPositions = async function (cex, asset) {
  const pair = [];
  pair[0] = asset;
  return await cex.fetchPositions(pair); // helpful information for margin maintainance
};

const ccxtPosition = async function (cex, asset) {
  let res = [];
  res[0] = await cex.fetchPosition(asset);
  return res; // helpful information for margin maintainance
};

const Orders = async function (symbol, inputDate, account, exchange, exchangeFees, apiKey = 'None', secret = 'None', password = 'None', stratOrderPrefix = 'None', orderNameStratControl = false) {
  const cex = initializeCCxt(exchange, account, apiKey, secret, password);
  let fromDate = (inputDate + '.000+00:00');
  if (exchange === 'binanceusdm' || exchange === 'binancecoinm' || exchange === 'binance') {
    try {
      if (orderNameStratControl) {
        const result = await getOrdersClientOrderAPI(cex, symbol, fromDate, exchangeFees, stratOrderPrefix, orderNameStratControl);
        return result;
      } else {
        const result = await getOrdersAPI(cex, symbol, fromDate, exchangeFees, stratOrderPrefix, orderNameStratControl);
        return result;
      }
    } catch (getOrdersError) {
      try {
        const result = await ccxtSumOfOrders(cex, symbol, fromDate, exchangeFees, stratOrderPrefix, orderNameStratControl);
        return result;
      } catch (ccxtSumOfOrdersError) {
        console.error(ccxtSumOfOrdersError);
      }
      console.error(getOrdersError);
    }
  } else {
    try {
      const result = await ccxtSumOfOrders(cex, symbol, fromDate, exchangeFees, stratOrderPrefix, orderNameStratControl);
      return result;
    } catch (ccxtSumOfOrdersError) {
      console.error(ccxtSumOfOrdersError);
    }
  }
};

const OrdersV2 = async function (symbol, inputDate, account, exchange, stratOrderPrefix = null, orderNameStratControl = false, lpType,cexObj) {
  // Checks if the there was a recent error in reconciliatin in summary collection of the Subaccount
  let dbName = exchange + "-Orders";
  let collectionName = "summaries";
  let reset = false;
  await dupeFunction(exchange,account);
  const lastStoredData = await civfund.dbMongoose.findOne(dbName, collectionName, "subaccountName",account);

  if ((lastStoredData && lastStoredData.recentErrorInReconciliation == true) || (subaccountErrorCache[account] && subaccountErrorCache[account].error)) {
    reset = true;
    if (lastStoredData) {
      let model = "Summary";
      // Updating the recentErrorInReconciliation of the object to false
      let replaceDoc = {
        startDate: lastStoredData.startDate,
        lastTradeAdded: lastStoredData.lastTradeAdded,
        subaccountName: lastStoredData.subaccountName,
        recentErrorInReconciliation :false
      };
      // Replace the whole document with the updated existingRecord
      await civfund.dbMongoose.replaceOne(dbName, collectionName, model, '_id', lastStoredData._id, replaceDoc);
    }
    // Set the error status in the cache
    setErrorCache(account);
  }
  return orderDetailsFromMongo(exchange, account, inputDate, symbol, stratOrderPrefix, orderNameStratControl,reset,lpType,cexObj);
}

const orderDetailsFromMongo = async function (exchange, account, inputDate, symbol = null, stratOrderPrefix = null, orderNameStratControl = false, reset = false,lpType,cexObj) {
  const strategyName = orderNameStratControl !== false ? stratOrderPrefix : account + symbol;
  const calculateSum = async (fillType) => {
    let sumOfOrderValue = 0;
    let sumOfSellOrderQuantity = 0;
    let sumOfOrderValueFeeHedge = 0;
    let sumOfSellOrderQuantityFeeHedge = 0;
    let sumOfExecutionFees = 0;
    let sumOfTpOrderProfit = 0;
    let sumOfSlippage = 0;
    let sumOfMisses = 0;

    const dateObj = new Date(inputDate);
    let unixTimestamp = Math.floor(dateObj.getTime());
    let dbName = exchange + "-Orders";
    let collectionName = account.toLowerCase() + (fillType === 'partial' ? "_accounts_partials" : "_accounts");

    if (fillType === 'filled' && !reset) {
      const lastStoredData = await getLastStoredData(exchange, account, strategyName);

      if (lastStoredData) {
        unixTimestamp = Math.max(unixTimestamp, lastStoredData.timestamp);
        sumOfOrderValue = lastStoredData.sumOfOrderValue;
        sumOfOrderValueFeeHedge = lastStoredData.sumOfOrderValueFeeHedge || 0;
        sumOfSellOrderQuantity = lastStoredData.sumOfSellOrderQuantity;
        sumOfSellOrderQuantityFeeHedge = lastStoredData.sumOfSellOrderQuantityFeeHedge || 0;
        sumOfExecutionFees = lastStoredData.sumOfExecutionFees || 0;
        sumOfTpOrderProfit = lastStoredData.sumOfTpOrderProfit || 0;
        sumOfSlippage = lastStoredData.sumOfSlippage || 0;
        sumOfMisses = lastStoredData.sumOfMisses || 0;
      }
    } else if (fillType === 'filled' && cexObj.sumOfOrders){
      // To convert the ISO date to Unix timestamp
      let date = new Date(cexObj.tillDate); // create a new Date object
      unixTimestamp = date.getTime(); // convert milliseconds to seconds
      sumOfOrderValue = Number(cexObj.sumOfOrders);
      sumOfSellOrderQuantity = Number(cexObj.sumOfSellOrderQuantity);
    }

    let query = {
      transactTime: { $gt: unixTimestamp }
    };
    let modifiedSymbol = removeSlash(symbol);

    if (!orderNameStratControl) {
      query.symbol = new RegExp("^" + modifiedSymbol);
    } else {
      query.clientOrderId = new RegExp("^" + stratOrderPrefix);
    }

    let trades = await civfund.dbMongoose.findAllQuery(dbName, collectionName, query);
    

    for (const trade of trades) {
      if (trade.status === 'FILLED') {
        const isStratOrder = trade.clientOrderId.startsWith(stratOrderPrefix);
        const shouldCalculateFeeHedge = trade.clientOrderId.includes('feeHedge') && lpType === "v3"; // feeHedge is the trade to hedge V3 position fees
        if (orderNameStratControl && !isStratOrder) continue;
        const cost = parseFloat(trade.executedQty) * parseFloat(trade.price);
        const quantity = parseFloat(trade.executedQty);

        if (trade.side === 'BUY') {
          if (shouldCalculateFeeHedge) { // For LP fee hedge
            sumOfOrderValueFeeHedge += Number(cost);
            sumOfSellOrderQuantityFeeHedge -= Number(quantity);
          } else { // For sumOfOrders
            sumOfOrderValue += Number(cost);
            sumOfSellOrderQuantity -= Number(quantity);
          }
        } else if (trade.side === 'SELL') {
          if (shouldCalculateFeeHedge) { // For LP fee hedge
            sumOfOrderValueFeeHedge -= Number(cost);
            sumOfSellOrderQuantityFeeHedge += Number(quantity);
          } else { // For sumOfOrders
            sumOfOrderValue -= Number(cost);
            sumOfSellOrderQuantity += Number(quantity);
          }
        }
        if (!shouldCalculateFeeHedge) { // CEX Execution fee for sumOfOrders
          sumOfOrderValue += Number(trade.fees);
          sumOfExecutionFees += Number(trade.fees);
        } else if (shouldCalculateFeeHedge) { // CEX Execution fee for LP fee hedge
          sumOfOrderValueFeeHedge += Number(trade.fees);
        }
        // Check for "_TP" in clientOrderId and calculate profit
        if (trade.clientOrderId.includes('_TP')) {
          const gridString = trade.clientOrderId.split(':')[1].split('_TP')[0];
          const gridValue = parseFloat(gridString);
        
          // Define a new query to find the last trade with the same grid value and stratOrderPrefix
          // and where transactTime is less than the current trade's transactTime
          let lastTradeQuery = {
            clientOrderId: new RegExp(`^${stratOrderPrefix}.*:${gridValue}`),
            symbol: new RegExp("^" + modifiedSymbol),
            transactTime: { $lt: trade.transactTime }
          };
        
          let lastTrades = await civfund.dbMongoose.findAllQuery(dbName, collectionName, lastTradeQuery);
          
          // Sort the trades by transactTime in descending order and pick the last one
          lastTrades.sort((a, b) => b.transactTime - a.transactTime);
          let lastTrade = lastTrades[0];
        
          if (lastTrade) {
            const expectedPrice = parseFloat(lastTrade.price);
            const profit = Math.abs((parseFloat(trade.price) - expectedPrice) * parseFloat(trade.executedQty));
            sumOfTpOrderProfit += profit;
          }
        }
        // Calculate sumOfMisses for orders with '-M' in clientOrderId
        if (trade.clientOrderId.includes('-M')) {
          const gridStrings = trade.clientOrderId.split(':')[1].split('-M');
          const gridValue1 = parseFloat(gridStrings[0]);
          const gridValue2 = parseFloat(gridStrings[1]);
          let missValue = ((gridValue2 - gridValue1) / 10000) * Math.abs(parseFloat(trade.price) * parseFloat(trade.executedQty / 2));
          sumOfMisses -= Math.abs(missValue);
        }
      }
    }

    // Sort trades by transactTime in descending order
    trades.sort((a, b) => b.transactTime - a.transactTime);

    // Get the transactTime of the latest trade
    let latestTransactTime;
    if (trades.length > 0) {
      latestTransactTime = trades[0].transactTime;
    } else {
      latestTransactTime = unixTimestamp;
    }
    if (fillType === 'filled') {
      await storeSumData(
        exchange,
        account,
        strategyName,
        sumOfOrderValue,
        sumOfSellOrderQuantity,
        sumOfOrderValueFeeHedge,
        sumOfExecutionFees,
        sumOfTpOrderProfit,
        sumOfSlippage,
        sumOfMisses,
        sumOfSellOrderQuantityFeeHedge,
        latestTransactTime
      );
    }
    return {
      sumOfOrderValue,
      sumOfSellOrderQuantity,
      sumOfOrderValueFeeHedge,
      sumOfSellOrderQuantityFeeHedge,
      sumOfExecutionFees,
      sumOfTpOrderProfit,
      sumOfMisses
    };
  };

  const partialResult = await calculateSum('partial');
  const filledResult = await calculateSum('filled');

  const finalResult = {
    sumOfOrderValue: partialResult.sumOfOrderValue + filledResult.sumOfOrderValue,
    sumOfSellOrderQuantity: partialResult.sumOfSellOrderQuantity + filledResult.sumOfSellOrderQuantity,
    sumOfOrderValueFeeHedge: partialResult.sumOfOrderValueFeeHedge + filledResult.sumOfOrderValueFeeHedge,
    sumOfSellOrderQuantityFeeHedge: partialResult.sumOfSellOrderQuantityFeeHedge + filledResult.sumOfSellOrderQuantityFeeHedge,
    sumOfExecutionFees: partialResult.sumOfExecutionFees + filledResult.sumOfExecutionFees,
    sumOfTpOrderProfit: partialResult.sumOfTpOrderProfit + filledResult.sumOfTpOrderProfit,
    sumOfSlippage:0,
    sumOfMisses: partialResult.sumOfMisses + filledResult.sumOfMisses,
  };

  return finalResult;
};

function removeSlash(inputString) {
  return inputString.replace(/\//g, '');
}

const storeSumData = async function (
  exchange,
  account,
  strategyName,
  sumOfOrderValue,
  sumOfSellOrderQuantity,
  sumOfOrderValueFeeHedge,
  sumOfExecutionFees,
  sumOfTpOrderProfit,
  sumOfSlippage,
  sumOfMisses,
  sumOfSellOrderQuantityFeeHedge,
  unixTimestamp
){
  let dbName = exchange + "-Orders";
  let collectionName = "sum_collection";
  let modelName = "SumCollection";

  const existingRecord = await civfund.dbMongoose.findOne(dbName, collectionName, "account", account.toLowerCase());
  if (existingRecord) {
    // Update the necessary fields in the existingRecord
    existingRecord.strategies[strategyName] = {
      sumOfOrderValue: sumOfOrderValue,
      sumOfSellOrderQuantity: sumOfSellOrderQuantity,
      sumOfOrderValueFeeHedge: sumOfOrderValueFeeHedge,
      sumOfExecutionFees:sumOfExecutionFees,
      sumOfTpOrderProfit:sumOfTpOrderProfit,
      sumOfSlippage:sumOfSlippage,
      sumOfMisses:sumOfMisses,
      sumOfSellOrderQuantityFeeHedge: sumOfSellOrderQuantityFeeHedge,
      timestamp: unixTimestamp
    };

    // Replace the whole document with the updated existingRecord
    await civfund.dbMongoose.replaceOne(dbName, collectionName, modelName, '_id', existingRecord._id, existingRecord);
  } else {
    const newRecord = {
      account: account.toLowerCase(),
      strategies: {
        [strategyName]: {
          sumOfOrderValue: sumOfOrderValue,
          sumOfSellOrderQuantity: sumOfSellOrderQuantity,
          sumOfOrderValueFeeHedge: sumOfOrderValueFeeHedge,
          sumOfExecutionFees:sumOfExecutionFees,
          sumOfTpOrderProfit:sumOfTpOrderProfit,
          sumOfSlippage:sumOfSlippage,
          sumOfMisses:sumOfMisses,
          sumOfSellOrderQuantityFeeHedge: sumOfSellOrderQuantityFeeHedge,
          timestamp: unixTimestamp
        }
      }
    };
    await civfund.dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
  }
};

const getSlippageForSingleCex = async function (trancheObj) {
  let sumOfSlippage = 0;
  let gridkeys = [];
  let gridPrices = {}; // Store the price for each grid key
  let dbName = trancheObj.cex + "-Orders";

  let unixTimestamp = Math.floor(new Date(trancheObj.tillDate).getTime());

  if ((subaccountErrorCache[trancheObj.cexSubaccount] && subaccountErrorCache[trancheObj.cexSubaccount].error)) {
    let collectionName = "slippageCalc";
    let account = trancheObj.cexSubaccount;
    const lastStoredDataResult = await getLastStoredObject(dbName, collectionName, "account", account.toLowerCase());
    let lastStoredData = null;
    if (lastStoredDataResult && lastStoredDataResult.strategies) {
      lastStoredData = lastStoredDataResult.strategies[trancheObj.stratOrderPrefix];
    }
    
    if (lastStoredData) {
      unixTimestamp = Math.max(unixTimestamp, lastStoredData.timestamp);
      sumOfMisses = lastStoredData.sumOfMisses || 0;
      gridkeys = lastStoredData.gridkeys || [];
      gridPrices = lastStoredData.gridPrices || {};
    }
  }

  let modifiedSymbol = removeSlash(trancheObj.cexSymbol);
  let query = {
    transactTime: { $gt: unixTimestamp },
    symbol: new RegExp("^" + modifiedSymbol),
    clientOrderId: new RegExp("^" + trancheObj.stratOrderPrefix)
  };

  let trades = await civfund.dbMongoose.findAllQuery(dbName, (trancheObj.cexSubaccount).toLowerCase() + "_accounts", query);
  trades.sort((a, b) => a.transactTime - b.transactTime); // Sort trades

  for (const trade of trades) {
    if (trade.status === 'FILLED' && !(trade.clientOrderId.includes('_TP'))) {
      const gridString = trade.clientOrderId.split(':')[1].split('/')[0];
      let gridSide = trade.clientOrderId.split(':')[1].split('/')[1];
      if (gridSide.includes('-M')) {
        gridSide = gridSide.split('-M')[0];
      }
      const gridKey = gridString + gridSide;

      if (gridkeys.includes(gridKey)) {
        // Calculate slippage using stored price for the grid key
        const keyPrice = gridPrices[gridKey]; // Retrieve the stored price
        const slippage = calculateSlippage(trade, keyPrice);
        sumOfSlippage += slippage;
      } else {
        // Store the trade price for this new grid key
        gridkeys.push(gridKey);
        gridPrices[gridKey] = parseFloat(trade.price); // Store trade price
      }
    }
  };

  // Sort trades by transactTime in descending order
  trades.sort((a, b) => b.transactTime - a.transactTime);

  // Get the transactTime of the latest trade
  let latestTransactTime;
  if (trades.length > 0) {
    latestTransactTime = trades[0].transactTime;
  } else {
    latestTransactTime = unixTimestamp;
  };

  await storeSlippageData(
    dbName,
    "account",
    (trancheObj.cexSubaccount).toLowerCase() + "_accounts",
    trancheObj.stratOrderPrefix,
    sumOfSlippage,
    gridkeys,
    gridPrices,
    latestTransactTime
  );

  return sumOfSlippage;
};

const calculateSlippage = function (trade, keyPrice) {
  // Ensure keyPrice is a number
  keyPrice = parseFloat(keyPrice);

  // Extracting trade price and quantity
  let tradePrice = parseFloat(trade.price); // Convert string to float if necessary
  let tradeQuantity = parseFloat(trade.executedQty); // Convert string to float if necessary
  let tradeType = trade.side; // Assuming 'BUY' or 'SELL'

  let priceDifference;
  if (tradeType === 'SELL') {
    // If the trade is a sell, slippage is trade price minus key price
    priceDifference = tradePrice - keyPrice;
  } else if (tradeType === 'BUY') {
    // If the trade is a buy, slippage is key price minus trade price
    priceDifference = keyPrice - tradePrice;
  } else {
    // Handle unexpected trade type
    console.error('Unexpected trade type:', tradeType);
    return 0;
  }

  // Slippage calculation
  let slippage = priceDifference * tradeQuantity;

  return slippage;
};

const storeSlippageData = async function (
  dbName,
  propertyName,
  propertyId,
  strategyName,
  sumOfSlippage,
  gridkeys,
  gridPrices,
  unixTimestamp
){
  let collectionName = "slippage_collection";
  let modelName = "SlippageCollection";

  const existingRecord = await civfund.dbMongoose.findOne(dbName, collectionName, propertyName, propertyId);
  if (existingRecord) {
    // Update the necessary fields in the existingRecord
    existingRecord.strategies[strategyName] = {
      strategyName: strategyName,
      sumOfSlippage: sumOfSlippage,
      gridkeys: gridkeys,
      gridPrices:gridPrices,
      timestamp: unixTimestamp
    };

    // Replace the whole document with the updated existingRecord
    await civfund.dbMongoose.replaceOne(dbName, collectionName, modelName, '_id', existingRecord._id, existingRecord);
  } else {
    const newRecord = {
      account: propertyId,
      strategies: {
        [strategyName]: {
          strategyName: strategyName,
          sumOfSlippage: sumOfSlippage,
          gridkeys: gridkeys,
          gridPrices:gridPrices,
          timestamp: unixTimestamp
        }
      }
    };
    await civfund.dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
  }
};

const getLastStoredObject = async function (dbName, collectionName, findProperty, findValue) {
  const lastStoredData = await civfund.dbMongoose.findOne(dbName,collectionName,findProperty,findValue);
  if (lastStoredData) {
    return lastStoredData;
  }
  return null;
};

const getSlippageForDoubleCex = async function (trancheObj1, trancheObj2) {
  let sumOfSlippage = 0;
  let gridkeys = [];
  let gridPrices = {}; // Store the price for each grid key
  let dbName = trancheObj1.cex + "-Orders";

  let unixTimestamp = Math.floor(new Date(trancheObj1.tillDate).getTime());

  if ((subaccountErrorCache[trancheObj1.cexSubaccount] && subaccountErrorCache[trancheObj1.cexSubaccount].error)) {
    let collectionName = "slippageCalc";
    let account = trancheObj1.cexSubaccount;
    const lastStoredDataResult = await getLastStoredObject(dbName, collectionName, "account", account.toLowerCase());
    let lastStoredData = null;
    if (lastStoredDataResult && lastStoredDataResult.strategies) {
      lastStoredData = lastStoredDataResult.strategies[trancheObj1.stratOrderPrefix];
    }
    
    if (lastStoredData) {
      unixTimestamp = Math.max(unixTimestamp, lastStoredData.timestamp);
      sumOfMisses = lastStoredData.sumOfMisses || 0;
      gridkeys = lastStoredData.gridkeys || [];
      gridPrices = lastStoredData.gridPrices || {};
    }
  }

  // Fetching trades for both tranches
  let trades1 = await fetchTrades(dbName, trancheObj1, unixTimestamp);
  let trades2 = await fetchTrades(dbName, trancheObj2, unixTimestamp);
  // Process trades to establish grid key correspondence and calculate derived price
  for (const trade1 of trades1) {
    if (trade1.status === 'FILLED' && !trade1.clientOrderId.includes('_TP')) {
      const gridKey1 = extractGridKey(trade1.clientOrderId);
      const tradeNumber1 = extractTradeNumber(trade1.clientOrderId);

      if (!gridkeys.includes(gridKey1)) {
        gridkeys.push(gridKey1);

        // Find the corresponding trade in trades2
        const correspondingTrade2 = trades2.find(t2 => 
          extractTradeNumber(t2.clientOrderId) === tradeNumber1 && 
          extractGridKey(t2.clientOrderId) === getOppositeGridKey(gridKey1)
        );

        if (correspondingTrade2) {
          // Calculate derived price: price of first divide by price of second
          let derivedPrice = parseFloat(trade1.price) / parseFloat(correspondingTrade2.price);
          gridPrices[gridKey1] = derivedPrice;
        }
      }
    }
  }

  // Calculate slippage for trades in trades1
  for (const trade1 of trades1) {
    if (trade1.status === 'FILLED' && !trade1.clientOrderId.includes('_TP')) {
      const gridKey1 = extractGridKey(trade1.clientOrderId);
      const tradeNumber1 = extractTradeNumber(trade1.clientOrderId);

      // Find the corresponding trade in trades2
      const correspondingTrade2 = trades2.find(t2 => 
        extractTradeNumber(t2.clientOrderId) === tradeNumber1 && 
        extractGridKey(t2.clientOrderId) === getOppositeGridKey(gridKey1)
      );

      if (correspondingTrade2) {
        // Calculate derived price: price of first divide by price of second
        let currentDerivedPrice = parseFloat(trade1.price) / parseFloat(correspondingTrade2.price);

        // Use the current derived price and the stored price (if available) to calculate slippage
        const storedPrice = gridPrices[gridKey1];

        if (storedPrice) {
          const slippage = calculateSlippageDoubleCex(trade1, storedPrice, currentDerivedPrice);
          sumOfSlippage += slippage;
        }
      }
    }
  }

  // Sort trades by transactTime in descending order
  trades1.sort((a, b) => b.transactTime - a.transactTime);

  // Get the transactTime of the latest trade
  let latestTransactTime;
  if (trades1.length > 0) {
    latestTransactTime = trades1[0].transactTime;
  } else {
    latestTransactTime = unixTimestamp;
  };

  await storeSlippageData(
    dbName,
    "account",
    (trancheObj1.cexSubaccount).toLowerCase() + "_accounts",
    trancheObj1.stratOrderPrefix,
    sumOfSlippage,
    gridkeys,
    gridPrices,
    latestTransactTime
  );

  return sumOfSlippage;
};

const calculateSlippageDoubleCex = function(trade, storedPrice, currentDerivedPrice) {

  // Ensure prices are numbers
  storedPrice = parseFloat(storedPrice);
  currentDerivedPrice = parseFloat(currentDerivedPrice);

  // Extracting trade quantity and price
  let tradeQuantity = parseFloat(trade.executedQty); // Convert string to float if necessary
  let tradePrice = parseFloat(trade.price);

  // Calculate the ratio of current derived price to stored price
  let priceRatio = currentDerivedPrice / storedPrice;

  // Slippage calculation based on trade type
  let slippage; let ratio
  if (trade.side === 'BUY') {
    slippage = (1 - priceRatio) * tradeQuantity * tradePrice;
    ratio = (1 - priceRatio) 
  } else if (trade.side === 'SELL') {
    slippage = (priceRatio - 1) * tradeQuantity * tradePrice;
    ratio = (priceRatio - 1) 

  } else {
    // Handle unexpected trade type
    console.error('Unexpected trade type:', trade.side);
    return 0;
  }
  return slippage;
}

function extractGridKey(clientOrderId) {
  return clientOrderId.split(':')[1].split('/')[0] + clientOrderId.split(':')[1].split('/')[1];
}

function extractTradeNumber(clientOrderId) {
  return clientOrderId.split(':')[2];
}

function getOppositeGridKey(gridKey) {
  if (gridKey.endsWith('b')) {
    return gridKey.slice(0, -1) + 's';
  } else if (gridKey.endsWith('s')) {
    return gridKey.slice(0, -1) + 'b';
  }
  return gridKey; // Fallback in case the gridKey doesn't end with 'b' or 's'
}

async function fetchTrades(dbName, trancheObj, unixTimestamp) {
  let modifiedSymbol = removeSlash(trancheObj.cexSymbol);
  let query = {
    transactTime: { $gt: unixTimestamp },
    symbol: new RegExp("^" + modifiedSymbol),
    clientOrderId: new RegExp("^" + trancheObj.stratOrderPrefix)
  };
  let trades = await civfund.dbMongoose.findAllQuery(dbName, (trancheObj.cexSubaccount).toLowerCase() + "_accounts", query);
  trades.sort((a, b) => a.transactTime - b.transactTime); // Sort trades
  return trades;
}

const getLastStoredData = async function (exchange, account, strategyName) {
  let dbName = exchange + "-Orders";
  let collectionName = "sum_collection";
  const lastStoredData = await civfund.dbMongoose.findOne(dbName, collectionName, "account",account.toLowerCase());

  if (lastStoredData && lastStoredData.strategies && lastStoredData.strategies[strategyName]) {
    return lastStoredData.strategies[strategyName];
  }

  return null;
};



const getCexInfo = async function (cex, pair, account, apiKey = 'None', secret = 'None', password = 'None') {
  try {
    const exchange = initializeCCxt(cex, account, apiKey, secret, password);
    let info;
    if (cex === "okx") {
      info = await ccxtPosition(exchange, pair);
    } else {
      info = await ccxtPositions(exchange, pair);
    }
    const balance = await exchange.fetchBalance();
    let NAV
    if (cex == "binancecoinm"){
      NAV = Number((Number(info[0].collateral) + Number(info[0].unrealizedPnl)) * info[0].markPrice) ;
    } else {
      NAV = Number(balance.info.totalMarginBalance);
    }
    exchange.close();
    return { info, NAV };
  } catch (error) {
    console.error(error);
  }
};

async function getOrdersAPI(cex, symbol, sinceDate, exchangeFees, stratOrderPrefix = "none", orderNameStratControl = false, recvWindow = 50000) {
  const trades = [];
  const BASE_URL = 'https://fapi.binance.com';
  const ENDPOINT = '/fapi/v1/userTrades';

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const endTime = Date.now();
  let startTime = Date.parse(sinceDate) + 1000;

  while (startTime < endTime) {
    let done = false;
    let lastTradeId = null;
    let firstIteration = true;
    let currentEndTime = Math.min(startTime + SEVEN_DAYS - 1, endTime);

    while (!done) {
      const params = {
        symbol,
        limit: 1000,
        timestamp: Date.now(),
        recvWindow,
        startTime,
        endTime: currentEndTime
      };

      if (lastTradeId !== null) {
        params.fromId = lastTradeId + 1;
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

        // Filter out trades with the same time as sinceDate or before that time, only on the first iteration
        if (firstIteration) {
          response.body = response.body.filter(trade => trade.time > startTime);
          firstIteration = false;
        }

        trades.push(...response.body);

        if (response.body.length < 1000) {
          done = true;
        } else {
          lastTradeId = response.body[response.body.length - 1].id; // Update lastTradeId to the last fetched trade's id
          currentEndTime = Math.min(response.body[response.body.length - 1].time + 1, endTime); // Update currentEndTime
        }
      } catch (error) {
        console.error(error);
        throw new Error(`Failed to fetch trades from ${new Date(startTime).toISOString()}`);
      }
    }

    startTime += SEVEN_DAYS;
  }

  const result = getSumOfOrders(trades, exchangeFees, stratOrderPrefix, orderNameStratControl);
  return result;
}

const getSumOfOrders = (trades, exchangeFees, /*stratOrderPrefix = "none", orderNameStratControl = false*/) => {
  let sumOfOrderValue = 0;
  let sumOfSellOrderQuantity = 0;

  for (const trade of trades) {
    const cost = parseFloat(trade.qty) * parseFloat(trade.price);
    const quantity = parseFloat(trade.qty);

    if (trade.side === 'BUY') {
      sumOfOrderValue += cost;
      sumOfSellOrderQuantity -= quantity;
    } else if (trade.side === 'SELL') {
      sumOfOrderValue -= cost;
      sumOfSellOrderQuantity += quantity;
    }

    const fee = Math.abs(cost * exchangeFees);
    sumOfOrderValue += fee;
  }
  return { sumOfOrderValue, sumOfSellOrderQuantity };
}

async function getOrdersClientOrderAPI(cex, symbol, sinceDate, exchangeFees, stratOrderPrefix = "none", orderNameStratControl = false, recvWindow = 5000) {
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
  const result = getSumOfOrdersClientOrderId(trades, exchangeFees, stratOrderPrefix, orderNameStratControl);

  return result;
}

async function getAccountBalance(cex,recvWindow = 10000) {
  let response;
  const BASE_URL = 'https://api.binance.com/sapi/v1/asset/wallet/balance';
  const params = {
    timestamp: Date.now(),
    recvWindow,
  };
  const queryParams = new URLSearchParams(params).toString();
  const signature = crypto
    .createHmac('sha256', cex.secret)
    .update(queryParams)
    .digest('hex');
  params.signature = signature;
  try {
    response = await proxyRequest(BASE_URL , params, cex.apiKey);
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to fetch trades balance`);
  }
  return response.body;
}

const getSumOfOrdersClientOrderId = (trades, exchangeFees, stratOrderPrefix = "none", orderNameStratControl = false) => {
  let sumOfOrderValue = 0;
  let sumOfSellOrderQuantity = 0;

  for (const trade of trades) {
    if (trade.status === 'FILLED') {
      const isStratOrder = trade.clientOrderId.startsWith(stratOrderPrefix);
      if (orderNameStratControl && !isStratOrder) continue;
      const cost = parseFloat(trade.executedQty) * parseFloat(trade.avgPrice);
      const quantity = parseFloat(trade.executedQty);

      if (trade.side === 'BUY') {
        sumOfOrderValue += cost;
        sumOfSellOrderQuantity -= quantity;
      } else if (trade.side === 'SELL') {
        sumOfOrderValue -= cost;
        sumOfSellOrderQuantity += quantity;
      }

      const fee = Math.abs(cost * exchangeFees);
      sumOfOrderValue += fee;
      // }
    }
  }
  return { sumOfOrderValue, sumOfSellOrderQuantity };
}

const getTradesFromLastHour = async function (cex, symbol, trades) {
  let tradesFromLastHour = [];
  let date = Date.now() - 3600000;
  let listOfTrades = await cex.fetchMyTrades(symbol, date, undefined, undefined);
  for (let trade in listOfTrades) {
    let tradeResult = await cex.fetchOrder(listOfTrades[trade].info.orderId, symbol);
    if (checkProperty(trades, "orderId", listOfTrades[trade].info.orderId)) {
      //Do nothing
    } else {
      tradesFromLastHour.push(tradeResult.info);
    }
  }
  return tradesFromLastHour;
};

function checkProperty(array, propertyName, propertyValue) {
  return array.some(obj => obj[propertyName] == propertyValue);
}

module.exports = {
  initializeCCxt,
  ccxtPosition,
  ccxtPositions,
  ccxtSumOfOrders,
  Orders,
  OrdersV2,
  getCexInfo,
  orderDetailsFromMongo,
  getSlippageForSingleCex,
  getSlippageForDoubleCex,
  getAccountBalance
};