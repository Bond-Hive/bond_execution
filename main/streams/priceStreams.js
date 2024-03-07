'use strict';
const { PriceMonitor } = require('@civfund/fund-libraries');
let btcusdt = new PriceMonitor('last','BTC/USDT',null,'binance',null,null,null,false);
let arbusdt = new PriceMonitor('last','ARB/USDT',null,'binanceusdm',null,null,null,false);

module.exports = {
  btcusdt,
  arbusdt
};
