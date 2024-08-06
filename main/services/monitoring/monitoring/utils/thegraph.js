const getThegraphOrderbookApiUrlv2 = (name = null) => {
  if (name === "decentrastates") {
    return 'https://api.thegraph.com/subgraphs/name/decentrastates/uniswap-v2-subgraph';
  } else {
    return 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2';
  }
};

const getThegraphOrderbookApiUrl = (chainId) => {
  // return "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";
  if (chainId == '1') {
    return 'https://gateway-arbitrum.network.thegraph.com/api/2766a0939ac6d47da98e1752000cca5f/subgraphs/id/HUZDsRpEVP2AvzDCyzDHtdc64dyDxx8FQjzsmqSg4H3B';
  } else if (chainId == '4') {
    return 'https://api.thegraph.com/subgraphs/name/kennie-stacktrek/uniswap-v3-rinkeby';
  } else if (chainId == '42') {
    return 'https://api.thegraph.com/subgraphs/name/fibofinance/uniswap-v3-kovan';
  } else if (chainId == '137') {
    return 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon';
  } else if (chainId == '80001') {
    return 'https://api.thegraph.com/subgraphs/name/kennie-stacktrek/uniswap-v3-mumbai';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

const getThegraphOrderbookApiUrl_quickSwap = (chainId) => {
  if (chainId === '137') {
    return 'https://api.thegraph.com/subgraphs/name/proy24/quickswap-polygon';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

const getThegraphOrderbookApiUrlv2_traderJoe = (chainId) => {
  if (chainId === '43114') {
    return 'https://api.thegraph.com/subgraphs/name/traderjoe-xyz/exchange';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

const getThegraphOrderbookApiUrlv2_spookySwap = (chainId) => {
  if (chainId === '250') {
    return 'https://api.thegraph.com/subgraphs/name/eerieeight/spookyswap';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

module.exports = {
  getThegraphOrderbookApiUrl,
  getThegraphOrderbookApiUrlv2,
  getThegraphOrderbookApiUrl_quickSwap,
  getThegraphOrderbookApiUrlv2_traderJoe,
  getThegraphOrderbookApiUrlv2_spookySwap,
};
