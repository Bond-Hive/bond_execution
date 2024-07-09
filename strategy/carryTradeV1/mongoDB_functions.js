'use strict';
const civfund = require('@civfund/fund-libraries');
const { dbMongoose } = require('@civfund/fund-libraries');
const { averageYieldsGlobal,averageYieldsPostExecutionGlobal } = require('./yieldDisplay'); // Adjust the path as necessary


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

async function getStrategyName(contractAddress) {
  const liveStrategiesObj = await getLiveStrategiesMongo(); 
  let toSearch = Object.keys(liveStrategiesObj).find(key => liveStrategiesObj[key].contractAddress === contractAddress);

  // If no matching strategy is found, exit the function
  if (!toSearch) {
    console.error("No matching strategy found for the given symbolFuture.");
    return { error: "No matching strategy found for the given symbolFuture." };
  }

  return liveStrategiesObj[toSearch].name;
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

async function findAllTreasuryTransfers(timestamp) {
  const dbName = 'bond-hive'; 
  const collectionName = 'treasury_transfers';
  
  // Constructing a query to fetch documents greater than a given timestamp
  const query = { date: { $gte: new Date(timestamp).toISOString() } };

  let dataCollection = await dbMongoose.findAllQuery(dbName, collectionName, query);
  
  return dataCollection.length ? dataCollection : false;
}


async function uploadTreasuryTransfers(event) {
  const dbName = 'bond-hive'; 
  const collectionName = 'treasury_transfers';
  let modelName = 'treasuryTransfers';

  const newRecord = {
    date: event.date,
    ledgerNumber: event.ledgerNumber,
    contractId: event.contractId,
    topics: event.topics,
  };

  // Assume dbMongoose.insertOne handles the connection and operation directly
  await dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
}



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
  await civfund.dbMongoose.insertOne(dbName, collectionName, modelName, newRecord);
}

module.exports = {
  getLiveStrategiesMongo,
  checkExecutedTransaction,
  uploadExecutedTransaction,
  findAllTreasuryTransfers,
  uploadTreasuryTransfers,
  getStrategyName
};