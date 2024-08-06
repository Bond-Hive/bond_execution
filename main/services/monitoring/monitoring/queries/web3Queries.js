const Web3 = require('web3');
const fetch = require('node-fetch');
const { ethers } = require('ethers');
const BigNumber = require('bignumber.js');
const puppeteer = require('puppeteer');
const makeBatchRequest = require('web3-batch-request').makeBatchRequest;
const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

// ABI imports
const uniV2contractABI = require('./abi/uniV2Pair.json');
const uniV3contractABI = require('./abi/uniV3Pool.json');
const arbGmxContractABI = require('./abi/arbGmxPair.json');
const arbGmxReaderABI = require('./abi/arbGmxReader.json');
const uniV3PositionManagerABI = require('./abi/uniV3PositionManager.json');
const CivVaultABI = require('./abi/CIVVault.json');
const newCivVaultABI = require('./abi/NewCIVVault.json');
const CivVaultGetterABI = require('./abi/CIVVault-Getter.json');
const newCivVaultGetterABI = require('./abi/NewCIVVault-Getter.json');

// Constants
const NFT_POSITION_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const VAULT_GETTER_SEPOLIA = '0x89DeDB0F927A4eC8bd2BCf4E89DFaF42aFB45f09';
const VAULT_GETTER_MAINNET = '0xD0C5F2Ba7aDcf7fBE6960cEc38EA1DE3Ebbc22c3';
const VAULT_GETTER_ARBITRUM = '0x625d2234b0ae7C0C6F47702837F87eD13AC99a17';
const VAULT_SEPOLIA = '0x451D7B420EcB7E835D87081ce8824c0f95Ec5fcE';
const VAULT_MAINNET = '0x9E0B1749f6f41fF0e463F92516fD52aA53B31628';
const VAULT_ARBITRUM = '0x44315018b7c161aac2831C32b384141CDE0228b4';

// Singleton web3 instances
const web3Instances = {
  '1': new Web3('https://mainnet.infura.io/v3/1544f9072d5c4d77bdac629592a4b14c'),
  '42161': new Web3('https://arbitrum-mainnet.infura.io/v3/1544f9072d5c4d77bdac629592a4b14c'),
  '11155111': new Web3('https://sepolia.infura.io/v3/1544f9072d5c4d77bdac629592a4b14c'),
  '137': new Web3('https://polygon-mainnet.infura.io/v3/1544f9072d5c4d77bdac629592a4b14c')
};

const safeCall = async (contract, method, args) => {
  try {
    const result = await contract.methods[method](...args).call();
    return result;
  } catch (error) {
    console.error(`Failed call: ${method} with args: ${args}`, error);
    return null;
  }
};

// sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to get V2 pair info
const getV2PairInfoWeb3 = async function (contractAddress, decimalsToken0, decimalsToken1, decimalsTokenLP, chainId = null) {
  const web3 = web3Instances[chainId || '1'];
  if (!web3) throw new Error('ChainId not supported with Infura');

  const contract = new web3.eth.Contract(uniV2contractABI, contractAddress);
  const reserves = await safeCall(contract, 'getReserves', []);
  const totalSupply = await safeCall(contract, 'totalSupply', []);

  const token0Price = (reserves.reserve1 / (10 ** decimalsToken1)) / (reserves.reserve0 / (10 ** decimalsToken0));
  const token1Price = (reserves.reserve0 / (10 ** decimalsToken0)) / (reserves.reserve1 / (10 ** decimalsToken1));
  const reserve0 = Number(reserves.reserve0 / (10 ** decimalsToken0));
  const reserve1 = Number(reserves.reserve1 / (10 ** decimalsToken1));
  const totalSupplyNormalized = Number(totalSupply / (10 ** decimalsTokenLP));

  return {
    reserve0,
    reserve1,
    token0Price,
    token1Price,
    totalSupply: totalSupplyNormalized
  };
};

// Function to get Arb GMX pool info
const getArbGMXPool = async function (contractAddress, dataStoreAddress, lpToken0symbol, decimalsToken0, precisionToken0, decimalsToken1, precisionToken1, decimalsTokenLP, max = true) {
  const web3 = web3Instances['42161'];
  if (!web3) throw new Error('ChainId not supported with Infura');
  const apiURL = 'https://arbitrum-api.gmxinfra.io/prices/tickers';

  // Fetch prices from the API
  const response = await fetch(apiURL);
  const signedPrices = await response.json();

  const contractToken0 = new web3.eth.Contract(arbGmxReaderABI, "0x60a0fF4cDaF0f6D496d71e0bC0fFa86FE8E6B23c");
  const readerMarket = await safeCall(contractToken0, 'getMarket', [dataStoreAddress, contractAddress]);

  // Update prices dynamically based on API response
  const market = [readerMarket.marketToken, readerMarket.indexToken, readerMarket.longToken, readerMarket.shortToken];
  const indexTokenPrice = findAndFormatPrice(readerMarket.indexToken, signedPrices, decimalsToken0, precisionToken0);
  const longTokenPrice = findAndFormatPrice(readerMarket.longToken, signedPrices, decimalsToken0, precisionToken0);
  const shortTokenPrice = findAndFormatPrice(readerMarket.shortToken, signedPrices, decimalsToken1, precisionToken1);
  const pnlFactorType = hashString("MAX_PNL_FACTOR_FOR_TRADERS");
  const maximize = false;

  const readerResultRaw = await safeCall(contractToken0, 'getMarketTokenPrice', [
    dataStoreAddress,
    market,
    indexTokenPrice,
    longTokenPrice,
    shortTokenPrice,
    pnlFactorType,
    maximize
  ]);

  const readerResult = readerResultRaw["1"];
  const gmxcontractPool = new web3.eth.Contract(arbGmxContractABI, contractAddress);
  const gmxPoolTotalSupply = await safeCall(gmxcontractPool, 'totalSupply', []);

  const reserve0 = Number(readerResult.longTokenAmount / (10 ** decimalsToken0));
  const reserve1 = Number(readerResult.shortTokenAmount / (10 ** decimalsToken1));
  const token0Price = (readerResult.longTokenUsd / (10 ** Number(30))) / reserve0;
  const token1Price = (readerResult.shortTokenUsd / (10 ** 30)) / reserve1;
  const totalSupplyNormalized = Number(gmxPoolTotalSupply / (10 ** decimalsTokenLP));
  const totalUSDValue = Number(readerResult.poolValue / (10 ** Number(30))) + Number(readerResult.netPnl / (10 ** 30));
  const getLongPnl = (await safeCall(contractToken0, 'getPnl', [dataStoreAddress, market, indexTokenPrice, true, maximize])) / 10 ** 30;
  const getShortPnl = (await safeCall(contractToken0, 'getPnl', [dataStoreAddress, market, indexTokenPrice, false, maximize])) / 10 ** 30;
  let shortPnLForNetPosition = getShortPnl < 0 ? 0 : getShortPnl;
  let longPnLForNetPosition = getLongPnl < 0 ? 0 : getLongPnl;

  let priceOfToken = readerResultRaw["0"] / 10 ** 30 - shortPnLForNetPosition / totalSupplyNormalized - longPnLForNetPosition / totalSupplyNormalized;

  return {
    reserve0,
    reserve1,
    token0Price,
    token1Price,
    priceOfToken,
    totalSupply: totalSupplyNormalized
  };
};

async function fetchTotalJLPSupply(tokenAddress) {
  try {
    let url = "https://mainnet.helius-rpc.com/?api-key=23001055-1018-409e-b21d-149827ab767c";
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getTokenSupply',
        params: [
          tokenAddress
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { result } = await response.json();
    return Number(result.value.amount/10**6);
  } catch (e) {
    console.log('Failed to fetchTotalJLPSupply:', e);
    // console.error('Failed to fetch assets by owner:', e);
    return []; // Return an empty array in case of error
  }
};

// Function to get JLP token info
const getJLPToken = async function (contractAddress, dataStoreAddress, lpToken0symbol, decimalsToken0, precisionToken0, decimalsToken1, precisionToken1, decimalsTokenLP, max = true) {
  let priceOfToken = (await getJLPPrice("JLP"));
  // console.log("priceOfToken",priceOfToken);
  return {
    reserve0: 1,
    reserve1: 1,
    token0Price: 1,
    token1Price: 1,
    priceOfToken: priceOfToken,
    totalSupply: 1
  };
};

async function getJLPPrice() {
  const poolData = await getJLP_aumUsd('5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq');
  const totalSupply = await fetchTotalJLPSupply("27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4")
  return poolData/10**6/totalSupply;
}

// // Function to get JLP price
// async function getJLPPrice(symbols) {
//   let url = "https://mainnet.helius-rpc.com/?api-key=09c31702-baf8-4c03-bb89-2e51f5887bee";
//   try {
//     const response = await fetch(url, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         jsonrpc: '2.0',
//         id: 'my-id',
//         method: 'getAssetsByOwner',
//         params: {
//           ownerAddress: '8gKZYvn6Dk5A5TUzqaNVfWgQHw4EvGTo6ySp2CvSjBR8',
//           page: 1,
//           limit: 1000,
//           displayOptions: {
//             showFungible: true
//           }
//         },
//       }),
//     });

//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const { result } = await response.json();
//     return result.items.filter(item =>
//       item.interface === 'FungibleToken' && symbols.includes(item.token_info.symbol)
//     ).map(item => ({
//       symbol: item.token_info.symbol === 'WBTC' ? 'BTC' : item.token_info.symbol, // Translate 'WBTC' to 'BTC'
//       usdTotalBalance: item.token_info.balance / Math.pow(10, item.token_info.decimals) * item.token_info.price_info.price_per_token,
//       usdPrice: item.token_info.price_info.price_per_token
//     }));
//   } catch (e) {
//     console.error('Failed to fetch assets by owner:', e);
//     return []; // Return an empty array in case of error
//   }
// };

// Function to find and format price data without decimals

async function fetchPoolData(accountAddress) {
  const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=23001055-1018-409e-b21d-149827ab767c", "confirmed");
  const publicKey = new PublicKey(accountAddress);
  try {
    const accountInfo = await connection.getAccountInfo(publicKey);
    if (accountInfo) {
      const buffer = accountInfo.data;
      const data = parsePoolData(buffer);
      fs.writeFileSync('pool_data.json', JSON.stringify(data, null, 2));
      return data;
    } else {
      console.log('No account info found.');
      return null;
    }
  } catch (err) {
    console.error('Error fetching account info:', err);
    return null;
  }
}

function parsePoolData(buffer) {
  let offset = 8;

  // Reads string by first determining the length from the buffer
  function readString(buffer, offset) {
    const length = 4;
    return buffer.toString('utf8', offset + 4, offset + 4 + length);
  }

  function readPublicKey(buffer, offset) {
    return new PublicKey(buffer.slice(offset, offset + 32)).toString();
  }

  function readU128(buffer, offset) {
    const low = buffer.readBigUInt64LE(offset);
    const high = buffer.readBigUInt64LE(offset + 8);
    return (high << 64n | low).toString();
  }

  function scanForU128Values(buffer, startOffset, count) {
    console.log("Scanning for potential u128 values...");
    for (let offset = startOffset; offset < startOffset + count; offset++) {
        try {
            const value = readU128(buffer, offset);
            console.log(`Potential u128 at offset ${offset}: ${value}`);
        } catch (e) {
            console.log(`Error reading u128 at offset ${offset}: ${e.message}`);
        }
    }
  }

  function readI64(buffer, offset) {
    return buffer.readBigInt64LE(offset).toString();
  }

  function readU8(buffer, offset) {
    return buffer.readUInt8(offset);
  }

  function readPublicKeyArray(buffer, offset, count) {
    let keys = [];
    for (let i = 0; i < count; i++) {
      const key = new PublicKey(buffer.slice(offset, offset + 32)).toString();
      keys.push(key);
      offset += 32; // Move to the next key
    }
    return keys;
  }

  const data = {
    name: readString(buffer, offset),
    custodies: readPublicKeyArray(buffer, offset += 12, 5),  // Assume 5 custodies, adjusting offset after the name
    aumUsd: readU128(buffer, offset +=160),
  };

  return data;
}

async function getJLP_aumUsd() {
  const accountAddress = '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';
  const poolData = await fetchPoolData(accountAddress);
  return poolData.aumUsd;
}

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
  await page.goto('https://app.gmx.io/#/pools', { waitUntil: 'networkidle2' });

  const selector = '#root > div > div.App > div > div.default-container.page-layout > div.GMList > div.token-grid > div:nth-child(3) > div.App-card-content > div:nth-child(2) > div:nth-child(2)'; // change div:nth-child(3) to different asset if change in FE
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
  const web3 = web3Instances[chainId];
  if (!web3) throw new Error('ChainId not supported with Infura');

  const V3PoolContract = new web3.eth.Contract(uniV3contractABI, contractAddress);
  const NFTPositionManagerContract = new web3.eth.Contract(uniV3PositionManagerABI, NFT_POSITION_MANAGER);

  const feeGrowthGlobal0X128Results = await safeCall(V3PoolContract, 'feeGrowthGlobal0X128', []);
  const feeGrowthGlobal1X128Results = await safeCall(V3PoolContract, 'feeGrowthGlobal1X128', []);
  const slot0 = await safeCall(V3PoolContract, 'slot0', []);
  const ticksLower = await safeCall(V3PoolContract, 'ticks', [tickLower]);
  const ticksUpper = await safeCall(V3PoolContract, 'ticks', [tickUpper]);
  const positions = await safeCall(NFTPositionManagerContract, 'positions', [positionId]);

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
  const feeGrowthInside0LastX128 = positions.feeGrowthInside0LastX128;
  const feeGrowthInside1LastX128 = positions.feeGrowthInside1LastX128;
  const liquidity = Number(positions.liquidity);

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
};


const getVaultInfo = async (chainId, poolId, address) => {
  const web3 = web3Instances[chainId];
  if (!web3) throw new Error('ChainId not supported with Infura');

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

  const CIVVault = new web3.eth.Contract(chainId === '42161' ? newCivVaultABI : CivVaultABI, chainId === '1' ? VAULT_MAINNET : chainId === '11155111' ? VAULT_SEPOLIA : VAULT_ARBITRUM);
  const CIVVaultGetter = new web3.eth.Contract(chainId === '42161' ? newCivVaultGetterABI : CivVaultGetterABI, chainId === '1' ? VAULT_GETTER_MAINNET : chainId === '11155111' ? VAULT_GETTER_SEPOLIA : VAULT_GETTER_ARBITRUM);
  await sleep(500);

  // Get currentEpoch first
  const currentEpoch = await safeCall(CIVVault, 'getCurrentEpoch', [poolId]);
  if (currentEpoch === null) {
    throw new Error('Failed to get currentEpoch');
  }
  await sleep(500);

  const calls = [
    chainId === '42161' ? null : { ethCall: CIVVaultGetter.methods.getClaimableGuaranteeToken(poolId, address).call, onError: null, onSuccess: null },
    { ethCall: CIVVault.methods.getUserInfoEpoch(poolId, address, currentEpoch).call, onError: null, onSuccess: null },
    { ethCall: CIVVault.methods.getEpochInfo(poolId, currentEpoch).call, onError: null, onSuccess: null },
    currentEpoch > 0 ? { ethCall: CIVVault.methods.getEpochInfo(poolId, currentEpoch - 1).call, onError: null, onSuccess: null } : null,
    { ethCall: CIVVault.methods.getStrategyInfo(poolId).call, onError: null, onSuccess: null },
    {
      ethCall: CIVVaultGetter.methods.getUnclaimedTokens(poolId, address).call, onError: null, onSuccess: null
    },
    { ethCall: CIVVaultGetter.methods.getUserBalances(poolId, address).call, onError: null, onSuccess: null }
  ];

  const results = await makeBatchRequest(web3, calls, { allowFailures: true, verbose: false });

  if (!results) {
    throw new Error('Batch request failed');
  }
  
  let formattedResults = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      formattedResults.push(result.value);
    } else {
      formattedResults.push(null);
    }
  }

  // Ensure results are mapped correctly
  const [
    claimableGuaranteeTokens,
    userInfoEpoch,
    epochInfo,
    epochInfo1,
    strategyInfo,
    unclaimedTokens,
    userBalances
  ] = formattedResults;

  const depositedVault = epochInfo ? epochInfo[1] : 0;
  let representTokenIndex = chainId === '42161' ? 0 : 1;
  const netVPSIndex = chainId === '42161' ? 4 : 3;
  const depositedPool = epochInfo1 && userBalances ? userBalances[representTokenIndex] * epochInfo1[netVPSIndex] / (10 ** 18) : 0;
  const claimableWithdraw = unclaimedTokens || 0;
  const strategyCapacity = 0;
  const maxDepositsIndex = chainId === '42161' ? 4 : 5;
  const maxDeposits = strategyInfo ? strategyInfo[maxDepositsIndex] : 0;
  const residualCapacity = 0;
  const curDepositEpoch = currentEpoch || 0;
  const depositAmounts = userInfoEpoch ? userInfoEpoch[0] : 0;
  const withdrawAmountsIndex = chainId === '42161' ? 2 : 1;
  const withdrawAmounts = userInfoEpoch ? userInfoEpoch[withdrawAmountsIndex] : 0;
  const lockPeriod = chainId === '42161' ? 0 : strategyInfo ? strategyInfo[9] : 0;
  const epochDuration = epochInfo ? chainId === '42161' ? epochInfo[11] : epochInfo[8] : 0;
  const claimableGuaranteeAmount = claimableGuaranteeTokens || 0;
  const epochStartTimeIndex = chainId === '42161' ? 7 : 6;
  const epochStartTime = epochInfo ? epochInfo[epochStartTimeIndex] : 0;
  representTokenIndex = chainId === '42161' ? 1 : 2;
  const representToken = strategyInfo ? strategyInfo[representTokenIndex] : '';
  const representTokenContract = new web3.eth.Contract(ERC20MinimalAbi, representToken);
  await sleep(500);
  const representTokenSupply = await safeCall(representTokenContract, 'totalSupply', []);

  return {
    depositedVault, // amount pending on Vault
    depositedPool, // amount successfully invested
    claimableWithdraw, // claimable withdrawn tokens
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
    epochStartTime,
    userBalances
  };
};

module.exports = { getV2PairInfoWeb3, getV3PairInfoWeb3, getVaultInfo, getArbGMXPool, getJLPToken };
