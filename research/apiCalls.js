'use strict';
const civfund = require('@civfund/fund-libraries')
var XLSX = require("xlsx");
const monitoringInfo = require('../main/monitoringInfo/monitoringInfo.json');
const axios = require('axios');
const mongoose = require('mongoose');
const { dbMongoose } = require('@civfund/fund-libraries');

const priceOfTick = function(tick, deltaDecimals = 0) {
  return ((1.0001) ** Number(tick)) * 10 ** (Number(deltaDecimals));
};

const getListOfOrders = async function (
  exchangeName,
  subaccount = "all",
  pair = "all",
  startDate,
  exchangeFee = 0.0004
) {
  let fromDate = (startDate+':00.000+00:00');
  let listOfSubaccounts = [];   let listOfPairs = []
  const workbook = XLSX.utils.book_new();
  if (subaccount == "all"){
    listOfSubaccounts = ["Test","Test1","Test2","Test3","Test4","Test5","Test6"]
  } else {
    listOfSubaccounts = [subaccount]
  }
  console.log('pair ',pair)
  if (pair == "all"){
    listOfPairs = ["ETH/USDT","MATIC/USDT","NEAR/USDT","AVAX/USDT","XTZ/USDT","THETA/USDT"]
  } else {
    listOfPairs = [pair]
  }
  console.log('listOfPairs ',listOfPairs)
  console.log('exchange ',exchangeName)


  for (let i = 0; i < listOfSubaccounts.length; i++) {
    let cex = civfund.initializeCcxt(exchangeName,listOfSubaccounts[i])
    console.log('subaccount ',listOfSubaccounts[i])
    let arrayOfTrades = []; let quantityObject = {};

    for (let i = 0; i < listOfPairs.length; i++) {
      let date = Date.parse(fromDate); let checkEmpty; let netValue; let netAmount; let actualPrice; let netValueIdeal
      console.log(date);
      console.log('pair: ',listOfPairs[i]);
      let page = Number(1);
      do {
        let result = await cex.fetchOrders(listOfPairs[i], date, undefined, undefined)
        console.log("page :",page)
        page = Number(page) + 1;
        for (let trade of result) {
          let currentOrder;
          if (trade.side == "buy"){
            netValue = trade.cost;
            netAmount = trade.amount;
          } else {
            netValue = -(trade.cost);
            netAmount = -(trade.amount);
          }
          if (trade.clientOrderId.includes("M") && !trade.clientOrderId.includes("web")){

            const str = trade.clientOrderId;
            const arrayOfMissedTrades = []; const arrayOfMissedTradesQuant = [];
            const beforeHyphen = str.split("-M")[0];
            let initialBaseTradeId; let strategyVersion;
            if (beforeHyphen.includes(":")){
              const parts = beforeHyphen.split(":");
              strategyVersion = parts[0];
              if (parts.length > 2) {
                const secondPart = parts[1]; // Ignores anything after the second colon
                initialBaseTradeId = secondPart;
              } else {
                initialBaseTradeId = parts[1];
              }
            } else {
              initialBaseTradeId = beforeHyphen;
            }
            arrayOfMissedTrades.push(initialBaseTradeId);
            const missedTradesStringRaw = str.split("-M")[1];
            const missedTradesString = missedTradesStringRaw.split(":")[0];
            const trimmedMissedTradesString = missedTradesString.endsWith("_") ? missedTradesString.slice(0, -1) : missedTradesString;
            const missedTradesArray = trimmedMissedTradesString.split("_");
            arrayOfMissedTrades.push(...missedTradesArray);
            let sumOfMissedQuant = 0;
            for (let i = 1; i < Number(arrayOfMissedTrades.length); Number(i++)){
              let arrayOfMissedTradesNameToFind = `${strategyVersion}:${arrayOfMissedTrades[i]}`
              if(quantityObject[arrayOfMissedTradesNameToFind]){
                sumOfMissedQuant += Number(quantityObject[arrayOfMissedTradesNameToFind]);
                arrayOfMissedTradesQuant.push(quantityObject[arrayOfMissedTradesNameToFind]);
              } else {
                sumOfMissedQuant += Number(Number(trade.amount)/Number(arrayOfMissedTrades.length));
                arrayOfMissedTradesQuant.push(sumOfMissedQuant);
              }
            }

            let originalQuantity;
            let originalQuantityKey = `${strategyVersion}:${initialBaseTradeId}`;
            // Check if the original quantity is present in the quantityObject
            if (quantityObject.hasOwnProperty(originalQuantityKey)) {
                originalQuantity = quantityObject[originalQuantityKey];
            } else {
                originalQuantity = trade.amount - sumOfMissedQuant;
                quantityObject[originalQuantityKey] = originalQuantity;
            }
            arrayOfMissedTradesQuant.unshift(originalQuantity);


            for (let i = 0; i < Number(arrayOfMissedTrades.length); Number(i++)){
              let missedValue = i == 0 ? "missTandem": "Yes";
              if (trade.side == "buy"){
                netValue = trade.price*arrayOfMissedTradesQuant[i];
                netAmount = arrayOfMissedTradesQuant[i];
                actualPrice = priceOfTick(Number(arrayOfMissedTradesQuant[i])-Number(5));
                netValueIdeal = arrayOfMissedTradesQuant[i] * actualPrice;
              } else {
                netValue = -(trade.price*arrayOfMissedTradesQuant[i]);
                netAmount = -(arrayOfMissedTradesQuant[i]);
                actualPrice = priceOfTick(Number(arrayOfMissedTradesQuant[i])+Number(5));
                netValueIdeal = -(arrayOfMissedTradesQuant[i] * actualPrice);
              }
              currentOrder = {
                datetime:(trade.datetime).replace(/T/, ' ').replace(/Z/, '').replace(/\..*/, ""),
                id:trade.id,
                clientOrderId:arrayOfMissedTrades[i],
                symbol:trade.symbol,
                side:trade.side,
                price:trade.price,
                amount:arrayOfMissedTradesQuant[i],
                cost:trade.price*arrayOfMissedTradesQuant[i],
                netValue:netValue,//
                netAmount:netAmount,//
                fees:trade.price*arrayOfMissedTradesQuant[i]*exchangeFee,
                actualPrice:actualPrice,//
                netValueIdeal,//
                "missed":missedValue,
                version:strategyVersion
              }
              arrayOfTrades.push(currentOrder);
              if (i == 0){
                let arrayOfMissedTradesName = `${strategyVersion}:${arrayOfMissedTrades[i]}`
                quantityObject[arrayOfMissedTradesName] = arrayOfMissedTradesQuant[i];
              }
            }
          } else {
            let clientOrderId; let strategyVersion;
            if (trade.clientOrderId.includes(":")) {
              const parts = trade.clientOrderId.split(":");
              strategyVersion = parts[0];
              if (parts.length > 2) {
                const secondPart = parts[1]; // Ignores anything after the second colon
                clientOrderId = secondPart;
              } else {
                clientOrderId = parts[1];
              }
          } else {
              clientOrderId = trade.clientOrderId;
          }
            currentOrder = {
              datetime:(trade.datetime).replace(/T/, ' ').replace(/Z/, '').replace(/\..*/, ""),
              id:trade.id,
              clientOrderId:clientOrderId,
              symbol:trade.symbol,
              side:trade.side,
              price:trade.price,
              amount:trade.amount,
              cost:trade.cost,
              netValue:netValue,
              netAmount:netAmount,
              fees:trade.cost*exchangeFee,
              actualPrice:actualPrice,
              netValueIdeal,
              "missed":"-",
              version:strategyVersion
            }
            arrayOfTrades.push(currentOrder);
            quantityObject[trade.clientOrderId] = trade.amount;
          }
          date = parseFloat(trade.timestamp) + 1;
        }
        do {
          checkEmpty = await cex.fetchOrders(listOfPairs[i], date, undefined, undefined)
          if (checkEmpty.length === 0){
            date = date + Number(7*24*60*60*1000);
          }
        } while (!(date > (new Date() - Number(7*24*60*60*1000))) && checkEmpty.length === 0)
      } while (!(checkEmpty.length === 0));
      let openPosition = (await civfund.ccxt.ccxtPosition(cex,listOfPairs[i]))[0]
      if (openPosition.side == "short"){
        netValue = openPosition.notional;
        netAmount = openPosition.contracts;
      } else {
        netValue = -(openPosition.notional);
        netAmount = -(openPosition.contracts);
      }
      let datetime
      if (openPosition.datetime){
      datetime = (openPosition.datetime).replace(/T/, ' ').replace(/Z/, '').replace(/\..*/, "")
      } else {datetime = 0}
      let currentPosition = {
        datetime:datetime,
        id:"openPosiion",
        clientOrderId:"openPosiion",
        symbol:openPosition.symbol,
        side:openPosition.side,
        price:openPosition.markPrice,
        amount:openPosition.contracts,
        cost:openPosition.notional,
        netValue:netValue,
        netAmount:netAmount,
      }
      arrayOfTrades.push(currentPosition);    
    }
    var worksheet = XLSX.utils.json_to_sheet(arrayOfTrades, {header:["datetime","id","clientOrderId","symbol","side","price","amount","cost","netValue","netAmount","fees","actualPrice"]});
    worksheet["!cols"] = [ { wch: 18 },{ wch: 7 },{ wch: 11 },{ wch: 10 },{ wch: 4 },{ wch: 9 },{ wch: 7 },{ wch: 11 },{ wch: 11 },{ wch: 11 },{ wch: 11 },{ wch: 11 } ]
    XLSX.utils.book_append_sheet(workbook, worksheet, `${listOfSubaccounts[i]}`);
  }
  let time = new Date().toISOString().replace(/:/, '').replace(/:/, '').replace(/\..+/, '')
  XLSX.writeFile(workbook, `../exchangeData/${time}-${exchangeName}-${subaccount}.xlsx`);
  return `created new workbook:${time}-${exchangeName}-${subaccount}.xlsx`;
}

const getListOfOrdersV2 = async function (
  exchangeName,
  subaccount = "all",
  defaultStrategyId ="-",
) {
  let listOfSubaccounts = [];
  let mongoDBName = "CIV_Analytics";
  let arrayOfTrades = [];

  if (subaccount == "all") {
      listOfSubaccounts = ["test", "test1", "test2", "test3", "test4", "test5", "test6"];
  } else {
      listOfSubaccounts = [subaccount]
  }
  for (let i = 0; i < listOfSubaccounts.length; i++) {
    // search for the last item in the sorted list, let the last date and quantity object
    let collectionName = exchangeName+"_"+listOfSubaccounts[i]+"-Sorted";
    let mongoDBModel = "Analytics";
    let lastDocument = await civfund.dbMongoose.findLastDocument(mongoDBName, collectionName, mongoDBModel, "unixTransactTime");
    let lastTradeTime = lastDocument?.unixTransactTime || null;
    // Fetch Orders from MongoDB
    let orders = await fetchOrdersFromMongo(exchangeName,listOfSubaccounts[i],lastTradeTime,mongoDBModel); // add date from the last time and fetch here, otherwise, fetch all data
    // Sort the trades as per ClientOrderId and Buy direction
    arrayOfTrades = await handleTrade(orders,mongoDBName,collectionName,defaultStrategyId); // add quantity object
    
    // Add trades to analytics
    await handleMongoDBOrderUpdate(mongoDBName,collectionName,listOfSubaccounts[i],arrayOfTrades);
  }
};

const handleMongoDBOrderUpdate = async function (mongoDBName, collectionName, subaccount, arrayOfTrades) {
  for (let trade in arrayOfTrades){
    await civfund.dbMongoose.insertOne(mongoDBName, collectionName, subaccount, arrayOfTrades[trade]);
  }
  return "Documents uploaded";
}

const fetchOrdersFromMongo = async function (exchangeName, subaccount, fromDate) {
  const dbName = exchangeName + "-Orders";
  const collectionName = subaccount + "_accounts";
  const mongoDBModel = "Orders";
  const query = fromDate ? {transactTime: { $gt: fromDate }} : {};
  let documentsObj = await civfund.dbMongoose.findAllQuery(dbName, collectionName, query, mongoDBModel);
  // Convert object to array
  let documentsArr = Object.values(documentsObj);

  // Sort documents in ascending order of unixTransactTime
  documentsArr.sort((a, b) => a.transactTime - b.transactTime);
  
  return documentsArr;
}

const handleTrade = async (orders,mongoDBName,collectionName,defaultStrategyId) => {
  let arrayOfTrades = [];
  let quantityObject = {};
  for (let trade of orders) {
    let currentOrder;
    const isBuy = trade.side == "BUY";
    let tradeProps = calculateTradeProperties(trade, isBuy);
  
    if (trade.clientOrderId.includes("M") && !trade.clientOrderId.includes("web")){
      const missedTradesProps = await getMissedTradesProperties(trade, quantityObject,mongoDBName,collectionName);
      const originalQuantity = quantityObject[`${missedTradesProps.strategyVersion}:${missedTradesProps.initialBaseTradeId}`]
        || trade.executedQty - missedTradesProps.sumOfMissedQuant;
  
      missedTradesProps.arrayOfMissedTradesQuant.unshift(originalQuantity);
      trade.fees = JSON.parse(JSON.stringify(trade.fees/(missedTradesProps.arrayOfMissedTrades.length)));

      for (let i = 0; i < missedTradesProps.arrayOfMissedTrades.length; i++){
        const missedValue = i == 0 ? "missTandem": "Yes";
        tradeProps.netValue = (isBuy ? 1:-1) * trade.price * missedTradesProps.arrayOfMissedTradesQuant[i];
        tradeProps.netAmount = (isBuy ? 1:-1) * missedTradesProps.arrayOfMissedTradesQuant[i];
        currentOrder = getOrderDetails(trade, missedTradesProps.arrayOfMissedTrades[i], tradeProps, missedValue, missedTradesProps.strategyVersion, Math.abs(tradeProps.netAmount), Math.abs(tradeProps.netValue));
        arrayOfTrades.push(currentOrder);
        if (i == 0){
          quantityObject[`${missedTradesProps.strategyVersion}:${missedTradesProps.arrayOfMissedTrades[i]}`] = missedTradesProps.arrayOfMissedTradesQuant[i];
        }
      }
    } else {
      let clientOrderId, strategyVersion;
      if (trade.clientOrderId.includes(":")){
        const parts = trade.clientOrderId.split(":");
        strategyVersion = parts[0];
        if (parts.length > 2) {
          const secondPart = parts[1]; // Ignores anything after the second colon
          clientOrderId = secondPart;
        } else {
          clientOrderId = parts[1];
        }
      } else {
        clientOrderId = trade.clientOrderId;
      }
      currentOrder = getOrderDetails(trade, clientOrderId, tradeProps, "-", strategyVersion, trade.executedQty, trade.price*trade.executedQty,defaultStrategyId);
      arrayOfTrades.push(currentOrder);
      quantityObject[trade.clientOrderId] = trade.executedQty;
    }
  }
  return arrayOfTrades;
};

// Calculate trade properties
function calculateTradeProperties(trade, isBuy) {
  const netValue = isBuy ? trade.price * trade.executedQty : -(trade.price * trade.executedQty);
  const netAmount = isBuy ? trade.executedQty : -trade.executedQty;
  return { netValue, netAmount};
}

// Get missed trades properties
const getMissedTradesProperties = async function (trade, quantityObject,mongoDBName,collectionName) {
  let initialBaseTradeId, strategyVersion, sumOfMissedQuant = 0;
  let arrayOfMissedTrades = [], arrayOfMissedTradesQuant = [];

  const strParts = trade.clientOrderId.split("-M");
  const beforeHyphen = strParts[0];
  const missedTradesStringRaw = strParts[1];
  const missedTradesString = missedTradesStringRaw.split(":")[0];
  const trimmedMissedTradesString = missedTradesString.endsWith("_")
    ? missedTradesString.slice(0, -1)
    : missedTradesString;
  const missedTradesArray = trimmedMissedTradesString.split("_");

    if (beforeHyphen.includes(":")) {
      const parts = beforeHyphen.split(":");
      strategyVersion = parts[0];
      if (parts.length > 2) {
          const secondPart = parts[1]; // Ignores anything after the second colon
          initialBaseTradeId = secondPart;
      } else {
          initialBaseTradeId = parts[1];
      }
  } else {
    initialBaseTradeId = beforeHyphen;
  }

  arrayOfMissedTrades.push(initialBaseTradeId);
  arrayOfMissedTrades.push(...missedTradesArray);

  for (let i = 1; i < arrayOfMissedTrades.length; i++){
    const arrayOfMissedTradesNameToFind = `${strategyVersion}:${arrayOfMissedTrades[i]}`
    let val;
    if(quantityObject[arrayOfMissedTradesNameToFind]){
      val = Number(quantityObject[arrayOfMissedTradesNameToFind]);
    } else {
      const detailFromMongo = await fetchDetailFromMongo(mongoDBName, collectionName, strategyVersion,arrayOfMissedTrades[i]);
      if (detailFromMongo) {
        val = Number(detailFromMongo.executedQty);
      }
    }
    if (val) {
      sumOfMissedQuant += Number(val);
      arrayOfMissedTradesQuant.push(val);
    } else {
      let missedQuant = Number(trade.executedQty) / arrayOfMissedTrades.length;
      sumOfMissedQuant += Number(missedQuant);
      arrayOfMissedTradesQuant.push(missedQuant);
    }
  }

  return { initialBaseTradeId, strategyVersion, sumOfMissedQuant, arrayOfMissedTrades, arrayOfMissedTradesQuant };
}

const fetchDetailFromMongo = async function (mongoDBName,collectionName,strategyVersion,gridLevel) {
  let mongoDBModel = "Analytics";
  const query = { "clientOrderId": gridLevel , "version": strategyVersion};
  let result = await civfund.dbMongoose.findAllQuery(mongoDBName, collectionName,query,mongoDBModel);
  return result[0];
}

// Get order details
function getOrderDetails(trade, clientOrderId, tradeProps, missedValue, strategyVersion, amount, cost, defaultStrategyId = "-") {
  let strategyId;
  if(strategyVersion){
    strategyId = strategyVersion;
  // } else {
  //   switch (trade.symbol){
  //     case ("1000PEPEUSDT"):
  //       strategyId = "V2_67";
  //       break;
  //     case ("ETHUSDT"):
  //       strategyId = "V2_68";
  //       break;
  //     default:
  //       strategyId = "-";
  //   }
  } else if (!defaultStrategyId == "-") {
    strategyId = defaultStrategyId;
  } else {
    strategyId = "-";
  }
  return {
    unixTransactTime: trade.transactTime,
    transactTime: unixToExcelDateFormat(trade.transactTime),
    orderId: trade.orderId,
    clientOrderId: clientOrderId,
    symbol: trade.symbol,
    side: trade.side,
    price: trade.price,
    executedQty: amount,
    cost: cost,
    netValue: tradeProps.netValue,
    netAmount: tradeProps.netAmount,
    fees: trade.fees,
    missed: missedValue,
    version: strategyId
  }
}

const getFundingFeesFromMonitoringFile = async function () {
  const dbNamemonitoringInfo = 'CIV-Fund'; 
  const collectionName = 'monitoring'; 
  
  let dataCollections = await dbMongoose.getCollection(dbNamemonitoringInfo, collectionName);
  
  if(dataCollections.length === 0) {
    throw new Error('No documents found in the collection');
  }
  
  let monitoringInfo = {};

  dataCollections.forEach(document => {
    const plainDoc = document.toObject ? document.toObject() : document; 
    if (plainDoc.type === 'lp') { // Check if type is 'lp'
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc;
        delete monitoringInfo[strategyId].strategyId; 
      }
    }
  });

  if (Object.keys(monitoringInfo).length === 0) {
    throw new Error('No lp type documents found in the collection');
  }

  const data = processFile(monitoringInfo);
  const dbName = "CIV_FundingFees";

  // Create a Set to store unique symbols
  let uniqueSymbols = new Set();

  for (const item of data) {
    // If the symbol is already in the Set, skip this iteration
    if (uniqueSymbols.has(item.symbol)) continue;
    // Otherwise, add the symbol to the Set
    uniqueSymbols.add(item.symbol);

    const collectionName = item.exchange;
    const mongoDBModel = item.exchange;

    let query;
    if (item.exchange === "binanceusdm") {
      query = {symbol: item.symbol.replace(/\//g, '')};
    } else if (item.exchange === "okx") {
      query = {instId: item.symbol};
    }

    let documentsObj = await civfund.dbMongoose.findAllQuery(dbName, collectionName, query, mongoDBModel);
    // Convert object to array
    let documentsArr = Object.values(documentsObj);
    let lastItemDatetimeUnix;
    
    // Check if documentsArr has any values
    if (documentsArr.length > 0) {
      // Sort documents in ascending order of unixTransactTime
      documentsArr.sort((a, b) => a.fundingTime - b.fundingTime);
      
      // Get the last item's datetime in Unix timestamp format
      lastItemDatetimeUnix = new Date(documentsArr[documentsArr.length - 1].datetime).getTime();
    } else {
      // If no data is returned from MongoDB, use item.timestamp
      lastItemDatetimeUnix = item.timestamp;
    }
    
    // Compare with item's timestamp and use the later one
    let latestTimestamp;
    if (lastItemDatetimeUnix > item.timestamp) {
      latestTimestamp = lastItemDatetimeUnix;
      
      // Create a new Date object from the latest timestamp and add three hours
      let latestDateObj = new Date(latestTimestamp);
      latestDateObj.setHours(latestDateObj.getHours() + 3);
      
      // Convert to ISO string format and remove milliseconds
      let latestDate = latestDateObj.toISOString().split('.')[0];
      
      // Now you can use latestDate for your getFundingFees function
      await getFundingFees(item.exchange, item.symbol,latestDate);
    } else {
      // Convert to ISO string format and remove milliseconds
      let latestDate = new Date(item.timestamp).toISOString().split('.')[0];
      // Now you can use latestDate for your getFundingFees function
      await getFundingFees(item.exchange, item.symbol,latestDate);
    }
  }

  for (const item of data) {
    const collectionName = item.exchange;
    const mongoDBModel = "funding";
    
    // Conditional property names and query adjustments based on the exchange
    let symbolKey, rateKey, query;
    if (item.exchange === "binanceusdm") {
      symbolKey = 'symbol';
      rateKey = 'fundingRate';
      query = { 
        symbol: item.symbol.replace(/\//g, ''), 
        fundingTime: { $gt: item.timestamp.toString() }
      };
    } else if (item.exchange === "okx") {
      symbolKey = 'instId';
      rateKey = 'realizedRate';
      query = { 
        instId: item.symbol, 
        fundingTime: { $gt: item.timestamp.toString() }
      };
    } else {
      // Handle other exchanges or throw an error
      throw new Error("Unsupported exchange");
    }
    
    // Execute the query and process the results
    let documentsObj = await civfund.dbMongoose.findAllQuery(dbName, collectionName, query, mongoDBModel);
    let documentsArr = Object.values(documentsObj);
    if (documentsArr.length > 0) {
      let total = 0;
      documentsArr.forEach(doc => {
        total += Number(doc[rateKey]);
      });
      let average = Number(total / documentsArr.length);
      await storeFundingFeeSummary(item.version, item.symbol, average)
    }
  }
  return "Funding Fees added for each strategy";
}

const storeFundingFeeSummary = async function (strategyName, pair, average) {
  let dbName = "CIV_FundingFees";
  let collectionName = "summary";
  let modelName = "summary";

  const existingRecord = await civfund.dbMongoose.findOne(dbName, collectionName, "pair", pair);
  if (existingRecord) {
    // Update the necessary fields in the existingRecord
    existingRecord.strategies[strategyName] = {
      average: average,
    };

    // Replace the whole document with the updated existingRecord
    await civfund.dbMongoose.replaceOne(dbName, collectionName, modelName, '_id', existingRecord._id, existingRecord);
  } else {
    const newRecord = {
      pair: pair,
      strategies: {
        [strategyName]: {
          average: average,
        }
      }
    };
    await civfund.dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
  }
};
 
// sample query http://localhost:3000/monitoring/getFundingFees/binanceusdm/RNDRUSDT/2023-05-12

const getFundingFees = async function (exchange, pair, sinceDate=null) {
  const cex = civfund.initializeCcxt(exchange,"fuckoff1");
  const listOfSymbols = await cex.loadMarkets();
  let allPairs;
  if (pair == "all"){
    // allPairs = cex.symbols;

    // For OKX all pairs
    allPairs = cex.symbols.filter(symbol => symbol.includes(':') && !symbol.includes('-'));

    // allPairs = ["ETHUSDT","BTCUSDT"];
  } else {
    allPairs = [pair]
  }
  for(let i = 0; i < allPairs.length; i++){
    let currentPair = allPairs[i];
    let shouldContinue = true;
    let allResults = [];
    let resultObject = {};
    resultObject.asset = currentPair;
    // let result = (await civfund.dbMongoose.findLastDocument("CIV_FundingFees",exchange,"fundingFees",'fundingTime'));
    // console.log(result);
    // let fundingTime = result.fundingTime; // or result._doc.fundingTime

    let date;
    if (sinceDate === null) {
      date = parseInt(fundingTime) + Number (5); // Convert fundingTime to a Date object
    } else {
      date = Math.floor(Date.parse(sinceDate)); // Convert sinceDate to a Date object
    }
    while(shouldContinue) {
      const result = await cex.fetchFundingRateHistory(currentPair,date,100, undefined);
      if(result.length > 0){
        // check the timestamp of the latest fetched result
        const latestTimestamp = result[result.length - 1].timestamp;
        if(latestTimestamp > Date.now()){
          shouldContinue = false;
        } else {
          allResults.push(...result);
          date = latestTimestamp + 1; // setting the 'since' parameter to fetch the next batch of results
        }
      } else {
        // no more results for this pair, continue with the next one
        shouldContinue = false;
      }
    }
    for (let i = 0; i < allResults.length; i++){
      allResults[i].info.datetime = formatDateTime(allResults[i].datetime);
      await civfund.dbMongoose.insertOne("CIV_FundingFees",exchange,"fundingFees",allResults[i].info);
    }
  }
  console.log("funding fees saved");
};

// getFundingFees('binance',"all",'2023-10-01');

const getFundingFeesV3 = function (monitoringInfo) {
  const data = processFile(monitoringInfo);
  // Create a Set to store unique symbols
  let uniqueSymbols = new Set();

  for (const item of data) {
    // If the symbol is already in the Set, skip this iteration
    if (uniqueSymbols.has(item.symbol)) continue;
    // Otherwise, add the symbol to the Set
    uniqueSymbols.add(item.symbol);
    console.log(item);
    getFundingFees(item.exchange,item.symbol.replace(/\//g, ''))
  }
};

const filterResultsByDays = (results, days) => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return results.filter(result => Date.parse(result.datetime) >= cutoff);
};

const getAverageAnnualRate = (results) => {
  const annualRates = results.map(result => parseFloat(result.fundingRate) * 3 * 365);
  const averageRate = annualRates.reduce((a, b) => a + b, 0) / annualRates.length;
  return averageRate;
};

const getFundingFeesV2 = async function (exchange, pairs, sinceDate=null) {
  if (sinceDate === null) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    sinceDate = ninetyDaysAgo;
  }

  const cex = civfund.initializeCcxt(exchange,"test");
  await cex.loadMarkets();

  let pairFundingRates = {};

  for(let i = 0; i < pairs.length; i++){
    let currentPair = pairs[i];
    let shouldContinue = true;
    let allResults = [];

    let date = Date.parse(sinceDate);

    while(shouldContinue) {
      const result = await cex.fetchFundingRateHistory(currentPair,date,100, undefined);
      if(result.length > 0){
        // check the timestamp of the latest fetched result
        const latestTimestamp = result[result.length - 1].timestamp;
        if(latestTimestamp > Date.now()){
          shouldContinue = false;
        } else {
          allResults.push(...result);
          date = latestTimestamp + 1; // setting the 'since' parameter to fetch the next batch of results
        }
      } else {
        // no more results for this pair, continue with the next one
        shouldContinue = false;
      }
    }

    const last7Days = filterResultsByDays(allResults, 7);
    const last30Days = filterResultsByDays(allResults, 30);
    const last90Days = filterResultsByDays(allResults, 90);

    pairFundingRates[currentPair] = {
      "7d": getAverageAnnualRate(last7Days) * 100,
      "30d": getAverageAnnualRate(last30Days) * 100,
      "90d": getAverageAnnualRate(last90Days) * 100
    };
  }
  return pairFundingRates;
};



function formatDateTime(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = ("0" + (d.getUTCMonth() + 1)).slice(-2);
  const day = ("0" + d.getUTCDate()).slice(-2);
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();

  if (minutes >= 30) {
      hours++;
  }

  if (hours === 24) { // Adjust if hour has rolled over to next day
      hours = 0;
      day++;
      // Further checks can be added for end of month/year
  }

  hours = ("0" + hours).slice(-2); // Ensure double digit format

  return `${year}-${month}-${day} ${hours}:00:00`;
}

const getPerformanceReportFromMongoDB = async function () {
  const workbook = XLSX.utils.book_new();
  for (let strategy in monitoringInfo){
    let arrayOfPerformanceSnapshot = [];
    let mongoDBName = monitoringInfo[strategy].name+"-monitoring"
    let result = (await civfund.dbMongoose.getCollection('CIV-Fund',mongoDBName));
    for (let i = 0;i<result.length;i++){
      arrayOfPerformanceSnapshot.push(result[i]._doc.strategy)
    }
    var worksheet = XLSX.utils.json_to_sheet(arrayOfPerformanceSnapshot, {header:["timestamp","unixTimestamp"]});
    worksheet["!cols"] = [ { wch: 18 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 } ]
    let sheetName;
    if (arrayOfPerformanceSnapshot[0].strategyVersion){
      sheetName = (arrayOfPerformanceSnapshot[0].strategyVersion).replace(/\//g, "-");
      sheetName = sheetName.substring(0, 31);
    } else if(arrayOfPerformanceSnapshot[0].strategyName){
      sheetName = (arrayOfPerformanceSnapshot[0].strategyName).replace(/\//g, "-");
      sheetName = sheetName.substring(0, 31);
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, `${sheetName}`);    
  }
  let time = new Date().toISOString().replace(/:/, '').replace(/:/, '').replace(/\..+/, '')
  XLSX.writeFile(workbook, `../exchangeData/${time}-PerformanceReport.xlsx`);
  return `created new workbook:${time}-PerformanceReport.xlsx`;
}

const masterResearchFunction = async function () {
  await cleanReportFromMongoDB(monitoringInfo);
  await getFundingFeesFromMonitoringFile (monitoringInfo);
  // await processAllGrids (monitoringInfo);
}

const cleanReportFromMongoDB = async function (monitoringInfo) {
  let data = processFile(monitoringInfo);
  let mongoResearchDB = 'CIV_Research';
  let mongoMasterDB = 'CIV-Fund';
  let mongoMasterModel = 'CIV_MasterModel';

  // Create a Set from strategy names to ensure uniqueness
  let uniqueStrategies = new Set(data.map(strategy => strategy.name));
  console.log("Processing for the following strategies:",uniqueStrategies);
  for (const strategyName of uniqueStrategies){
    let mongoResearchCollection = strategyName;
    let mongoResearchModel = strategyName;
    let mongoMasterCollection = strategyName+"-monitoring";
    let startDate;

    // Create a Set to keep track of processed timestampKeys
    let processedTimestamps = new Set();

    // Find the strategy in the data array
    let strategy = data.find(s => s.name === strategyName);

    let result = (await civfund.dbMongoose.findLastDocument(mongoResearchDB,mongoResearchCollection,mongoResearchModel,'unixTimestamp'));
    if (typeof result === "undefined"){
      startDate = strategy.timestamp/1000;
    } else {
      startDate = result.unixTimestamp;
    }

    const query = {unixTimestamp: { $gt: startDate }};
    let documentsObj = await civfund.dbMongoose.findAllQuery(mongoMasterDB, mongoMasterCollection, query, mongoMasterModel);

    for (const report of documentsObj){
      let object = report.strategy;
      delete object.type;
      delete object.subType;
      delete object.openingDate;
      delete object.lpInitialValue;
      delete object.initialHedgeCollateral;
      delete object.showStrat;
      delete object.outOfRange;
      delete object.token0PriceDecimals;
      delete object.token1PriceDecimals;
      delete object.token0QuantityDecimals;
      delete object.token1QuantityDecimals;
      delete object.hourlyVolume;
      delete object.hourStartUnix;
      delete object.reserveUSD;
      object.timestampKey = roundToNearestHalfHour(object.timestamp);
      // if (object.totalInitialValue == null || isNaN(Number(object.totalInitialValue)) || 
      //     object["profitWNoise"] == null || isNaN(Number(object["profitW/ONoise"]))) {
      //     console.log("Cannot cast to number:", object.totalInitialValue, object["profitW/ONoise"]);
      //     console.log(object);
      //     return "Cannot cast to number:", object.totalInitialValue, object["profitW/ONoise"];
      //     // handle error, e.g. skip this item or throw an error
      // } else {
        object["Fee income in $"] = Number(object.totalInitialValue) + Number(object["profitW/ONoise"]);
      // }
      // Check if the timestampKey has already been processed
      if (processedTimestamps.has(object.timestampKey)) {
        continue;
      }

      await civfund.dbMongoose.insertOne(mongoResearchDB, mongoResearchCollection, mongoResearchModel, object);

      // Add the current timestampKey to the processedTimestamps Set
      processedTimestamps.add(object.timestampKey);
    }
  }
  return uniqueStrategies;
}

function roundToNearestHalfHour(dateString) {
  const date = new Date(dateString);
  const minutes = date.getMinutes();
  const hours = date.getHours();

  // Round to nearest half hour
  let roundedHours = hours;
  let roundedMinutes = (minutes >= 30) ? 30 : 0;

  // If rounding to 30 took us to the next hour, adjust the hour
  if (minutes >= 30 && roundedMinutes == 30) {
      roundedHours++;
  }

  date.setHours(roundedHours);
  date.setMinutes(roundedMinutes);
  date.setSeconds(0);
  date.setMilliseconds(0);

  const timestampKey = `${("0" + date.getDate()).slice(-2)}-${("0" + (date.getMonth()+1)).slice(-2)}-${date.getFullYear()} ${("0" + date.getHours()).slice(-2)}:${("0" + date.getMinutes()).slice(-2)}:${("0" + date.getSeconds()).slice(-2)}`;
  return timestampKey;
}

const getConsoleReportFromMongoDB = async function (hours) {
  const workbook = XLSX.utils.book_new();
  const inputDateTime = (await civfund.dbMongoose.getDBElementsFromSort('CivFund','Console','date','1'))[0].date;
  const inputDate = new Date(inputDateTime);
  const timeDiff = new Date() - inputDate;
  const halfHoursDiff = Math.round(timeDiff / (1000 * 60 * 30));
  const skipValue = halfHoursDiff - hours*2;
  let result = await civfund.dbMongoose.findAfterSkipping('CivFund','Console',skipValue);
  // let result = await civfund.dbMongoose.getCollection('CivFund','Console')
  // const result = (await civfund.dbMongoose.findSorted('CivFund','Console','date','-1',hours*2));
  for (let i = 0; i < result.length; i++){
    let aoa = [];
    for (let j = 0; j < result[i].logs.length; j++){
      let tempArr = [result[i].logs[j]];
      aoa.push(tempArr);
    }
    var worksheet = XLSX.utils.aoa_to_sheet(aoa);
    let time = result[i].date.replace(/:/, '').replace(/:/, '').replace(/\..+/, '');
    XLSX.utils.book_append_sheet(workbook, worksheet, `${time}${i}`);    
  }
  let time = new Date().toISOString().replace(/:/, '').replace(/:/, '').replace(/\..+/, '');
  XLSX.writeFile(workbook, `../consoleData/${time}-Report.xlsx`);
  return `created new workbook:${time}-PerformanceReport.xlsx`;
}


function toExcelDateFormat(date) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  return pad(date.getUTCDate()) + '-' +
         pad(date.getUTCMonth() + 1) + '-' +
         date.getUTCFullYear() + '  ' + // Two spaces here
         pad(date.getUTCHours()) + ':' +
         pad(date.getUTCMinutes()) + ':' +
         pad(date.getUTCSeconds());
}

function unixToExcelDateFormat(unixTimestamp) {
  const date = new Date(unixTimestamp); // Convert UNIX timestamp to JavaScript Date

  const pad = (n) => (n < 10 ? '0' + n : n);
  return pad(date.getUTCDate()) + '-' +
         pad(date.getUTCMonth() + 1) + '-' +
         date.getUTCFullYear() + '  ' + // Two spaces here
         pad(date.getUTCHours()) + ':' +
         pad(date.getUTCMinutes()) + ':' +
         pad(date.getUTCSeconds());
}

const getUnixTime = (dateString) => Math.floor(new Date(dateString).getTime() / 1000);

const handleMongoDBUpdate = async function (pairData,pair) {
  let mongoDBName = pair+"-LPData";
  let mongoDBModel = "LPHourData";
  await civfund.dbMongoose.insertOne('CIV_LPData',mongoDBName,mongoDBModel,pairData);
}

const LPHourDataSchema = new mongoose.Schema({
  hourlyVolumeUSD: Number,
  reserveUSD: Number,
  hourStartUnix: Number,
  date: String,
});

const getLatestPerformanceReportFromMongoDB = async function (inputVariables) {
  try {
    let mongoDBName = `${inputVariables._mongoDBMonitoring}-monitoring`;
    let result = await civfund.dbMongoose.getCollection('CIV-Fund', mongoDBName);

    if (!result || result.length === 0) {
      return "error";
    }

    const latestElement = result.reduce((a, b) => {
      return a.unixTimestamp > b.unixTimestamp ? a : b;
    });

    const obj = JSON.parse(JSON.stringify(latestElement));
    return obj.strategy;
  } catch (error) {
    console.error(error);
    return {};
  }
};

const processAllReports = async (monitoringInfo) => {
  const data = processFile(monitoringInfo);
  let mongoDBName = `CIV-Fund`;

  let uniqueKeys = new Set(); // Store unique keys across all trades

  for (const item of data) {
    let mongoDBCollectionName = `${item.name}-monitoring`;
    console.log("mongoDBCollectionName", mongoDBCollectionName);
    let trades = await civfund.dbMongoose.getCollection(mongoDBName, mongoDBCollectionName);

    // Iterate through each trade
    trades.forEach((trade) => {
      // Iterate through each key in the trade object
      for (const key in trade._doc.strategy) {
        // If the key has not been seen before, print it and its corresponding value
        if (!uniqueKeys.has(key)) {
          console.log(`New Key: ${key}, Sample Value: ${trade._doc.strategy[key]}`);
          uniqueKeys.add(key);
        }
      }
    });
  }
};

const processAllGrids = async (monitoringInfo) => {
  const data = processFile(monitoringInfo);
  await getListOfOrdersV2(data[0].exchange);
  for (const item of data) {
    await getGridData(item.version, item.exchange, item.subaccount.toLowerCase(), item.timestamp);
  }
  console.log("All Grids Processed");
  return {"All Grids Processed":data};
};

const processFile = (monitoringInfo) => {
  const data = monitoringInfo;
  let processedData = [];
  let uniqueData = [];

  for (const strategy in data) {
    const name = data[strategy].name;
    const lpAddress = data[strategy].lpAddress;
    const tranches = data[strategy].tranches;
    for (const tranche in tranches) {
      const type = tranches[tranche].type;
      const cexObjects = tranches[tranche].cex;
      for (const cex in cexObjects) {
        let timestamp = new Date(cexObjects[cex].timeStamp).getTime();
        let timestampISO = cexObjects[cex].timeStamp;

        if (type === "rebalance") {
          const lastRebalance = Object.values(tranches).filter(t => t.type === "rebalance").sort((a, b) => new Date(b.openingDate).getTime() - new Date(a.openingDate).getTime())[0];
          timestamp = lastRebalance.restartTimeStamp? new Date(lastRebalance.restartTimeStamp).getTime(): new Date(lastRebalance.openingDate).getTime();
        }
        const version = cexObjects[cex].stratOrderPrefix;
        const symbol = cexObjects[cex].cexSymbol;
        const exchange = cexObjects[cex].cex;
        const subaccount = cexObjects[cex].cexSubaccount.toLowerCase();
        const sumOfFundingFee = cexObjects[cex].sumOfFundingFee;
        const sumOfFundingFeeQuantity = cexObjects[cex].sumOfFundingFeeQuantity;
        const fundingFeeTillDate = cexObjects[cex].fundingFeeTillDate;

        processedData.push({timestamp, timestampISO, version, exchange, subaccount, symbol,name, lpAddress,sumOfFundingFee,sumOfFundingFeeQuantity,fundingFeeTillDate});
      }
    }
  }

  // Sort the array in descending order of timestamp
  processedData.sort((a, b) => b.timestamp - a.timestamp);

  // Build an array of unique entries
  const uniqueKeys = new Set();
  for (const entry of processedData) {
    const key = `${entry.version}-${entry.exchange}-${entry.subaccount}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.add(key);
      uniqueData.push(entry);
    }
  }

  return uniqueData;
}

const getGridData = async function (version,exchange,subaccount,timestamp) {
  let grids = {};
  timestamp = ensureUnixTimestamp(timestamp);

  // find all trades with the specified version and subaccount
  let mongoDBName = `CIV_Analytics`;
  let mongoDBCollectionName = `${exchange}_${subaccount}-Sorted`;
  let mongoDBGridCollectionName = `${exchange}_${subaccount}-Grids`;
  let mongoDBGridModel = `${exchange}_${subaccount}-Grids`;
  await civfund.dbMongoose.deleteMany(mongoDBName, mongoDBGridCollectionName,"version",version,mongoDBGridModel);
  let trades = await civfund.dbMongoose.getCollection(mongoDBName, mongoDBCollectionName);

  // Filter trades for the given version and sort them based on unixTransactTime
  let versionTrades = trades.filter(trade => trade._doc.version == version && trade._doc.unixTransactTime > timestamp);
  versionTrades.sort((a, b) => a.unixTransactTime - b.unixTransactTime);

  let startPrice = versionTrades.length > 0 ? parseFloat(versionTrades[0]._doc.price) : null;
  let lastPrice = versionTrades.length > 0 ? parseFloat(versionTrades[versionTrades.length - 1]._doc.price) : null;

  for (let trade of versionTrades) {
    let gridId = trade._doc.clientOrderId;
    if (!isNaN(gridId)) {
      if (!grids[gridId]) {
        grids[gridId] = {
          grid: gridId,
          price: Math.pow(1.0001, gridId),
          quantity: parseFloat(trade._doc.executedQty),
          numberOfOrdersExecuted: 0,
          presentQuantityStatus: 0,
          executionFees: 0,
          closedMisses: 0,
          sumOfOrdersForGrid: 0
        };
      }
      let grid = grids[gridId];
      grid.numberOfOrdersExecuted++;
      grid.presentQuantityStatus += parseFloat(trade._doc.netAmount);
      grid.executionFees -= parseFloat(trade._doc.fees);
      grid.sumOfOrdersForGrid += trade._doc.side === 'BUY' ? parseFloat(trade._doc.cost) : -parseFloat(trade._doc.cost);
      if (trade._doc.missed === 'Yes') {
        grid.closedMisses++;
      }
    }
  }

  // Post-process to add percentUnhedged, averageFees, unhedgeCost and postMissPnL
  for (let gridId in grids) {
    let grid = grids[gridId];
    if (startPrice > grid.price && lastPrice > grid.price || startPrice < grid.price && lastPrice < grid.price) {
      grid.percentUnhedged = grid.presentQuantityStatus / grid.quantity;
    } else {
      grid.percentUnhedged = 1 - Math.abs(grid.presentQuantityStatus / grid.quantity);
    }
    grid.averageFees = grid.executionFees / grid.numberOfOrdersExecuted;
    grid.unhedgeCost = (grid.price - lastPrice) * Math.abs(grid.percentUnhedged * grid.quantity);

    // Calculate postMissPnL
    if (grid.presentQuantityStatus === 0 && grid.percentUnhedged === 0) {
      grid.postMissPnL = -grid.sumOfOrdersForGrid;
    } else {
      // Need to get the cost of the last trade for this grid
      let lastTrade = versionTrades.filter(trade => trade._doc.clientOrderId == gridId).sort((a, b) => a.unixTransactTime - b.unixTransactTime).pop();
      let lastTradeCost = lastTrade ? parseFloat(lastTrade._doc.netValue) : 0;
      grid.postMissPnL = -(grid.sumOfOrdersForGrid - lastTradeCost);
    }
    grid.version = version;
    await civfund.dbMongoose.insertOne(mongoDBName,mongoDBGridCollectionName,mongoDBGridModel,grid);
  }
  return "grid Data added";
}

const ensureUnixTimestamp = (timestamp) => {
  // Check if the timestamp is already in Unix format
  if (typeof timestamp === 'number' && timestamp >= 0) {
      return timestamp;
  }
  
  // Try to convert an ISO 8601 string to Unix time
  if (typeof timestamp === 'string' && timestamp.includes('-')) {
      const converted = new Date(timestamp).getTime();
      if (!isNaN(converted)) {
          return converted;
      }
  }

  // If we've got this far, the timestamp is not valid
  throw new Error('Timestamp must be in Unix format or a valid ISO 8601 string');
}

const poolResearchFunction = async function () {
  const {symbolMapping,editedSymbols} = await getListOfSymbolsFromExchange('binanceusdm','Test');
  symbolMapping.WETH = "ETH/USDT:USDT";
  // list of stable coins
  const stableCoins = ['USDC', 'USDT', 'DAI'];

  // list of manual overrides
  let manualOverrides = {
    'WETH':'ETH', 
    'WBTC':'BTC', 
    'STETH':'ETH', 
    'SETH2':'ETH'
  };  

  const poolsData = await getListPoolsDataFromDefilama();
  const filteredPoolsData = poolsData.filter(pool => checkSymbolInExchange(pool.symbol,editedSymbols,stableCoins,manualOverrides));
  
  const uniqueSymbols = getUniqueSymbols(filteredPoolsData);
  const originalSymbols = mapSymbolsBackToOriginal(uniqueSymbols, symbolMapping);

  // Add 'ETH/USDT:USDT' to originalSymbols
  originalSymbols.push('ETH/USDT:USDT');

  const fundingFees = await getFundingFeesV2('binanceusdm', originalSymbols);
  const priceVolatility = await pricevolatility('binanceusdm', originalSymbols);

  // Adding data to each object in the filteredPoolsData
  for (let pool of filteredPoolsData) {
    const symbols = pool.symbol.split("-");
    const symbol1DataKey = symbolMapping[symbols[0]] || manualOverrides[symbols[0]] || symbols[0];
    const symbol2DataKey = symbolMapping[symbols[1]] || manualOverrides[symbols[1]] || symbols[1];

    const symbol1Original = manualOverrides[symbol1DataKey] || symbol1DataKey;
    const symbol2Original = manualOverrides[symbol2DataKey] || symbol2DataKey;

    pool.symbol1 = {
      "symbol": symbols[0],
      "fundingFees": fundingFees[symbol1Original] || 0,
      "priceVolatility": priceVolatility[symbol1Original] || {"7d": 0, "30d": 0, "90d": 0}
    };

    pool.symbol2 = {
      "symbol": symbols[1],
      "fundingFees": fundingFees[symbol2Original] || 0,
      "priceVolatility": priceVolatility[symbol2Original] || {"7d": 0, "30d": 0, "90d": 0}
    };
  }

  for (let pool in filteredPoolsData){
    await civfund.dbMongoose.insertOne("CIV_PoolsResearch","uniswap","poolsInfo",filteredPoolsData[pool]);
  }
  return "added information to mongoDB";
}



function transformResult(result) {
  return result.map(data => {
    return {
      date: new Date(data[0]),
      open: data[1],
      close: data[4]
    };
  });
}

function calculateReturn(data) {
  for(let i = 1; i < data.length; i++){
    data[i].return = (data[i].close - data[i-1].close) / data[i-1].close;
  }
  return data;
}

function calculateVolatility(data, days) {
  const dailyReturns = data.slice(-days).map(day => day.return);
  const mean = dailyReturns.reduce((a, b) => a + b) / days;
  const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / days;
  const dailyVolatility = Math.sqrt(variance);

  // annualizing the period volatility
  const annualizedVolatility = dailyVolatility * Math.sqrt(365);

  // converting the decimal into a percentage
  const annualizedVolatilityPercentage = annualizedVolatility * 100;

  return annualizedVolatilityPercentage;
}

const pricevolatility = async function(exchange, pairs, sinceDate=null) {
  if (sinceDate === null) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 100);
    sinceDate = ninetyDaysAgo;
  }

  const cex = civfund.initializeCcxt(exchange,"test");
  let pairVolatility = {};

  for(let i = 0; i < pairs.length; i++){
    let currentPair = pairs[i];

    let date = Date.parse(sinceDate);
    const result = await cex.fetchOHLCV (currentPair,'1d',date,100);

    let data = transformResult(result);
    data = calculateReturn(data);

    const last7Days = calculateVolatility(data, 7);
    const last30Days = calculateVolatility(data, 30);
    const last90Days = calculateVolatility(data, 90);

    pairVolatility[currentPair] = {
      "7d": last7Days,
      "30d": last30Days,
      "90d": last90Days
    };
  }
  return pairVolatility;
};

const mapSymbolsBackToOriginal = (uniqueSymbols, symbolMapping) => {
  return uniqueSymbols
    .map(symbol => symbolMapping[symbol])
    .filter(originalSymbol => originalSymbol !== undefined);
};

const getListOfSymbolsFromExchange = async function (exchange,subaccount) {
  const cex = civfund.initializeCcxt(exchange,subaccount);
  await cex.loadMarkets();
  let allPairs = cex.symbols;

  // Filter out the pairs which include 'BUSD'
  allPairs = allPairs.filter(pair => !pair.includes('BUSD'));

  let editedSymbols = [];
  let symbolMapping = {};

  // Remove '1000' from the pairs which start with '1000' and
  // filter out pairs that have anything other than 'USDT' after ':'
  allPairs = allPairs.map(pair => {
    let originalPair = pair;

    if (pair.startsWith('1000')) {
      pair = pair.slice(4);
    }

    let parts = pair.split(':');

    if (parts[1] !== 'USDT') {
      return null;
    }

    // Here we split the first part of the pair on '/' and return the first part
    let firstHalf = parts[0].split('/')[0];
    editedSymbols.push(firstHalf);
    symbolMapping[firstHalf] = originalPair;

    return originalPair;
  });

  // Remove null values
  allPairs = allPairs.filter(pair => pair !== null);

  // Return both the original symbols and the mapping
  return { originalSymbols: allPairs, editedSymbols: editedSymbols, symbolMapping: symbolMapping };
}

// getFundingFeesFromMonitoringFile();

const getListPoolsDataFromDefilama = async function () {
  try {
    let response = await axios.get('https://yields.llama.fi/pools');
    // The data from the API is available in response.data
    let data = response.data.data;
    let filteredData = data.filter(item => 
        item.chain === "Ethereum" && 
        (item.project === "uniswap-v2" || item.project === "uniswap-v3") && 
        item.tvlUsd > 100000
    );
    let sortedData = filteredData.sort((a, b) => b.apy - a.apy); // This will sort in descending order. If you want to sort in ascending order, use a.apy - b.apy instead.
    return sortedData;
  } catch (error) {
    console.error(`Error: ${error}`);
  }
}

const checkSymbolInExchange = (symbol, exchangeSymbols, stableCoins, manualOverrides) => {
  // split the symbol into individual tokens
  const tokens = symbol.split("-");

  // check if all tokens are in exchange symbols, stable coins, or manual overrides
  return tokens.every(token =>
    exchangeSymbols.includes(token) ||
    stableCoins.includes(token) ||
    Object.keys(manualOverrides).includes(token)
  );
};


const getUniqueSymbols = (poolsData) => {
  let symbols = [];
  poolsData.forEach(pool => {
    const tokens = pool.symbol.split("-");
    symbols = [...symbols, ...tokens];
  });
  const uniqueSymbols = [...new Set(symbols)];
  return uniqueSymbols;
};

module.exports = {
  getListOfOrders,
  getListOfOrdersV2,
  getFundingFees,
  getPerformanceReportFromMongoDB,
  getLatestPerformanceReportFromMongoDB,
  getConsoleReportFromMongoDB,
  getGridData,
  processAllGrids,
  processAllReports,
  cleanReportFromMongoDB,
  masterResearchFunction,
  poolResearchFunction,
  getFundingFeesV3,
  getFundingFeesFromMonitoringFile
};