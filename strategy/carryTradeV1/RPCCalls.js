const web3 = require("@solana/web3.js");

const solanaConnectionURL = process.env.QUICKNODE_API;

async function getTransactionDetails(transactionSignature) {
  // Use the environment variable for the connection
  const solana = new web3.Connection(solanaConnectionURL);
  const transactionResponse = await solana.getTransaction(
    transactionSignature,
    { maxSupportedTransactionVersion: 0 }
  );
  
  // Extract the first account key directly and return its string representation
  const firstAccountKey = transactionResponse.transaction.message.accountKeys[0].toString();
  return firstAccountKey;
}

module.exports = {
  getTransactionDetails,
};