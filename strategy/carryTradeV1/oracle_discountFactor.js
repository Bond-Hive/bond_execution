// Import necessary modules from stellar-sdk
const {
  Keypair,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
} = require("@stellar/stellar-sdk");

// Asynchronous function to execute transactions
async function executeOracleDiscountFactor({
  secretKey,
  rpcServerUrl,
  contractAddress,
  operationName,
  operationValue,
  operationValueType, // Parameter to specify the type of the value, e.g., "i128"
  transactionTimeout = 30, // Default timeout set to 30 seconds
}) {
  // Create a Keypair from the secret key provided
  const sourceKeypair = Keypair.fromSecret(secretKey);

  // Initialize the Soroban RPC server with the provided URL
  const server = new SorobanRpc.Server(rpcServerUrl);

  // Instantiate a contract using the provided address
  const contract = new Contract(contractAddress);

  // Retrieve the account information from the server
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

  // Convert the operation value to the required ScVal format with the specified type
  const operationVal = nativeToScVal(operationValue, { type: operationValueType });

  // Build the transaction
  let builtTransaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(operationName, operationVal))
    .setTimeout(transactionTimeout)
    .build();

  // Prepare the transaction on the server
  let preparedTransaction = await server.prepareTransaction(builtTransaction);
  preparedTransaction.sign(sourceKeypair);
  console.log(
    `Signed prepared transaction XDR: ${preparedTransaction.toEnvelope().toXDR("base64")}`,
  );

  // Send the transaction and handle responses
  try {
    let sendResponse = await server.sendTransaction(preparedTransaction);
    console.log(`Sent transaction: ${JSON.stringify(sendResponse)}`);

    if (sendResponse.status === "PENDING") {
      let getResponse = await server.getTransaction(sendResponse.hash);

      while (getResponse.status === "NOT_FOUND") {
        console.log("Waiting for transaction confirmation...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        getResponse = await server.getTransaction(sendResponse.hash);
      }

      // console.log(`getTransaction response: ${JSON.stringify(getResponse)}`);

      if (getResponse.status === "SUCCESS") {
        if (!getResponse.resultMetaXdr) {
          throw "Empty resultMetaXDR in getTransaction response";
        }
        let transactionMeta = getResponse.resultMetaXdr;
        let returnValue = transactionMeta.v3().sorobanMeta().returnValue();
        console.log(`Transaction Success result: ${returnValue.value()}`);
      } else {
        throw `Transaction failed: ${getResponse.resultXdr}`;
      }
    } else {
      throw sendResponse.errorResultXdr;
    }
  } catch (err) {
    console.log("Sending transaction failed");
    console.log(JSON.stringify(err));
  }
}

// Example usage
// executeTransaction({
//   secretKey: "SAYTIFZPLLX4BOIS3BCP6WGJC6JUGT2MZBSLVL5RN5NTBBQJPHWCM3XQ",
//   rpcServerUrl: "https://soroban-testnet.stellar.org:443",
//   contractAddress: "CA3W4KUEWIH5UFI7VKYOK43ZBQ3L7CCYRDASBTVXYVDDTRVENY4RQD3Q",
//   operationName: "set_discount",
//   operationValue: 105937583948376232,
//   operationValueType: "i128", // Specify the type as "i128"
// });


async function invokeFunction({
  secretKey,
  rpcServerUrl,
  contractAddress,
  operationName,
  transactionTimeout = 30, // Default timeout set to 30 seconds
}) {
  // Create a Keypair from the secret key provided
  const sourceKeypair = Keypair.fromSecret(secretKey);

  // Initialize the Soroban RPC server with the provided URL
  const server = new SorobanRpc.Server(rpcServerUrl);

  // Instantiate a contract using the provided address
  const contract = new Contract(contractAddress);

  // Retrieve the account information from the server
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

  // Convert the operation value to the required ScVal format with the specified type

  // Build the transaction
  let builtTransaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(operationName))
    .setTimeout(transactionTimeout)
    .build();

  // Prepare the transaction on the server
  let preparedTransaction = await server.prepareTransaction(builtTransaction);
  preparedTransaction.sign(sourceKeypair);
  console.log(
    `Signed prepared transaction XDR: ${preparedTransaction.toEnvelope().toXDR("base64")}`,
  );

  // Send the transaction and handle responses
  try {
    let sendResponse = await server.sendTransaction(preparedTransaction);
    console.log(`Sent transaction: ${JSON.stringify(sendResponse)}`);

    if (sendResponse.status === "PENDING") {
      let getResponse = await server.getTransaction(sendResponse.hash);

      while (getResponse.status === "NOT_FOUND") {
        console.log("Waiting for transaction confirmation...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        getResponse = await server.getTransaction(sendResponse.hash);
      }

      // console.log(`getTransaction response: ${JSON.stringify(getResponse)}`);

      if (getResponse.status === "SUCCESS") {
        if (!getResponse.resultMetaXdr) {
          throw "Empty resultMetaXDR in getTransaction response";
        }
        let transactionMeta = getResponse.resultMetaXdr;
        let returnValue = transactionMeta.v3().sorobanMeta().returnValue();
        console.log(`Transaction Success result: ${JSON.stringify(returnValue.value())}`);
        // Extract the value of _value properties
        // const hiValue = returnValue.value()._attributes.hi._value;
        const hiValue = BigInt(returnValue.value()._attributes.hi._value);
        const loValue = BigInt(returnValue.value()._attributes.lo._value);
        // console.log("hiValue:", hiValue);
        // console.log("loValue:", loValue);

        return loValue;
        
      } else {
        throw `Transaction failed: ${getResponse.resultXdr}`;
      }
    } else {
      throw sendResponse.errorResultXdr;
    }
  } catch (err) {
    console.log("Sending transaction Failed");
    console.log(JSON.stringify(err));
  }
}


module.exports = { 
  executeOracleDiscountFactor,
  invokeFunction
};