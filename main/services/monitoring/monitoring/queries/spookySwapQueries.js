const {createSpookySwapQueryClient} = require('./thegraphClient.js');

const getLPPoolBalance_spookySwap = async function(chainId, pairAddress, ownerWallet) {
  const client = createSpookySwapQueryClient(chainId);
  
  const getPositionQuery = `
	{
	  liquidityPositions(
		where: {pair: "${pairAddress}", user: "${ownerWallet}"}
	  ) {
		id
		liquidityTokenBalance
		pair {
		  totalSupply
		  id
		  reserveUSD
		  token1Price
		}
	  }
	}`;
  const getPosition = await client.query(getPositionQuery).toPromise();
  if (getPosition.error !== undefined) {
    throw new Error(JSON.stringify(getPosition.error));
  }
  const calculationData = getPosition['data']['liquidityPositions'][0];
  return calculationData;
};
  

module.exports = {
  getLPPoolBalance_spookySwap,
};
