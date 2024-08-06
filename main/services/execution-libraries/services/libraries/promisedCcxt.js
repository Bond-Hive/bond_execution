'use strict';

const latencyCorrection = 500; //ms

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ccxtPromisedCreateOrder = async function (
  cex,
  symbol,
  type,
  side,
  amount,
  price = undefined,
  clientId = undefined,
  stopPrice = undefined,
  recvWindow = 1000
) {
  try {
    let resObject;
    let param = {
      'recvWindow': recvWindow
    };
    if (clientId) {
      param['clientOrderId'] = clientId;
      if (stopPrice) {
        param['stopPrice'] = stopPrice;
      }
    }
    resObject = await cex.createOrder(symbol, type, side, amount, price, param);
    await sleep(recvWindow + latencyCorrection);
    return resObject;
  } catch (error) {
    await sleep(recvWindow + latencyCorrection);
    throw error;
  }
};

const ccxtPromisedCancelOrder = async function (cex, pair, orderID) {
  const resObject = await cex.cancelOrder(orderID, pair);
  return resObject; // Cancel an order
};

const ccxtPromisedEditOrder = async function (
  cex,
  orderID,
  symbol,
  type,
  side,
  amount,
  price = undefined,
  clientId = undefined,
  stopPrice = undefined,
) {
  let resObject;
  if (clientId) {
    let param = null;
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
    resObject = await cex.editOrder(orderID, symbol, type, side, amount, price, param);
  } else if (price && !clientId && !stopPrice) {
    resObject = await cex.editOrder(orderID, symbol, type, side, amount, price);
  } else {
    resObject = await cex.editOrder(orderID, symbol, type, side, amount);
  }
  return resObject;
};

module.exports = {
  ccxtPromisedCreateOrder,
  ccxtPromisedCancelOrder,
  ccxtPromisedEditOrder,
};
