const { getLiveStrategiesMongo, uploadTreasuryTransfers,findAllTreasuryTransfers,getStrategyName  } = require('./mongoDB_functions');
const { fetchEvents,
  getCurrentLedger,
  retrieveAccountAndFilterBalance,
  retrieveAccountAndFilterBalanceFromSecret,
  sendTransaction,
  changeTrust 
} = require('./RPCCalls');

async function checkTreasury(contractAddress = null) {
  const secondsPerDay = 24 * 60 * 60;
  const currentLedger = await getCurrentLedger();
  const startLedger = currentLedger - (secondsPerDay / 6);
  const date24HoursAgo = new Date(Date.now() - secondsPerDay * 1000).toISOString();

  // Fetch all recorded treasury transfers from a given start date, done only once here
  let executedTransfers = await findAllTreasuryTransfers(date24HoursAgo);
  let unrecordedEvents = [];

  let strategies;
  if (contractAddress) {
    // Fetch only the strategy for the given contract address
    strategies = [{ contractAddress: contractAddress }];
  } else {
    // Fetch all live strategies from MongoDB
    strategies = await getLiveStrategiesMongo();
  }

  // Set to keep track of processed contract addresses
  let processedAddresses = new Set();

  // Iterate over each strategy obtained from MongoDB or the single provided strategy
  for (const strategy of Object.values(strategies)) {

    if (processedAddresses.has(strategy.contractAddress)) {
      console.log(`Strategy already processed for address ${strategy.contractAddress}`);
      continue; // Skip this iteration if already processed
    }

    // Mark the contract address as processed
    processedAddresses.add(strategy.contractAddress);

    // Fetch events for each contract address starting from the calculated ledger
    const events = await fetchEvents(strategy.contractAddress, startLedger);

    if (!events || events.length === 0) {
      console.log(`No events found for strategy ${strategy.contractAddress}.`);
      continue; // Skip to the next iteration of the loop if no events were fetched
    }

    // Compare each event fetched to recorded transfers and already recorded new events
    for (const event of events) {
      // Filter for events where topics are "SHARES minted"
      if (event.topics === "SHARES minted") {
        let isRecorded = executedTransfers && executedTransfers.find(et =>
          et.ledgerNumber === event.ledgerNumber &&
          et.contractId === event.contractId &&
          et.date === event.date &&
          et.topics === event.topics
        );

        let isAlreadyListed = unrecordedEvents.find(ue =>
          ue.ledgerNumber === event.ledgerNumber &&
          ue.contractId === event.contractId &&
          ue.date === event.date &&
          ue.topics === event.topics
        );

        if (!isRecorded && !isAlreadyListed) {
          await uploadTreasuryTransfers(event);
          unrecordedEvents.push(event);
        }
      }
    }

    if (unrecordedEvents.length > 0) {
      // Get the strategy name or use the function to retrieve it if not present
      let strategyName = strategy.name ? strategy.name.toUpperCase() : (await getStrategyName(strategy.contractAddress)).toUpperCase();
    
      // Construct the name of the environment variable dynamically
      let envVarName = `STELLAR_PUB_${strategyName}_TREASURY`;
      // Access the environment variable using the constructed name
      let secretKey = process.env[envVarName];

      if (!secretKey) {
        console.error(`Secret key for ${envVarName} not found in environment.`);
        return; // Exit if the secret key is not found
      }
       
      try {
        // Assuming retrieveAccountAndFilterBalanceFromSecret is an async function that returns the balance
        let usdcBalance = (await retrieveAccountAndFilterBalanceFromSecret(secretKey)).balance;
        console.log("usdcBalance:", usdcBalance);
        if (usdcBalance == 0){
          console.log("nothing to transfer");
          return "nothing to transfer"; 
        }
        sendTransaction({
          secretKey: process.env.STELLAR_PUB_BTC_DEC24_TREASURY,
          rpcServerUrl: process.env.QUICKNODE_API_STELLAR_PUBNET,
          destinationId: process.env.BINANCE_STELLAR_ADDRESS,
          assetCode: "USDC",
          assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          amount:usdcBalance,
          memoText: process.env.BINANCE_MEMO_BONDHIVE,
          network:"publicnet" 
        });
      } catch (error) {
        console.error("Error retrieving USDC balance:", error);
      }
    }
    await sleep(3000); // Sleep for 3 sec before processing the next strategy
  }
  console.log("transfers processed");
  return "transfers processed";
}

// Example usage:
// checkTreasury("CA5BMOP5GYY5W64RRKZT6Q4RVAFUFBZBWQ3FMQATREOZQP7XVDEXT222");// Processes all strategies
// checkTreasury();// Processes all strategies


module.exports = {
  checkTreasury
};

