const { getCexInfo, OrdersV2 } = require('./libraries/ccxtFunctions.js');
const { percentual } = require('./libraries/mainFunctions.js');

const getV4Monitoring = async function (strategy) {
  let resultObj = {};

  // Get hedge value from CEX's for each tranche
  resultObj.hedge = await getHedgeValue(strategy);
  const{
    initialHedgeCollateral:initialHedgeCollateral,
    hedgeCollateralFromOrders:hedgeCollateralChange,
    cexNAV: cexNAV,
  } = JSON.parse(JSON.stringify(resultObj.hedge.final));
  
  // Time Calculations
  const timeDiff = (new Date()).getTime() - (new Date(strategy.openingDate)).getTime();
  const daysDiff = timeDiff / (1000 * 3600 * 24);

  // Main Calculations
  const hedgeCollateralValue = initialHedgeCollateral - hedgeCollateralChange;
  const totalValue = hedgeCollateralValue;
  const NAV = cexNAV;
  const totalInitialValue = initialHedgeCollateral;
  const totalPercentChange = percentual(totalInitialValue, totalValue);
  const totalNAVChange = percentual(totalInitialValue, NAV);
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
    'NAV': NAV,
    'totalNAVChange': totalNAVChange,
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

  let initialHedgeCollateral = 0; let hedgeCollateralFromOrders = 0; let cexNAV = 0;
  for (let trancheResult in hedgeObj){
    let finalObj = hedgeObj[trancheResult].final;
    initialHedgeCollateral += Number(finalObj.initalCEXCollateral);
    hedgeCollateralFromOrders += Number(finalObj.collateralFromOrders);
    cexNAV += Number(finalObj.cexNAV);
  }

  hedgeObj.final = {
    'initialHedgeCollateral' : initialHedgeCollateral,
    'hedgeCollateralFromOrders' : hedgeCollateralFromOrders,
    'cexNAV': cexNAV,
  }
  return hedgeObj;
}


const getHedgeTrancheDeploy = async function (tranche, strategy) {
  let trancheObj = {};

  for (let cex in tranche.cex){
    let cexObj = tranche.cex[cex];
    let apiKey = cexObj.apiKey? cexObj.apiKey: 'None';
    let secret = cexObj.secret? cexObj.secret: 'None';
    let password = cexObj.password? cexObj.password: 'None';
    let orderNameStratControl = (cexObj.orderNameStratControl) ? cexObj.orderNameStratControl : false;
    let stratOrderPrefix = (cexObj.orderNameStratControl) ? cexObj.stratOrderPrefix : false;

    const {
      info:CexInfo,
      NAV:cexNAV
    } = await getCexInfo(cexObj.cex, cexObj.cexSymbol, cexObj.cexSubaccount, apiKey, secret, password); // array response from ccxt fecth position

    let {
      // positionAmt:openPosition,
      symbol:symbol,
      markPrice:markPrice,
    } = CexInfo[0].info;

    let {
      contracts:openPosition,
      marginRatio:marginRatio,
      side:side
    } = CexInfo[0];

    let {
      sumOfOrderValue: sumOfOrder,
      sumOfSellOrderQuantity: sumOfSellOrderQuantity
    } = await OrdersV2(cexObj.cexSymbol, cexObj.tillDate, cexObj.cexSubaccount, cexObj.cex, stratOrderPrefix, orderNameStratControl,"v4",cexObj);
    console.log("sumOfOrder",sumOfOrder);

    // hedge data
    let collateralFromOrders = JSON.parse(JSON.stringify(sumOfOrder)); /*let collateralFromOrdersWNoise = JSON.parse(JSON.stringify(sumOfOrder));*/
    let sign = (side === "long") ? -1 : 1;
    console.log("collateralFromOrders",collateralFromOrders);

    collateralFromOrders += parseFloat(sumOfSellOrderQuantity) * markPrice;
    console.log("collateralFromOrders",collateralFromOrders);

    let cexName = 'cex'+cex;
    trancheObj[cexName] = {
      'CEX': cexObj.cex,
      'accountName': cexObj.cexSubaccount,
      'marginRatio': marginRatio,
      'initalCEXCollateral' : cexObj.initialCEXCollateral,
      'collateralFromOrders' : collateralFromOrders,
      'cexNAV':cexNAV,
      'markPrice':markPrice,
    }
  }

  let finalInitalCEXCollateral = 0; let finalCollateralFromOrders = 0; let finalCexNAV = 0
  for (let cexResult in trancheObj){
    finalInitalCEXCollateral += Number(trancheObj[cexResult].initalCEXCollateral);
    finalCollateralFromOrders += Number(trancheObj[cexResult].collateralFromOrders);
    finalCexNAV += Number(trancheObj[cexResult].cexNAV);
  }

  trancheObj.final = {
    'initalCEXCollateral' : finalInitalCEXCollateral,
    'collateralFromOrders' : finalCollateralFromOrders,
    'cexNAV':finalCexNAV,
  }
  return trancheObj;
}


module.exports = {
  getV4Monitoring,
};
