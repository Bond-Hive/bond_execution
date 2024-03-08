require('isomorphic-unfetch'); // required by urql
const enV = require('../configEnv/configEnv.js');
const env = enV.NODE_ENV || 'development';
const config = require('./config/config.js')[env];
const {
  createClient,
  dedupExchange,
  cacheExchange,
  fetchExchange,
} = require('@urql/core');
const {retryExchange} = require('@urql/exchange-retry');
const {
  getThegraphOrderbookApiUrl,
  getThegraphOrderbookApiUrlv2,
  getThegraphOrderbookApiUrl_quickSwap,
  getThegraphOrderbookApiUrlv2_traderJoe,
  getThegraphOrderbookApiUrlv2_spookySwap,
} = require('../utils/thegraph.js');

const createUniswapQueryClient = function(chainId) {
  return createClient({
    url: getThegraphOrderbookApiUrl(chainId),
    exchanges: [
      dedupExchange,
      cacheExchange,
      retryExchange(config.thegraph.retry),
      fetchExchange,
    ],
  });
};

const createUniswapV2QueryClient = function(subgraph) {
  return createClient({
    url: getThegraphOrderbookApiUrlv2(subgraph),
    exchanges: [
      dedupExchange,
      cacheExchange,
      retryExchange(config.thegraph.retry),
      fetchExchange,
    ],
  });
};

const createQuickSwapQueryClient = function(chainId) {
  return createClient({
    url: getThegraphOrderbookApiUrl_quickSwap(chainId),
    exchanges: [
      dedupExchange,
      cacheExchange,
      retryExchange(config.thegraph.retry),
      fetchExchange,
    ],
  });
};

const createTraderJoeQueryClient = function(chainId) {
  return createClient({
    url: getThegraphOrderbookApiUrlv2_traderJoe(chainId),
    exchanges: [
      dedupExchange,
      cacheExchange,
      retryExchange(config.thegraph.retry),
      fetchExchange,
    ],
  });
};

const createSpookySwapQueryClient = function(chainId) {
  return createClient({
    url: getThegraphOrderbookApiUrlv2_spookySwap(chainId),
    exchanges: [
      dedupExchange,
      cacheExchange,
      retryExchange(config.thegraph.retry),
      fetchExchange,
    ],
  });
};

module.exports = {
  createUniswapQueryClient,
  createUniswapV2QueryClient,
  createQuickSwapQueryClient,
  createTraderJoeQueryClient,
  createSpookySwapQueryClient,
};
