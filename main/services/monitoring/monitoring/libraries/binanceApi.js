const crypto = require("crypto");
const proxyRequest = require('./proxyRequest.js');
const axios = require('axios');

const baseUrl = "https://fapi.binance.com";
const urlEndpointListenkey = "/fapi/v1/listenKey";
const params = {
  recvWindow: 5000,
  timestamp: Date.now(),
};
const queryString = new URLSearchParams(params).toString();

// Function to refresh the listenKey
const keepAliveListenKey = async (subaccount, listenKey, apiKey) => {
  try {
    await axios.post(`https://fapi.binance.com/fapi/v1/listenKey?listenKey=${listenKey}`, {}, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });
  } catch (error) {
    console.error('Error while trying to refresh listenKey for ', subaccount);
  }
};

const closeListenKey = async (subaccount, apiKey, apiSecret) => {
  let signature = crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");
  
  try {
    await axios.delete(`https://fapi.binance.com/fapi/v1/listenKey`, null, {
      headers: { 'X-MBX-APIKEY': apiKey },
      params: {
        ...params,
        signature,
      },
    });
    console.log('Successfully closed listenKey for ', subaccount);
    return true;
  } catch (error) {
    console.error('Error while trying to close listenKey for ', subaccount, error);
    return false;
  }
};

const getListenKey = async (subaccount, apiKey, apiSecret) => {
  let response;

  let signature = crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");

  try {
    response = await axios.post(baseUrl + urlEndpointListenkey, null, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
      params: {
        ...params,
        signature,
      },
    });

    return response.data.listenKey;
  } catch (error) {
    console.log('Unable to setup Listen Key for ', subaccount, error.code || ' N/A ', error.message || 'N/A');
    return null;
  }
};

const fetchAllOrders = async (symbol, apiKey, apiSecret) => {
  const resServerTime = await proxyRequest(baseUrl + "/fapi/v1/time");
  const timeStamp = resServerTime.body.serverTime;

  const queriedTimeStamp = `symbol=${symbol}&timestamp=${timeStamp}`;

  let signature = crypto
    .createHmac("sha256", apiSecret)
    .update(queriedTimeStamp)
    .digest("hex");

  let paramsAllOrders = {
    symbol: symbol,
    timestamp: timeStamp,
    signature: signature,
  };

  try {
    let response = await proxyRequest(baseUrl + "/fapi/v1/allOrders", paramsAllOrders, apiKey);
    return response.body;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  getListenKey,
  fetchAllOrders,
  keepAliveListenKey,
  closeListenKey
};
