/* eslint-disable no-mixed-spaces-and-tabs */
const { getPoolsByTokens, getPool, getPoolVolume } = require('../queries/uniswapQueries.js');
const { nativeAddress, nativeUsdToken } = require('../utils/web3.js');
const puppeteer = require('puppeteer');

// for consistency with priceOfTick, we let the consumer of this function enter the same deltaDecimals and add the minus here
const tickOfPrice = function (price, deltaDecimals = 0) {
  return Math.floor(Math.log(Number(price) * 10 ** (- Number(deltaDecimals))) / Math.log(1.0001));
};
const priceOfTick = function (tick, deltaDecimals = 0) {
  return ((1.0001) ** Number(tick)) * 10 ** (Number(deltaDecimals));
};

const percentual = function (a, b) {
  let percent;
  if (b !== 0) {
    if (a !== 0) {
      percent = (b - a) / a * 100;
    } else {
      percent = b * 100;
    }
  } else {
    percent = - a * 100;
  }
  return percent;
}

const getLiquidityForAmounts = function (poolData, tickTarget, amountLeft, amountRight, tickDecimals = false, acceptInRange = false, inputTicks = false, tickLeft = 0, tickRight = 0) {
  tickTarget = Number(tickTarget);
  amountLeft = Number(amountLeft);
  amountRight = Number(amountRight);
  const tickSpacing = Number(poolData.feeTier) / 50;

  let tickLower; let tickUpper; let liquidity; let tickCurrent;

  if (inputTicks) {
    tickCurrent = tickTarget;
    /* left and right tick must be at the boundary of a tick spacing otherwise they get rounded */
    tickLower = Math.round(Number(tickLeft) / tickSpacing) * tickSpacing;
    tickUpper = Math.round(Number(tickRight) / tickSpacing) * tickSpacing;
  } else {
    /* ROUND INTO TICK SPACING. only the current tick is allowed to break inside a spacing */
    tickCurrent = Number(poolData.tick);
    const targetRounded = Math.round(tickTarget / tickSpacing) * tickSpacing;

    if (tickTarget >= targetRounded) {
      tickLower = targetRounded;
      tickUpper = tickLower + tickSpacing;
    } else {
      tickUpper = targetRounded;
      tickLower = tickUpper - tickSpacing;
    }
  }

  // if we are trapped in-between, throw error
  if (tickCurrent >= tickLower && tickCurrent <= tickUpper) {
    if (!acceptInRange) {
      throw new Error('In range! No limit order possible');
    }
  }

  let sqrtA; let sqrtB; let sqrtC;

  // this was likely just a bug, this flag could be removed in a future version
  if (tickDecimals) {
    sqrtA = priceOfTick(tickLower, Number(poolData.token1.decimals) - Number(poolData.token0.decimals)) ** (1 / 2);
    sqrtB = priceOfTick(tickUpper, Number(poolData.token1.decimals) - Number(poolData.token0.decimals)) ** (1 / 2);
    sqrtC = priceOfTick(tickCurrent, Number(poolData.token1.decimals) - Number(poolData.token0.decimals)) ** (1 / 2);
  } else {
    sqrtA = priceOfTick(tickLower) ** (1 / 2);
    sqrtB = priceOfTick(tickUpper) ** (1 / 2);
    sqrtC = priceOfTick(tickCurrent) ** (1 / 2);
  }

  // subtract a tiny amount in order to prevent rounding issues
  if (tickCurrent < tickLower) {
    liquidity = Math.round(Math.abs(amountLeft * (sqrtB * sqrtA) / (sqrtB - sqrtA)) * 0.999999);
  } else if (tickCurrent > tickUpper) {
    liquidity = Math.round(Math.abs(amountRight / (sqrtB - sqrtA)) * 0.999999);
  } else {
    if (!acceptInRange) {
      throw new Error('In range! No limit order possible');
    } else {
      const liquidityLeft = Math.round(Math.abs(amountLeft * (sqrtB * sqrtC) / (sqrtB - sqrtC)) * 0.999999);
      const liquidityRight = Math.round(Math.abs(amountRight / (sqrtC - sqrtA)) * 0.999999);
      liquidity = Math.min(liquidityLeft, liquidityRight);
    }
  }

  return { tickLower, tickUpper, liquidity, tickCurrent };
};

const calcAmountsForLiquidity = async function (chainId, pool, tickLower, tickUpper, liquidity) {
  const poolData = await getPool(chainId, pool.toLowerCase());
  return getAmountsForLiquidity(poolData, tickLower, tickUpper, liquidity, true);
};

const calcAmountsForTickLiquidity = async function (chainId, pool, tickLower, tickUpper, liquidity, tickTarget) {
  const poolData = await getPool(chainId, pool.toLowerCase());
  return getAmountsForLiquidity(poolData, tickLower, tickUpper, liquidity, true, true, tickTarget);
};

const calcLiquidityForAmounts = async function (chainId, pool, tickTarget, amountLeft, amountRight) {
  const poolData = await getPool(chainId, pool.toLowerCase());
  return getLiquidityForAmounts(poolData, tickTarget, amountLeft, amountRight, true, true);
};

const calcLiquidityForTickAmounts = async function (chainId, pool, amountLeft, amountRight, tickLeft, tickRight, tickTarget) {
  const poolData = await getPool(chainId, pool.toLowerCase());
  return getLiquidityForAmounts(poolData, tickTarget, amountLeft, amountRight, true, true, true, tickLeft, tickRight);
};

const getAmountsForLiquidity = function (poolData, tickLower, tickUpper, liquidity, removeDecimals = false, inputTick = false, tickTarget = 0) {
  tickLower = Number(tickLower);
  tickUpper = Number(tickUpper);
  liquidity = Number(liquidity);

  let sqrtA; let sqrtB; let sqrtC; let tickCurrent;

  if (inputTick) {
    tickCurrent = tickTarget;
  } else {
    tickCurrent = Number(poolData.tick);
  }

  sqrtA = priceOfTick(tickLower) ** (1 / 2);
  sqrtB = priceOfTick(tickUpper) ** (1 / 2);
  sqrtC = priceOfTick(tickCurrent) ** (1 / 2);

  let amountA = 0; let amountB = 0;

  if (tickCurrent < tickLower) {
    amountA = Math.abs(liquidity * (sqrtB - sqrtA) / (sqrtB * sqrtA));
    if (removeDecimals) {
      amountA = amountA * 10 ** (-Number(poolData.token0.decimals));
    }
  } else if (tickCurrent > tickUpper) {
    amountB = Math.abs(liquidity * (sqrtB - sqrtA));
    if (removeDecimals) {
      amountB = amountB * 10 ** (-Number(poolData.token1.decimals));
    }
  } else {
    // "In range! No limit order possible" FIXED
    // Here the mixing of meaning for A/B doesn't help, sqrtA represents tickLower, not to be confused with amountA
    amountA = Math.abs(liquidity * (sqrtB - sqrtC) / (sqrtB * sqrtC));
    amountB = Math.abs(liquidity * (sqrtC - sqrtA));
    if (removeDecimals) {
      amountA = amountA * 10 ** (-Number(poolData.token0.decimals));
      amountB = amountB * 10 ** (-Number(poolData.token1.decimals));
    }
  }
  return { amountA, amountB };
};

const getAmountsForLiquidityWithoutGraph = function (tickLower, tickUpper, liquidity,token0Decimals,token1Decimals,removeDecimals = false,tickTarget = 0) {
  tickLower = Number(tickLower);
  tickUpper = Number(tickUpper);
  liquidity = Number(liquidity);

  let sqrtA; let sqrtB; let sqrtC;
  let tickCurrent = tickTarget;


  sqrtA = priceOfTick(tickLower) ** (1 / 2);
  sqrtB = priceOfTick(tickUpper) ** (1 / 2);
  sqrtC = priceOfTick(tickCurrent) ** (1 / 2);

  let amountA = 0; let amountB = 0;

  if (tickCurrent < tickLower) {
    amountA = Math.abs(liquidity * (sqrtB - sqrtA) / (sqrtB * sqrtA));
    if (removeDecimals) {
      amountA = amountA * 10 ** (-Number(token0Decimals));
    }
  } else if (tickCurrent > tickUpper) {
    amountB = Math.abs(liquidity * (sqrtB - sqrtA));
    if (removeDecimals) {
      amountB = amountB * 10 ** (-Number(token1Decimals));
    }
  } else {
    // "In range! No limit order possible" FIXED
    // Here the mixing of meaning for A/B doesn't help, sqrtA represents tickLower, not to be confused with amountA
    amountA = Math.abs(liquidity * (sqrtB - sqrtC) / (sqrtB * sqrtC));
    amountB = Math.abs(liquidity * (sqrtC - sqrtA));
    if (removeDecimals) {
      amountA = amountA * 10 ** (-Number(token0Decimals));
      amountB = amountB * 10 ** (-Number(token1Decimals));
    }
  }
  return { amountA, amountB };
};

const choosePool = async function (chainId, tokenGiven, tokenWanted) {
  // looks at the highest volume pool available, so it executes faster
  let poolNumber = 0;
  let maxVolume = -1;
  const poolList = await getPoolsByTokens(chainId, tokenGiven, tokenWanted);

  if (poolList.length < 1) return 0;

  for (let i = 0; i < poolList.length; ++i) {
    // fix CIV pools
    if (poolList[i].id.toLowerCase() === '0x2b1b8052eed6467967d047b58b71f8e9ffa057b5') {
      return poolList[i];
    }
    const volumes = await getPoolVolume(chainId, poolList[i].id);
    let currVolume = 0;

    // add day0 today and day1 yesterday volumes, if found, changing the second to volumes[1].
    // keep as 0 for now to avoid the issue with flashloan pools, TO DO more research needed
    try {
      currVolume += Number(volumes[0].volumeUSD);
    } catch (e) {
      currVolume += 0;
    }
    try {
      currVolume += Number(volumes[1].volumeUSD);
    } catch (e) {
      currVolume += 0;
    }

    // do not discard any tiers anymore
    if ((currVolume > maxVolume) && (Number(poolList[i].feeTier) > 0)) {
      maxVolume = currVolume;
      poolNumber = i;
    }
  }
  return poolList[poolNumber];
};

const getFrontendPool = async function (chainId, tokenGiven, tokenWanted) {
  var start = process.hrtime()
  tokenGiven = String(tokenGiven).toLowerCase()
  tokenWanted = String(tokenWanted).toLowerCase()

  let chosenPool = await choosePool(chainId, tokenGiven, tokenWanted)
  if (chosenPool === 0) return 0

  let poolAddress = chosenPool.id
  let tokenLeftOfPool = chosenPool.token0.id

  let decimalsGiven, decimalsWanted, rate
  if (String(tokenGiven).toLowerCase() === String(tokenLeftOfPool).toLowerCase()) {
    decimalsGiven = chosenPool.token0.decimals
    decimalsWanted = chosenPool.token1.decimals
    rate = priceOfTick(chosenPool.tick, Number(decimalsGiven) - Number(decimalsWanted))
  } else {
    decimalsGiven = chosenPool.token1.decimals
    decimalsWanted = chosenPool.token0.decimals
    rate = 1 / priceOfTick(chosenPool.tick, Number(decimalsWanted) - Number(decimalsGiven))
  }

  return ({
    poolContract: poolAddress,
    rate: rate,
    feeTier: chosenPool.feeTier,
    decimalsFrom: decimalsGiven,
    decimalsTo: decimalsWanted,
    tickCurrent: chosenPool.tick,
    result: "OK",
    latencyMilliseconds: process.hrtime(start)[1] / 1000000
  });
};

const getTokenDollarValue = async function (chainId, tokenAddress, tokenAmount = 1, withDecimals = false) {
  tokenAddress = tokenAddress.toLowerCase();
  const nativeToken = nativeAddress(chainId).toLowerCase();
  const UsdAddress = nativeUsdToken(chainId).toLowerCase();
  let dollarValue = 0;
  const poolNativeUsd = await getFrontendPool(chainId, nativeToken, UsdAddress);
  let poolTokenNative; let nativeValue; let tokensPerNative;

  // get pair token / native and native / usdt
  if (tokenAddress === nativeToken) {
    const amountToken = Number(tokenAmount) * 10 ** (withDecimals ? 0 : Number(poolNativeUsd.decimalsFrom));
    // native tokens always have 18 decimals
    dollarValue = poolNativeUsd.rate * amountToken * 10 ** (- 18);
  } else {
    poolTokenNative = await getFrontendPool(chainId, tokenAddress, nativeToken);
    if (poolTokenNative === 0) {
      // no Native pool, try USD
      const poolTokenUsd = await getFrontendPool(chainId, tokenAddress, UsdAddress);
      if (poolTokenUsd === 0) {
        return 'no liquidity';
      }
      const amountToken = Number(tokenAmount) * 10 ** (withDecimals ? 0 : Number(poolTokenUsd.decimalsFrom));
      dollarValue = poolTokenUsd.rate * amountToken * 10 ** (- Number(poolTokenUsd.decimalsFrom));

      return ({
        dollarValue: dollarValue,
        result: 'OK',
      });
    }

    nativeValue = poolNativeUsd.rate;
    const amountToken = Number(tokenAmount) * 10 ** (withDecimals ? 0 : Number(poolTokenNative.decimalsFrom));
    //	  tokensPerNative = poolTokenNative.rate * 10 ** (- 18)
    //	  dollarValue = tokensPerNative * nativeValue * amountToken * 10 ** (Number(poolTokenNative.decimalsFrom) - 18)
    tokensPerNative = poolTokenNative.rate;
    dollarValue = tokensPerNative * nativeValue * amountToken * 10 ** (- Number(poolTokenNative.decimalsFrom));
  }

  return ({
    dollarValue: dollarValue,
    dollarValueString: dollarValue.toFixed(12),
    result: 'OK',
  });
};

const getUniV3UnclaimedFees = async function (
  tick,
  tickLower,
  tickUpper,
  ticksLowerResults,
  ticksUpperResults,
  feeGrowthInside0LastX128,
  feeGrowthInside1LastX128,
  liquidity,
  token0decimals,
  token1decimals,
  feeGrowthGlobal0X128,
  feeGrowthGlobal1X128,
  method = "default",
  positionId,
  lpToken0symbol = "ETH"
  ) {
  let fees0Token, fees1Token;
  try {
    if (method === "default") {
      // Constants for calculations using BigInt
      const TWO_POW_128 = BigInt(2 ** 128);
      const TWO_POW_256 = BigInt(2 ** 256);
    
      if (tick < tickLower || tick > tickUpper) {
        // When tokens are outside range
        let feeGrowthOutside0 = BigInt(ticksUpperResults.feeGrowthOutside0X128) - BigInt(ticksLowerResults.feeGrowthOutside0X128);
        let feeGrowthOutside1 = BigInt(ticksUpperResults.feeGrowthOutside1X128) - BigInt(ticksLowerResults.feeGrowthOutside1X128);
    
        // Adjusting feeGrowthInside using BigInt to prevent overflow
        let feeGrowthInside0 = BigInt(feeGrowthInside0LastX128);
        if (feeGrowthInside0 > TWO_POW_128) {
          feeGrowthInside0 -= TWO_POW_256;
        }
    
        let feeGrowthInside1 = BigInt(feeGrowthInside1LastX128);
        if (feeGrowthInside1 > TWO_POW_128) {
          feeGrowthInside1 -= TWO_POW_256;
        }
    
        fees0Token = (
          Number(feeGrowthOutside0 - feeGrowthInside0) * BigInt(liquidity) / TWO_POW_128
        ) / (10 ** token0decimals);
    
        fees1Token = (
          Number(feeGrowthOutside1 - feeGrowthInside1) * BigInt(liquidity) / TWO_POW_128
        ) / (10 ** token1decimals);
      } else {
        // When tokens are inside range
        let feeGrowthGlobal0 = BigInt(feeGrowthGlobal0X128);
        let feeGrowthGlobal1 = BigInt(feeGrowthGlobal1X128);
    
        let feeGrowthInside0 = BigInt(feeGrowthInside0LastX128);
        if (feeGrowthInside0 > TWO_POW_128) {
          feeGrowthInside0 -= TWO_POW_256;
        }
    
        let feeGrowthInside1 = BigInt(feeGrowthInside1LastX128);
        if (feeGrowthInside1 > TWO_POW_128) {
          feeGrowthInside1 -= TWO_POW_256;
        }
    
        // Ensure all intermediate values are BigInt
        let totalFeeGrowth0 = feeGrowthGlobal0 - BigInt(ticksLowerResults.feeGrowthOutside0X128) - BigInt(ticksUpperResults.feeGrowthOutside0X128) - feeGrowthInside0;
        let totalFeeGrowth1 = feeGrowthGlobal1 - BigInt(ticksLowerResults.feeGrowthOutside1X128) - BigInt(ticksUpperResults.feeGrowthOutside1X128) - feeGrowthInside1;

        let fees0 = totalFeeGrowth0 * BigInt(liquidity) / TWO_POW_128;
        let fees1 = totalFeeGrowth1 * BigInt(liquidity) / TWO_POW_128;

        // Convert BigInt result to Number for final calculation, ensuring no intermediate mixing of types
        fees0Token = Number(fees0) / (10 ** token0decimals);
        fees1Token = Number(fees1) / (10 ** token1decimals);
      }    
    } else if (method === "webScrape") {
      const url = `https://app.uniswap.org/pools/` + positionId;
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: "new"
      });
      const page = await browser.newPage();
      let feesToken
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded'
        });
        // const selectorFee = "div.Card__LightCard-sc-a1e3c85c-1"; 
        const selectorFee = "div.sc-fqkvVR.sc-iTeOpy.sc-fWKdJz.eyjjoV.ibXgld.bYPvpY";

        await page.waitForTimeout(20000);

        // // Log the HTML of the page to console
        // const pageHTML = await page.content();
        // console.log(pageHTML); // This will print the entire HTML content to your console

        // Extracting token fees using the provided selector
        feesToken = await page.$$eval(selectorFee, (elems, lpToken0symbol) => {
          const filteredElems = elems.map(el => el.innerText).filter(text => text.includes(lpToken0symbol));
          return filteredElems.length > 1 ? filteredElems[1] : null; 
        }, lpToken0symbol); // Pass lpToken0symbol here
      } catch (error) {
        console.error('Error during web scraping:', error);
      } finally {
        await browser.close();
      }
      // After extracting the strings
      const splitFees = feesToken ? feesToken.split('\n') : null;
      fees0Token = splitFees && splitFees.length > 1 ? splitFees[1] : null;
      fees1Token = splitFees && splitFees.length > 1 ? splitFees[3] : null;
    }

    return { fees0Token, fees1Token };
  } catch (error) {
    console.error('Error occurred during processing:', error);
    return {
      error: 'Error occurred during processing',
      details: error.message,
    };
  }
};


const getValue = async function (contract_address, chainId) {
  const value = await getTokenDollarValue(chainId, contract_address);
  return value.dollarValue;
}

const getStringAfterNumbers = function (str) {
  const regex = /^\d+(.*)/;
  const match = str.match(regex);
  return match ? match[1] : str;
}

const getSubaccountsCex = function (monitoringData) {
  const cexSubaccounts = {};

  for (const key in monitoringData) {
    const tranches = monitoringData[key].tranches;
    for (const trancheKey in tranches) {
      const cex = tranches[trancheKey].cex;
      if (cex) {
        for (const cexKey in cex) {
          const cexSubaccount = cex[cexKey].cexSubaccount;
          const cexValue = cex[cexKey].cex;
          if (cexSubaccount && cexValue) { // Added a check to ensure cexSubaccount and cexValue exist
            if (cexSubaccounts[cexValue]) {
              if (!cexSubaccounts[cexValue].find(subaccount => subaccount.subaccount === cexSubaccount)) { // Check if cexSubaccount already exists before pushing
                cexSubaccounts[cexValue].push({ subaccount: cexSubaccount, symbols: [] });
              }
            } else {
              cexSubaccounts[cexValue] = [{ subaccount: cexSubaccount, symbols: [] }];
            }

            const cexSymbol = cex[cexKey].cexSymbol;
            if (cexSymbol) {
              const subaccount = cexSubaccounts[cexValue].find(subaccount => subaccount.subaccount === cexSubaccount);
              const symbols = subaccount.symbols || [];
              if (!symbols.includes(cexSymbol)) {
                symbols.push(cexSymbol);
              }
              subaccount.symbols = symbols;
            }
          }
        }
      }
    }
  }
  return cexSubaccounts;
}

const timestampToMilliseconds = (timestamp) => {
  const date = new Date(timestamp);
  return date.getTime();
}

module.exports = {
  getFrontendPool,
  getTokenDollarValue,
  getAmountsForLiquidity,
  getLiquidityForAmounts,
  getAmountsForLiquidityWithoutGraph,
  tickOfPrice,
  priceOfTick,
  choosePool,
  calcAmountsForLiquidity,
  calcLiquidityForAmounts,
  calcAmountsForTickLiquidity,
  calcLiquidityForTickAmounts,
  percentual,
  getUniV3UnclaimedFees,
  getValue,
  getStringAfterNumbers,
  getSubaccountsCex,
  timestampToMilliseconds,
};
