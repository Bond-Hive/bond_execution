'use strict';
const { PriceMonitor } = require('@civfund/fund-libraries');
let yieldsLast30Global = {};
let yieldsLat30PostExecutionGlobal = {};
let averageYieldsGlobal = {};
let averageYieldsPostExecutionGlobal = {};
let webSocketConnections = {};

const { dbMongoose } = require('@civfund/fund-libraries');

async function fetchLiveStrategies(){
  const dbName = 'bond-hive'; 
  const collectionName = 'LiveStrategies'; 
  
  let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
  
  if (dataCollections.length === 0) {
    throw new Error('No documents found in the collection');
  };
  
  const currentDate = new Date();
  
  for (let document of dataCollections) {
    const plainDoc = document.toObject ? document.toObject() : document; 
    const symbolFuture = plainDoc.symbolFuture;
    const symbolSpot = plainDoc.symbolSpot;
    
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
    
    console.log(symbolFuture, symbolSpot, maturity);
    setupYieldCalculation(symbolSpot, symbolFuture, maturity);
  }
}



function setupYieldCalculation(symbolSpot,symbolFuture,maturity) {
  const futurePriceMonitor = new PriceMonitor('last', symbolFuture, null, 'binanceusdm', null, null, null, true);
  const spotPriceMonitor = new PriceMonitor('last', symbolSpot, null, 'binance', null, null, null, true);
  //Storing the connections
  webSocketConnections[symbolFuture] = futurePriceMonitor;
  webSocketConnections[symbolSpot] = spotPriceMonitor;

  futurePriceMonitor.on('price', (data) => {
    const spotPrice = spotPriceMonitor.getPrice();
    const futurePrice = data;
    const maturityDate = new Date(maturity);
    const currentDate = new Date();
    const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
    const yieldOnCarryTrade = (futurePrice - spotPrice) / spotPrice * 365 / daysToMaturity;
    const yieldOnCarryTradePostFees = ((((futurePrice - spotPrice) / spotPrice)) *(1-0.01)) * 365 / daysToMaturity;

     // Check if yield is more than 500% to avoid outliers like infinity and so on
     if (Math.abs(yieldOnCarryTrade) > 5 || Math.abs(yieldOnCarryTradePostFees) > 5) {
      console.log(`Yield for ${symbolFuture} an outlier. Ignoring...`);
      return; // Skip further processing
    }

    yieldsLat30PostExecutionGlobal[symbolFuture] = (yieldsLat30PostExecutionGlobal[symbolFuture] || []).concat(yieldOnCarryTradePostFees).slice(-30);
    yieldsLast30Global[symbolFuture] = (yieldsLast30Global[symbolFuture] || []).concat(yieldOnCarryTrade).slice(-30);
    
    const averageYield = calculateAverage(yieldsLast30Global[symbolFuture]);
    const averageYieldPostExecution = calculateAverage(yieldsLat30PostExecutionGlobal[symbolFuture]);

    averageYieldsGlobal[symbolFuture] = averageYield;
    averageYieldsPostExecutionGlobal[symbolFuture] = averageYieldPostExecution;

    // console.log(`Average yield on carry trade for ${symbolFuture}: ${averageYield}`);
    // console.log(`Average yield on carry trade for ${symbolFuture} post execution fees: ${averageYieldPostExecution}`);
  });
}

function calculateAverage(prices) {
  let sum = 0;
  for (let price of prices) {
    sum += price;
  }
  const average = sum / prices.length;
  return average;
}


function stopWebSockets() {
  for (let key in webSocketConnections) {
    const monitor = webSocketConnections[key];
    if (monitor && typeof monitor.close === 'function') {
      monitor.close(); // Close the WebSocket connection
      console.log(`WebSocket for ${key} closed.`);
    }
  }
  return "All WebSockets closed.";
};

async function restartYieldCalc() {
  console.log("Restarting yield calculations...");
  stopWebSockets(); // Stop all current WebSocket connections
  await fetchLiveStrategies(); // Re-fetch live strategies
  return "Yield calculation websockets restarted.";
};

fetchLiveStrategies();

// Export the stop function if needed, or call it when appropriate
module.exports = { 
  restartYieldCalc,
  stopWebSockets,
  averageYieldsGlobal,
  averageYieldsPostExecutionGlobal,
  webSocketConnections
};