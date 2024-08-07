'use strict';
const { PriceMonitor } = require('../services/execution-libraries/index');
let btcusdt = new PriceMonitor('last','BTC/USDT',null,'binance',null,null,null,false);
let ethusdt = new PriceMonitor('last','ETH/USDT',null,'binanceusdm',null,null,null,false);

module.exports = {
  btcusdt,
  ethusdt,
};
