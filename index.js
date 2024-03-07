const app = require('./main/server/app.js');
const Monitoring = require('@civfund/fund-monitoring');
const monitoringInfoTest = require('./main/monitoringInfo/monitoringInfoTest.json');
const websocketInfo = require('./main/monitoringInfo/websocketInfo.json');
const researchAPICalls = require('./research/apiCalls.js');
const monitoringInfo = require('./main/monitoringInfo/monitoringInfo.json');
const monitoringCalls = require('./main/controllers/monitoringController.js');
const { getUniV3UnclaimedFees } = require('@civfund/fund-monitoring/monitoring/libraries/mainFunctions.js');
const { dbMongoose } = require('@civfund/fund-libraries');

app.listen(process.env.PORT || 3000, () => {
  console.log(`Monitoring server listening at port: ${process.env.PORT || 3000}`);
});

const startWebsockets = async () => {
if (typeof process.env.LOCAL_WEBSOCKET_STOP === "undefined"){
  CivMonitoring.monitoringWebsocketRoutine(monitoringInfoTest, websocketInfo);

  (() => {
    CivMonitoring.masterFundingFee(monitoringInfo)
    const initialDelay = calculateInitialDelay();
    console.log("initialDelay",initialDelay)
    setTimeout(() => {
      CivMonitoring.masterFundingFee(monitoringInfo);
      setInterval(async () => {
        CivMonitoring.masterFundingFee(monitoringInfo);
        researchAPICalls.getFundingFeesFromMonitoringFile();
      }, 8 * 60 * 60 * 1000);
    }, initialDelay);
  })();
};
}

const scheduleMasterResearchAPI = async () => {
  await researchAPICalls.masterResearchFunction();
}

const uniswapV3Fee_webScrape = async () => {
  const dbName = 'bond-hive';
  const collectionName = 'monitoring';
  
  let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
  
  if(dataCollections.length === 0) {
    throw new Error('No documents found in the collection');
  }
  
  let monitoringInfo = {};
  dataCollections.forEach(document => {
    const plainDoc = document.toObject ? document.toObject() : document;
    if (plainDoc.lpType == 'v3' && plainDoc.tranches["1"].feesCalcMethod == 'webScrape') {
      const positionId = plainDoc.tranches["1"].positionId;
      if (positionId) {
        if (monitoringInfo.hasOwnProperty(positionId)) {
          // Duplicate value, not to be added
        } else {
          monitoringInfo[positionId] = positionId;
        }
      }
    }
  });

  if (Object.keys(monitoringInfo).length === 0) {
    throw new Error('No lp type v3 documents with feesCalcMethod webScrape found in the collection');
  }
  for (let position in monitoringInfo){
    let result = await getUniV3UnclaimedFees(null,null,null,null,null,null,null,null,null,null,null,null,"webScrape",position);
    monitoringInfo[position] = result;
  }
  monitoringInfo.fees = "v3";
  monitoringInfo.timestamp = new Date();

  uploadPerformanceToMongoDB(monitoringInfo);
  console.log("fees Uploaded",monitoringInfo);
  return "fees Uploaded"
}

if (process.env.LOCAL_UNISWAP_FEE_WEBSCRAPE_CALL === "render") {
  uniswapV3Fee_webScrape()
  setInterval(() => {
    uniswapV3Fee_webScrape()
      .then(() => console.log("Monitoring call successful"))
      .catch(err => console.error("Monitoring call failed:", err));
  }, 30 * 60 * 1000); // This sets the interval to 30 minutes
}

const schedulePoolResearchAPI = async () => {
  await researchAPICalls.poolResearchFunction();
}

const uploadPerformanceToMongoDB = async function (result) {
  let mongoDBModel = "v3Fees";
  let dbName = "bond-hive";
  let collectionName = "monitoring_fees";
  const lastStoredData = await dbMongoose.findOne(dbName, collectionName, "fees","v3");
  if (lastStoredData) {
    await dbMongoose.replaceOne(dbName, collectionName, mongoDBModel, '_id', lastStoredData._id, result);
  } else {
    await dbMongoose.insertOne(dbName, collectionName, mongoDBModel, result);  
  }
}

const scheduleMonitoringCall = async () => {
  const timeout = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error('Monitoring call timed out'));
    }, 1000 * 60 * 25); // Set timeout duration here, e.g.,25 mins
  });

  // Race the monitoring call against the timeout
  return Promise.race([
    monitoringCalls.fetchMonitoringInfo(),
    timeout
  ]);
};


if (typeof process.env.LOCAL_MONITORING_CALL === "undefined") {
  setInterval(() => {
    scheduleMonitoringCall()
      .then(() => console.log("Monitoring call successful"))
      .catch(err => console.error("Monitoring call failed:", err));
  }, 30 * 60 * 1000); // This sets the interval to 30 minutes
}

// Then schedule it to run every 60 minutes
if (process.env.RUNNING_RESEARCH_APICALL === "true") {
  // Run immediately at start
  scheduleMasterResearchAPI();
  schedulePoolResearchAPI();
  setInterval(scheduleMasterResearchAPI, 60 * 60 * 1000); // 60 minutes * 60 seconds * 1000 milliseconds
  setInterval(schedulePoolResearchAPI, 24 * 60 * 60 * 1000); // Once daily
}
const targetHours = [0, 8, 16];

function calculateInitialDelay() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinutes = now.getUTCMinutes();

  // Find the next target hour
  let nextHour = targetHours.find(hour => hour > currentHour);
  if (nextHour === undefined) {
      nextHour = targetHours[0];
  }

  // Calculate the delay until the next target hour
  let delay = nextHour - currentHour;
  if (delay < 0) delay += 24; // If the next hour is on the next day
  delay *= 60; // Convert hours to minutes

  // If it's 15 minutes past the hour, adjust the delay to start at the next hour
  if (currentMinutes >= 15) {
      delay -= (currentMinutes - 15);
  } else {
      delay += (15 - currentMinutes);
  }

  delay *= 60 * 1000; // Convert minutes to milliseconds
  return delay;
}

process.on('uncaughtException', error => {
  console.log('error', [error.name, error.message, error.stack]);
});

process.on('unhandledRejection', error => {
  console.log('error', [error.name, error.message, error.stack]);
});

startWebsockets();

if (process.env.FREE_ISTANCE === "true") {
  setInterval(keepAlive, 600000);  // Runs keepAlive function every 10 minutes
}
