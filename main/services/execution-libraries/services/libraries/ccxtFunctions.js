'use strict';
const bcrypt = require('bcrypt');
const db = require('./mongoDB.js');
require('../config/configEnv.js');

/* PASSWORD AUTHENTICATION */

const createPasswordHash = function(inputPassword) {
    const saltRounds = 10;
  
    // Use callback function with bcrypt.genSalt()
    bcrypt.genSalt(saltRounds, (err, salt) => {
      if (err) {
        throw new Error('Invalid password');
      }
  
      console.log(`The salt is ${salt}`); // use salt to hash password
  
      // Use callback function with bcrypt.hash()
      bcrypt.hash(inputPassword, salt, (err, hash) => {
        if (err) {
          throw new Error('Invalid password');
        }
  
        console.log(`The hash for password [${inputPassword}] is ${hash} now please store this on DB or ENV variable`);
      });
    });
  
    return 'check your logs';
};
  

const checkPassword = async function(inputPassword) {
  return (bcrypt.compare(inputPassword, process.env.CCXT_HASH));
};

/* ATOMIC VIEW functions, unsecured */

const ccxtBalance = async function(cex) {
  return await cex.fetchBalance();
};

const ccxtMarket = async function(cex, marketInfo) {
  await cex.loadMarkets();
  return await cex.markets[marketInfo];
};

const ccxtOrderbook = async function(cex, symbol) {
  return await cex.fetchOrderBook(symbol);
};

const ccxtFetchDeposit = async function(cex) {
  return await cex.fetchDeposits(); // check if deposit has been received
};

const ccxtFetchTransfer = async function(cex, asset) {
  return await cex.fetchTransfers(asset); // check transfer status
};

const ccxtFetchOrders = async function(cex, pair) {
  return await cex.fetchOrders(pair); // fetch all orders with status
};

const ccxtFetchIdOrder = async function(cex, symbol, orderID) {
  return await cex.fetchOrder(orderID, symbol); // fetch order by id
};

const ccxtFetchOpenOrders = async function(cex, pair) {
  return await cex.fetchOpenOrders(pair); // fetch all open orders with status
};

const ccxtFetchCurrentPrice = async function(cex, exchangeName, pair) {
  const result = await cex.fetchTrades(pair); // fetch recent trades
  const market = result[result.length-1]; // fetch the last trade
  let currentPrice;
  if (exchangeName == 'binance' || exchangeName == 'binanceusdm') {
    currentPrice = market['info']['p'];
  } else if (exchangeName == 'ftx') {
    currentPrice = market['info']['price'];
  }
  return currentPrice;
};

const ccxtFetchMyOrders = async function(cex, pair, sinceDate) {
  const date = Date.parse(sinceDate);
  return await cex.fetchMyTrades(pair, date, undefined, undefined); // provides the history of settled trades
};

const ccxtFetchOrderIdFromOpenOrders = async function(currentObjWithOrders, cex, pair) {
  const result = await cex.fetchOpenOrders(pair); // provides the history of settled trades
  for (let i = 0; i < result.length; i++) {
    if	(currentObjWithOrders[result[i].clientOrderId]) {
      currentObjWithOrders[result[i].clientOrderId].id = result[i].id;
    }
  }
  return currentObjWithOrders;
};

const ccxtSumOfOrders = async function(cex, pair, sinceDate, setupCost = null) {
  let sumOfOrders = 0;

  const result = await cex.fetchMyTrades(pair, sinceDate, undefined, undefined);
  for (const trade of result) {
    const cost = parseFloat(trade['cost']);
    if (trade['side'] === 'buy') {
      sumOfOrders += cost;
    } else if (trade['side'] === 'sell') {
      sumOfOrders -= cost;
    }
    if (setupCost === null)
      // Default value is binance
      sumOfOrders += Math.abs(cost * 0.0004);
    else
    sumOfOrders += Math.abs(cost * setupCost);
  }

  return sumOfOrders;
};

const ccxtFetchDepositAddress = async function(cex, asset) {
  console.log(asset);
  return await cex.fetchDepositAddress(asset); // Fetch Deposit Address
};

const ccxtPositions = async function(cex, asset) {
  const pair =[];
  pair[0] = asset;
  return await cex.fetchPositions(pair); // helpful information for margin maintainance
};

const ccxtPosition = async function(cex, asset) {
  let res = [];
  let array = [];
  array.push(asset)
  res[0] = await cex.fetchPositions(array);
  return res[0]; // helpful information for margin maintainance
};

const DeltaHedgeArrayOfLevels = async function(startPrice, startQuantity, upperLimitOfOrders, gridSizePercentage) { // Outputs an object of Price Levels and Quantity used for intial setup in Delta Hedging
  // Notes:
  // 1. Parameters:
  // 		a. startPrice - price of token at time of setup
  // 		b. startQunatity - qunatity of the token in the position, this is usually half of the total LP position
  // 		c. upperLimitOfOrders - no of grid levels required on the upside, on the downside, it generates from the begining
  // 		d. gridSizePercentage - percentage distance of grid from each other
  // 2. By default, the percentagePosition is 1 for buyOrders and -1 for sellOrders. This can be changed using changeDeltaHedgePercentagePosition or changeDeltaHedgeBulkPercentagePosition function
  const orders ={};
  const gridSizePercentageMod = gridSizePercentage/100;
  const presentGrid = Math.floor(Math.abs(startPrice)/(startPrice*gridSizePercentageMod));
  // For creating grid from start to startPrice
  for (let i=1; i<presentGrid; i++) {
    const price = parseFloat(parseFloat(startPrice) - parseFloat((presentGrid-i)*startPrice*gridSizePercentageMod)).toFixed(6);
    const price_lower = parseFloat(parseFloat(startPrice) - parseFloat((presentGrid-i+1)*startPrice*gridSizePercentageMod)).toFixed(6);
    const quantity = parseFloat((Math.sqrt(startPrice/price_lower)-Math.sqrt(startPrice/price))*startQuantity).toFixed(9);
    const grid = parseFloat(i+1);
    const percentagePosition = 0;
    orders[parseFloat(i+1)] = {price, quantity, percentagePosition, grid};
  }
  // For creating grid upwards from startPrice to defined upperLimitOfOrders
  for (let i=1; i<=upperLimitOfOrders; i++) {
    const price = parseFloat((presentGrid+i)*startPrice*gridSizePercentageMod).toFixed(6);
    const price_lower = parseFloat((presentGrid+i-1)*startPrice*gridSizePercentageMod).toFixed(6);
    const quantity = parseFloat((Math.sqrt(startPrice/price_lower)-Math.sqrt(startPrice/price))*startQuantity).toFixed(9);
    const grid = parseFloat(presentGrid+i);
    const percentagePosition = -1;
    orders[parseFloat(presentGrid+i)] = {price, quantity, percentagePosition, grid};
  }
  console.log(`Created main list of Grid Levels`);
  return orders;
};

const createDatabase = async function(startPrice, startQuantity, upperLimitOfOrders, gridSizePercentage, database) {
  const orders ={};
  orders['name'] = 'MasterList';
  const gridSizePercentageMod = gridSizePercentage/100;
  const presentGrid = Math.floor(Math.abs(startPrice)/(startPrice*gridSizePercentageMod));
  // For creating grid from start to startPrice
  for (let i=1; i<presentGrid; i++) {
    const price = parseFloat(parseFloat(startPrice) - parseFloat((presentGrid-i)*startPrice*gridSizePercentageMod)).toFixed(6);
    const price_lower = parseFloat(parseFloat(startPrice) - parseFloat((presentGrid-i+1)*startPrice*gridSizePercentageMod)).toFixed(6);
    const quantity = parseFloat((Math.sqrt(startPrice/price_lower)-Math.sqrt(startPrice/price))*startQuantity).toFixed(9);
    const grid = parseFloat(i+1);
    const percentagePosition = 0.0;
    orders[parseFloat(i+1)] = {price, quantity, percentagePosition, grid};
  }
  // For creating grid upwards from startPrice to defined upperLimitOfOrders
  for (let i=1; i<=upperLimitOfOrders; i++) {
    const price = parseFloat((presentGrid+i)*startPrice*gridSizePercentageMod).toFixed(6);
    const price_lower = parseFloat((presentGrid+i-1)*startPrice*gridSizePercentageMod).toFixed(6);
    const quantity = parseFloat((Math.sqrt(startPrice/price_lower)-Math.sqrt(startPrice/price))*startQuantity).toFixed(9);
    const grid = parseFloat(presentGrid+i);
    const percentagePosition = -1.0;
    orders[parseFloat(presentGrid+i)] = {price, quantity, percentagePosition, grid};
  }
  console.log(`Created main list of Grid Levels`);
  const collectionName = startPrice+'_'+startQuantity+'_'+gridSizePercentage+'%';
  return await db.getDBInsertOne(database, collectionName, orders);
};

const createDatabaseProfit = async function(startPrice, startQuantity, upperLimitOfOrders, gridSizePercentage, profitGridPercentage, database) {
  const orders ={};
  orders['name'] = 'MasterList';
  const gridSizePercentageMod = gridSizePercentage/100;
  const profitGridPercentageMod = profitGridPercentage/100;
  const presentGrid = Math.floor(Math.abs(startPrice)/(startPrice*gridSizePercentageMod));
  // For creating grid from start to startPrice
  for (let i=1; i<presentGrid; i++) {
    const price = parseFloat(parseFloat(startPrice) - parseFloat((presentGrid-i)*startPrice*gridSizePercentageMod)).toFixed(6);
    const buyPrice = price*(1-profitGridPercentageMod);
    const sellPrice = price*(1+profitGridPercentageMod);
    const price_lower = parseFloat(parseFloat(startPrice) - parseFloat((presentGrid-i+1)*startPrice*gridSizePercentageMod)).toFixed(6);
    const quantity = parseFloat((Math.sqrt(startPrice/price_lower)-Math.sqrt(startPrice/price))*startQuantity).toFixed(9);
    const grid = parseFloat(i+1);
    const percentagePosition = 0.0;
    orders[parseFloat(i+1)] = {price, buyPrice, sellPrice, quantity, percentagePosition, grid};
  }
  // For creating grid upwards from startPrice to defined upperLimitOfOrders
  for (let i=1; i<=upperLimitOfOrders; i++) {
    const price = parseFloat((presentGrid+i)*startPrice*gridSizePercentageMod).toFixed(6);
    const buyPrice = price*(1-profitGridPercentage);
    const sellPrice = price*(1+profitGridPercentage);
    const price_lower = parseFloat((presentGrid+i-1)*startPrice*gridSizePercentageMod).toFixed(6);
    const quantity = parseFloat((Math.sqrt(startPrice/price_lower)-Math.sqrt(startPrice/price))*startQuantity).toFixed(9);
    const grid = parseFloat(presentGrid+i);
    const percentagePosition = -1.0;
    orders[parseFloat(presentGrid+i)] = {price, buyPrice, sellPrice, quantity, percentagePosition, grid};
  }
  console.log(`Created main list of Grid Levels`);
  const collectionName = startPrice+'_'+startQuantity+'_'+gridSizePercentage+'%'+'_'+profitGridPercentage+'%';
  return await db.getDBInsertOne(database, collectionName, orders);
};

const createDatabaseV3 = async function(startLeftPrice, startRightPrice, startLeftQuantity, startRightQuantity, leftLowerPrice, leftUpperPrice, gridSizePercentage, hedgeTokenPosition, database) {
  const orders ={};

  if	(hedgeTokenPosition == 'right') {
    orders['name'] = 'MasterList';
    const sqrtA = (leftLowerPrice) ** (1/2);
    const sqrtB = (leftUpperPrice) ** (1/2);
    const sqrtC = (startLeftPrice) ** (1/2);
    const liquidity = startLeftQuantity*sqrtC*sqrtB/parseFloat(parseFloat(sqrtB) - parseFloat(sqrtC));
    const gridSizePercentageMod = gridSizePercentage/100;
    const presentGrid = Math.floor(Math.abs(startRightPrice)/(startRightPrice*gridSizePercentageMod));
    const lowerGrid = parseFloat(Math.floor(Math.abs(1/leftUpperPrice)/(startRightPrice*gridSizePercentageMod)));
    const upperGrid = Math.floor(Math.abs(1/leftLowerPrice)/(startRightPrice*gridSizePercentageMod));

    for (let i=1; i<=upperGrid+30; i++) {
      const price = parseFloat(i*startRightPrice*gridSizePercentageMod).toFixed(6);
      const sqrtPriceLeft = (1/price) ** (1/2);
      const price_lower = parseFloat((i-1)*startRightPrice*gridSizePercentageMod).toFixed(6);
      const sqrtPriceLeft_upper = (1/price_lower) ** (1/2);
      let quantity;
      if ((i<lowerGrid) || (i>=upperGrid)) {
        quantity = 0;
      } else {
        quantity = -(parseFloat(liquidity*(sqrtPriceLeft - sqrtA)) - parseFloat(liquidity*(sqrtPriceLeft_upper - sqrtA)));
      }
      const grid = parseFloat(i+1);
      let percentagePosition;
      if (i<presentGrid) {
        percentagePosition = 0;
      } else {
        percentagePosition = -1;
      }
      orders[parseFloat(i+1)] = {price, quantity, percentagePosition, grid};
    }

    const collectionName = startRightPrice+'_'+startRightQuantity+'_'+gridSizePercentage+'%';
    return await db.getDBInsertOne(database, collectionName, orders);
  }
};

/* ATOMIC EXECUTION functions, secured */

const ccxtCreateOrder = async function(
    cex,
    symbol,
    type,
    side,
    amount,
    price,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    const order = await cex.createOrder(symbol, type, side, amount, price);
    return order;
  } else {
    return 'failed authentication!';
  }
};

const ccxtCreateOrderWithNomenclature = async function(
    cex,
    exchangeName,
    symbol,
    type,
    side,
    amount,
    price,
    clientId,
    inputPassword,
) {
  let param;
  if	(exchangeName == 'binance' || exchangeName == 'binanceusdm' || exchangeName == 'binancecoinm' ) {
    param = {
      'clientOrderId': clientId,
    };
  } else if (exchangeName == 'ftx') {
    param = {
      'orderId': clientId,
    };
  }
  return await cex.createOrder(symbol, type, side, amount, price, param);
};

const ccxtCreateLimitOrder = async function(
    cex,
    exchangeName,
    symbol,
    type,
    side,
    amount,
    price,
    stopPrice,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    let param;
    if	(exchangeName == 'binance' || exchangeName == 'binanceusdm') {
      param = {
        'stopPrice': stopPrice,
      };
    } else if (exchangeName == 'ftx') {
      param = {
        'triggerPrice': stopPrice,
      };
    }
    const order = await cex.createOrder(symbol, type, side, amount, price, param);
    return order;
  } else {
    return 'failed authentication!';
  }
};

const ccxtCreateStopOrderWithNomenclature = async function(
    cex,
    exchangeName,
    symbol,
    type,
    side,
    amount,
    price,
    stopPrice,
    clientId,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    let param;
    if	(exchangeName == 'binance' || exchangeName == 'binanceusdm') {
      param = {
        'stopPrice': stopPrice,
        'clientOrderId': clientId,
      };
    } else if (exchangeName == 'ftx') {
      param = {
        'triggerPrice': stopPrice,
        'orderId': clientId,
      };
    }
    return await cex.createOrder(symbol, type, side, amount, price, param);
  } else {
    return 'failed authentication!';
  }
};

const ccxtEditStopOrder = async function(
    cex,
    exchangeName,
    orderID,
    symbol,
    type,
    side,
    amount,
    price,
    stopPrice,
    clientId,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    let param;
    if	(exchangeName == 'binance' || exchangeName == 'binanceusdm') {
      param = {
        'stopPrice': stopPrice,
        'clientOrderId': clientId
      };
    } else if (exchangeName == 'ftx') {
      param = {
        'triggerPrice': stopPrice,
        'clientOrderId': clientId
      };
    }
    return await cex.editOrder(orderID, symbol, type, side, amount, price, param);
  } else {
    return 'failed authentication!';
  }
};

const ccxtCreateLimitBuyOrder = async function(cex, symbol, amount, price, inputPassword) {
  if (await checkPassword(inputPassword)) {
    return await cex.createLimitBuyOrder(symbol, amount, price);
  } else {
    return 'failed authentication!';
  }
};

const ccxtAddMargin = async function(cex, symbol, amount, inputPassword) {
  if (await checkPassword(inputPassword)) {
    const margin = await cex.addMargin(symbol, amount, {});
    console.log('margin=', margin);
    return margin;
  } else {
    return 'failed authentication!';
  }
};

const ccxtTransfer = async function(
    cex,
    asset,
    amount,
    fromAccount,
    toAccount,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    return await cex.transfer(asset, amount, fromAccount, toAccount); // transfer money internally, across Spot and Futures wallets
  } else {
    return 'failed authentication!';
  }
};

const ccxtSetLeverage = async function(cex, pair, leverage, inputPassword) {
  if (await checkPassword(inputPassword)) {
    return await cex.setLeverage(leverage, pair); // set the futures leverage globally, default "2" (2x levered)
  } else {
    return 'failed authentication!';
  }
};

const ccxtCancelOrder = async function(cex, pair, orderID, inputPassword) {
  if (await checkPassword(inputPassword)) {
    return await cex.cancelOrder(orderID, pair); // Cancel an order
  } else {
    return 'failed authentication!';
  }
};

const ccxtWithdraw = async function(
    cex,
    asset,
    amount,
    address,
    network,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    return await cex.withdraw(asset, amount, address, network); // withdraw funds
  } else {
    return 'failed authentication!';
  }
};

/* HIGHER LEVEL functions, all secured  */

// TO DO: the token to be hedged (of the two) should ideally be an input
// TO DO: instead of calling "getEthUsdt" abstract away the two token names/pair address <--- Done

/* const DeployAsset = async function(cex, LPAsset, swapPrice, deployLPFund, deployCollateralFund, inputPassword) {
  	if (await checkPassword(inputPassword)) {
		/*const transferInitialCollateralAsset = await transferCollateralAsset(cex,deployCollateralFund,collateralAsset);
		const checkSwap = await mockSwap(LPAsset,swapPrice,deployFund/2);
		const checkLPPoolDeploy = await mockLPPoolDeploy(LPPool,deployFund);
		return transferInitialCollateralAsset, checkSwap, checkLPPoolDeploy

		return 'please connect me to an autotask'
	} else {
		return "failed authentication!"
	}
};*/

const reBalanceCollateral = async function(
    cex,
    LPAsset,
    pairToHedge,
    collateralAsset,
    reBalanceSwapPrice,
    rebalancePercent,
    rebalanceLPTokenSellPercent,
    inputPassword,
) {
  if (await checkPassword(inputPassword)) {
    const positionData = await ccxtPosition(cex, pairToHedge);
    const percentPosition = positionData['percentage'];

    if (percentPosition < (-rebalancePercent) ) {
      /*    	const checkLPSell = await mockSellLPToken(rebalanceLPTokenSellPercent);
			const checkSwap = await mockSwap(LPAsset, reBalanceSwapPrice, checkLPSell/2);
			const newCollateralFund = await mockWalletBalance();
			const checkCollateralTransfer = await transferCollateralAsset (cex, newCollateralFund, collateralAsset, inputPassword)
	*/
      return 'Re-balancing done';
    }
    return 'Re-balancing not required';
  } else {
    return 'failed authentication!';
  }
};

/* const transferCollateralAsset = async function (cex, deployCollateralFund, collateralAsset, inputPassword) {
  	if (await checkPassword(inputPassword)) {
		const addressData = await ccxtFetchDepositForAddress(cex, collateralAsset);
		const address = addressData['address'];
		const network = addressData['network'];
	//  const transferData = await mockTransfer(collateralAsset, deployCollateralFund, address, network);
	//  return transferData['mockID'];
	  // For testing using actual binance account, paste any recent Tx id, | const transferID = '0xa0a4a9d0eb5f4b82c13d5e272ec0b9a1799986d122ff05686ef6f9612b5a4070';
		return 'nothing done for now'
	} else {
		return "failed authentication!"
	}
}*/

const transferCollateralAssetCheck = async function(cex, pairToHedge, collateralAsset, transferID, leverage, inputPassword) {
  if (await checkPassword(inputPassword)) {
    const depositData = await ccxtFetchDeposit(cex, collateralAsset, leverage);
    for (let i = 0; i < depositData.length; i++) {
      if (depositData[i]['info']['txId'] == transferID) {
        const postFeeCollateralFund = depositData[i]['info']['amount'];
        const transferData = await ccxtTransfer(cex, collateralAsset, postFeeCollateralFund, 'spot', 'future', inputPassword);
        // For testing, add/remove 4649 | const transferData = await ccxtTransfer(cex, collateralAsset, postFeeCollateralFund - 4649, 'spot', 'future', inputPassword);
        await ccxtSetLeverage(cex, pairToHedge, leverage, inputPassword, inputPassword);

        // Checking if transfer went through
        const internalTransferID = transferData['id'];
        const fetchTransferData = await ccxtFetchTransfer(cex, collateralAsset);
        for (let i = 0; i < fetchTransferData.length; i++) {
          if (fetchTransferData[i]['id'] == internalTransferID) {
            if (fetchTransferData[i]['info']['status'] == 'CONFIRMED') {
              return 'deposit received for ' + collateralAsset + postFeeCollateralFund + ', transfered to futures wallet and leverage set to ' + leverage;
            }
          }
        } return 'deposit received for ' + collateralAsset + postFeeCollateralFund + ' but transfer to future wallet failed';
      }
    } return 'no deposit received';
  } else {
    return 'failed authentication!';
  }
};

module.exports = {
  ccxtBalance,
  ccxtMarket,
  ccxtOrderbook,
  ccxtCreateOrder,
  ccxtAddMargin,
  ccxtFetchDeposit,
  ccxtTransfer,
  ccxtFetchTransfer,
  ccxtFetchOrders,
  ccxtFetchIdOrder,
  ccxtSetLeverage,
  ccxtCancelOrder,
  ccxtWithdraw,
  ccxtPosition,
  ccxtPositions,
  ccxtFetchDepositAddress,
  ccxtCreateLimitBuyOrder,
  transferCollateralAssetCheck,
  reBalanceCollateral,
  createPasswordHash,
  checkPassword,
  ccxtFetchMyOrders,
  ccxtSumOfOrders,
  ccxtCreateLimitOrder,
  ccxtFetchCurrentPrice,
  ccxtCreateStopOrderWithNomenclature,
  ccxtFetchOpenOrders,
  DeltaHedgeArrayOfLevels,
  createDatabase,
  createDatabaseProfit,
  createDatabaseV3,
  ccxtEditStopOrder,
  ccxtCreateOrderWithNomenclature,
  ccxtFetchOrderIdFromOpenOrders,
};