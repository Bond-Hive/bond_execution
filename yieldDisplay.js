'use strict';
const { PriceMonitor } = require('@civfund/fund-libraries');
let btcusdt = new PriceMonitor('last','BTC/USDT',null,'binance',null,null,null,true);
let BTC240329 = new PriceMonitor('last','BTC/USDT_240329',null,'binanceusdm',null,null,null,true);
let BTC240628 = new PriceMonitor('last','BTC/USDT_240628',null,'binanceusdm',null,null,null,true);
let ethusdt = new PriceMonitor('last','ETH/USDT',null,'binance',null,null,null,true);
let ETH240329 = new PriceMonitor('last','ETH/USDT_240329',null,'binanceusdm',null,null,null,true);
let ETH240628 = new PriceMonitor('last','ETH/USDT_240628',null,'binanceusdm',null,null,null,true);
let averageYieldsGlobal = {};
let yieldsGlobal = {};
let averageYieldsGlobalPostExecution = {};
let yieldsGlobalPostExecution = {};

ETH240329.on('price', (data) => {
  const ethSpotPrice = ethusdt.getPrice();
  const eth240329Price = data;
  const maturityDate = new Date('2024-03-29');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (eth240329Price - ethSpotPrice) / ethSpotPrice * 365 / daysToMaturity;
  const yieldOnCarryTradePostFees = ((((eth240329Price - ethSpotPrice) / ethSpotPrice)) *(1-0.25)) * 365 / daysToMaturity;

  yieldsGlobalPostExecution['ETH/USDT_240329'] = (yieldsGlobalPostExecution['ETH/USDT_240329'] || []).concat(yieldOnCarryTradePostFees).slice(-30);
  yieldsGlobal['ETH/USDT_240329'] = (yieldsGlobal['ETH/USDT_240329'] || []).concat(yieldOnCarryTrade).slice(-30);
  const averageYield = calculateAverage(yieldsGlobal['ETH/USDT_240329']);
  const averageYieldPostExecution = calculateAverage(yieldsGlobalPostExecution['ETH/USDT_240329']);

  averageYieldsGlobal['ETH/USDT_240329'] = averageYield;
  averageYieldsGlobalPostExecution['ETH/USDT_240329'] = averageYieldPostExecution;

  console.log(`Average yield on carry trade for ETH 240329: ${averageYield}`);
  console.log(`Average yield on carry trade for ETH 240329 post execution fees: ${averageYieldPostExecution}`);
});

ETH240628.on('price', (data) => {
  const ethSpotPrice = ethusdt.getPrice();
  const eth240628Price = data;
  const maturityDate = new Date('2024-06-28');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (eth240628Price - ethSpotPrice) / ethSpotPrice * 365 / daysToMaturity;
  const yieldOnCarryTradePostFees = ((((eth240628Price - ethSpotPrice) / ethSpotPrice)) *(1-0.25)) * 365 / daysToMaturity;

  yieldsGlobalPostExecution['ETH/USDT_240628'] = (yieldsGlobalPostExecution['ETH/USDT_240628'] || []).concat(yieldOnCarryTradePostFees).slice(-30);
  yieldsGlobal['ETH/USDT_240628'] = (yieldsGlobal['ETH/USDT_240628'] || []).concat(yieldOnCarryTrade).slice(-30);
  const averageYield = calculateAverage(yieldsGlobal['ETH/USDT_240628']);
  const averageYieldPostExecution = calculateAverage(yieldsGlobalPostExecution['ETH/USDT_240628']);

  averageYieldsGlobal['ETH/USDT_240628'] = averageYield;
  averageYieldsGlobalPostExecution['ETH/USDT_240628'] = averageYieldPostExecution;

  console.log(`Average yield on carry trade for ETH 240628: ${averageYield}`);
  console.log(`Average yield on carry trade for ETH 240628 post execution fees: ${averageYieldPostExecution}`);
});

BTC240329.on('price', (data) => {
  const btcSpotPrice = btcusdt.getPrice();
  const btc240329Price = data;
  const maturityDate = new Date('2024-03-29');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (btc240329Price - btcSpotPrice) / btcSpotPrice * 365 / daysToMaturity;
  const yieldOnCarryTradePostFees = ((((btc240329Price - btcSpotPrice) / btcSpotPrice)) *(1-0.25)) * 365 / daysToMaturity;

  yieldsGlobalPostExecution['BTC/USDT_240329'] = (yieldsGlobalPostExecution['BTC/USDT_240329'] || []).concat(yieldOnCarryTradePostFees).slice(-30);
  yieldsGlobal['BTC/USDT_240329'] = (yieldsGlobal['BTC/USDT_240329'] || []).concat(yieldOnCarryTrade).slice(-30);
  const averageYield = calculateAverage(yieldsGlobal['BTC/USDT_240329']);
  const averageYieldPostExecution = calculateAverage(yieldsGlobalPostExecution['BTC/USDT_240329']);

  averageYieldsGlobal['BTC/USDT_240329'] = averageYield;
  averageYieldsGlobalPostExecution['BTC/USDT_240329'] = averageYieldPostExecution;

  console.log(`Average yield on carry trade for BTC 240329: ${averageYield}`);
  console.log(`Average yield on carry trade for BTC 240329 post execution fees: ${averageYieldPostExecution}`);
});

BTC240628.on('price', (data) => {
  const btcSpotPrice = btcusdt.getPrice();
  const btc240628Price = data;
  const maturityDate = new Date('2024-06-28');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (btc240628Price - btcSpotPrice) / btcSpotPrice * 365 / daysToMaturity;
  const yieldOnCarryTradePostFees = ((((btc240628Price - btcSpotPrice) / btcSpotPrice)) *(1-0.25)) * 365 / daysToMaturity;

  yieldsGlobalPostExecution['BTC/USDT_240628'] = (yieldsGlobalPostExecution['BTC/USDT_240628'] || []).concat(yieldOnCarryTradePostFees).slice(-30);
  yieldsGlobal['BTC/USDT_240628'] = (yieldsGlobal['BTC/USDT_240628'] || []).concat(yieldOnCarryTrade).slice(-30);
  const averageYield = calculateAverage(yieldsGlobal['BTC/USDT_240628']);
  const averageYieldPostExecution = calculateAverage(yieldsGlobalPostExecution['BTC/USDT_240628']);

  averageYieldsGlobal['BTC/USDT_240628'] = averageYield;
  averageYieldsGlobalPostExecution['BTC/USDT_240628'] = averageYieldPostExecution;

  console.log(`Average yield on carry trade for BTC 240628: ${averageYield}`);
  console.log(`Average yield on carry trade for BTC 240628 post execution fees: ${averageYieldPostExecution}`);
});

function calculateAverage(prices) {
  let sum = 0;
  for (let price of prices) {
    sum += price;
  }
  const average = sum / prices.length;
  return average;
}
