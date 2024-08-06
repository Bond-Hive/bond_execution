const {
  createUniswapQueryClient,
  createUniswapV2QueryClient,
} = require('./thegraphClient.js');

const getPositionInfo = async function (chainId, positionId) {
  const client = createUniswapQueryClient(chainId);
  const getPosition = `
	    {
		  position(id: "${positionId}") {
			id
			owner
			liquidity
			pool {
			  token0Price
			  token1Price
			  tick
			  token0 {
				symbol
			  }
			  feeGrowthGlobal0X128
			  feeGrowthGlobal1X128
			  poolDayData(orderBy: date, orderDirection: desc, first: 1) {
				volumeUSD
			  }
			  token1 {
				symbol
			  }
			}
			feeGrowthInside0LastX128
			feeGrowthInside1LastX128
			tickLower {
			  feeGrowthOutside1X128
			  feeGrowthOutside0X128
			  tickIdx
			}
			tickUpper {
			  feeGrowthOutside0X128
			  feeGrowthOutside1X128
			  tickIdx
			}
			token0 {
			  symbol
			  decimals
			}
			token1 {
			  symbol
			  decimals
			}
		  }
	    }`;
  const { data, error } = await client.query(getPosition).toPromise();

  if (error) {
    // Handle the CombinedError object
    if (error.name === 'CombinedError') {
      throw new Error(`CombinedError: ${JSON.stringify(error.graphQLErrors)}`);
    } else {
      throw new Error(JSON.stringify(error));
    }
  }

  return data.position;
};

async function getDailyPairInfo(chainId, poolId) {
  const client = createUniswapV2QueryClient(chainId);
  const query = `
	{
		pairDayDatas(
			where: {pairAddress: "${poolId}"}
			orderBy: date
			orderDirection: desc
			first: 1
		) {
			dailyVolumeUSD
			date
		}
	}`;

  const { data, error } = await client.query(query).toPromise();
  if (error) throw new Error(JSON.stringify(error));
  return data.pairDayDatas;
}

async function getHourlyPairInfo(chainId, poolId) {
  const client = createUniswapV2QueryClient(chainId);
  const query = `
	  {
		pairHourDatas(
		  where: {pair: "${poolId}"}
		  first: 1
		  orderBy: hourStartUnix
		  orderDirection: desc
		) {
		  hourlyVolumeUSD
		  reserveUSD
		  hourStartUnix
		}
	  }
	  `;

  const { data, error } = await client.query(query).toPromise();
  if (error) throw new Error(JSON.stringify(error));
  return data.pairHourDatas;
}

let subgraph = null;
let lastValue = null;

async function getPairInfo(chainId, poolId) {
  const client = createUniswapV2QueryClient(subgraph);
  const query = `
	{
		pair(id: "${poolId}") {
			reserve0
			reserve1
			totalSupply
			token0Price
			token1Price
			token1 {
				symbol
			}
			token0 {
				symbol
			}
		}
	}`;

  const { data, error } = await client.query(query).toPromise();
  if (error) throw new Error(JSON.stringify(error));
  if (Number(data.pair.reserve0) === lastValue) {
    if (subgraph === "decentrastates") {
      subgraph = null;
    } else subgraph = "decentrastates";
    const newClient = createUniswapV2QueryClient(subgraph);
    const { data, error } = await newClient.query(query).toPromise();
    if (error) throw new Error(JSON.stringify(error));
    lastValue = Number(data.pair.reserve0);
    return data.pair;
  } else {
    lastValue = Number(data.pair.reserve0);
    return data.pair;
  }
}

const getPool = async function (chainId, poolAddress) {
  const client = createUniswapQueryClient(chainId);
  let pool = [];
  poolAddress = poolAddress.toLowerCase();

  const getPool = `
	  {
		pools(where: {id: "${poolAddress}"}) {
		  id
		  token0 {
			id
			decimals
			name
			symbol
		  }
		  token1 {
			id
			decimals
			name
			symbol
		  }
		  feeTier
		  sqrtPrice
		  token0Price
		  token1Price
		  tick
		  liquidity
		  volumeUSD
		  totalValueLockedUSD
		  txCount
		}
	  }
	  `;

  pool = await client.query(getPool).toPromise();

  if (pool.error !== undefined) {
    throw new Error(JSON.stringify(pool.error));
  }

  return pool.data.pools[0];
};

const getPoolVolume = async function (chainId, poolAddress, first = 2) {
  const client = createUniswapQueryClient(chainId);
  let pool = [];
  poolAddress = poolAddress.toLowerCase();

  const getPool = `
	  {
		poolDayDatas(
		  first: ${first}, 
		  orderBy: date,
		  orderDirection: desc,	
		  where: {
			  pool: "${poolAddress}"
			} ) 
		  {
		  date
		  token0Price
		  volumeToken0
		  volumeToken1
		  volumeUSD
		  feesUSD
		  txCount
		  tvlUSD
		}
	  }
	  `;

  pool = await client.query(getPool).toPromise();

  if (pool.error !== undefined) {
    throw new Error(JSON.stringify(pool.error));
  }

  return pool.data.poolDayDatas;
};

const getPoolsByTokens = async function (chainId, token0, token1) {
  const client = createUniswapQueryClient(chainId);
  const tokens = [token0.toLowerCase(), token1.toLowerCase()];
  const sortedTokens = tokens.sort();

  let pool = [];

  const getPool = `
	  {
		  pools(where: {token0: "${sortedTokens[0]}", token1: "${sortedTokens[1]}"}) {
			  id
			  token0 {
				  id
				  decimals
				  name
				  symbol
			  }
			  token1 {
				  id
				  decimals
				  name
				  symbol
			  }
			  feeTier
			  sqrtPrice
			  token0Price
			  token1Price
			  tick
			  volumeUSD
			  totalValueLockedUSD
		  }
	  }`;

  pool = await client.query(getPool).toPromise();

  if (pool.error !== undefined) {
    throw new Error(JSON.stringify(pool.error));
  }

  return pool.data.pools;
};

const getUniV3UnclaimedFeesQuery = async function (chainId, poolId) {
  const client = createUniswapQueryClient(chainId);
  const getTxn = `
	  {
		  positions(where: {id:"${poolId}"}) 
		  {
			  liquidity
			  token0 {symbol decimals} 
			  token1 {symbol decimals}
  
			  pool {
				  feeGrowthGlobal0X128
				  feeGrowthGlobal1X128
				  tick
			  }
  
			  tickLower {
				  feeGrowthOutside0X128
				  feeGrowthOutside1X128
				  tickIdx
			  }
			  tickUpper {
				  feeGrowthOutside0X128
				  feeGrowthOutside1X128
				  tickIdx
			  }
			
			  feeGrowthInside0LastX128
			  feeGrowthInside1LastX128
		  }
	  }`;

  let result = await client.query(getTxn).toPromise();

  if (result.error !== undefined) {
    throw new Error(JSON.stringify(result.error));
  }

  return result.data.positions[0];
};

module.exports = {
  getPool,
  getPoolsByTokens,
  getPoolVolume,
  getPositionInfo,
  getUniV3UnclaimedFeesQuery,
  getPairInfo,
  getDailyPairInfo,
  getHourlyPairInfo
};
