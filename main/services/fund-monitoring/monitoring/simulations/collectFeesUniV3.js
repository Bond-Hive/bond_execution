const { ethers } = require('ethers');
const positionManagerABI = require('./positionManagerABI.json')
require('dotenv').config()

// Infura provider setup

const provider = new ethers.InfuraProvider('mainnet', 'b165ca4a2a7f4583bebae070d32e8f43');
const wallet = new ethers.Wallet('PRIVATE_KEY', provider);

// UniswapV3 NonfungiblePositionManager contract details
const NonfungiblePositionManager = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

// Express route
//app.get('/simulateCollect', async (req, res) => {
const getSimulation = async () => {
  try {
    // Create a contract instance
    const contract = new ethers.Contract(NonfungiblePositionManager, positionManagerABI, wallet);

    // Define inputs for the collect method
    const params = {
      tokenId: 601910,
      recipient: '0x6423cf260c13775F9F9F1263CDc527Aaf80aFfaC',
      amount0Max: '26769679837837992899',
      amount1Max: '177652874494839047'
    };

    // Simulate the transaction (use callStatic for simulation)
    const response = await contract.collect.staticCall(params);

    // Return the response
    console.log(response);
  } catch (error) {
    console.error(error);
  }
};

getSimulation();