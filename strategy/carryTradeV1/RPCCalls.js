const baseUrl = process.env.QUICKNODE_API_STELLAR_PUBNET;

const {
  Keypair,
  SorobanRpc,
  Networks,
} = require("@stellar/stellar-sdk");
const axios = require('axios');

var StellarSdk = require("stellar-sdk");

// Function to decode base64 strings and remove non-ASCII characters
function decodeBase64(base64String) {
  return Buffer.from(base64String, 'base64').toString('utf-8').replace(/[^\x20-\x7E]/g, '');
}

// Function to fetch events
async function fetchEvents(contractAddress, startLedger) {
  const url = `${baseUrl}`;
  const data = {
    "jsonrpc": "2.0",
    "id": 8675309,
    "method": "getEvents",
    "params": {
      "startLedger": startLedger,
      "pagination": {
        "limit": 100
      },
      "filters": [
        {
          "type": "contract",
          "contractIds": [
            contractAddress
          ]
        }
      ]
    }
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.result && response.data.result.events) {
      const events = response.data.result.events.map((event, index) => {
        const decodedTopics = event.topic.map(decodeBase64).join(' ');
        return {
          date: event.ledgerClosedAt,
          ledgerNumber: event.ledger,
          contractId: event.contractId,
          topics: decodedTopics
        };
      });
      return events;
    } else {
      return { events: [] };
    }
  } catch (error) {
    console.error('Error making the request:', error);
    return { error: 'Error making the request' };
  }
}

async function getCurrentLedger() {
  const url = `${baseUrl}`;
  const data = {
    "jsonrpc": "2.0",
    "id": 8675309,
    "method": "getLatestLedger"
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Assuming the response includes the ledger number directly in a format like { result: { ledger: 1000000 } }

    if (response.data && response.data.result && response.data.result.sequence) {
      return response.data.result.sequence;
    } else {
      throw new Error('Ledger number not found in the response');
    }
  } catch (error) {
    console.error('Error fetching current ledger:', error);
    throw error; // Rethrow to handle it in the calling function
  }
}

async function retrieveAccountAndFilterBalance(accountId, assetCode="USDC") { 
  const urlWithAccountId = `${baseUrl}/accounts/${accountId}`;

  try {
    const response = await axios.get(urlWithAccountId, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.data && response.data.balances) {
      const balanceEntry = response.data.balances.find(balance => balance.asset_code === assetCode);
      if (balanceEntry) {
        console.log({
          balance: balanceEntry.balance,
          asset_code: balanceEntry.asset_code
        })
        return {
          balance: balanceEntry.balance,
          asset_code: balanceEntry.asset_code
        };
      } else {
        throw new Error(`Balance for asset code ${assetCode} not found`);
      }
    } else {
      throw new Error('No balances available in the account information');
    }
  } catch (error) {
    console.error(`Error fetching account information for account ID ${accountId}:`, error);
    throw error; // Rethrow to handle it in the calling function
  }
}

// Example usage:
// retrieveAccountAndFilterBalance('GDMTDAXHH6RIX4SW5O3P32BE5AJFEHUOTKP2QLYG42LT74OMSZTWX66L','USDC')

async function retrieveAccountAndFilterBalanceFromSecret(secretKey, assetCode="USDC") { 
  const server = new SorobanRpc.Server(process.env.QUICKNODE_API_STELLAR_PUBNET);
  const sourceKeypair = Keypair.fromSecret(secretKey);
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());
  const accountId = sourceAccount.accountId(); // If accountId is a method
  const urlWithAccountId = `${baseUrl}/accounts/${accountId}`;

  try {
    const response = await axios.get(urlWithAccountId, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.data && response.data.balances) {
      const balanceEntry = response.data.balances.find(balance => balance.asset_code === assetCode);
      if (balanceEntry) {
        console.log({
          balance: balanceEntry.balance,
          asset_code: balanceEntry.asset_code
        })
        return {
          balance: balanceEntry.balance,
          asset_code: balanceEntry.asset_code
        };
      } else {
        throw new Error(`Balance for asset code ${assetCode} not found`);
      }
    } else {
      throw new Error('No balances available in the account information');
    }
  } catch (error) {
    console.error(`Error fetching account information for account ID ${sourceAccount}:`, error);
    throw error; // Rethrow to handle it in the calling function
  }
}

// Example usage:
// retrieveAccountAndFilterBalance('GDMTDAXHH6RIX4SW5O3P32BE5AJFEHUOTKP2QLYG42LT74OMSZTWX66L','USDC')

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
//   secretKey: process.env.STELLAR_PUB_BTC_DEC24_TREASURY,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: process.env.BINANCE_STELLAR_ADDRESS,
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   amount: "1",
//   memoText: process.env.BINANCE_MEMO_BONDHIVE,
//   network:"publicnet" 
// });

// changeTrust({
//   secretKey: process.env.STELLAR_PUB_BTC_SEP24_TREASURY,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: "GBWKTYBKK622T42SWBQ3AOMYFQF2REXFBIEZLVCD63USJ37ONWJB7GIF", //BTC_Dec24 Treasury Public Address
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   network:"publicnet" 
// });

// changeTrust({
//   secretKey: process.env.STELLAR_PUB_BTC_DEC24_TREASURY,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: "GCLDOU2AAMNRBLWVWQBOQOBDFMPJDON6XSWBDEPHEFKL7YTYKBJHRWQF", //BTC_Dec24 Treasury Public Address
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   network:"publicnet" 
// });

// changeTrust({
//   secretKey: process.env.STELLAR_PUB_ETH_SEP24_TREASURY,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: "GCIYCFKRO6NMH6DSW6V75763G5QKBSXSCTWZYOFIPLN36VOJ6635PYO4", //BTC_Dec24 Treasury Public Address
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   network:"publicnet" 
// });

// changeTrust({
//   secretKey: process.env.STELLAR_PUB_ETH_DEC24_TREASURY,
//   rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
//   destinationId: "GBU5HD2U7MITGWK7RK356QNGUIYZTKDIPRGZ32USIFQCKJULUFSA4XI5", //BTC_Dec24 Treasury Public Address
//   assetCode: "USDC",
//   assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
//   network:"publicnet" 
// });

module.exports = {
  fetchEvents,
  getCurrentLedger,
  retrieveAccountAndFilterBalance,
  retrieveAccountAndFilterBalanceFromSecret,
  sendTransaction,
  changeTrust,
};