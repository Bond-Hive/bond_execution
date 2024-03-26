'use strict';
const { PriceMonitor } = require('@civfund/fund-libraries');
let btcusdt = new PriceMonitor('last','BTC/USDT',null,'binance',null,null,null,true);
let BTC240329 = new PriceMonitor('last','BTC/USDT_240329',null,'binanceusdm',null,null,null,true);
let BTC240628 = new PriceMonitor('last','BTC/USDT_240628',null,'binanceusdm',null,null,null,true);
let ethusdt = new PriceMonitor('last','ETH/USDT',null,'binance',null,null,null,true);
let ETH240329 = new PriceMonitor('last','ETH/USDT_240329',null,'binanceusdm',null,null,null,true);
let ETH240628 = new PriceMonitor('last','ETH/USDT_240628',null,'binanceusdm',null,null,null,true);

ETH240329.on('price', (data) => {
  // Calculate yield on carry trade
  const ethSpotPrice = ethusdt.getPrice();
  const eth240329Price = data;
  const maturityDate = new Date('2024-03-29');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (eth240329Price - ethSpotPrice) / ethSpotPrice * 365 / daysToMaturity;

  // Do something with the yield on carry trade
  console.log(`Yield on carry trade for ETH 240329: ${yieldOnCarryTrade}`);
});


ETH240628.on('price', (data) => {
  // Calculate yield on carry trade
  const ethSpotPrice = ethusdt.getPrice();
  const eth240628Price = data;
  const maturityDate = new Date('2024-06-28');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (eth240628Price - ethSpotPrice) / ethSpotPrice * 365 / daysToMaturity;

  // Do something with the yield on carry trade
  console.log(`Yield on carry trade for ETH 240628: ${yieldOnCarryTrade}`);
});

BTC240329.on('price', (data) => {
  // Calculate yield on carry trade
  const btcSpotPrice = btcusdt.getPrice();
  const btc240329Price = data;
  const maturityDate = new Date('2024-03-29');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (btc240329Price - btcSpotPrice) / btcSpotPrice * 365 / daysToMaturity;

  // Do something with the yield on carry trade
  console.log(`Yield on carry trade for BTC 240329: ${yieldOnCarryTrade}`);
});

BTC240628.on('price', (data) => {
  // Calculate yield on carry trade
  const btcSpotPrice = btcusdt.getPrice();
  const btc240628Price = data;
  const maturityDate = new Date('2024-06-28');
  const currentDate = new Date();
  const daysToMaturity = Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  const yieldOnCarryTrade = (btc240628Price - btcSpotPrice) / btcSpotPrice * 365 / daysToMaturity;

  // Do something with the yield on carry trade
  console.log(`Yield on carry trade for BTC 240628: ${yieldOnCarryTrade}`);
});