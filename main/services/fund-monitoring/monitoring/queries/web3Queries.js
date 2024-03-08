const Web3 = require('web3');
const uniV2contractABI = require('./abi/uniV2Pair.json');
const uniV3contractABI = require('./abi/uniV3Pool.json');
const arbTokenContractABI = require('./abi/arbToken.json');
const arbGmxContractABI = require('./abi/arbGmxPair.json');
const arbGmxReaderABI = require('./abi/arbGmxReader.json');
const uniV3PositionManagerABI = require('./abi/uniV3PositionManager.json');
const CivVaultABI = require('./abi/CIVVault.json');
const CivVaultGetterABI = require('./abi/CIVVault-Getter.json');
const fetch = require('node-fetch');
const { ethers } = require('ethers');
const BigNumber = require('bignumber.js');
const puppeteer = require('puppeteer');


const NFT_POSITION_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const VAULT_GOERLI = '0x4cD6A7596febDa71dD772A17921a7f791EBe0C6B';
const VAULT_GETTER_GOERLI = '0x80Ce46fEf6811B23C0379c015221E1001F4cB439';
const VAULT_MAINNET = '0x9E0B1749f6f41fF0e463F92516fD52aA53B31628';
const VAULT_GETTER_MAINNET = '0xD0C5F2Ba7aDcf7fBE6960cEc38EA1DE3Ebbc22c3';

const getV2PairInfoWeb3 = async function (contractAddress, decimalsToken0, decimalsToken1, decimalsTokenLP, chainId = null) {
  let web3;
  if (!chainId) {
    web3 = new Web3('https://mainnet.infura.io/v3/cd67bf30b3a64391805989ba259cec10');
  } else if (chainId === 137) {
    web3 = new Web3('https://polygon-mainnet.infura.io/v3/cd67bf30b3a64391805989ba259cec10');
  } else throw new Error('ChainId not supported with Infura');

  const contract = new web3.eth.Contract(uniV2contractABI, contractAddress);

  const [reserves, totalSupply] = await Promise.all([
    contract.methods.getReserves().call(),
    contract.methods.totalSupply().call()
  ]);

  const token0Price = (reserves.reserve1 / (10 ** decimalsToken1)) / (reserves.reserve0 / (10 ** decimalsToken0));
  const token1Price = (reserves.reserve0 / (10 ** decimalsToken0)) / (reserves.reserve1 / (10 ** decimalsToken1));
  const reserve0 = Number(reserves.reserve0 / (10 ** decimalsToken0));
  const reserve1 = Number(reserves.reserve1 / (10 ** decimalsToken1));
  const totalSupplyNormalized = Number(totalSupply / (10 ** decimalsTokenLP));

  // Close web3 connection
  web3.currentProvider.disconnect();

  return {
    reserve0,
    reserve1,
    token0Price,
    token1Price,
    totalSupply: totalSupplyNormalized
  };
}

const getArbGMXPool = async function (contractAddress, dataStoreAddress, decimalsToken0, precisionToken0, decimalsToken1, precisionToken1, decimalsTokenLP, max = true) {
  const web3 = new Web3('https://arbitrum-mainnet.infura.io/v3/cd67bf30b3a64391805989ba259cec10');
  const apiURL = 'https://arbitrum-api.gmxinfra.io/prices/tickers';

  // Fetch prices from the API
  const response = await fetch(apiURL);
  const signedPrices = await response.json();

  const contractToken0 = new web3.eth.Contract(arbGmxReaderABI, "0x60a0fF4cDaF0f6D496d71e0bC0fFa86FE8E6B23c");
  const readerMarket = await contractToken0.methods.getMarket(dataStoreAddress, contractAddress).call();

  // Update prices dynamically based on API response
  const market = [readerMarket.marketToken, readerMarket.indexToken, readerMarket.longToken, readerMarket.shortToken];
  const indexTokenPrice = findAndFormatPrice(readerMarket.indexToken, signedPrices, decimalsToken0, precisionToken0);
  const longTokenPrice = findAndFormatPrice(readerMarket.longToken, signedPrices, decimalsToken0, precisionToken0);
  const shortTokenPrice = findAndFormatPrice(readerMarket.shortToken, signedPrices, decimalsToken1, precisionToken1);
  const pnlFactorType = hashString("MAX_PNL_FACTOR_FOR_TRADERS");
  const maximize = false;

  const readerResultRaw = (await contractToken0.methods.getMarketTokenPrice(
    dataStoreAddress,
    market,
    indexTokenPrice,
    longTokenPrice,
    shortTokenPrice,
    pnlFactorType,
    maximize
  ).call());

  // console.log(readerResultRaw);
  const readerResult = readerResultRaw["1"];

  const gmxcontractPool = new web3.eth.Contract(arbGmxContractABI, contractAddress);
  const gmxPoolTotalSupply = await gmxcontractPool.methods.totalSupply().call();

  const reserve0 = Number(readerResult.longTokenAmount / (10 ** decimalsToken0));
  const reserve1 = Number(readerResult.shortTokenAmount / (10 ** decimalsToken1));
  const token0Price = (readerResult.longTokenUsd / (10 ** Number(30))) / (reserve0);
  const token1Price = (readerResult.shortTokenUsd / (10 ** 30)) / (reserve1);
  const totalSupplyNormalized = Number(gmxPoolTotalSupply / (10 ** decimalsTokenLP));
  const totalUSDValue = Number(readerResult.poolValue / (10 ** Number(30))) + Number(readerResult.netPnl / (10 ** 30)) //+ Number(readerResult.totalBorrowingFees / (10 ** 30));
  const priceOfToken = await webScrapeGMTable();

  web3.currentProvider.disconnect();
  
  // console.log("reserve0",reserve0);
  // console.log("reserve1",reserve1);
  // console.log("token0Price",token0Price);
  // console.log("token1Price",token1Price);
  // console.log("totalSupplyNormalized",totalSupplyNormalized);
  // console.log("totalUSDValue",totalUSDValue);
  // console.log("priceOfToken",priceOfToken);

  return {
    reserve0,
    reserve1,
    token0Price,
    token1Price,
    priceOfToken,
    totalSupply: totalSupplyNormalized
  };
};


// console.log(getArbGMXPool("0x70d95587d40A2caf56bd97485aB3Eec10Bee6336","0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",30,6,18,"0x~82aF49447D8a07e3bd95BD0d56f35241523fBab1","0xaf88d065e77c8cC2239327C5EDb3A432268e5831", false));
// console.log(getArbGMXPool("0x70d95587d40A2caf56bd97485aB3Eec10Bee6336","0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",18,4,6,6,18, true));

// Function to find and format price data without decimals
const findAndFormatPrice = (tokenAddress, signedPrices, decimals, precision) => {
  const tokenData = signedPrices.find(token => token.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
  if (!tokenData) return ['0', '0']; // Default values if token not found

  // Convert prices to BigNumber for precise arithmetic
  const minPriceBig = new BigNumber(tokenData.minPrice);
  const maxPriceBig = new BigNumber(tokenData.maxPrice);

  // Adjust according to the formula: (Price / 10^(30 - decimals)) * 10^decimals
  const divisor = new BigNumber(10).pow(new BigNumber(30).minus(decimals));
  const minPriceAdjusted = minPriceBig.dividedBy(divisor).multipliedBy(new BigNumber(10).pow(new BigNumber(30).minus(decimals))).toFixed(0);
  const maxPriceAdjusted = maxPriceBig.dividedBy(divisor).multipliedBy(new BigNumber(10).pow(new BigNumber(30).minus(decimals))).toFixed(0);

  return [minPriceAdjusted, maxPriceAdjusted];
};


// Function to hash a string using keccak256
function hashString(string) {
  const { keccak256, toUtf8Bytes } = ethers;
  return keccak256(toUtf8Bytes(string));
}


const webScrapeGMTable = async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: "new"
  });
  const page = await browser.newPage();
  await page.goto('https://app.gmx.io/#/pools', { waitUntil: 'networkidle0' });

  const selector = '#root > div > div.App > div > div.default-container.page-layout > div.GMList > div.token-grid > div:nth-child(2) > div.App-card-content > div:nth-child(2) > div:nth-child(2)';
  await page.waitForSelector(selector);

  // Extract the text content of the container
  const dataText = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    return element ? element.innerText : 'Element not found';
  }, selector);

  // Use a regular expression to extract the numbers
  const matches = dataText.match(/([\d,]+.\d+)\s*GM\s*\(\$([\d,]+.\d+)\)/);
  let perTokenPrice;
  if (matches && matches.length === 3) {
    // Remove commas and convert to numbers for calculation
    const gmValue = parseFloat(matches[1].replace(/,/g, ''));
    const usdValue = parseFloat(matches[2].replace(/,/g, ''));

    // Calculate per token price
    perTokenPrice = usdValue / gmValue;

    // console.log(`GM Value: ${gmValue}, USD Value: ${usdValue}, Per Token Price: ${perTokenPrice}`);
  } else {
    console.log('Could not parse the values.');
  }

  await browser.close();
  // Optionally, return the calculated value
  return matches ? perTokenPrice : null;
};

const getV3PairInfoWeb3 = async function (chainId, positionId, contractAddress, lpToken0address, lpToken1address, tickLower, tickUpper) {
  let web3;
  if (chainId === 1) {
    web3 = new Web3('https://mainnet.infura.io/v3/cd67bf30b3a64391805989ba259cec10');
  } else if (chainId === 137) {
    web3 = new Web3('https://polygon-mainnet.infura.io/v3/cd67bf30b3a64391805989ba259cec10');
  } else throw new Error('ChainId not supported with Infura');

  const V3PoolContract = new web3.eth.Contract(uniV3contractABI, contractAddress);
  const NFTPositionManagerContract = new web3.eth.Contract(uniV3PositionManagerABI, NFT_POSITION_MANAGER);

  const [feeGrowthGlobal0X128Results, feeGrowthGlobal1X128Results, slot0, ticksLower, ticksUpper, positions] = await Promise.all([
    V3PoolContract.methods.feeGrowthGlobal0X128().call(),
    V3PoolContract.methods.feeGrowthGlobal1X128().call(),
    V3PoolContract.methods.slot0().call(),
    V3PoolContract.methods.ticks(tickLower).call(),
    V3PoolContract.methods.ticks(tickUpper).call(),
    NFTPositionManagerContract.methods.positions(positionId).call()
  ]);

  const feeGrowthGlobal0X128 = Number(feeGrowthGlobal0X128Results);
  const feeGrowthGlobal1X128 = Number(feeGrowthGlobal1X128Results);
  const tick = Number(slot0.tick);
  const ticksLowerResults = {
    feeGrowthOutside0X128: Number(ticksLower.feeGrowthOutside0X128),
    feeGrowthOutside1X128: Number(ticksLower.feeGrowthOutside1X128),
  };
  const ticksUpperResults = {
    feeGrowthOutside0X128: Number(ticksUpper.feeGrowthOutside0X128),
    feeGrowthOutside1X128: Number(ticksUpper.feeGrowthOutside1X128),
  };
  const feeGrowthInside0LastX128 = Number(positions.feeGrowthInside0LastX128);
  const feeGrowthInside1LastX128 = Number(positions.feeGrowthInside1LastX128);
  const liquidity = Number(positions.liquidity);

  // Close web3 connection
  web3.currentProvider.disconnect();

  return {
    feeGrowthGlobal0X128,
    feeGrowthGlobal1X128,
    tick,
    ticksLowerResults,
    ticksUpperResults,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128,
    liquidity
  }
}

const getVaultInfo = async (chainId, poolId, address) => {
  let web3;
  if (chainId === '1') {
    web3 = new Web3('https://mainnet.infura.io/v3/cd67bf30b3a64391805989ba259cec10');
  } else if (chainId === '5') {
    web3 = new Web3('https://goerli.infura.io/v3/b165ca4a2a7f4583bebae070d32e8f43');
  } else throw new Error('ChainId not supported with Infura');

  const ERC20MinimalAbi = [
    {
      "constant": true,
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "name": "",
          "type": "uint256"
        }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
    }
  ];

  const CIVVault = chainId === '1' ? new web3.eth.Contract(CivVaultABI, VAULT_MAINNET) : new web3.eth.Contract(CivVaultABI, VAULT_GOERLI);
  const CIVVaultGetter = chainId === '1' ? new web3.eth.Contract(CivVaultGetterABI, VAULT_GETTER_MAINNET) : new web3.eth.Contract(CivVaultGetterABI, VAULT_GETTER_GOERLI);

  const currentEpoch = await CIVVault.methods.getCurrentEpoch(poolId).call();
  const userBalances = await CIVVaultGetter.methods.getUserBalances(poolId, address).call();
  const claimableGuaranteeTokens = await CIVVaultGetter.methods.getClaimableGuaranteeToken(poolId, address).call();

  const safeCall = async (promise) => {
    try {
      const result = await promise;
      return result;
    } catch (error) {
      return null;
    }
  };

  const [userInfoEpoch, epochInfo, epochInfo1, strategyInfo, allowedDeposit, unclaimedTokens] = await Promise.all([
    safeCall(CIVVault.methods.getUserInfoEpoch(poolId, address, currentEpoch).call()),
    safeCall(CIVVault.methods.getEpochInfo(poolId, currentEpoch).call()),
    safeCall(currentEpoch > 0 ? CIVVault.methods.getEpochInfo(poolId, currentEpoch - 1).call() : null),
    safeCall(CIVVault.methods.getStrategyInfo(poolId).call()),
    safeCall(CIVVaultGetter.methods.getAllowedDeposit(poolId, address).call()),
    safeCall(CIVVaultGetter.methods.getUnclaimedTokens(poolId, address).call()),
  ]);

  const depositedVault = epochInfo? epochInfo[1] : 0;
  const depositedPool = epochInfo1 && userBalances ? userBalances[1] * epochInfo1[3] / (10 ** 18) : 0;
  const claimableWithdraw = unclaimedTokens || 0;
  const strategyCapacity = 0;
  const maxDeposits = strategyInfo ? strategyInfo[5] : 0;
  const residualCapacity = 0;
  const curDepositEpoch = currentEpoch || 0;
  const depositAmounts = userInfoEpoch ? userInfoEpoch[0] : 0;
  const withdrawAmounts = userInfoEpoch ? userInfoEpoch[1] : 0;
  const lockPeriod = strategyInfo ? strategyInfo[9] : 0;
  const epochDuration = epochInfo ? epochInfo[8] : 0;
  const claimableGuaranteeAmount = claimableGuaranteeTokens || 0;
  const allowed = allowedDeposit || 0;
  const epochStartTime = epochInfo ? epochInfo[6] : 0;

  const representToken = strategyInfo ? strategyInfo[2] : '';
  const representTokenContract = new web3.eth.Contract(ERC20MinimalAbi, representToken);
  const representTokenSupply = await representTokenContract.methods.totalSupply().call();

  return {
    depositedVault, // amount pending on Vault
    depositedPool, // amount succesfully invested
    claimableWithdraw, // claimable withdrawed tokens
    strategyCapacity,
    residualCapacity,
    curDepositEpoch,
    depositAmounts,
    withdrawAmounts,
    maxDeposits,
    lockPeriod,
    epochDuration,
    claimableGuaranteeAmount,
    representTokenSupply,
    allowed,
    epochStartTime,
    userBalances
  };
};

module.exports = { getV2PairInfoWeb3, getV3PairInfoWeb3, getVaultInfo , getArbGMXPool};
