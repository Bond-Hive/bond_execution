'use strict';
const { PriceMonitor } = require('@civfund/fund-libraries');
let yieldsLast30Global = {};
let yieldsLast30PostExecutionGlobal = {};
let averageYieldsGlobal = {};
let averageYieldsPostExecutionGlobal = {};
let averageDiscountFactorPostExecutionGlobal = {};
let webSocketConnections = {};
const WebSocket = require('ws');
const http = require('http');

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
    const yieldOnCarryTradePostFees = ((((futurePrice - spotPrice) / spotPrice)) *(1-0.09)) * 365 / daysToMaturity;
    // Check if yield is more than 500% to avoid outliers like infinity and so on
    if (Math.abs(yieldOnCarryTrade) > 5 || Math.abs(yieldOnCarryTradePostFees) > 5) {
      console.log(`Yield for ${symbolFuture} an outlier. Ignoring...`);
      return; // Skip further processing
    }

    yieldsLast30PostExecutionGlobal[symbolFuture] = (yieldsLast30PostExecutionGlobal[symbolFuture] || []).concat(yieldOnCarryTradePostFees).slice(-30);
    yieldsLast30Global[symbolFuture] = (yieldsLast30Global[symbolFuture] || []).concat(yieldOnCarryTrade).slice(-30);
    
    const averageYield = calculateAverage(yieldsLast30Global[symbolFuture]);
    const averageYieldPostExecution = calculateAverage(yieldsLast30PostExecutionGlobal[symbolFuture]);
    const averageDiscountFactorPostExecution = Math.pow(1 + (averageYieldPostExecution/365), daysToMaturity)

    // console.log("averageYieldPostExecution",averageYieldPostExecution);
    // console.log("averageDiscountFactorPostExecution",averageDiscountFactorPostExecution);

    averageYieldsGlobal[symbolFuture] = averageYield;
    averageYieldsPostExecutionGlobal[symbolFuture] = averageYieldPostExecution;
    averageDiscountFactorPostExecutionGlobal[symbolFuture] = averageDiscountFactorPostExecution;

    if (wss.clients.size > 0) { // Check if there are connected clients
      const averageYieldPostExecutionRange = formatYieldAsRange(averageYieldPostExecution);
      broadcast(JSON.stringify({ 
        symbolFuture, 
        averageYieldPostExecution: averageYieldPostExecutionRange 
      }));
    }
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

// Initialize a simple HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

// Initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });

// Define broadcast function at a higher scope to make it accessible everywhere
function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', function connection(ws) {
  console.log('A new client connected.');
  // Send a message to the client indicating successful connection
  ws.send(JSON.stringify({ message: 'Connected to yield calculation service' }));

  // Remember to handle client disconnection
  ws.on('close', function() {
    console.log('Client disconnected.');
  });
});

server.listen(10000, function listening() {
  console.log('Listening on %d', server.address().port);
});

function formatYieldAsRange(value, rangePercentage = 3.5) {
  // Calculate the range values
  const lowerBound = value * (1 - rangePercentage / 100);
  const upperBound = value * (1 + rangePercentage / 100);
  
  // Convert to percentage format with two decimals
  const lowerBoundPercent = (lowerBound * 100).toFixed(2) + '%';
  const upperBoundPercent = (upperBound * 100).toFixed(2) + '%';
  
  return { lower: lowerBoundPercent, upper: upperBoundPercent };
}


// Export the stop function if needed, or call it when appropriate
module.exports = { 
  restartYieldCalc,
  stopWebSockets,
  averageYieldsGlobal,
  averageYieldsPostExecutionGlobal,
  webSocketConnections,
  averageDiscountFactorPostExecutionGlobal
};