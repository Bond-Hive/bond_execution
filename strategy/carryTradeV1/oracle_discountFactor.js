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

var StellarSdk = require("stellar-sdk");

// Asynchronous function to execute transactions
async function executeOracleDiscountFactor({
  secretKey,
  rpcServerUrl,
  contractAddress,
  operationName,
  operationValue,
  operationValueType, // Parameter to specify the type of the value, e.g., "i128"
  transactionTimeout = 30, // Default timeout set to 30 seconds
  network
}) {
  let retryLimit = 15; // Number of retries
  let retries = 0;

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

  // Check if the network is valid
  if (network !== "testnet" && network !== "publicnet") {
   throw new Error("Invalid network type. Please specify 'testnet' or 'publicnet'.");
  }
  let networkPassphrase = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

  console.log("networkPassphrase",networkPassphrase);
  // Build the transaction
  let builtTransaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase,
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

      while (getResponse.status === "NOT_FOUND" && retries < retryLimit) {
        console.log("Waiting for transaction confirmation...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        getResponse = await server.getTransaction(sendResponse.hash);
        retries++; // Increment the retry counter
      }

      if (retries >= retryLimit) {
        console.log("Transaction confirmation failed: Timeout after multiple retries.");
        return "Txn failed"
      } else if (getResponse.status === "SUCCESS") {
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


async function invokeFunction({
  secretKey,
  rpcServerUrl,
  contractAddress,
  operationName,
  transactionTimeout = 30, // Default timeout set to 30 seconds
  network
}) {
  let retryLimit = 15; // Number of retries
  let retries = 0;

  // Create a Keypair from the secret key provided
  const sourceKeypair = Keypair.fromSecret(secretKey);

  // Initialize the Soroban RPC server with the provided URL
  const server = new SorobanRpc.Server(rpcServerUrl);

  // Instantiate a contract using the provided address
  const contract = new Contract(contractAddress);

  // Retrieve the account information from the server
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

  // Check if the network is valid
  if (network !== "testnet" && network !== "publicnet") {
    throw new Error("Invalid network type. Please specify 'testnet' or 'publicnet'.");
  }

  let networkPassphrase = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

  console.log("networkPassphrase",networkPassphrase);
  // Build the transaction
  let builtTransaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase,
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

      while (getResponse.status === "NOT_FOUND" && retries < retryLimit) {
        console.log("Waiting for transaction confirmation...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        getResponse = await server.getTransaction(sendResponse.hash);
        retries++; // Increment the retry counter
      }

      // console.log(`getTransaction response: ${JSON.stringify(getResponse)}`);

      if (retries >= retryLimit) {
        console.log("Transaction confirmation failed: Timeout after multiple retries.");
        return "Transaction confirmation failed"
      } else if (getResponse.status === "SUCCESS") {
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

async function sendTransaction({
  secretKey,
  rpcServerUrl,
  destinationId,
  assetCode,
  assetIssuer,
  amount,
  memoText,
  network
}) {
  const server = new SorobanRpc.Server(rpcServerUrl);
  const sourceKeypair = Keypair.fromSecret(secretKey);
  let transaction;

  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());
  console.log("sourceAccount",sourceAccount);

  const asset = new StellarSdk.Asset(assetCode, assetIssuer);
  // Check if the network is valid
  if (network !== "testnet" && network !== "publicnet") {
    throw new Error("Invalid network type. Please specify 'testnet' or 'publicnet'.");
  }
  let networkPassphrase = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

  console.log("networkPassphrase",networkPassphrase);
  transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: destinationId,
        asset: asset,
        amount: amount,
      })
    )
    .addMemo(StellarSdk.Memo.text(memoText))
    .setTimeout(180)
    .build();

  transaction.sign(sourceKeypair);

  try {
    const result = await server.sendTransaction(transaction);
    logAllProperties(result);
    // console.log("Success! Results:", result);
  } catch (error) {
    console.error("Something went wrong!", error);
  }
}

function logAllProperties(obj) {
  if (obj == null) return; // Base case: exit if the object is null

  // Log the type of the object using its constructor name
  console.log(obj.constructor.name);
  console.log(obj); // Log the whole object for an overview

  // Iterate over all keys in the object
  Object.keys(obj).forEach(key => {
      const value = obj[key];
      // Check if the value is an object and not an array or null
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          console.log(`Navigating into ${key}...`);
          logAllProperties(value); // Recursive call to log properties of nested objects
      } else {
          console.log(`${key}: ${value}`); // Log the value of the property
      }
  });
}

async function changeTrust({
  secretKey,
  rpcServerUrl,
  destinationId,
  assetCode,
  assetIssuer,
  network
}) {
  const server = new SorobanRpc.Server(rpcServerUrl);
  const sourceKeypair = Keypair.fromSecret(secretKey);
  let transaction;

  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());
  console.log("sourceAccount",sourceAccount);

  const asset = new StellarSdk.Asset(assetCode, assetIssuer);
  // Check if the network is valid
  if (network !== "testnet" && network !== "publicnet") {
    throw new Error("Invalid network type. Please specify 'testnet' or 'publicnet'.");
  }

  let networkPassphrase = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
  console.log("networkPassphrase",networkPassphrase);

  transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: asset,
        source: destinationId,
      })
    )
    .setTimeout(180)
    .build();

  transaction.sign(sourceKeypair);

  try {
    const result = await server.sendTransaction(transaction);
    logAllProperties(result);
    // console.log("Success! Results:", result);
  } catch (error) {
    console.error("Something went wrong!", error);
  }
}

function logAllProperties(obj) {
  if (obj == null) return; // Base case: exit if the object is null

  // Log the type of the object using its constructor name
  console.log(obj.constructor.name);
  console.log(obj); // Log the whole object for an overview

  // Iterate over all keys in the object
  Object.keys(obj).forEach(key => {
      const value = obj[key];
      // Check if the value is an object and not an array or null
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          console.log(`Navigating into ${key}...`);
          logAllProperties(value); // Recursive call to log properties of nested objects
      } else {
          console.log(`${key}: ${value}`); // Log the value of the property
      }
  });
}



// For Testnet

// executeTransaction({
//   secretKey: "SAYTIFZPLLX4BOIS3BCP6WGJC6JUGT2MZBSLVL5RN5NTBBQJPHWCM3XQ",
//   rpcServerUrl: "https://soroban-testnet.stellar.org:443",
//   contractAddress: "CA3W4KUEWIH5UFI7VKYOK43ZBQ3L7CCYRDASBTVXYVDDTRVENY4RQD3Q",
//   operationName: "set_discount",
//   operationValue: 105937583948376232,
//   operationValueType: "i128", // Specify the type as "i128",
//   network:"testnet" 
// });

// sendTransaction({
//   secretKey: process.env.STELLAR_TEST_ALICE,
//   destinationId: "GCZEAIDXRPLJ5UPINK36M3FG2TP3YJHYQFBPWA6EFYWVBOC5EAWXSVTV", //Kiyf Public Address
//   rpcServerUrl: "https://soroban-testnet.stellar.org:443",
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   amount: "1",
//   memoText: process.env.BINANCE_MEMO_BONDHIVE,
//   network:"testnet" 
// });

// changeTrust({ 
//   secretKey: process.env.STELLAR_TEST_ALICE,
//   destinationId: "GCZEAIDXRPLJ5UPINK36M3FG2TP3YJHYQFBPWA6EFYWVBOC5EAWXSVTV", //Kiyf Public Address
//   rpcServerUrl: "https://soroban-testnet.stellar.org:443",
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   network:"testnet" 
// });





// For Publicnet

// sendTransaction({
//   secretKey: process.env.STELLAR_PUB_BTC_Dec24,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: process.env.BINANCE_STELLAR_ADDRESS,
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   amount: "1",
//   memoText: process.env.BINANCE_MEMO_BONDHIVE,
//   network:"publicnet" 
// });

// changeTrust({
//   secretKey: process.env.STELLAR_PUB_BTC_Dec24,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: "GAPBH4OCBYMVRAHLJIBVVCI3JHK2BV5W5A7R57Y4X4NL6M6F35TD2WBR", //BTC_Dec24 Treasury Public Address
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   network:"publicnet" 
// });





module.exports = { 
  executeOracleDiscountFactor,
  invokeFunction
};