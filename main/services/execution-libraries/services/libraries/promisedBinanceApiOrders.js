'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { matchSubaccountKeys } = require('./helpers.js');
const BINANCE_API_BASE = 'https://fapi.binance.com';
const BINANCE_API_BASE_COINM = 'https://dapi.binance.com';
const BINANCE_SANDBOX_API_BASE = 'https://testnet.binancefuture.com';
const latencyCorrection = 500; //ms

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const createBinanceInstance = (setupVars, exchange) => {
    const { apiKey, secret: apiSecret } = setupVars;

    // Determine the appropriate API base URL based on the exchange parameter
    let baseURL;
    if (exchange === "binanceusdm") {
        baseURL = BINANCE_API_BASE;
    } else if (exchange === "binancecoinm") {
        baseURL = BINANCE_API_BASE_COINM;
    } else {
        throw new Error("Unsupported exchange type provided");
    }

    const instance = axios.create({
        baseURL: baseURL,
        timeout: 3000,
        headers: { 'X-MBX-APIKEY': apiKey },
    });

    const signQuery = (query) => {
        return crypto
            .createHmac('sha256', apiSecret)
            .update(query)
            .digest('hex');
    };

    return { instance, signQuery };
};


const createSandboxBinanceInstance = (setupVars) => {
    const { apiKey, secret: apiSecret } = setupVars;

    const instance = axios.create({
        baseURL: BINANCE_SANDBOX_API_BASE,
        timeout: 3000,
        headers: { 'X-MBX-APIKEY': apiKey },
    });

    const signQuery = (query) => {
        return crypto
            .createHmac('sha256', apiSecret)
            .update(query)
            .digest('hex');
    };

    return { instance, signQuery };
};

const binanceCreateOrder = async function (
    exchange,
    subaccount,
    symbol,
    type,
    side,
    amount,
    price = undefined,
    clientId = undefined,
    stopPrice = undefined,
    timeInForce = 'GTC', // Add this parameter with default value 'GTC' not valid for market orders
    setupVars = null,
    serverTimeOffset,
    recvWindow = 3000,
    sandbox = false
) {
    let orderParams;
    try {
        if (setupVars === null) {
            setupVars = matchSubaccountKeys(exchange, subaccount);
        }

        const { instance, signQuery } = sandbox ? createSandboxBinanceInstance(setupVars) : createBinanceInstance(setupVars,exchange);

        orderParams = new URLSearchParams({
            symbol: symbol,
            side: side,
            type: type,
            quantity: amount,
            recvWindow: recvWindow,
            timestamp: Date.now() + serverTimeOffset,
        });

        // Add timeInForce parameter only if type is not 'MARKET'
        if (type !== 'MARKET') {
            orderParams.set('timeInForce', timeInForce);
        }

        if (price) {
            orderParams.set('price', price);
        }

        if (clientId) {
            orderParams.set('newClientOrderId', clientId);
        }

        if (stopPrice) {
            orderParams.set('stopPrice', stopPrice);
        }

        const signature = signQuery(orderParams.toString());
        orderParams.set('signature', signature);

        // Determine the API endpoint based on the exchange type
        const apiEndpoint = exchange === "binanceusdm" ? '/fapi/v1/order' : '/dapi/v1/order';

        // Perform the API request using the determined endpoint
        const res = await instance.post(apiEndpoint, orderParams);

        await sleep(recvWindow + latencyCorrection);

        if (res.status === 200) return res.data;
        else throw new Error(`Order creation failed with status code: ${res.status}, message: ${JSON.stringify(res.data)}`);
    } catch (error) {
        await sleep(recvWindow + latencyCorrection);
        if (error.response) {
            error.stack = `Error: Request failed with status code ${error.response.status}, data: { code: ${error.response.data.code}, msg: '${error.response.data.msg}'}, order params: '${orderParams}'`;
            console.log(error.stack);
        }
        // Re-throw the error to let the outer module handle it
        throw error;
    }
};

const binanceCancelOrder = async function (
    exchange,
    subaccount,
    symbol,
    orderId,
    setupVars = null,
    serverTimeOffset,
    sandbox = false
) {
    let orderParams;
    try {
        if (setupVars === null) {
            setupVars = matchSubaccountKeys(exchange, subaccount);
        }
        const { instance, signQuery } = sandbox ? createSandboxBinanceInstance(setupVars) : createBinanceInstance(setupVars,exchange);

        orderParams = new URLSearchParams({
            symbol: symbol,
            orderId: orderId,
            timestamp: Date.now() + serverTimeOffset,
        });

        const signature = signQuery(orderParams.toString());
        orderParams.set('signature', signature);

        // Determine the API endpoint based on the exchange type
        const apiEndpoint = exchange === "binanceusdm" ? '/fapi/v1/order' : '/dapi/v1/order';

        // Perform the API request using the determined endpoint
        const res = await instance.delete(apiEndpoint, { params: orderParams });
        return res.data;
    } catch (error) {
        if (error.response) {
            error.stack = `Error: Request failed with status code ${error.response.status}, data: { code: ${error.response.data.code}, msg: '${error.response.data.msg}'}, order params: '${orderParams}'`;
            console.log(error.stack);
        }
        // Re-throw the error to let the outer module handle it
        throw error;
    }
};

const binanceEditOrder = async function (
    exchange,
    subaccount,
    symbol,
    orderId,
    type,
    side,
    amount,
    price = undefined,
    clientId = undefined,
    stopPrice = undefined,
    timeInForce = 'GTC',
    setupVars = null,
    serverTimeOffset,
    sandbox = false
) {
    let orderParams;
    try {
        if (setupVars === null) {
            setupVars = matchSubaccountKeys(exchange, subaccount);
        }

        const { instance, signQuery } = sandbox ? createSandboxBinanceInstance(setupVars) : createBinanceInstance(setupVars,exchange);

        orderParams = new URLSearchParams({
            symbol: symbol,
            orderId: orderId,
            type: type,
            side: side,
            quantity: amount,
            timestamp: Date.now() + serverTimeOffset,
        });

        // Add timeInForce parameter only if type is not 'MARKET'
        if (type !== 'MARKET') {
            orderParams.set('timeInForce', timeInForce);
        }

        if (price) {
            orderParams.set('price', price);
        }

        if (clientId) {
            orderParams.set('newClientOrderId', clientId);
        }

        if (stopPrice) {
            orderParams.set('stopPrice', stopPrice);
        }

        const signature = signQuery(orderParams.toString());
        orderParams.set('signature', signature);

        // Determine the API endpoint based on the exchange type
        const apiEndpoint = exchange === "binanceusdm" ? '/fapi/v1/order' : '/dapi/v1/order';

        // Perform the API request using the determined endpoint
        const res = await instance.post(apiEndpoint, orderParams);

        return res.data;
    } catch (error) {
        if (error.response) {
            error.stack = `Error: Request failed with status code ${error.response.status}, data: { code: ${error.response.data.code}, msg: '${error.response.data.msg}'}, order params: '${orderParams}'`;
            console.log(error.stack);
        }
        // Re-throw the error to let the outer module handle it
        throw error;
    }
};

module.exports = {
    binanceCreateOrder,
    binanceCancelOrder,
    binanceEditOrder,
};
