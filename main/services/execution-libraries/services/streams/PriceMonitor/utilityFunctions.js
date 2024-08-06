
const BN = require('web3').utils.BN;
const axios = require('axios');

const updateServerTimeOffset = async () => {
    const serverTime = await axios.get('https://api.binance.com/api/v3/time');
    return serverTime.data.serverTime - Date.now();
}

const toDashPair = (pair) => {
    const [first, second] = pair.split('/');
    return first + '-' + second;
}

const toLowercasePair = (pair) => {
    if (pair.includes('/')) {
        const [first, second] = pair.split('/');
        return first.toLowerCase() + second.toLowerCase();
    }
    return pair.toLowerCase(); // Return the original string if no '/' is found
};

const toContinuePair = (pair) => {
    if (pair.includes('/')) {
        const [first, second] = pair.split('/');
        return first + second;
    }
    return pair; // Return the original string if no '/' is found
};


const calculatePrice = (token0, token1) => {
    return new BN(token0).div(new BN(token1));
};

module.exports = {
    toLowercasePair,
    toContinuePair,
    calculatePrice,
    updateServerTimeOffset,
    toDashPair
};
