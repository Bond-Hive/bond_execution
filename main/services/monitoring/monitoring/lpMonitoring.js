'use strict';
const { getCexInfo, Orders, OrdersV2, getSlippageForSingleCex, getSlippageForDoubleCex } = require('./libraries/ccxtFunctions.js');
const { getValue, percentual, getUniV3UnclaimedFees, getAmountsForLiquidityWithoutGraph } = require('./libraries/mainFunctions.js');
const { getPositionInfo, getHourlyPairInfo } = require('./queries/uniswapQueries.js');
const { getV2PairInfoWeb3, getV3PairInfoWeb3, getArbGMXPool, getJLPToken } = require('./queries/web3Queries.js');
const { getWebSocketPriceMonitorUniversal } = require('./initialState/webSocketPriceMonitorUniversal.js');
const civfund = require('@civfund/fund-libraries');
let feesCache = {};
let globalWebSockets = {};

function clearCache() {
  feesCache = {}; // This resets the cache object
}

// Schedule cache clearing every 30 minutes
// 1800000 milliseconds = 30 minutes
setInterval(clearCache, 1800000);

///////////////////////// LP Monitoring /////////////////////////
const getLpMonitoring = async function (strategy) {
  let resultObj = {};

  // Get the LP values
  switch (strategy.lpType) {
    case ("v2"):
      resultObj.lp = await getV2Lp(strategy);
      break;
    case ("v3"):
      resultObj.lp = await getV3Lp(strategy);
      break;
    default:
      console.error("LP version does not exist");
  }

  // Assigning the final values of LP from each LP
  const {
    initialValue: lpInitialValue,
    totalShares: totalShares,
    initialVPS: initialVPS,
    token0Price: token0DexPrice,
    token1Price: token1DexPrice,
    token0splittedBalance: lpToken0Qty,
    token1splittedBalance: lpToken1Qty,
    LpTokenValue: totalLpTokenValue,
    unclaimedFees: unclaimedFees,
    totalFeeToken0: totalFeeToken0,
    totalFeeToken1: totalFeeToken1,
    // hourlyVolume: hourlyVolume,
    // hourStartUnix: hourStartUnix,
    // reserveUSD: reserveUSD
  } = JSON.parse(JSON.stringify(resultObj.lp.final));

  // Assinging values for use in CEX calculation for computing w/o noise values
  strategy.dexPriceToken0 = JSON.parse(JSON.stringify(token0DexPrice));
  strategy.dexPriceToken1 = JSON.parse(JSON.stringify(token1DexPrice));

  // Get hedge value from CEX's for each tranche
  resultObj.hedge = await getHedgeValue(strategy);
  const {
    initialHedgeCollateral: initialHedgeCollateral,
    hedgeCollateralFromOrders: hedgeCollateralChange,
    hedgeCollateralFromOrdersWNoise: hedgeCollateralChangeWONoise,
    hedgeSetupCost: hedgeSetupCost,
    cexNAV: cexNAV,
    cexNAVWNoiseAdjustment: cexNAVWNoiseAdjustment,
    openPositionToken0: openPositionToken0,
    openPositionToken1: openPositionToken1,
    token0CexPrice: token0CexPrice,
    token1CexPrice: token1CexPrice,
    token0PriceAdjustment: token0PriceAdjustment,
    token1PriceAdjustment: token1PriceAdjustment,
    sumOfSellOrderQuantityFeeHedgeToken0: sumOfSellOrderQuantityFeeHedgeToken0,
    sumOfSellOrderQuantityFeeHedgeToken1: sumOfSellOrderQuantityFeeHedgeToken1,
    fundingFee: fundingFee,
    latestFundingFeeRate: latestFundingFeeRate,
    fundingFeeRate: fundingFeeRate,
    sumOfOrderValueFeeHedge: sumOfOrderValueFeeHedge,
    PVGammaHedge: PVGammaHedge,
    PVDeltaHedge: PVDeltaHedge,
    sumOfExecutionFees: sumOfExecutionFees,
    sumOfTpOrderProfit: sumOfTpOrderProfit,
    sumOfSlippage: sumOfSlippage,
    sumOfMisses: sumOfMisses,
  } = JSON.parse(JSON.stringify(resultObj.hedge.final));

  // Time Calculations
  const timeDiff = (new Date()).getTime() - (new Date(strategy.openingDate)).getTime();
  const daysDiff = timeDiff / (1000 * 3600 * 24);
  // Main Calculations
  const hedgeCollateralValue = initialHedgeCollateral - hedgeCollateralChange + hedgeSetupCost;
  const hedgedV3UnclaimedFees = -sumOfOrderValueFeeHedge + token0CexPrice * (totalFeeToken0 / token0PriceAdjustment - sumOfSellOrderQuantityFeeHedgeToken0) + token1CexPrice * (totalFeeToken1 / token1PriceAdjustment - sumOfSellOrderQuantityFeeHedgeToken1);
  const totalValue = hedgeCollateralValue + totalLpTokenValue + hedgedV3UnclaimedFees; //unclaimed value for v2 LP by default is zero. The fees is covered in LP value
  const NAV = cexNAV + totalLpTokenValue;
  const NAVWoNoise = cexNAV - cexNAVWNoiseAdjustment + totalLpTokenValue;
  const totalInitialValue = initialHedgeCollateral + lpInitialValue;
  const totalPercentChange = +  percentual(totalInitialValue, totalValue);
  const totalNAVChange = percentual(totalInitialValue, NAV);
  const totalNAVChangeWoNoise = percentual(totalInitialValue, NAVWoNoise);
  const totalNAVChangeWoNoiseCAGR = parseFloat(((((1 + (totalNAVChangeWoNoise / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]);

  const CAGR = parseFloat(((((1 + (totalPercentChange / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]);
  const totalPNL = totalValue - totalInitialValue;
  const outOfRange = (lpToken0Qty === 0 || lpToken1Qty === 0) ? true : false;
  const feesAPR = (unclaimedFees / parseFloat(lpInitialValue)) / daysDiff * 365 * 100;

  // Without Noise Calculations
  const hedgeCollateralValueWONoise = Number(initialHedgeCollateral) - Number(hedgeCollateralChangeWONoise) + Number(hedgeSetupCost);
  const totalValueWONoise = hedgeCollateralValueWONoise + totalLpTokenValue + hedgedV3UnclaimedFees;
  const totalPercentChangeWNoise = percentual(totalInitialValue, totalValueWONoise);
  let totalPNLWNoise, CAGRWNoise;
  if (strategy.lpChainId == "sol"){
    totalPNLWNoise = totalPNL;
    CAGRWNoise = parseFloat(((((1 + (totalPercentChange / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]);
  } else {
    totalPNLWNoise = totalValueWONoise - totalInitialValue;
    CAGRWNoise = parseFloat(((((1 + (totalPercentChangeWNoise / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]);
  };
  const calculatedNAVWoNoise = totalValue + fundingFee - cexNAVWNoiseAdjustment;
  const totalcalculatedNAVChangeWoNoise = percentual(totalInitialValue, calculatedNAVWoNoise);
  const totalcalculatedNAVChangeWoNoiseCAGR = parseFloat(((((1 + (totalcalculatedNAVChangeWoNoise / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]);
  const presentCalculatedVPS = calculatedNAVWoNoise / totalShares // Need to check
  const totalCalculatedUnitChangeWoNoise = percentual(initialVPS, presentCalculatedVPS); // Add
  const totalCalculatedUnitChangeWoNoiseCAGR = parseFloat(((((1 + (totalCalculatedUnitChangeWoNoise / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]); //Add

  const presentVPS = calculatedNAVWoNoise / totalShares
  const totalUnitChangeWoNoise = percentual(initialVPS, presentVPS); // Add
  const totalUnitChangeWoNoiseCAGR = parseFloat(((((1 + (totalUnitChangeWoNoise / 100)) ** (365 / daysDiff) - 1) * 100).toString()).split('e+')[0]); //Add

  // Delta in tokens of LP vs Hedge Calculation
  let deltaToken0; let deltaToken0Percent; let deltaToken1; let deltaToken1Percent;
  if (strategy.lpToken0symbol === 'USDT' || strategy.lpToken0symbol === 'USDC' || strategy.lpToken0symbol === 'DAI') {
    deltaToken0 = 0;
    deltaToken0Percent = 0;
  } else {
    deltaToken0 = (-1 * lpToken0Qty) + openPositionToken0
    deltaToken0Percent = deltaToken0 / lpToken0Qty * 100;
  }

  if (strategy.lpToken1symbol === 'USDT' || strategy.lpToken1symbol === 'USDC' || strategy.lpToken1symbol === 'DAI') {
    deltaToken1 = 0;
    deltaToken1Percent = 0;
  } else {
    deltaToken1 = (-1 * lpToken1Qty) + openPositionToken1;
    deltaToken1Percent = deltaToken1 / lpToken1Qty * 100;
  }

  // Checking the denomination for the strategy
  let denominationValue;
  if (strategy.denomination === 'USDT' || strategy.denomination === 'USDC' || strategy.denomination === 'DAI') {
    denominationValue = 1;
  } else if (strategy.denomination === 'token0') {
    denominationValue = token0DexPrice;
  } else if (strategy.denomination === 'token1') {
    denominationValue = token1DexPrice;
  } else {
    return "Denomination is not defined"
  }

  resultObj.final = {
    'strategyName': strategy.name,
    'lpPool': strategy.lpSymbol,
    'type': strategy.type,
    'subType': strategy.subType,
    'reportingDenomination': strategy.denomination,
    'openingDate': strategy.openingDate,
    'profitW/ONoise': totalPNLWNoise / denominationValue,
    'CAGRW/ONoise': CAGRWNoise,
    'totalPercentChangeW/ONoise': totalPercentChangeWNoise,
    'profit': totalPNL / denominationValue,
    'CAGR': CAGR,
    'totalPercentChange': totalPercentChange,
    'totalInitialValue': totalInitialValue / denominationValue,
    'totalValue': totalValue / denominationValue,
    'NAV': NAV / denominationValue,
    'NAVWNoise': NAVWoNoise / denominationValue,
    'totalNAVChange': totalNAVChange,
    'totalNAVChangeWoNoise': totalNAVChangeWoNoise,
    'totalNAVChangeWoNoiseCAGR': totalNAVChangeWoNoiseCAGR,
    'UniV3UnclaimedFees': unclaimedFees / denominationValue,
    'hedgedV3UnclaimedFees': hedgedV3UnclaimedFees / denominationValue,
    'feeToken0': totalFeeToken0 / denominationValue,
    'feeToken1': totalFeeToken1 / denominationValue,
    'feesAPR': feesAPR,
    'lpInitialValue': lpInitialValue / denominationValue,
    'totalLpTokenValue': totalLpTokenValue / denominationValue,
    'initialHedgeCollateral': initialHedgeCollateral / denominationValue, // 
    'hedgeCollateralValue': hedgeCollateralValue / denominationValue,
    'hedgeCollateralValueWONoise': hedgeCollateralValueWONoise / denominationValue,
    'lpTokenValueChange': (totalLpTokenValue - lpInitialValue) / denominationValue,
    'hedgeCollateralChange': -hedgeCollateralChange / denominationValue,
    'hedgeCollateralChangeWONoise': -hedgeCollateralChangeWONoise / denominationValue,
    'cexToken0Qty': openPositionToken0,
    'lpToken0Qty': lpToken0Qty,
    'deltaToken0': deltaToken0,
    'deltaToken0Percent': deltaToken0Percent,
    'cexToken1Qty': openPositionToken1,
    'lpToken1Qty': lpToken1Qty,
    'deltaToken1': deltaToken1,
    'deltaToken1Percent': deltaToken1Percent,
    'token0DexPrice': token0DexPrice,
    'token1DexPrice': token1DexPrice,
    'token0CexPrice': token0CexPrice,
    'token1CexPrice': token1CexPrice,
    'showStrat': strategy.showStrat,
    'outOfRange': outOfRange,
    'token0PriceDecimals': strategy.token0PriceDecimals,
    'token1PriceDecimals': strategy.token1PriceDecimals,
    'token0QuantityDecimals': strategy.token0QuantityDecimals,
    'token1QuantityDecimals': strategy.token1QuantityDecimals,
    'calculatedNAVWoNoise': calculatedNAVWoNoise / denominationValue,
    'totalcalculatedNAVChangeWoNoiseCAGR': totalcalculatedNAVChangeWoNoiseCAGR,
    'initialVPS': initialVPS,
    'presentVPS': presentVPS,
    'totalUnitChangeWoNoise': totalUnitChangeWoNoise,
    'totalUnitChangeWoNoiseCAGR': totalUnitChangeWoNoiseCAGR,
    'totalCalculatedUnitChangeWoNoise': totalCalculatedUnitChangeWoNoise,
    'totalCalculatedUnitChangeWoNoiseCAGR': totalCalculatedUnitChangeWoNoiseCAGR,
    'totalShares': totalShares,
    'PVGammaHedge': PVGammaHedge,
    'ExpectedGammaHedge': Math.abs((Number(totalLpTokenValue) - Number(lpInitialValue)) + Number(PVDeltaHedge)),
    'PVDeltaHedge': PVDeltaHedge,
    'sumOfExecutionFees': -sumOfExecutionFees,
    'sumOfTpOrderProfit': sumOfTpOrderProfit,
    'sumOfSlippage': sumOfSlippage,
    'sumOfMisses': sumOfMisses,
    'fundingFee': fundingFee,
    'fundingFeeRate': fundingFeeRate,
    'latestFundingFeeRate': latestFundingFeeRate,

    // 'hourlyVolume': hourlyVolume,
    // 'hourStartUnix': hourStartUnix,
    // 'reserveUSD': reserveUSD
  }
  return resultObj.final;
}

////////////////////////// GET V2 LP //////////////////////////

const getV2Lp = async function (strategy) {
  let V2LpObj = {};
  let pairInfo
  if (strategy.lpChainId == 1) {
    pairInfo = await getV2PairInfoWeb3(
      strategy.lpAddress,
      strategy.token0decimals,
      strategy.token1decimals,
      strategy.lpTokendecimals
    );
  } else if (strategy.lpChainId == "arb") {
    pairInfo = await getArbGMXPool(
      strategy.lpAddress,
      strategy.dataStoreAddress,
      strategy.lpToken0symbol,
      strategy.token0decimals,
      strategy.token0PriceDecimals,
      strategy.token1decimals,
      strategy.token1PriceDecimals,
      strategy.lpTokendecimals,
    );
  } else if (strategy.lpChainId == "sol") {
    pairInfo = await getJLPToken(
      strategy.lpAddress,
      strategy.dataStoreAddress,
      strategy.lpToken0symbol,
      strategy.token0decimals,
      strategy.token0PriceDecimals,
      strategy.token1decimals,
      strategy.token1PriceDecimals,
      strategy.lpTokendecimals,
    );
  }

  let token0Price, token1Price;
  if (strategy.lpToken0symbol === 'USDT' || strategy.lpToken0symbol === 'USDC' || strategy.lpToken0symbol === 'DAI') {
    token0Price = 1;
    token1Price = pairInfo.token1Price;
  } else if (strategy.lpToken1symbol === 'USDT' || strategy.lpToken1symbol === 'USDC' || strategy.lpToken1symbol === 'DAI') {
    token0Price = pairInfo.token0Price;
    token1Price = 1;
  } else {
    token0Price = await getFromBinance(strategy, "token0");
    token1Price = await getFromBinance(strategy, "token1");
  }
  let totalInitialBalance = 0; let totalTokenBalance = 0; let totalShares = 0; let initialVPS = 1;
  for (let tranche in strategy.tranches) {
    const currentTranche = strategy.tranches[tranche];
    totalInitialBalance += Number(currentTranche.initialLPValue);
    totalTokenBalance += Number(currentTranche.tokenBalance);
    totalShares += currentTranche.shares ? Number(currentTranche.shares) : Number(currentTranche.initialLPValue);
    initialVPS = currentTranche.initialVPS ? Number(currentTranche.initialVPS) : 1;
  }
  const poolShare = totalTokenBalance / pairInfo.totalSupply;
  const token0balance = poolShare * pairInfo.reserve0;
  const token1balance = poolShare * pairInfo.reserve1;
  let tokenValue

  if (strategy.lpChainId == 1) {
    tokenValue = (token0balance * token0Price) + (token1balance * token1Price);
  } else if (strategy.lpChainId == "arb" || strategy.lpChainId == "sol") {
    tokenValue = totalTokenBalance * pairInfo.priceOfToken;
  }

  V2LpObj.final = {
    'initialValue': totalInitialBalance,
    'totalShares': totalShares,
    'initialVPS': initialVPS,
    'token0Price': token0Price,
    'token1Price': token1Price,
    'token0splittedBalance': token0balance,
    'token1splittedBalance': token1balance,
    'LpTokenValue': tokenValue,
    'totalTokenBalance': totalTokenBalance,
    'unclaimedFees': 0,
    'totalFeeToken0': 0,
    'totalFeeToken1': 0,
    // 'hourlyVolume': hourlyVolume,
    // 'hourStartUnix': hourStartUnix,
    // 'reserveUSD': reserveUSD
  }
  return V2LpObj;
}

////////////////////////// GET V3 LP //////////////////////////

const getV3Lp = async function (strategy) {
  let V3LpObj = {};
  for (let tranche in strategy.tranches) {
    let trancheName = 'tranche' + [tranche];
    V3LpObj[trancheName] = await getV3LpTranche(strategy.tranches[tranche], strategy);
  }
  let totalInitialBalance = 0; let totalToken0balance = 0; let totalToken1balance = 0; let totalTokenLpValue = 0; let totalUnclaimedFees = 0; let totalFeeToken0 = 0; let totalFeeToken1 = 0;
  for (let trancheResult in V3LpObj) {
    totalInitialBalance += Number(V3LpObj[trancheResult].initialValue);
    totalToken0balance += Number(V3LpObj[trancheResult].token0Balance);
    totalToken1balance += Number(V3LpObj[trancheResult].token1Balance);
    totalTokenLpValue += Number(V3LpObj[trancheResult].totalValue);
    totalUnclaimedFees += Number(V3LpObj[trancheResult].adjustedFees);
    totalFeeToken0 += Number(V3LpObj[trancheResult].feesToken0);
    totalFeeToken1 += Number(V3LpObj[trancheResult].feesToken1);
  }
  V3LpObj.final = {
    'address': strategy.lpAddress,
    'token0address': strategy.lpToken0address,
    'token1address': strategy.lpToken1address,
    'initialValue': totalInitialBalance,
    'chainId': strategy.lpChainId,
    'token0Price': V3LpObj[Object.keys(V3LpObj)[0]].token0Price,
    'token1Price': V3LpObj[Object.keys(V3LpObj)[0]].token1Price,
    'token0splittedBalance': totalToken0balance,
    'token1splittedBalance': totalToken1balance,
    'LpTokenValue': totalTokenLpValue,
    'unclaimedFees': totalUnclaimedFees,
    'totalFeeToken0': totalFeeToken0,
    'totalFeeToken1': totalFeeToken1,
    'hourlyVolume': 0,
    'hourStartUnix': 0,
    'reserveUSD': 0,
    'totalTokenBalance': 'NA in v3'
  }
  return V3LpObj;
}

////////////////////////// Utils //////////////////////////

const getV3LpTranche = async function (tranche, strategy) {
  const {
    positionId: positionId,
    initialLPValue: initialValue,
    feesToken0OffSet: feesToken0OffSet,
    feesToken1OffSet: feesToken1OffSet,
  } = tranche;

  const {
    lpChainId: chainId,
    lpToken0address: token0address,
    lpToken1address: token1address,
  } = strategy;

  let tickTarget;
  let tick;
  let token0contractName = strategy.lpToken0symbol;
  let token1contractName = strategy.lpToken1symbol;
  let token0PriceV3;
  let token1PriceV3;
  let feeGrowthGlobal0X128;
  let feeGrowthGlobal1X128;
  let ticksLowerResults;
  let ticksUpperResults;
  let feeGrowthInside0LastX128;
  let feeGrowthInside1LastX128;
  let liquidity;
  if (strategy.fetchMethod === 'Infura') {
    tickTarget = await getV3PairInfoWeb3(chainId, positionId, strategy.lpAddress, strategy.lpToken0address, strategy.lpToken1address, Number(tranche.tickLower), Number(tranche.tickUpper));
    tick = tickTarget.tick;
    feeGrowthGlobal0X128 = tickTarget.feeGrowthGlobal0X128;
    feeGrowthGlobal1X128 = tickTarget.feeGrowthGlobal1X128;
    ticksLowerResults = tickTarget.ticksLowerResults;
    ticksUpperResults = tickTarget.ticksUpperResults;
    feeGrowthInside0LastX128 = tickTarget.feeGrowthInside0LastX128;
    feeGrowthInside1LastX128 = tickTarget.feeGrowthInside1LastX128;
    liquidity = tickTarget.liquidity;
  } else {
    tickTarget = await getPositionInfo(chainId, positionId);
    tick = Number(tickTarget.pool.tick);
    feeGrowthGlobal0X128 = Number(tickTarget.pool.feeGrowthGlobal0X128);
    feeGrowthGlobal1X128 = Number(tickTarget.pool.feeGrowthGlobal1X128);
    ticksLowerResults = tickTarget.tickLower;
    ticksUpperResults = tickTarget.tickUpper;
    feeGrowthInside0LastX128 = Number(tickTarget.feeGrowthInside0LastX128);
    feeGrowthInside1LastX128 = Number(tickTarget.feeGrowthInside1LastX128);
    liquidity = Number(tickTarget.liquidity);
  }

  // try {
  //   ([token0PriceV3, token1PriceV3] = await Promise.all([
  //     getValue(token0address, '1'),
  //     getValue(token1address, '1')
  //   ]));
  // } catch(error){
  // console.error("An error occurred: ", error);

  // }

  if (token0contractName === 'USDT' || token0contractName === 'USDC' || token0contractName === 'DAI') {
    token0PriceV3 = 1;
    token1PriceV3 = await getFromBinance(strategy, "token1");
  } else if (token1contractName === 'USDT' || token1contractName === 'USDC' || token1contractName === 'DAI') {
    token0PriceV3 = await getFromBinance(strategy, "token0");
    token1PriceV3 = 1;
  } else {
    token0PriceV3 = await getFromBinance(strategy, "token0");
    token1PriceV3 = await getFromBinance(strategy, "token1");
  }

  let uniV3UnclaimedFees
  // Construct a unique cache key for the current calculation, depending on the unique variables
  const cacheKey = `${positionId}-${tranche.tickLower}-${tranche.tickUpper}-${tranche.feesCalcMethod}`;

  if (feesCache[cacheKey]) {
    console.log('Using cached result for uniV3UnclaimedFees')
    uniV3UnclaimedFees = JSON.parse(JSON.stringify(feesCache[cacheKey])); // Return cached result if available
  } else {
    if (tranche.feesCalcMethod === "webScrape") {
      console.log('Using webScrape for uniV3UnclaimedFees');
      let dbName = "CIV-Fund";
      let collectionName = "monitoring_fees";
      const lastStoredData = await civfund.dbMongoose.findOne(dbName, collectionName, "fees", "v3");
      uniV3UnclaimedFees = lastStoredData[positionId];
    } else {
      console.log('Using Infura for uniV3UnclaimedFees')
      uniV3UnclaimedFees = await getUniV3UnclaimedFees(
        tick,
        Number(tranche.tickLower),
        Number(tranche.tickUpper),
        ticksLowerResults,
        ticksUpperResults,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        liquidity,
        strategy.token0decimals,
        strategy.token1decimals,
        feeGrowthGlobal0X128,
        feeGrowthGlobal1X128
      );
    };
    // Cache the new data
    feesCache[cacheKey] = JSON.parse(JSON.stringify(uniV3UnclaimedFees));
  }


  let result = uniV3UnclaimedFeesParse(uniV3UnclaimedFees.fees0Token, uniV3UnclaimedFees.fees1Token, feesToken0OffSet, feesToken1OffSet);
  let { fees0Token, fees1Token } = result;
  const {
    amountA: token0Balance,
    amountB: token1Balance
  } = await getAmountsForLiquidityWithoutGraph(Number(tranche.tickLower), Number(tranche.tickUpper), Number(tranche.lpLiquidity), strategy.token0decimals, strategy.token1decimals, true, tick);

  const token0value = token0Balance * token0PriceV3;
  const token1value = token1Balance * token1PriceV3;
  const totalValue = token0value + token1value;
  let finalFees;
  if (token0contractName == 'USDT' || token0contractName == 'USDC' || token0contractName == 'DAI') {
    finalFees = Number(fees0Token) + Number(fees1Token) * token1PriceV3;
  } else if (token1contractName == 'USDT' || token1contractName == 'USDC' || token1contractName == 'DAI') {
    finalFees = Number(fees0Token) * token0PriceV3 + Number(fees1Token);
  } else {
    finalFees = Number(fees0Token) * token0PriceV3 + Number(fees1Token) * token1PriceV3;
  }

  return {
    'positionId': tranche.positionId,
    'openingDateV3': tranche.openingDate,
    'initialValue': initialValue,
    'feesToken0OffSet': tranche.feesToken0OffSet,
    'feesToken1OffSet': tranche.feesToken1OffSet,
    'tickLower': tranche.tickLower,
    'tickUpper': tranche.tickUpper,
    'liquidity': liquidity,
    'token0Balance': token0Balance,
    'token1Balance': token1Balance,
    'totalValue': totalValue,
    'adjustedFees': finalFees,
    'feesToken0': fees0Token,
    'feesToken1': fees1Token,
    'token0Price': token0PriceV3,
    'token1Price': token1PriceV3
  }
}

async function getFromBinance(strategy, token) {
  // Loop through each tranche in the strategy
  for (let trancheId in strategy.tranches) {
    let tranche = strategy.tranches[trancheId];

    // Loop through each cex in the tranche
    for (let cexId in tranche.cex) {
      let cexObj = tranche.cex[cexId];

      // Check if the cex hedgeToken matches the requested token
      if (cexObj.hedgeToken === token) {
        // Fetch the cex info
        let apiKey = cexObj.apiKey ? cexObj.apiKey : 'None';
        let secret = cexObj.secret ? cexObj.secret : 'None';
        let password = cexObj.password ? cexObj.password : 'None';

        // Return the markPrice from the fetched cex info
        let markPrice = (await getPriceMonitor(cexObj.cexSymbol, cexObj.cex)).getPrice();
        markPrice = (cexObj.dexPriceAdjustment) ? markPrice / cexObj.dexPriceAdjustment : markPrice; // This is in case, the hedge is multiple of original token. Example, 1000SHIB on binance is 1000x of shib, so this adjustment is relavent
        markPrice = cexObj.cexSymbol == "ARB/USDT" ? getWebSocketPriceMonitorUniversal().arbusdt.getPrice() : markPrice;

        return markPrice;
      }
    }
  }

  // Throw an error if no matching cex was found for the requested token
  throw new Error(`No matching cex found for token: ${token}`);
}

function parseTokenAmount(amount) {
  let multiplier = 1;

  // Convert amount to string if it is not already
  let amountStr = amount.toString();

  // Check for the 'M' suffix and multiply by 1,000,000 if it's there
  if (amountStr.endsWith('M')) {
    multiplier = 1000000;
    amountStr = amountStr.slice(0, -1); // Remove the 'M'
  }

  // Remove the '<' symbol if it's there
  if (amountStr.startsWith('<')) {
    amountStr = amountStr.slice(1);
  }

  // Remove any commas and convert to a number
  const amountNumber = parseFloat(amountStr.replace(/,/g, '')) * multiplier;

  return amountNumber;
}

function uniV3UnclaimedFeesParse(rawFees0Token, rawFees1Token, feesToken0OffSet, feesToken1OffSet) {
  const fees0Token = parseTokenAmount(rawFees0Token);
  const fees1Token = parseTokenAmount(rawFees1Token);

  const adjustedFees0Token = fees0Token - feesToken0OffSet;
  const adjustedFees1Token = fees1Token - feesToken1OffSet;

  return { fees0Token: adjustedFees0Token, fees1Token: adjustedFees1Token }
}


const getHedgeValue = async function (strategy) {
  let hedgeObj = {};
  for (let tranche in strategy.tranches) {
    let trancheName = 'tranche' + tranche;
    if (strategy.tranches[tranche].type == "deploy") {
      hedgeObj[trancheName] = await getHedgeTrancheDeploy(strategy.tranches[tranche], strategy);
    } else if (strategy.tranches[tranche].type == "rebalance") {
      hedgeObj[trancheName] = getHedgeTrancheRebalance(strategy.tranches[tranche]);
    }
  }
  let initialHedgeCollateral = 0; let hedgeCollateralFromOrders = 0; let hedgeCollateralFromOrdersWNoise = 0; let hedgeSetupCost = 0; let cexNAV = 0; let cexNAVWNoiseAdjustment = 0; let openPositionToken0 = 0; let openPositionToken1 = 0; let fundingFee = 0; let fundingFeeRate = 0; let latestFundingFeeRate = 0; let sumOfOrderValueFeeHedge = 0; let sumOfExecutionFees = 0; let sumOfTpOrderProfit = 0; let sumOfSlippage = 0; let sumOfMisses = 0;
  for (let trancheResult in hedgeObj) {
    let finalObj = hedgeObj[trancheResult].final;
    initialHedgeCollateral += Number(finalObj.initalCEXCollateral);
    hedgeCollateralFromOrders += Number(finalObj.collateralFromOrders);
    hedgeCollateralFromOrdersWNoise += Number(finalObj.collateralFromOrdersWNoise);
    hedgeSetupCost += Number(finalObj.setupCost);
    cexNAV += Number(finalObj.cexNAV);
    fundingFee += Number(finalObj.fundingFee);
    fundingFeeRate += Number(finalObj.fundingFeeRate);
    latestFundingFeeRate += Number(finalObj.latestFundingFeeRate);
    cexNAVWNoiseAdjustment += Number(finalObj.cexNAVWNoiseAdjustment);
    openPositionToken0 += Number(finalObj.openPositionToken0);
    openPositionToken1 += Number(finalObj.openPositionToken1);
    sumOfOrderValueFeeHedge += Number(finalObj.sumOfOrderValueFeeHedge);
    sumOfExecutionFees += Number(finalObj.sumOfExecutionFees);
    sumOfTpOrderProfit += Number(finalObj.sumOfTpOrderProfit);
    sumOfSlippage += Number(finalObj.sumOfSlippage);
    sumOfMisses += Number(finalObj.sumOfMisses);
  }

  hedgeObj.final = {
    'initialHedgeCollateral': initialHedgeCollateral,
    'hedgeCollateralFromOrders': hedgeCollateralFromOrders,
    'hedgeCollateralFromOrdersWNoise': hedgeCollateralFromOrdersWNoise,
    'hedgeSetupCost': hedgeSetupCost,
    'cexNAV': cexNAV,
    'fundingFee': fundingFee,
    'fundingFeeRate': fundingFeeRate,
    'latestFundingFeeRate': latestFundingFeeRate,
    'cexNAVWNoiseAdjustment': cexNAVWNoiseAdjustment,
    'openPositionToken0': openPositionToken0,
    'openPositionToken1': openPositionToken1,
    'token0CexPrice': hedgeObj[Object.keys(hedgeObj)[0]].final.token0CexPrice,
    'token1CexPrice': hedgeObj[Object.keys(hedgeObj)[0]].final.token1CexPrice,
    'token0PriceAdjustment': hedgeObj[Object.keys(hedgeObj)[0]].final.token0PriceAdjustment,
    'token1PriceAdjustment': hedgeObj[Object.keys(hedgeObj)[0]].final.token1PriceAdjustment,
    'sumOfSellOrderQuantityFeeHedgeToken0': hedgeObj[Object.keys(hedgeObj)[0]].final.sumOfSellOrderQuantityFeeHedgeToken0,
    'sumOfSellOrderQuantityFeeHedgeToken1': hedgeObj[Object.keys(hedgeObj)[0]].final.sumOfSellOrderQuantityFeeHedgeToken1,
    'sumOfOrderValueFeeHedge': sumOfOrderValueFeeHedge,
    'PVGammaHedge': hedgeObj[Object.keys(hedgeObj)[0]].final.PVGammaHedge,
    'PVDeltaHedge': hedgeObj[Object.keys(hedgeObj)[0]].final.PVDeltaHedge,
    'sumOfExecutionFees': sumOfExecutionFees,
    'sumOfTpOrderProfit': sumOfTpOrderProfit,
    'sumOfSlippage': sumOfSlippage,
    'sumOfMisses': sumOfMisses,
  }
  return hedgeObj;
}

const getHedgeTrancheRebalance = function (tranche) {
  let trancheObj = {};

  for (let cex in tranche.cex) {
    let cexObj = tranche.cex[cex];
    let cexName = 'cex' + cex;
    trancheObj[cexName] = {
      'CEX': cexObj.cex,
      'accountName': cexObj.cexSubaccount,
      'initalCEXCollateral': cexObj.initialCEXCollateral,
      'setupCost': cexObj.setupCost,
    }
  }
  let finalInitalCEXCollateral = 0; let finalCollateralFromOrders = 0; let finalCollateralFromOrdersWNoise = 0; let finalSetupCost = 0; let finalCexNAV = 0; let finalCexNAVWNoiseAdjustment = 0; let finalOpenPositionToken0 = 0; let finalOpenPositionToken1 = 0; let fundingFee = 0; let fundingFeeRate = 0; let latestFundingFeeRate = 0;
  for (let cexResult in trancheObj) {
    finalInitalCEXCollateral += Number(trancheObj[cexResult].initalCEXCollateral);
    finalSetupCost += Number(trancheObj[cexResult].setupCost);
  }
  trancheObj.final = {
    'initalCEXCollateral': finalInitalCEXCollateral,
    'collateralFromOrders': finalCollateralFromOrders,
    'collateralFromOrdersWNoise': finalCollateralFromOrdersWNoise,
    'setupCost': finalSetupCost,
    'cexNAV': finalCexNAV,
    'fundingFee': fundingFee,
    'fundingFeeRate': fundingFeeRate,
    'latestFundingFeeRate': latestFundingFeeRate,
    'cexNAVWNoiseAdjustment': finalCexNAVWNoiseAdjustment,
    'openPositionToken0': finalOpenPositionToken0,
    'openPositionToken1': finalOpenPositionToken1
  }
  return trancheObj;
}

const getHedgeTrancheDeploy = async function (tranche, strategy) {
  let trancheObj = {};

  for (let cex in tranche.cex) {
    let cexObj = tranche.cex[cex];
    let apiKey = cexObj.apiKey ? cexObj.apiKey : 'None';
    let secret = cexObj.secret ? cexObj.secret : 'None';
    let password = cexObj.password ? cexObj.password : 'None';
    let gammaHedge = (cexObj.deployType === "gammaHedge") ? true : false;
    let dexPrice = (cexObj.hedgeToken === "token0") ? strategy.dexPriceToken0 : strategy.dexPriceToken1;
    dexPrice = (cexObj.dexPriceAdjustment) ? dexPrice * cexObj.dexPriceAdjustment : dexPrice; // This is in case, the hedge is multiple of original token. Example, 1000SHIB on binance is 1000x of shib, so this adjustment is relavent
    let orderNameStratControl = (cexObj.orderNameStratControl) ? cexObj.orderNameStratControl : false;
    let stratOrderPrefix = (cexObj.orderNameStratControl) ? cexObj.stratOrderPrefix : false;
    let openPosition;
    
    const cexNAV = 0;
    let markPrice = (await getPriceMonitor(cexObj.cexSymbol, cexObj.cex)).getPrice();
    markPrice = cexObj.cexSymbol == "ARB/USDT" ? getWebSocketPriceMonitorUniversal().arbusdt.getPrice() : markPrice;

    let sumOfOrder;
    let sumOfSellOrderQuantity;
    let sumOfOrderValueFeeHedge = 0;
    let sumOfSellOrderQuantityFeeHedge = 0;
    let priceAdjustment = 1;
    let PVGammaHedge = 0;
    let PVDeltaHedge = 0;
    let sumOfExecutionFees = 0;
    let sumOfTpOrderProfit = 0;
    let sumOfSlippage = 0;
    let sumOfMisses = 0;

    if (!cexObj.calculationType) {
      let {
        sumOfOrderValue,
        sumOfSellOrderQuantity: localSumOfSellOrderQuantity
      } = await Orders(removeSlash(cexObj.cexSymbol), cexObj.tillDate, cexObj.cexSubaccount, cexObj.cex, cexObj.exchangeFees, apiKey, secret, password, stratOrderPrefix, orderNameStratControl);
      sumOfOrder = sumOfOrderValue + Number(cexObj.sumOfOrders);
      sumOfSellOrderQuantity = localSumOfSellOrderQuantity + Number(cexObj.sumOfSellOrderQuantity);
    } else if (cexObj.calculationType == "new") {
      let {
        sumOfOrderValue,
        sumOfSellOrderQuantity: localSumOfSellOrderQuantity,
        sumOfOrderValueFeeHedge: localSumOfOrderValueFeeHedge,
        sumOfSellOrderQuantityFeeHedge: localSumOfSellOrderQuantityFeeHedge,
        sumOfExecutionFees: localSumOfExecutionFees,
        sumOfTpOrderProfit: localSumOfTpOrderProfit,
        sumOfMisses: localSumOfMisses
      } = await OrdersV2(cexObj.cexSymbol, cexObj.tillDate, cexObj.cexSubaccount, cexObj.cex, stratOrderPrefix, orderNameStratControl, strategy.lpType, cexObj);
      sumOfOrder = sumOfOrderValue;
      sumOfSellOrderQuantity = localSumOfSellOrderQuantity;
      sumOfExecutionFees = localSumOfExecutionFees;
      sumOfTpOrderProfit = localSumOfTpOrderProfit;
      sumOfMisses = localSumOfMisses;
      if (!(strategy.lpType == 'v3')) {
        sumOfOrderValueFeeHedge = 0;
        sumOfSellOrderQuantityFeeHedge = 0;
      } else {
        sumOfOrderValueFeeHedge = localSumOfOrderValueFeeHedge;
        sumOfSellOrderQuantityFeeHedge = localSumOfSellOrderQuantityFeeHedge;
      }
    }

    // hedge data
    let collateralFromOrders = JSON.parse(JSON.stringify(sumOfOrder)); let collateralFromOrdersWNoise = JSON.parse(JSON.stringify(sumOfOrder));

    if (gammaHedge) { // To add back delta difference
      openPosition = parseFloat(cexObj.initialQuantity) + parseFloat(sumOfSellOrderQuantity);
      collateralFromOrders += parseFloat(cexObj.initialQuantity) * (markPrice - parseFloat(cexObj.initialPrice));
      collateralFromOrdersWNoise += parseFloat(cexObj.initialQuantity) * (dexPrice - parseFloat(cexObj.initialPrice));
      collateralFromOrders += parseFloat(sumOfSellOrderQuantity) * markPrice;
      collateralFromOrdersWNoise += parseFloat(sumOfSellOrderQuantity) * dexPrice;
    }

    PVGammaHedge = -(JSON.parse(JSON.stringify(sumOfOrder)) + parseFloat(sumOfSellOrderQuantity) * dexPrice);
    PVDeltaHedge = -(parseFloat(cexObj.initialQuantity) * (dexPrice - parseFloat(cexObj.initialPrice)));

    let adjustedOpenPosition = JSON.parse(JSON.stringify(openPosition));
    if (cexObj.dexPriceAdjustment) { // This is in case, the hedge is multiple of original token. Example, 1000SHIB on binance is 1000x of shib, so this adjustment is relavent
      openPosition *= cexObj.dexPriceAdjustment;
      adjustedOpenPosition = JSON.parse(JSON.stringify(openPosition / cexObj.dexPriceAdjustment));
      priceAdjustment = cexObj.dexPriceAdjustment;
    }

    let cexNAVWNoiseAdjustment = adjustedOpenPosition * (dexPrice - markPrice);

    let fundingFee = await getLatestFundingFeeInfo(cexObj.cex, (cexObj.cexSubaccount).toLowerCase(), cexObj.cexSymbol, cexObj.stratOrderPrefix) || 0;
    let fundingFeeRate = await getNetFundingFeeRate(cexObj.cexSymbol, cexObj.stratOrderPrefix) || 0;


    let latestFundingFeeRate = await getLatestFundingFeeRate(cexObj.cex, cexObj.cexSymbol) || 0;

    let cexName = 'cex' + cex;
    trancheObj[cexName] = {
      'CEX': cexObj.cex,
      'accountName': cexObj.cexSubaccount,
      'pair': cexObj.cexSymbol,
      'version': cexObj.stratOrderPrefix,
      'fundingFee': fundingFee,
      'fundingFeeRate': fundingFeeRate,
      'latestFundingFeeRate': latestFundingFeeRate,
      // 'marginRatio': marginRatio,
      'deployType': cexObj.deployType,
      'initalCEXCollateral': cexObj.initialCEXCollateral,
      'collateralFromOrders': collateralFromOrders,
      'collateralFromOrdersWNoise': collateralFromOrdersWNoise,
      'openPosition': openPosition,
      'setupCost': cexObj.setupCost,
      'cexNAV': cexNAV,
      'cexNAVWNoiseAdjustment': cexNAVWNoiseAdjustment,
      'hedgeToken': cexObj.hedgeToken,
      'markPrice': markPrice,
      'sumOfOrderValueFeeHedge': sumOfOrderValueFeeHedge,
      'sumOfSellOrderQuantityFeeHedge': sumOfSellOrderQuantityFeeHedge,
      'priceAdjustment': priceAdjustment,
      'PVGammaHedge': PVGammaHedge,
      'PVDeltaHedge': PVDeltaHedge,
      'sumOfExecutionFees': sumOfExecutionFees,
      'sumOfTpOrderProfit': sumOfTpOrderProfit,
      'sumOfMisses': sumOfMisses,
    }
  }

  // check if two objects or one
  // if one, then get all trades --> for each level, fix a price for b and s --> calculate $ value of slippage to that level
  // if two, then get all trades --> for each level, fix a price for b and s by comparing the levels for each --> calculate $ value of slippage to that level

  let cexKeys = Object.keys(tranche.cex);
  let numberOfObjects = cexKeys.length;
  let sumOfSlippage;

  // if (numberOfObjects === 1 && !(strategy.lpChainId == "arb")) {
  //   sumOfSlippage = await getSlippageForSingleCex(tranche.cex[cexKeys[0]]); // Pass the CEX object to the function
  // } else if (numberOfObjects === 2 && !(strategy.lpChainId == "arb")) {
  //   // Passing both CEX objects as separate parameters
  //   sumOfSlippage = await getSlippageForDoubleCex(tranche.cex[cexKeys[0]], tranche.cex[cexKeys[1]]);
  // } else {
    // console.log("Monitoring doesn't support more than 2 CEX objects for slippage calculation");
    // console.error("Monitoring doesn't support more than 2 CEX objects for slippage calculation");
  // }


  let finalInitalCEXCollateral = 0, finalCollateralFromOrders = 0, finalCollateralFromOrdersWNoise = 0, finalSetupCost = 0, finalCexNAV = 0, finalCexNAVWNoiseAdjustment = 0, finalOpenPositionToken0 = 0, finalOpenPositionToken1 = 0, token0CexPrice = 1, token1CexPrice = 1, finalFundingFee = 0, finalFundingFeeRate = 0, latestFundingFeeRate = 0, finalSumOfOrderValueFeeHedge = 0, finalPVGammaHedge = 0, finalPVDeltaHedge = 0, finalSumOfExecutionFees = 0, finalSumOfTpOrderProfit = 0, finalSumOfMisses = 0, sumOfSellOrderQuantityFeeHedgeToken0 = 0, sumOfSellOrderQuantityFeeHedgeToken1 = 0, token0PriceAdjustment = 1, token1PriceAdjustment = 1;
  const processedCombos = new Set();
  let finalCexNAVCount = 0; let cexNumber = 0;
  const processedFundingFeeCombos = new Set();
  for (let cexResult in trancheObj) {
    const combo = `${trancheObj[cexResult].CEX}-${trancheObj[cexResult].accountName}`;
    const comboFundingFee = `${trancheObj[cexResult].CEX}-${trancheObj[cexResult].accountName}-${trancheObj[cexResult].pair}-${trancheObj[cexResult].version}`;
    finalInitalCEXCollateral += Number(trancheObj[cexResult].initalCEXCollateral);
    finalCollateralFromOrders += Number(trancheObj[cexResult].collateralFromOrders);
    finalCollateralFromOrdersWNoise += Number(trancheObj[cexResult].collateralFromOrdersWNoise);
    finalSetupCost += Number(trancheObj[cexResult].setupCost);
    finalCexNAVWNoiseAdjustment += Number(trancheObj[cexResult].cexNAVWNoiseAdjustment);
    finalPVGammaHedge += Number(trancheObj[cexResult].PVGammaHedge);
    finalPVDeltaHedge += Number(trancheObj[cexResult].PVDeltaHedge);
    finalSumOfExecutionFees += Number(trancheObj[cexResult].sumOfExecutionFees);
    finalSumOfTpOrderProfit += Number(trancheObj[cexResult].sumOfTpOrderProfit);
    finalSumOfMisses += Number(trancheObj[cexResult].sumOfMisses);

    // if (!processedCombos.has(combo)) {
    //   processedCombos.add(combo);
    finalCexNAV += Number(trancheObj[cexResult].cexNAV);
    finalSumOfOrderValueFeeHedge += Number(trancheObj[cexResult].sumOfOrderValueFeeHedge);
    finalCexNAVCount++;
    cexNumber++;
    // }
    if (!processedFundingFeeCombos.has(comboFundingFee)) {
      processedFundingFeeCombos.add(comboFundingFee);
      finalFundingFee += Number(trancheObj[cexResult].fundingFee);
      finalFundingFeeRate += Number(trancheObj[cexResult].fundingFeeRate);
      latestFundingFeeRate += Number(trancheObj[cexResult].latestFundingFeeRate);
    }
    if (trancheObj[cexResult].hedgeToken == 'token0') {
      finalOpenPositionToken0 += Number(trancheObj[cexResult].openPosition);
      token0CexPrice = trancheObj[cexResult].markPrice;
      token0PriceAdjustment = trancheObj[cexResult].priceAdjustment;
      sumOfSellOrderQuantityFeeHedgeToken0 = trancheObj[cexResult].sumOfSellOrderQuantityFeeHedge;
    } else {
      finalOpenPositionToken1 += Number(trancheObj[cexResult].openPosition);
      token1CexPrice = trancheObj[cexResult].markPrice;
      token1PriceAdjustment = trancheObj[cexResult].priceAdjustment;
      sumOfSellOrderQuantityFeeHedgeToken1 = trancheObj[cexResult].sumOfSellOrderQuantityFeeHedge;
    }
  }
  finalCexNAV = finalCexNAV / finalCexNAVCount;

  trancheObj.final = {
    'initalCEXCollateral': finalInitalCEXCollateral,
    'collateralFromOrders': finalCollateralFromOrders,
    'collateralFromOrdersWNoise': finalCollateralFromOrdersWNoise,
    'setupCost': finalSetupCost,
    'cexNAV': finalCexNAV,
    'fundingFee': finalFundingFee,
    'fundingFeeRate': (finalFundingFeeRate / cexNumber) * 0.7,
    'latestFundingFeeRate': (latestFundingFeeRate / cexNumber),
    'sumOfOrderValueFeeHedge': finalSumOfOrderValueFeeHedge,
    'sumOfSellOrderQuantityFeeHedgeToken0': sumOfSellOrderQuantityFeeHedgeToken0,
    'sumOfSellOrderQuantityFeeHedgeToken1': sumOfSellOrderQuantityFeeHedgeToken1,
    'cexNAVWNoiseAdjustment': finalCexNAVWNoiseAdjustment,
    'openPositionToken0': finalOpenPositionToken0,
    'openPositionToken1': finalOpenPositionToken1,
    'token0CexPrice': token0CexPrice,
    'token1CexPrice': token1CexPrice,
    'token0PriceAdjustment': token0PriceAdjustment,
    'token1PriceAdjustment': token1PriceAdjustment,
    'PVGammaHedge': finalPVGammaHedge,
    'PVDeltaHedge': finalPVDeltaHedge,
    'sumOfExecutionFees': finalSumOfExecutionFees,
    'sumOfTpOrderProfit': finalSumOfTpOrderProfit,
    'sumOfSlippage': sumOfSlippage,
    'sumOfMisses': finalSumOfMisses,

  }
  return trancheObj;
}

const getLatestFundingFeeInfo = async function (exchange, subaccount, symbol, version) {
  let dbName = exchange + "-FundingFees";
  let collectionName = "fundingFee_collection";

  try {
    // Perform the MongoDB query
    const result = await civfund.dbMongoose.findOne(
      dbName,
      collectionName,
      "account",
      subaccount.toLowerCase() + symbol
    );

    // Check if the result and the necessary fields exist
    if (result && result.strategies && result.strategies[version] && typeof result.strategies[version].sumOfFundingFee !== 'undefined') {
      return result.strategies[version].sumOfFundingFee;
    } else {
      // If the result is null or fields are missing, return 0
      return 0;
    }
  } catch (error) {
    // If there is an error (e.g., database connection issue), return 0
    return 0;
  }
};


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

const getLatestFundingFeeRate = async function (exchange, symbol) {
  let dbName = "CIV_FundingFees";
  let lastFundingQuery = {
    symbol: removeSlash(symbol),
  };

  try {
    // Perform the MongoDB query
    const result = await civfund.dbMongoose.findAllQuery(
      dbName,
      exchange,
      lastFundingQuery
    );

    result.sort((a, b) => b.fundingTime - a.fundingTime);
    let lastFundingRate = result[0];

    // Check if the result and the necessary fields exist
    if (result) {
      return (lastFundingRate.fundingRate) * 3 * 365 * 100;
    } else {
      // If the result is null or fields are missing, return 0
      return 0;
    }
  } catch (error) {
    // If there is an error (e.g., database connection issue), return 0
    return 0;
  }
};
// getLatestFundingFeeRate('binanceusdm','test',"ETH/USDT");

function removeSlash(inputString) {
  return inputString.replace(/\//g, '');
}

async function getPriceMonitor(symbol, exchange) {
  // Check if a PriceMonitor object already exists for this pair
  if (!globalWebSockets[symbol]) {
    globalWebSockets[symbol] = new civfund.PriceMonitor('last', symbol, null, exchange, null, null, null, false);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Pause for 3 seconds
  }

  return globalWebSockets[symbol];
}

module.exports = {
  getLpMonitoring,
  getV2Lp
};