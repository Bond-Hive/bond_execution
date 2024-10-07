const ethers = require('ethers');
const bhContractABI = require('./abi/bhVault.json');
const rpcServerUrl= "https://rpc.testnet.soniclabs.com";

const bhVaultGetQuote = async (rpcServerUrl,contractAddress, productId) => {
  try {
    let provider = new ethers.providers.JsonRpcProvider(rpcServerUrl);
    const tokenContract = new ethers.Contract(contractAddress, bhContractABI, provider);

    // Fetching the quote for the specified product
    let quote = await tokenContract.quote(productId);
    console.log(`Current quote for product ${productId}:`, quote.toString());
    return quote.toString();
  } catch (error) {
    console.error('Error in bhVaultGetQuote:', error.message);
  }
};

// Example usage: getting the quote for product ID 1
// bhVaultGetQuote(rpcServerUrl,"0xC4644426C7a68f4D3Ec9fb78b3F0A74f420f1DB6", "4");

const bhVaultSetQuote = async (secretKey,rpcServerUrl,contractAddress,productId,operationValue) => {

  try {
    let provider = new ethers.providers.JsonRpcProvider(rpcServerUrl);

    // You need to have a signer, which is usually derived from a wallet with a private key
    const wallet = new ethers.Wallet(secretKey, provider);
    const tokenContract = new ethers.Contract(contractAddress, bhContractABI, wallet);

    // Setting a new quote
    const setQuoteTx = await tokenContract.setQuote(productId, operationValue);
    return "Txn sent"
  } catch (error) {
    console.error('Error in bhVaultSetQuote:', error.message);
  }
};

// Example usage: setting the quote for product ID 1 to a new amount (e.g., 100)
// bhVaultSetQuote(process.env.SONIC_TESTNET_WALLET,rpcServerUrl,"0xC4644426C7a68f4D3Ec9fb78b3F0A74f420f1DB6", "4", "10155217920688995");


const bhVaultInitializeProduct = async (rpcServerUrl, secretKey, contractAddress, productParams) => {
  try {
    let provider = new ethers.providers.JsonRpcProvider(rpcServerUrl);
    const wallet = new ethers.Wallet(secretKey, provider);
    const tokenContract = new ethers.Contract(contractAddress, bhContractABI, wallet);

    // Destructuring the product parameters for easier use
    const { bondName, bondSymbol, token, admin, startTime, endTime, quotePeriod, treasury, minDeposit } = productParams;

    // Initialize a new product
    const tx = await tokenContract.initializeProduct({
      bondName,
      bondSymbol,
      token,
      admin,
      startTime,
      endTime,
      quotePeriod,
      treasury,
      minDeposit
    });

    console.log("Initializing new product transaction:", tx);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction receipt:", receipt);
  } catch (error) {
    console.error('Error in bhVaultInitializeProduct:', error.message);
  }
};

// Example product parameters
const productParams = {
  token: '0xC1799cB8908174F264b5d9B0dE52C8A09d32DaB4',
  admin: '0x4C9D2bA4589A426452c0929CC6f40dA0a378e184',
  startTime: 1727886071, // current time in seconds 
  endTime: 1743148800,
  quotePeriod: 300, // 5 mins
  treasury: '0x4C9D2bA4589A426452c0929CC6f40dA0a378e184',
  minDeposit: 100, // minimum deposit amount
  bondName: 'btc_mar25',
  bondSymbol: 'BHive',
};

// Example usage: initializing a product with the given parameters
// bhVaultInitializeProduct(rpcServerUrl,process.env.SONIC_TESTNET_WALLET,"0xC4644426C7a68f4D3Ec9fb78b3F0A74f420f1DB6", productParams);

const depositIntoVault = async (rpcServerUrl, secretKey, contractAddress, productId, amount, expectedQuote) => {
  try {
    let provider = new ethers.providers.JsonRpcProvider(rpcServerUrl);
    const wallet = new ethers.Wallet(secretKey, provider);
    const contract = new ethers.Contract(contractAddress, bhContractABI, wallet);

    console.log(`Attempting to deposit ${amount} tokens into product ${productId}...`);

    // Perform the deposit transaction
    const tx = await contract.deposit(productId, amount, expectedQuote);
    console.log("Deposit transaction sent:", tx);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction receipt:", receipt);
  } catch (error) {
    console.error('Error depositing into the vault:', error.message);
  }
};

// Example usage:
// Replace 'your-private-key-here', 'product-id', 'amount', and 'expectedQuote' with actual values
// depositIntoVault(rpcServerUrl,process.env.SONIC_TESTNET_WALLET,"0xC4644426C7a68f4D3Ec9fb78b3F0A74f420f1DB6", "2", "100000000", "10404");

module.exports = {
  bhVaultGetQuote,
  bhVaultSetQuote
};