'use strict';
const { DateTime } = require('luxon');
const civfund = require('@civfund/fund-libraries')

///////////////////////// Funding Fee Function /////////////////////////

const masterFundingFee = async function (monitoringInfo) {
  const data = processFile(monitoringInfo);

  for (const item of data) {
    await getFundingRateAndFees(item.exchange, item.subaccount.toLowerCase(), item.symbol, item.timestampISO);
    let { sumOfFundingFee, sumOfFundingFeeQuantity, fundingFeeTillDate } = await getLatestFundingFeeInfo(item);

    // get all trades and funding fees from mongoDB
    let trades = await getTradesFromMongo(item, fundingFeeTillDate);
    let fundingFees = await getFundingFeeFromMongo(item, fundingFeeTillDate);

    if (fundingFees.length === 0) {
      console.log("no additional Funding Fee object to process");
      continue;
    }

    // Calculate funding fee
    const result = await calculateFundingFee(
      trades,
      fundingFees,
      Number(sumOfFundingFee),
      Number(sumOfFundingFeeQuantity),
      item.exchange,
      item.subaccount.toLowerCase(),
      item.symbol
    );

    // save the updated sumOfFundingFee and sumOfFundingFeeQuantity for the next iteration
    await storeFundingFeeData(
      item.exchange,
      item.subaccount.toLowerCase(),
      item.version,
      item.symbol,
      result.sumOfFundingFee,
      result.sumOfFundingFeeQuantity,
      result.fundingFeeTillDate
    ) 
  }

  return "Check mongoDB";
};

const calculateFundingFee = async function (trades, fundingFees, sumOfFundingFee, sumOfFundingFeeQuantity,exchange, subaccount,pair) {
  // Sort fundingFees in ascending order by timestamp to make sure we're processing them in the right order
  const cex = civfund.initializeCcxt(exchange, subaccount);
  await cex.loadMarkets();
  let decimals = await cex.market(pair).precision.amount;

  // Initialize periodStart with the timestamp of the first funding fee
  let firstPeriodEnd = Number(fundingFees[0].timestamp);
  let periodStart = firstPeriodEnd - 8 * 60 * 60 * 1000; // subtract 8 hours in milliseconds

  let fundingFeeTillDate = 0;  // declare fundingFeeTillDate here

  for (const fundingFee of fundingFees) {
    // Filter trades that occurred during the period ending with this funding fee
    const periodEnd = Number(fundingFee.timestamp);
    const tradesInPeriod = trades.filter(trade => Number(trade.transactTime) > periodStart && Number(trade.transactTime) <= periodEnd);

    // Calculate the net position from the trades during this period
    let netPosition = 0;

    for (const trade of tradesInPeriod) {
      // console.log(trade.executedQty);
      const quantity = Number(Number(trade.executedQty).toFixed(decimals));
      if (trade.side === 'SELL') {
        netPosition -= Number(quantity);
      } else if (trade.side === 'BUY') {
        netPosition += Number(quantity);
      }
    }
    // console.log(netPosition);

    // Add the net position to the previous sumOfFundingFeeQuantity
    sumOfFundingFeeQuantity = Number((Number(sumOfFundingFeeQuantity) + Number(netPosition)).toFixed(decimals));

    // Calculate the share of the fundingAmount and add it to sumOfFundingFee
    const share = Math.abs(sumOfFundingFeeQuantity) / Number(fundingFee.estimatedTokenSizeInNative);
    // console.log(fundingFee.fundingAmount);
    sumOfFundingFee += share * Number(fundingFee.fundingAmount);
    
    // Update periodStart for the next iteration
    periodStart = periodEnd;

    // Update fundingFeeTillDate with the value of periodEnd
    fundingFeeTillDate = periodEnd;
  }

  return {
    sumOfFundingFee,
    sumOfFundingFeeQuantity,
    fundingFeeTillDate
  };
};

const getLatestFundingFeeInfo = async function (data) {
  let sumOfFundingFee; let sumOfFundingFeeQuantity; let fundingFeeTillDate;
  let dbName = data.exchange + "-FundingFees";
  let collectionName = "fundingFee_collection";

  const existingRecord = await civfund.dbMongoose.findOne(dbName, collectionName, "account", data.subaccount.toLowerCase()+data.symbol);
  if (existingRecord) {
    console.log("FundingFee Function: Reached inside existing summary file");
    sumOfFundingFee = existingRecord.strategies[data.version].sumOfFundingFee;
    sumOfFundingFeeQuantity = existingRecord.strategies[data.version].sumOfFundingFeeQuantity;
    fundingFeeTillDate = Number(existingRecord.strategies[data.version].fundingFeeTillDate);
  } else {
    console.log("FundingFee Function: Reached inside monitoringfile");
    sumOfFundingFee = data.sumOfFundingFee;
    sumOfFundingFeeQuantity = data.sumOfFundingFeeQuantity;
    fundingFeeTillDate = data.fundingFeeTillDate;
  }
  return {sumOfFundingFee,sumOfFundingFeeQuantity,fundingFeeTillDate};
};

const getTradesFromMongo = async function (item,fundingFeeTillDate) {
  let dbName = item.exchange + "-Orders";
  let collectionName = item.subaccount.toLowerCase() +"_accounts";
  let unixTimestamp = getUnixTimestamp(fundingFeeTillDate);
  let modifiedSymbol = removeSlash(item.symbol);
  let query = {
    transactTime: { $gt: unixTimestamp },
    symbol: new RegExp("^" + modifiedSymbol),
    clientOrderId: new RegExp("^" + item.version)
  };    
  return await civfund.dbMongoose.findAllQuery(dbName, collectionName, query);
};

const getFundingFeeFromMongo = async function (item,fundingFeeTillDate) {
  let dbNameFunding = item.exchange + "-FundingFees";
  let collectionNameFunding = item.subaccount.toLowerCase();

  // Check if fundingFeeTillDate is a Unix timestamp
  let unixTimestampFunding;
  if (typeof fundingFeeTillDate === 'number') {
    unixTimestampFunding = fundingFeeTillDate;
  } else {
    unixTimestampFunding = getUnixTimestamp(fundingFeeTillDate);
  }
  
  let queryFunding = {
    timestamp: { $gt: unixTimestampFunding },
    symbol: new RegExp("^" + item.symbol),
  };

  return await civfund.dbMongoose.findAllQuery(dbNameFunding, collectionNameFunding, queryFunding);
};


function removeSlash(inputString) {
  return inputString.replace(/\//g, '');
};

const getUnixTimestamp = (dateStr, timezone = 'GMT') => {
  let date = DateTime.fromISO(dateStr, { zone: timezone });
  return date.toMillis();
};

const storeFundingFeeData = async function (exchange, account, strategyName, pair, sumOfFundingFee, sumOfFundingFeeQuantity, unixTimestamp) {
  let dbName = exchange + "-FundingFees";
  let collectionName = "fundingFee_collection";
  let modelName = "fundingFeeCollection"+account;

  const existingRecord = await civfund.dbMongoose.findOne(dbName, collectionName, "account", account.toLowerCase()+pair);
  if (existingRecord) {
    // Update the necessary fields in the existingRecord
    existingRecord.strategies[strategyName] = {
      sumOfFundingFee: sumOfFundingFee,
      sumOfFundingFeeQuantity: sumOfFundingFeeQuantity,
      fundingFeeTillDate: unixTimestamp
    };

    // Replace the whole document with the updated existingRecord
    await civfund.dbMongoose.replaceOne(dbName, collectionName, modelName, '_id', existingRecord._id, existingRecord);
  } else {
    const newRecord = {
      account: account.toLowerCase()+pair,
      strategies: {
        [strategyName]: {
          sumOfFundingFee: sumOfFundingFee,
          sumOfFundingFeeQuantity: sumOfFundingFeeQuantity,
          fundingFeeTillDate: unixTimestamp
        }
      }
    };
    await civfund.dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
  }
};

const getFundingRateAndFees = async function (exchange, subaccount, pair, sinceDate = null) {
  const cex = civfund.initializeCcxt(exchange, subaccount);
  await cex.loadMarkets();
  let decimals = await cex.market(pair).precision.amount;
  let shouldContinue = true;
  let allResults = [];
  let matchedResults = [];

  const query = {symbol:pair};
  let data = await civfund.dbMongoose.findAllQuery(`${exchange}-FundingFees`, subaccount.toLowerCase(), query, `${subaccount}-Funding`);
  let timestampISO;
  if (data && data.length > 0) {  
    data.sort((a,b) => b.timestamp - a.timestamp)
    let date = new Date(data[0].datetime);
    // Add three hour to the timestamp
    date.setHours(date.getHours() + 3);
    // Convert it to 'YYYY-MM-DDTHH:mm:ss' format
    timestampISO = date.toISOString().slice(0, 19);
  } else {
    timestampISO = sinceDate;
  }
  let date = Date.parse(timestampISO);

  while (shouldContinue) {
    const result = await cex.fetchFundingRateHistory(pair, date, 100, undefined);
    const fundingHistory = await cex.fetchFundingHistory(pair, date, 100, undefined);
    if (result.length > 0) {
      const latestTimestamp = result[result.length - 1].timestamp;
      if (latestTimestamp > Date.now()) {
        shouldContinue = false;
      } else {
        allResults.push(...result);
        date = latestTimestamp + 1;
      }

      // Match funding rate history with funding history within 1 minute range
      for (let i = 0; i < result.length; i++) {
        for (let j = 0; j < fundingHistory.length; j++) {
          // Timestamps within 600,000 milliseconds (10 minute) range
          if (Math.abs(result[i].timestamp - fundingHistory[j].timestamp) <= 600000) {
            // Fetch mark price
            const markPriceData = await cex.fetchMarkOHLCV(pair, '1m', result[i].timestamp, 1);
            // Check if mark price data is available
            if (markPriceData && markPriceData.length > 0) {
              const openPrice = markPriceData[0][1]; // Get the opening price (mark price)

              // Calculate amount
              const amount = Number(((fundingHistory[j].amount / result[i].fundingRate) / openPrice).toFixed(decimals));
              const symbol = result[i].symbol.split(':')[0];
              // Create new object with required information
              const matchedResult = {
                symbol:symbol,
                timestamp:result[i].timestamp,
                datetime:result[i].datetime,
                fundingRate:result[i].fundingRate,
                fundingAmount: fundingHistory[j].amount,
                estimatedTokenSizeInNative: amount,
                price: openPrice,
                fundingCurrency: fundingHistory[j].code,
                transactionId: fundingHistory[j].id,
              };
              matchedResults.push(matchedResult);

              // Replace the MongoDB comment section here with your code to save `matchedResult` to MongoDB
              await civfund.dbMongoose.insertOne(`${exchange}-FundingFees`,subaccount,`${subaccount}-Funding`,matchedResult);
            }
          }
        }
      }
    } else {
      // Break out of the loop if result length is 0
      shouldContinue = false;
    }
  }
  return matchedResults;
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

module.exports = {
  masterFundingFee,
};