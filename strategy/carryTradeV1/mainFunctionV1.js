'use strict';
const { webSocketOrdersBinance } = require('./depositMonitor');
const { enterDeltaHedge } = require('./deltaHedge');
const execution = require('../../main/services/execution-libraries/index');
const { dbMongoose } = require('../../main/services/execution-libraries/index');
const { averageYieldsGlobal,webSocketConnections,averageYieldsPostExecutionGlobal, averageDiscountFactorPostExecutionGlobal } = require('./yieldDisplay'); // Adjust the path as necessary
const { executeOracleDiscountFactor, invokeFunction } = require('./oracle_discountFactor'); // Adjust the path as necessary
const treasury_functions = require('./treasury_operations');
const executionTracker = {};
const {
  SorobanRpc,
} = require("@stellar/stellar-sdk");
const server = new SorobanRpc.Server(process.env.QUICKNODE_API_STELLAR_PUBNET);
const axios = require('axios');


const mainFunction = async () => {
  const handleDeposit = async (deposit, liveStrategiesObj) => {
    if (deposit.network !== 'XLM' || deposit.currency !== 'USDC') return;

    if (await checkExecutedTransaction(deposit.txid)) {
      console.log('Transaction already executed');
      return;
    }
    let treasuryAccount = await getTransactionByHash(deposit.txid);
    let matchingStrategy = Object.values(liveStrategiesObj).find(strategy => strategy.treasuryAddress === treasuryAccount) || null;
    console.log("matchingStrategy",matchingStrategy);
    console.log("deposit",deposit);

    let executedLiveStrategy;
    let profitPercent;
    let amount;
    for (let liveStrategy of Object.values(liveStrategiesObj)) {
      // step 1 - check if the asset is free to be used (from fetch deposit), if not wait and check again. Add in "in-process" in mongoDB so it is not picked by next
      // step 2 - check collateral in coin-m, enough for next 20%? Enter delta hedge -> transfer 20% and rest of the 80%. If not, 20% spot -> transfer -> coin-m short

      // const { strategy, symbolFuture, symbolSpot, spotExchange, subaccount, futuresExchange, spotDecimals } = liveStrategy;
      // const clientOrderId = `V${strategy}-${deposit.id}`;
      // profitPercent = calculateProfitPercent(symbolFuture);
      // amount = deposit.amount / (webSocketConnections[symbolFuture].getPrice());

      // await processSpotTransactions(strategy, subaccount, symbolSpot, amount, spotDecimals);
      // await processFuturesTransactions(strategy, subaccount, symbolSpot, symbolFuture, amount, spotDecimals, futuresExchange, clientOrderId, profitPercent);

      // executedLiveStrategy = liveStrategy;
      // break;
    }

    // uploadExecutedTransaction(deposit, executedLiveStrategy, profitPercent, amount);
  };

  const processSpotTransactions = async (strategy, subaccount, symbolSpot, amount, spotDecimals) => {
    executeSpotOrderWithWebsocket(strategy, subaccount, symbolSpot, amount * 0.2, spotDecimals, "BUY", "MARKET", `${clientOrderId}-20`);
    internalFundsTransfer(strategy, subaccount, symbolSpot, amount * 0.2, 'spot', 'future');
  };

  const processFuturesTransactions = async (spotExchange, futuresExchange, subaccount, clientOrderId, symbolSpot, symbolFuture, amount, spotDecimals, futuresDecimals, profitPercent) => {
    enterDeltaHedge(spotExchange, futuresExchange, subaccount, clientOrderId, symbolSpot, symbolFuture, amount, spotDecimals, futuresDecimals, 1, profitPercent * 100);
    internalFundsTransfer(spotExchange, subaccount, symbolSpot, amount * 0.8, 'spot', 'future');
  };

  const onMessageCallback = async (response) => {
    if (response.e !== "outboundAccountPosition") return;  // need to change this to balanceUpdate on main, testing done with 'outboundAccountPosition'
    const liveStrategiesObj = await getLiveStrategiesMongo();
    const deposits = await getBinanceDeposits('binance', 'Test', 'USDC', getUnixTimestampForLastDay());
    for (let deposit of deposits) {
      await handleDeposit(deposit, liveStrategiesObj);
    }
  };
  webSocketOrdersBinance('Test', onMessageCallback);
};

// Check for the funds have been deposited into the Binance wallet
const getBinanceDeposits = async function(exchangeName,subaccount,assetName,since,limit=10) {
  let cex = execution.initializeCcxt(exchangeName,subaccount);
  return await cex.fetchDeposits(assetName, since, limit);
};

function getUnixTimestampForLastDay() {
  const oneDayInMilliseconds = 7 * 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
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
}

const executeSpotOrderWithWebsocket = async function(
  exchange,
  subaccount,
  pair,
  amount,
  decimals,
  side,
  orderType,
  clientOrderId,
  price
  ){
  let cex = await execution.initializeCcxt(exchange,subaccount);
  execution.ccxt.ccxtCreateOrderWithNomenclature(
    cex,
    exchange,
    pair,
    orderType,
    side,
    Number(Number(amount).toFixed(decimals)),
    price,
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
  // Sample use --> internalFundsTransfer('binanceusdm','Test',"USDT",1000,'spot','future');
};

const getBinanceInternalTransfers = async function(exchangeName,subaccount,assetName,since,limit=50) { // --> Sample for Frank
  let cex = execution.initializeCcxt(exchangeName,subaccount);
  console.log(await cex.fetchTransfers(assetName, since, limit));
  // Sample use --> getBinanceTransfers('binanceusdm','Test7','USDT',1685111342000);
  /* Payload for getBinanceTransfers
  [
  {
    info: { ... },
    id: "93920432048",
    timestamp: 1646764072000,
    datetime: "2022-03-08T18:27:52.000Z",
    currency: "USDT",
    amount: 11.31,
    fromAccount: "spot",
    toAccount: "future",
    status: "ok"
  }
  ]
  */
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
    depositAddress: executedLiveStrategy.poolAddress,
    exchangeId: depositResults.id,
    txid: depositResults.txid,
    depositTimestamp: depositResults.timestamp,
    executedTimestamp: Date.now(),
    actionType: depositResults.type,
    network: depositResults.network,
    currency: depositResults.currency,
    amount: amount,
    profitPercent: profitPercent*100,
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

// if (typeof process.env.LOCAL_WEBSOCKET_STOP === "undefined"){
  mainFunction();
// }


module.exports = {
  mainFunction,
  oracleFunction,
};