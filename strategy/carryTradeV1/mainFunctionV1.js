'use strict';
const { webSocketOrdersBinance } = require('./depositMonitor');
const { enterDeltaHedge, executeFuturesOrderWithWebsocket } = require('./deltaHedge');
const execution = require('../../main/services/execution-libraries/index');
const { dbMongoose } = require('../../main/services/execution-libraries/index');
const { averageYieldsGlobal,webSocketConnections,averageYieldsPostExecutionGlobal, averageDiscountFactorPostExecutionGlobal } = require('./yieldDisplay'); // Adjust the path as necessary
const { executeOracleDiscountFactor, invokeFunction } = require('./oracle_discountFactor'); // Adjust the path as necessary
const treasury_functions = require('./treasury_operations');
const executionTracker = {};
const webSocketPriceMonitorUniversal = require('../../main/streams/priceStreams'); // Price Websocket input for sharing  the particular asset prices
let handledDeposit = [];

function clearCache() {
  handledDeposit = []; // This resets the cache object
};

// Global object to manage overhang and USDC carryover by strategy
let strategyState = {};

// Schedule cache clearing every 5 minutes
// 300000 milliseconds = 5 minutes
setInterval(clearCache, 300000);

const {
  SorobanRpc,
} = require("@stellar/stellar-sdk");
const server = new SorobanRpc.Server(process.env.QUICKNODE_API_STELLAR_PUBNET);
const axios = require('axios');


const mainFunction = async () => {
  const handleDeposit = async (deposit, liveStrategiesObj) => {
    if (deposit.network !== 'XLM' || deposit.currency !== 'USDC') return;

    if (handledDeposit.includes(deposit.txid)) {
      console.log('Transaction already executed and recorded');
      return;
    } else if (await checkExecutedTransaction(deposit.txid)) {
      console.log('Transaction already executed');
      return;
    } else {
      handledDeposit.push(deposit.txid);  // Record the txId in the global array to avoid future checks
    }

    let treasuryAccount = await getTransactionByHash(deposit.txid);
    let matchingStrategy = Object.values(liveStrategiesObj).find(strategy => strategy.treasuryAddress === treasuryAccount) || null;
    if (!matchingStrategy) {
      console.log("No matching strategy found.");
      return;
    } else if (matchingStrategy.cexExecution == "false"){
      console.log("Execution is not enabled");
      return;
    }
    if (!await checkAssetRelease(deposit.txid)) {
      console.log('Processing stopped due to insufficient confirm times');
      return; // Stop processing if confirm times never satisfy the condition
    }
    await manageDeltaNeutralStrategy(deposit, matchingStrategy);
    uploadExecutedTransaction(deposit, matchingStrategy, "NA", deposit.amount);
  };

  const onMessageCallback = async (response) => {
    if (response.e !== "balanceUpdate") return;  // need to change this to balanceUpdate on main, testing done with 'outboundAccountPosition'
    const liveStrategiesObj = await getLiveStrategiesMongo();
    const deposits = await getBinanceDeposits('binance', 'Test', 'USDC', getUnixTimestampForLastDay());
    for (let deposit of deposits) {
      await handleDeposit(deposit, liveStrategiesObj);
    }
  };
  webSocketOrdersBinance('Test', onMessageCallback);
};

async function manageDeltaNeutralStrategy(deposit, matchingStrategy, leverageMultiplier = 3) {
  const [firstSymbol, secondSymbol] = matchingStrategy.symbolSpot.split('/');
  const price = webSocketPriceMonitorUniversal[matchingStrategy.websocket].getPrice();
  const mS = matchingStrategy;

  let usdtFreeBalance = (await getBinanceBalance(mS.futuresExchange, mS.subaccount))[firstSymbol].free * price;
  let totalAmountNeeded = deposit.amount + (await getStrategyState(mS.name)).usdcCarryover;
  const clientOrderId = `${mS.name}_${deposit.txid.slice(0, 4)}_${deposit.txid.slice(-4)}`;

  if (usdtFreeBalance * leverageMultiplier < mS.minTradeSize) {
    console.log('No sufficient free assets to start trading, initiating minimal trade...');
    let spotAmountToExecute = await ceilToMultiple(mS.spotDecimals, mS.minTradeSize, price, 1, mS.name);
    if (typeof process.env.LOCAL_WEBSOCKET_STOP === "undefined"){
      await executeSpotOrderWithWebsocket(mS.spotExchange, mS.subaccount, mS.symbolSpot, spotAmountToExecute, mS.spotDecimals, 'BUY', 'MARKET', clientOrderId);
      await internalFundsTransfer(mS.spotExchange, mS.subaccount, firstSymbol, spotAmountToExecute, 'spot', 'delivery');
      await executeFuturesOrderWithWebsocket(mS.futuresExchange, mS.subaccount, mS.symbolFuture, 1, mS.futuresDecimals, 'SELL', 'MARKET', clientOrderId);
    }
    usdtFreeBalance = (await getBinanceBalance(mS.futuresExchange, mS.subaccount))[firstSymbol].free * price;
    totalAmountNeeded -= mS.minTradeSize;
  }

  while (totalAmountNeeded > mS.minTradeSize) {
    let totalAmountFutCon = Math.floor(totalAmountNeeded / mS.minTradeSize);
    let feeBalanceFutCon = Math.floor(usdtFreeBalance * leverageMultiplier / mS.minTradeSize);
    let usdToExecute = Math.min(feeBalanceFutCon, totalAmountFutCon) * mS.minTradeSize;
    let futConToexecute = usdToExecute / mS.minTradeSize;
    let spotAmountToExecute = await ceilToMultiple(mS.spotDecimals, mS.minTradeSize, price, futConToexecute, mS.name);
    if (typeof process.env.LOCAL_WEBSOCKET_STOP === "undefined"){
      await executeSpotOrderWithWebsocket(mS.spotExchange, mS.subaccount, mS.symbolSpot, spotAmountToExecute, mS.spotDecimals, 'BUY', 'MARKET', clientOrderId);
      await executeFuturesOrderWithWebsocket(mS.futuresExchange, mS.subaccount, mS.symbolFuture, futConToexecute, mS.futuresDecimals, 'SELL', 'MARKET', clientOrderId);
      await internalFundsTransfer(mS.spotExchange, mS.subaccount, firstSymbol, spotAmountToExecute, 'spot', 'delivery');
    }
    usdtFreeBalance = (await getBinanceBalance(mS.futuresExchange, mS.subaccount))[firstSymbol].free * price;
    totalAmountNeeded -= futConToexecute * mS.minTradeSize;
  }

  if (totalAmountNeeded > 0 && totalAmountNeeded < mS.minTradeSize) {
    updateStrategyState(mS.name, totalAmountNeeded, "usdcCarryover");
  }
  return "execution successful";

}

const ceilToMultiple = async function(decimals, tradeSize, price, futConToexecute, name) {
  const spotMultiple = (1 / (10 ** decimals)) * price;
  const overhang = (await getStrategyState(name)).overhang * price;
  const spotSize = Math.ceil((futConToexecute * tradeSize - overhang) / spotMultiple) / (10 ** decimals);
  updateStrategyState(name, ((futConToexecute * tradeSize - overhang) % spotMultiple) / price, "overhang");
  return spotSize;
};


const getStrategyState = async function(name) {
  if (!strategyState[name]) {
    const dbName = 'bond-hive'; 
    const collectionName = 'executionOverhangs'; 
    let dataCollection = await dbMongoose.findOne(dbName, collectionName, "name", name);
    if (!dataCollection) {
      strategyState[name] = { overhang: 0, usdcCarryover: 0 };
      return strategyState[name]; // No document found
    };
    strategyState[name] = dataCollection.property;
    return dataCollection.property;
  } else {
    return strategyState[name];
  }
};

const updateStrategyState  = async function(name,value,property) {
  strategyState[name][property] = value;
  const dbName = 'bond-hive'; 
  const collectionName = 'executionOverhangs';
  let modelName = 'executionOverhangs';
  let dataCollection = await dbMongoose.findOne(dbName, collectionName, "name", name);
  if (!dataCollection) {
    const newRecord = {
      name: name,
      property: { overhang: 0, usdcCarryover: 0 }
    }
    await dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
    strategyState[name] = newRecord.property;
    return strategyState[name];
  };
  const newRecord = dataCollection;
  newRecord.property[property] = value;
  await dbMongoose.replaceOne(dbName, collectionName, modelName, "_id",dataCollection._id,newRecord);
};

// Check for the funds have been deposited into the Binance wallet
const getBinanceDeposits = async function(exchangeName,subaccount,assetName,since,limit=10) {
  let cex = execution.initializeCcxt(exchangeName,subaccount);
  return await cex.fetchDeposits(assetName, since, limit);
};

const getBinanceBalance = async function(exchangeName,subaccount) {
  let cex = execution.initializeCcxt(exchangeName,subaccount);
  return await cex.fetchBalance();
};

function getUnixTimestampForLastDay() {
  const oneDayInMilliseconds = 10 * 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
  const currentDate = new Date(); // Current date and time
  const lastDayTimestamp = new Date(currentDate.getTime() - oneDayInMilliseconds); // Subtract 1 day from the current date
  
  return Math.floor(lastDayTimestamp.getTime()); // Convert to Unix timestamp (in seconds) and return
}

async function getTransactionByHash(transactionHash) {
  const url = `${process.env.QUICKNODE_API}transactions/${transactionHash}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    // Check if the transaction data is successfully retrieved
    if (response.data) {
      return response.data.source_account;
    } else {
      throw new Error('Transaction data not found in the response');
    }
  } catch (error) {
    console.error(`Error fetching transaction with hash ${transactionHash}:`, error);
    throw error; // Rethrow to handle it in the calling function
  }
};

const checkAssetRelease = async (txid, maxRetries = 5) => {
  for (let retry = 0; retry < maxRetries; retry++) {
    const deposits = await getBinanceDeposits('binance', 'Test', 'USDC', getUnixTimestampForLastDay());
    const deposit = deposits.find(d => d.txid === txid);

    if (!deposit) {
      console.log('No deposit found with the given txid');
      return false;
    }

    const [numerator, denominator] = deposit.info.confirmTimes.split('/').map(Number);

    if (numerator >= denominator) {
      console.log(`Confirm times are satisfactory: ${deposit.info.confirmTimes}`);
      return true;
    }

    console.log(`Confirm times not met (${deposit.info.confirmTimes}), retrying after 20 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 20000)); // 20 second delay
  }

  console.log('Max retries reached, confirm times check failed');
  return false;
};

const executeSpotOrderWithWebsocket = async function(
  exchange,
  subaccount,
  pair,
  amount,
  decimals,
  side,
  orderType,
  clientOrderId,
  ){
  let cex = await execution.initializeCcxt(exchange,subaccount);
  await execution.ccxt.ccxtCreateOrderWithNomenclature(
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

// Internal Asset transfer
const internalFundsTransfer = async function(exchangeName,subaccount,assetName,amount,fromAccount,toAccount) { // --> Sample for Frank
  let cex = execution.initializeCcxt(exchangeName,subaccount);
  return await cex.transfer(assetName, amount, fromAccount, toAccount)
  // Sample use --> internalFundsTransfer('binanceusdm','Test',"USDT",1000,'spot','future'); // to list all options use console.log(cex.options['accountsByType']
};

async function getLiveStrategiesMongo() {
  const dbName = 'bond-hive'; 
  const collectionName = 'LiveStrategies'; 
  let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
  if (dataCollections.length === 0) {
    throw new Error('No documents found in the collection');
  }
  const currentDate = new Date();
  let liveStrategiesObj = {};
  for (let document of dataCollections) {
    const plainDoc = document.toObject ? document.toObject() : document;
    const symbolFuture = plainDoc.symbolFuture; // Ensure symbolFuture is defined for logging
    // Extract maturity date from symbolFuture
    const maturityMatch = symbolFuture.match(/_(\d{6})/);
    if (!maturityMatch) {
      console.error(`Maturity date format error in symbolFuture: ${symbolFuture}`);
      continue; // Skip this iteration if the format does not match
    }
    const maturityStr = maturityMatch[1];
    const maturity = `20${maturityStr.slice(0, 2)}-${maturityStr.slice(2, 4)}-${maturityStr.slice(4, 6)}`;
    
    // Convert maturity string to Date object
    const maturityDate = new Date(maturity);
    
    // Check if maturity date has not passed
    if (maturityDate < currentDate) {
      console.log(`Maturity date for ${symbolFuture} has passed. Ignoring...`);
      continue; // Skip to the next document if the maturity date has passed
    }
    
    // Assign plainDoc properties to liveStrategiesObj[document.strategy] and add maturityDate
    liveStrategiesObj[plainDoc.strategy] = {
      ...plainDoc,
      maturityDate // This adds the maturityDate as a property
    };
  }
  return liveStrategiesObj; // Optionally return the object if needed elsewhere
}

async function checkExecutedTransaction(txid) {
  const dbName = 'bond-hive'; 
  const collectionName = 'executedTransaction'; 
  let dataCollection = await dbMongoose.findOne(dbName, collectionName, "txid", txid);
  if (!dataCollection) {
    return false; // No document found
  }
  return true; // Document found
}

const oracleFunction = async (contractAddress, secretKey) => {
  try {
    // Fetch the live strategies from MongoDB
    let liveStrategiesObj = await getLiveStrategiesMongo();
    let operationValue;

    // Find the strategy with the matching symbolFuture
    let toSearch = Object.keys(liveStrategiesObj).find(key => liveStrategiesObj[key].contractAddress === contractAddress);

    // If no matching strategy is found, exit the function
    if (!toSearch) {
      console.error("No matching strategy found for the given symbolFuture.");
      return { error: "No matching strategy found for the given symbolFuture." };
    }

    // Extract the contract address and determine the RPC server URL
    let network = liveStrategiesObj[toSearch].oracleNetwork;
    let rpcServerUrl = network === "testnet"
      ? "https://soroban-testnet.stellar.org:443"
      : liveStrategiesObj[toSearch].rpcurl; // Modify this line if you have URLs for other networks

    // Assume averageDiscountFactorPostExecutionGlobal is available globally
    operationValue = Math.round(Number(averageDiscountFactorPostExecutionGlobal[liveStrategiesObj[toSearch].symbolFuture] / 100) * Math.pow(10, 7));
    console.log("quote value", operationValue);
    let operationValueType = "i128";
    secretKey = secretKey || (network === "testnet" ? process.env.STELLAR_TEST_KIYF : process.env.STELLAR_PUB_ORACLE_DEPLOYER);

    const invokeAndExecute = () => {
      invokeFunction({
        secretKey,
        rpcServerUrl,
        contractAddress,
        operationName: "quote",
        network
      }).then(quote_value => {
        console.log("quote_value: ", quote_value);

        if (quote_value === BigInt(0)) {
          console.log("quote_value is zero, updating value");
          // Execute the operation to set the quote value
          executeOracleDiscountFactor({
            secretKey,
            rpcServerUrl,
            contractAddress,
            operationName: "set_quote",
            operationValue,
            operationValueType,
            network
          });
        }
      }).catch(error => {
        console.error("Error invoking function to get quote value:", error);
      }).finally(() => {
        executionTracker[contractAddress].lastExecutionTime = Date.now();
      });
    };

    if (!executionTracker[contractAddress]) {
      executionTracker[contractAddress] = {
        lastExecutionTime: 0
      };
    }

    const currentTime = Date.now();
    const { lastExecutionTime } = executionTracker[contractAddress];

    if (currentTime - lastExecutionTime > 280 * 1000) {
      // If more than 280 seconds have passed since the last execution, reset the timer and execute
      executionTracker[contractAddress].lastExecutionTime = currentTime;
      invokeAndExecute();
    }

    // Return immediately with the operation value as a string
    return { quote: operationValue.toString() };
  } catch (error) {
    console.error("An error occurred in oracleFunction:", error);
    throw error;
  }
};


// Sample usage, assuming "BTC/USDT_240628" is a valid symbolFuture in liveStrategiesObj
// oracleFunction("BTC/USDT_240628");

async function uploadExecutedTransaction(depositResults,executedLiveStrategy,profitPercent,amount) {
  const dbName = 'bond-hive'; 
  const collectionName = 'executedTransaction';
  let modelName = 'ExecutedTransaction';
  const newRecord = {
    strategy: executedLiveStrategy.strategy,
    name: executedLiveStrategy.name,
    symbolSpot: executedLiveStrategy.symbolSpot,
    symbolFuture: executedLiveStrategy.symbolFuture,
    depositAddress: executedLiveStrategy.contractAddress,
    exchangeId: depositResults.id,
    txid: depositResults.txid,
    depositTimestamp: depositResults.timestamp,
    executedTimestamp: Date.now(),
    actionType: depositResults.type,
    network: depositResults.network,
    currency: depositResults.currency,
    amount: amount,
    profitPercent: calculateProfitPercent(executedLiveStrategy.symbolFuture)*100,
    profitPercentPostExecution: calculateProfitPercent(executedLiveStrategy.symbolFuture,true)*100,
    APY: averageYieldsGlobal[executedLiveStrategy.symbolFuture]*100,
    APYPostexecution: averageYieldsPostExecutionGlobal[executedLiveStrategy.symbolFuture]*100,
  };
  await execution.dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
}

function calculateProfitPercent(symbolFuture,postExecution = false) {
  // Extracting maturity date from symbolFuture
  const maturityMatch = symbolFuture.match(/_(\d{6})/);
  if (!maturityMatch) {
    console.error(`Maturity date format error in symbolFuture: ${symbolFuture}`);
    return null; // Return null or handle as appropriate for your application
  }
  const maturityStr = maturityMatch[1];
  const maturity = `20${maturityStr.slice(0, 2)}-${maturityStr.slice(2, 4)}-${maturityStr.slice(4, 6)}`;
  const maturityDate = new Date(maturity);

  // Getting the APY for the future symbol
  const apy = postExecution? averageYieldsPostExecutionGlobal[symbolFuture] :averageYieldsGlobal[symbolFuture];
  if (typeof apy !== 'number') {
      console.error(`APY for ${symbolFuture} is not available or invalid.`);
      return null; // Return null or handle as appropriate for your application
  }

  // Calculate the number of days to maturity from today
  const currentDate = new Date();
  const timeToMaturity = maturityDate - currentDate;
  const daysToMaturity = timeToMaturity / (1000 * 60 * 60 * 24);

  // Convert APY to absolute percentage return over the period to maturity
  const absolutePercent = (apy / 365) * daysToMaturity;
  return Math.abs(absolutePercent); // Ensure it's an absolute value
}

if (typeof process.env.LOCAL_WEBSOCKET_STOP === "undefined"){
  mainFunction();
}


module.exports = {
  mainFunction,
  oracleFunction,
};