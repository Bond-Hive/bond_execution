'use strict';

const ccxtSyncroCreateOrder = function(
    cex,
    exchangeName,
    symbol,
    type,
    side,
    amount,
    price,
    clientId,
    stopPrice = undefined,
) {
  try {
    let param;
    if	(exchangeName == 'binance' || exchangeName == 'binanceusdm') {
      if (stopPrice) {
        param = {
          'stopPrice': stopPrice,
          'clientOrderId': clientId,
        };
      } else {
        param = {
          'clientOrderId': clientId,
        };
      }
    }
    cex.createOrder(symbol, type, side, amount, price, param);
    return true;
  } catch (e) {
    console.log(e.constructor.name, e.message);
  }
};

const ccxtSyncroCancelOrder = function(cex, pair, orderID) {
  try {
    cex.cancelOrder(orderID, pair);
    return true; // Cancel an order
  } catch (e) {
    console.log(e.constructor.name, e.message);
  }
};

const ccxtSyncroEditOrder = function(
    cex,
    exchangeName,
    orderID,
    symbol,
    type,
    side,
    amount,
    price,
    clientId,
    stopPrice = undefined,
) {
  try {
    let param;
    if	(exchangeName == 'binance' || exchangeName == 'binanceusdm') {
      if (stopPrice) {
        param = {
          'stopPrice': stopPrice,
          'clientOrderId': clientId,
        };
      } else {
        param = {
          'clientOrderId': clientId,
        };
      }
    }
    cex.editOrder(orderID, symbol, type, side, amount, price, param);
    return true;
  } catch (e) {
    console.log(e.constructor.name, e.message);
  }
};

module.exports = {
  ccxtSyncroCancelOrder,
  ccxtSyncroCreateOrder,
  ccxtSyncroEditOrder,
};
