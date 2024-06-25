import {
  Keypair,
  TransactionBuilder,
  Account,
  BASE_FEE,
  Networks,
  Operation,
  nativeToScVal,
  Contract,
  SorobanRpc,
  ScInt
} from "@stellar/stellar-sdk";


// Set up the server connection to the testnet
const RPC_SERVER = "https://soroban-testnet.stellar.org/";
const server = new SorobanRpc.Server(RPC_SERVER);

// Your secret key (the private key)
const sourceSecretKey = 'SAYTIFZPLLX4BOIS3BCP6WGJC6JUGT2MZBSLVL5RN5NTBBQJPHWCM3XQ'; // Replace this with your actual secret key.
const sourceKeypair = Keypair.fromSecret(sourceSecretKey);

async function main() {
  try {
    // Load the source account
    const sourceAccount = await server.getAccount('GCZEAIDXRPLJ5UPINK36M3FG2TP3YJHYQFBPWA6EFYWVBOC5EAWXSVTV');
    console.log('Account loaded successfully:', sourceAccount);

    // Assuming a contract function needs to be called
    const contractId = `CA3W4KUEWIH5UFI7VKYOK43ZBQ3L7CCYRDASBTVXYVDDTRVENY4RQD3Q`; // Example contract ID
    const discountFactor = new ScInt(105937583948376); // Example discount factor as i128
    let discount_factor = discountFactor.toU128(); // Assuming the discount_factor should be an unsigned 128-bit int
    const contract = new Contract(contractId);
    console.log(contract);

    // Define other necessary parameters for your contract function
    // Build and submit the transaction
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET
    })
    // Add your specific operations here. Example:
    .addOperation(Operation.invokeContractFunction({
      contract: contractId,
      function: "set_discount",
      args: [discount_factor],
      source: "GCZEAIDXRPLJ5UPINK36M3FG2TP3YJHYQFBPWA6EFYWVBOC5EAWXSVTV",
    }))
    .setTimeout(180)
    .build();

    // Sign the transaction to prove you are actually the person sending it
    transaction.sign(sourceKeypair);
    // Submit the transaction to the Stellar network
    console.log("transaction",transaction)
    const transactionResult = await server.sendTransaction(transaction);
    console.log('Transaction submitted successfully:', transactionResult);
    // logAllProperties(transactionResult.errorResult);
    // console.log(transactionResult.errorResult.ChildStruct);

    // let requestBody = {
    //   "jsonrpc": "2.0",
    //   "id": 8675309,
    //   "method": "getLatestLedger"
    // }
    // let res = await fetch('https://soroban-testnet.stellar.org', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(requestBody),
    // })
    // let json = await res.json()
    // console.log(json)

  } catch (error) {
    console.error('An error occurred:', error);
  }
}

function logAllProperties(obj) {
  if (obj == null) return; // Base case

  console.log(obj.constructor.name);
  console.log(obj);

  Object.keys(obj).forEach(key => {
      const value = obj[key];
      // Check if the value is an object and not an array or null
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
          console.log(`Navigating into ${key}...`);
          logAllProperties(value); // Recursive call
      } else {
          console.log(`${key}: ${value}`);
      }
  });
}

main().catch(console.error);
