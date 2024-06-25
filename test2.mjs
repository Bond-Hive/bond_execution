// yarn add @stellar/stellar-sdk
import * as StellarSdk from "@stellar/stellar-sdk";

import { Server } from "@stellar/stellar-sdk/rpc";
const server = new Server("https://soroban-testnet.stellar.org");

async function sendTransaction() {
  try {
    const contractId =
      "CDPYO2RTBVMPMOOO6ANGVPTXET7YA5IRSY55Z26WDMFDYTK3ES2BJY73";
    const sourceSecretKey =
      "SAYTIFZPLLX4BOIS3BCP6WGJC6JUGT2MZBSLVL5RN5NTBBQJPHWCM3XQ";
    const contract = new StellarSdk.Contract(contractId);
    const accountId =
      "GCZEAIDXRPLJ5UPINK36M3FG2TP3YJHYQFBPWA6EFYWVBOC5EAWXSVTV";
    const account = await server.getAccount(accountId);
    const fee = StellarSdk.BASE_FEE;
    const transaction = new StellarSdk.TransactionBuilder(account, { fee })
      .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
      .setTimeout(30)
      .addOperation(contract.call("increment4"))
      .build();

    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
    transaction.sign(sourceKeypair);

    server.sendTransaction(transaction).then((result) => {
      console.log("hash:", result.hash);
      console.log("status:", result.status);
      logAllProperties(result.errorResult);
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
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

sendTransaction();