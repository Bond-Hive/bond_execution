// Description: Helper functions.

require('../config/configEnv.js');

const triggersFromList = (list, currentPrice) => {
  let lowerBoundIndex, upperBoundIndex, upperBoundPrice, lowerBoundPrice;

  // Determine the index of the upper bound.
  upperBoundIndex = list.findIndex((price) => price > currentPrice);

  if (upperBoundIndex === 0) lowerBoundIndex = null;
  else if (upperBoundIndex === -1) {
    lowerBoundIndex = list.length - 1;
    upperBoundIndex = null;
  }

  if (currentPrice === list[list.length - 1]) {
    lowerBoundIndex = list.length - 2;
    upperBoundIndex = list.length - 1;
  }

  // Subtract 1 from the upper bound index to get the index of the price level that
  // the current price is bounded by.
  if (upperBoundIndex > 0) lowerBoundIndex = upperBoundIndex - 1;

  // Look up the corresponding prices.
  if (lowerBoundIndex === null) lowerBoundPrice = null;
  else lowerBoundPrice = list[lowerBoundIndex];

  if (upperBoundIndex === null) upperBoundPrice = null;
  else upperBoundPrice = list[upperBoundIndex];

  return {upperBoundIndex, lowerBoundIndex, upperBoundPrice, lowerBoundPrice};
};

const getDatabaseUrl = (url, dbName) => {
  let originalString = url;
  // Find the position of the last '/' character in the original string
  let lastSlashIndex = originalString.lastIndexOf('/');
  // Find the position of the '?' character in the original string
  let questionMarkIndex = originalString.indexOf('?');
  // Extract the substring before and after the '/' character
  let stringBeforeSlash = originalString.substring(0, lastSlashIndex + 1);
  // Concatenate the new database name with the string after the slash
  let newStringAfterSlash = dbName;
  // Concatenate the final string
  let finalString = stringBeforeSlash + newStringAfterSlash + originalString.substring(questionMarkIndex);

  return finalString;
};

const addDefaultToEmptyObjects = (obj) => {
  if (obj && typeof obj === "object") {
    for (const prop in obj) {
      if (obj[prop] && typeof obj[prop] === "object" && Object.keys(obj[prop]).length === 0) {
        obj[prop]["default"] = "default";
      } else if (typeof obj[prop] === "object") {
        addDefaultToEmptyObjects(obj[prop]);
      }
    }
  }
  return obj;
}

const removeDefaultFromEmptyObjects = (obj) => {
  if (obj && typeof obj === "object") {
    for (const prop in obj) {
      if (obj[prop] && typeof obj[prop] === "object") {
        removeDefaultFromEmptyObjects(obj[prop]);
        if (Object.keys(obj[prop]).length === 1 && obj[prop].default === "default") {
          obj[prop] = {};
        }
      }
    }
  }
  return obj;
}

const getSchemaDefinition = (document) => {
  let mySchemaDefinition = {};
  for (const propName of Object.keys(document)) {
    const propValue = document[propName];
    mySchemaDefinition[propName] = { type: typeof(propValue) };
  }
  return mySchemaDefinition;
}

const getAllKeysFromMap = (map) => {
  return Array.from(map.keys());
}

const matchSubaccountKeys = function (cex, subaccount = 'None', api = 'None', pwd = 'None', pwds = 'None') {
  // define the cex-specific variables
  let setupVars = {
    apiKey: '',
    secret: ''
  };

  if (cex === 'binanceusdm' && subaccount === 'sandbox') {
    setupVars = {
      apiKey: process.env.BINANCE_SANDBOX_API,
      secret: process.env.BINANCE_SANDBOX_SECRET,
    };
  } else if (cex === 'binance' || cex === 'binanceusdm' || cex === 'binancecoinm') {
    if (subaccount === 'None') {
      setupVars = {
        apiKey: process.env.BINANCE_API,
        secret: process.env.BINANCE_SECRET,
      };
    } else if (api !== 'None' && pwd !== 'None') {
      setupVars = {
        apiKey: api,
        secret: pwd,
      };
    } else {
      // Use subaccount value to get the appropriate API/secret keys
      const key = `BINANCE_${subaccount.toUpperCase()}_SUBACCOUNT_API`;
      const secret = `BINANCE_${subaccount.toUpperCase()}_SUBACCOUNT_SECRET`;
      setupVars = {
        apiKey: process.env[key],
        secret: process.env[secret],
      };
    }
  } else if (cex === 'okx') {
    if (subaccount === 'None') {
      setupVars = {
        apiKey: process.env.OKX_API,
        secret: process.env.OKX_SECRET,
        password: process.env.OKX_PASSWORD
      };
    } else if (api !== 'None' && pwd !== 'None' && pwds !== 'None') {
      setupVars = {
        apiKey: api,
        secret: pwd,
        password: pwds
      };
    } else {
      // Use subaccount value to get the appropriate API/secret keys
      const key = `OKX_${subaccount.toUpperCase()}_SUBACCOUNT_API`;
      const secret = `OKX_${subaccount.toUpperCase()}_SUBACCOUNT_SECRET`;
      const password = `OKX_${subaccount.toUpperCase()}_SUBACCOUNT_PASSWORD`;
      setupVars = {
        apiKey: process.env[key],
        secret: process.env[secret],
        password: process.env[password]
      };
    }
  } else {
    throw 'Unsupported exchange';
  }

  return setupVars;
};

// export as module
module.exports = {
  triggersFromList,
  getDatabaseUrl,
  addDefaultToEmptyObjects,
  removeDefaultFromEmptyObjects,
  getSchemaDefinition,
  getAllKeysFromMap,
  matchSubaccountKeys
};
