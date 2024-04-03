const crypto = require("crypto");
const proxyRequest = require('./proxyRequest.js');
const axios = require('axios');

const baseUrl = "https://api.binance.com";
const urlEndpointListenkey = "/api/v3/userDataStream";


// Function to refresh the listenKey
const keepAliveListenKey = async (listenKey, apiKey) => {
  try {
    const response = await axios.put(`https://api.binance.com/api/v3/userDataStream`, null, {
      headers: { 'X-MBX-APIKEY': apiKey },
      params: {
        listenKey
      },
    });

    if (response.status !== 200) {
      throw new Error(`Failed to refresh listenKey, status code: ${response.status}`);
    }

    console.log('Successfully refreshed listenKey!');
  } catch (error) {
    console.error('Error while trying to refresh listenKey:', error);
    throw error;
  }
};


const getListenKey = async (apiKey, apiSecret) => {
  const params = {
    recvWindow: 5000,
    timestamp: Date.now(),
  };
  const queryString = new URLSearchParams(params).toString();
  
  let signature = crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");

  let response;
  try {
    response = await axios.post(baseUrl + urlEndpointListenkey, null, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
      params: {
        // ...params,
        // signature,
      },
    });
  } catch (error) {
    console.error('Error while trying to get listenKey:', error);
    throw error;
  }
 // Check if response is defined and has the necessary properties
 if (response && response.data && response.data.listenKey) {
  return response.data.listenKey;
} else {
  throw new Error('Unexpected response format from Binance API');
}
};


const fetchAllOrders = async (symbol, apiKey, apiSecret) => {
  const resServerTime = await proxyRequest(baseUrl + "/api/v1/time");
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
    let response = await proxyRequest(baseUrl + "/api/v1/allOrders", paramsAllOrders, apiKey);
    return response.body;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  getListenKey,
  fetchAllOrders,
  keepAliveListenKey
};
