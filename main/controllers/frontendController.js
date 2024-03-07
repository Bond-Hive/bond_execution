const civfund = require('@civfund/fund-libraries');

const getDataFrontend = async (req, res) => {
    const input = req.params.strategyName;
    const strategyName = addSpaceAfterSubstring(input);    
    const collectionName = strategyName + "-monitoring";
    try {
        let data = await civfund.dbMongoose.findLastDocument('bond-hive', collectionName, 'performanceData');
        res.send({
            investedPositionReturns: data.strategy['NAVWNoise'],
            ROI: data.strategy['totalNAVChangeWoNoise'],
            APY: data.strategy['totalNAVChangeWoNoiseCAGR'],
            pricetoken0: data.strategy.token0DexPrice,
            pricetoken1: data.strategy.token1DexPrice,
        });
    } catch (e) {
        console.error(e);
        res.status(500);
        res.send({ result: 'FAILURE', exception: e.message, error: e.stack });
    }
};

const getData = async (strategyName) => {
    try {
        const collectionName = strategyName + "-monitoring";
        let data = await civfund.dbMongoose.getCollection('Fund-Frontend', collectionName);
        return data[0].data;
    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

const alive = (req, res) => {
    res.status(200);
    res.send('OK');
};

const addSpaceAfterSubstring = (inputString) => {
    const substring = "'s";
    const index = inputString.indexOf(substring);

    if (index !== -1) {
        const stringWithSpace = inputString.slice(0, index + substring.length) + " " + inputString.slice(index + substring.length);
        return stringWithSpace;
    }

    return inputString;
};

const binarySearchClosest = (array, target) => {
    let left = 0;
    let right = array.length - 1;

    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (array[mid][0] === target) return array[mid];
        if (array[mid][0] < target) left = mid + 1;
        else right = mid;
    }

    if (left === 0) return array[left];
    if (left === array.length - 1) return array[left];

    return Math.abs(array[left][0] - target) < Math.abs(array[left - 1][0] - target) ? array[left] : array[left - 1];
};

const findClosestValue = (target, array) => binarySearchClosest(array, target);

const calculatePercentageIncrease = (initialValue, finalValue) => {
    return ((finalValue - initialValue) / initialValue) * 100;
};

const getLastPerformanceData = (data) => {
    const t = Date.now(); // Current timestamp in milliseconds
    const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds

    const tMinus1 = t - oneDay; // Timestamp 1 day ago
    const tMinus8 = t - 8 * oneDay; // Timestamp 8 days ago

    const lastMonth = new Date(t);
    const endLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 0).getTime();
    const startLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - 1, 1).getTime();

    const weeklyValue1 = findClosestValue(tMinus1, data);
    const weeklyValue8 = findClosestValue(tMinus8, data);
    const monthlyValueStart = findClosestValue(startLastMonth, data);
    const monthlyValueEnd = findClosestValue(endLastMonth, data);

    const weeklyPerformance = calculatePercentageIncrease(
        parseFloat(weeklyValue8[1]),
        parseFloat(weeklyValue1[1])
    );

    const monthlyPerformance = calculatePercentageIncrease(
        parseFloat(monthlyValueStart[1]),
        parseFloat(monthlyValueEnd[1])
    );

    return { "lastWeekPerformance": weeklyPerformance.toFixed(2), "lastMonthPerformance": monthlyPerformance.toFixed(2) };
};

const getPerformanceData = async (req, res) => {
    try {
        const input = req.params.strategyName;
        const strategyName = addSpaceAfterSubstring(input);
        const formattedData = await getData(strategyName);
        const performanceData = getLastPerformanceData(formattedData);
        res.send({ "fullHistory": formattedData, "lastPerformances": performanceData});
    } catch (e) {
        console.error(e);
        res.status(500);
        res.send({ result: 'FAILURE', exception: e.message, error: e.stack });
    }
};

module.exports = {
    getPerformanceData,
    getDataFrontend,
    alive
};
