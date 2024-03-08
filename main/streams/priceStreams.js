'use strict';
const { PriceMonitor } = require('@civfund/fund-libraries');
let btcusdt = new PriceMonitor('last','BTC/USDT',null,'binance',null,null,null,false);
let arbusdt = new PriceMonitor('last','ARB/USDT',null,'binanceusdm',null,null,null,false);
let btcusdtusdm = new PriceMonitor('last','BTC/USDT',null,'binanceusdm',null,null,null,false);
let BTC240329 = new PriceMonitor('last','BTC/USDT_240329',null,'binanceusdm',null,null,null,true);

// BTC240329.on('price', (data) => {
//   console.log(data)
// })

module.exports = {
  btcusdt,
  arbusdt,
  BTC240329,
  btcusdtusdm
};
