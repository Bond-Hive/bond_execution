const { getCexInfo, OrdersV2, getAccountBalance } = require('@civfund/fund-monitoring/monitoring/libraries/ccxtFunctions.js');
const { percentual } = require('@civfund/fund-monitoring/monitoring/libraries/mainFunctions.js');
const civfund = require('@civfund/fund-libraries');
const webSocketPriceMonitorUniversal = require('../../../../main/streams/priceStreams'); // Price Websocket input for sharing  the particular asset prices

const getV8Monitoring = async function (strategy) {
  let resultObj = {};

  // Get hedge value from CEX's for each tranche
  resultObj.hedge = await getHedgeValue(strategy);
  const{
    initialHedgeCollateral:initialHedgeCollateral,
    hedgeCollateralFromOrders:hedgeCollateralChange,
  } = JSON.parse(JSON.stringify(resultObj.hedge.final));
  
  // Time Calculations
  const timeDiff = (new Date()).getTime() - (new Date(strategy.openingDate)).getTime();
  const daysDiff = timeDiff / (1000 * 3600 * 24);

  // Main Calculations
  const hedgeCollateralValue = initialHedgeCollateral - hedgeCollateralChange;
  const totalValue = hedgeCollateralValue;
  const totalInitialValue = initialHedgeCollateral;
  const totalPercentChange = percentual(totalInitialValue, totalValue);
  const CAGR = parseFloat(((((1+(totalPercentChange/100))**(365/daysDiff)-1)*100).toString()).split('e+')[0]);
  const totalPNL = totalValue - totalInitialValue;

  resultObj.final = {
    'strategyName': strategy.name,
    'type': strategy.type,
    'profit': totalPNL,
    'CAGR': CAGR,
    'totalPercentChange': totalPercentChange,
    'totalInitialValue': totalInitialValue,
    'totalValue': totalValue,
    'initialHedgeCollateral': initialHedgeCollateral,
    'hedgeCollateralValue': hedgeCollateralValue,
    'hedgeCollateralChange': hedgeCollateralChange,
    'showStrat': strategy.showStrat,
  }
  return resultObj.final;
}

const getHedgeValue = async function (strategy) {
  let hedgeObj = {};
  for (let tranche in strategy.tranches){
    let trancheName = 'tranche'+tranche;
    hedgeObj[trancheName] = await getHedgeTrancheDeploy(strategy.tranches[tranche],strategy);
  }

  let initialHedgeCollateral = 0; let hedgeCollateralFromOrders = 0;
  for (let trancheResult in hedgeObj){
    let finalObj = hedgeObj[trancheResult].final;
    initialHedgeCollateral += Number(finalObj.initialCEXCollateral);
    hedgeCollateralFromOrders += Number(finalObj.collateralFromOrders);
  }

  hedgeObj.final = {
    'initialHedgeCollateral' : initialHedgeCollateral,
    'hedgeCollateralFromOrders' : hedgeCollateralFromOrders,
  }
  return hedgeObj;
}


const getHedgeTrancheDeploy = async function (tranche, strategy) {
  let trancheObj = {};
  const today = new Date(); // Current date

  for (let cex in tranche.cex) {
    let cexObj = tranche.cex[cex];
    
    
    // Get the funding fee rate
    let fundingFeeRate = await getNetFundingFeeRate(cexObj.cexSymbol, cexObj.stratOrderPrefix) || 0;

    // Parse fundingFeeTillDate as a Date object
    let fundingFeeTillDate = new Date(cexObj.fundingFeeTillDate);

    // Calculate the difference in days between today and fundingFeeTillDate
    let daysDifference = (today - fundingFeeTillDate) / (1000 * 60 * 60 * 24);

    // Calculate collateralFromOrders with the new formula
    let collateralFromOrders = parseFloat(cexObj.sumOfFundingFeeQuantity) * fundingFeeRate / 100 * (daysDifference / 365);

    let cexName = 'cex' + cex;

    trancheObj[cexName] = {
      'CEX': cexObj.cex,
      'initialCEXCollateral': cexObj.initialCEXCollateral,
      'collateralFromOrders': collateralFromOrders,
    }
  }

  let finalInitialCEXCollateral = 0;
  let finalCollateralFromOrders = 0;
  for (let cexResult in trancheObj) {
    finalInitialCEXCollateral += Number(trancheObj[cexResult].initialCEXCollateral);
    finalCollateralFromOrders += Number(trancheObj[cexResult].collateralFromOrders);
  }

  trancheObj.final = {
    'initialCEXCollateral': finalInitialCEXCollateral,
    'collateralFromOrders': finalCollateralFromOrders,
  }
  return trancheObj;
}



const getNetFundingFeeRate = async function (symbol, version) {
  let dbName = "CIV_FundingFees";
  let collectionName = "summary";

  try {
    // Perform the MongoDB query
    const result = await civfund.dbMongoose.findOne(
      dbName,
      collectionName,
      "pair",
      symbol
    );

    // Check if the result and the necessary fields exist
    if (result && result.strategies && result.strategies[version] && result.strategies[version].average) {
      return result.strategies[version].average * 3 * 365 * 100;
    } else {
      // If the result is null or fields are missing, return 0
      return 0;
    }
  } catch (error) {
    // If there is an error (e.g., database connection issue), return 0
    return 0;
  }
};


module.exports = {
  getV8Monitoring,
};
