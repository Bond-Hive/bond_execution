require('../config/configEnv.js');
const ccxt = require('ccxt');

const initializeCcxt = function(cex, subaccount = 'None', api = 'None', pwd = 'None', pwds = 'None') {
  // instantiate ccxt
  const exchangeClass = ccxt[cex];
  
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
  }
  
  else {
    throw 'Unsupported exchange';
  }
  
  // add global options by appending them after the 'if' block
  setupVars = {...setupVars,
    options: {
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
  };
  
  // instantiate the cex inside ccxt
  const exchange = new exchangeClass(setupVars);

  if (subaccount === 'sandbox') {
    exchange.setSandboxMode(true);
  }

  return exchange;
};

const initializeProCcxt = function(cex, subaccount = 'None', api = 'None', pwd = 'None', pwds = 'None') {
  // instantiate ccxt
  const exchangeClass = ccxt.pro[cex];

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
  }
  
  else {
    throw 'Unsupported exchange';
  }
  
  // instantiate the cex inside ccxt
  const exchange = new exchangeClass(setupVars);

  if (subaccount === 'sandbox') {
    exchange.setSandboxMode(true);
  }

  return exchange;
};

module.exports = {
  initializeCcxt,
  initializeProCcxt,
};
