const nativeToken = function(chainId) {
  if (chainId === '1') {
    return 'ETH';
  } else if (chainId === '4') {
    return 'rETH';
  } else if (chainId === '42') {
    return 'kETH';
  } else if (chainId === '137') {
    return 'MATIC';
  } else if (chainId === '80001') {
    return 'mMATIC';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

const nativeAddress = function(chainId) {
  if (chainId === '1') {
    return '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  } else if (chainId === '4') {
    return '0xc778417E063141139Fce010982780140Aa0cD5Ab';
  } else if (chainId === '42') {
    return '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
  } else if (chainId === '137') {
    return '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
  } else if (chainId === '80001') {
    return '0x9c3c9283d3e44854697cd22d3faa240cfb032889';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

const nativeUsdToken = function(chainId) {
  if (chainId === '1') {
    return '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  } else if (chainId === '4') {
    return '0xc7ad46e0b8a400bb3c915120d284aafba8fc4735';
  } else if (chainId === '42') {
    return '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa';
  } else if (chainId === '137') {
    return '0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
  } else if (chainId === '80001') {
    return '0x9c3c9283d3e44854697cd22d3faa240cfb032889';
  } else {
    throw new Error(`Unsupported Network: ${chainId}`);
  }
};

module.exports = {
  nativeToken,
  nativeAddress,
  nativeUsdToken,
};
