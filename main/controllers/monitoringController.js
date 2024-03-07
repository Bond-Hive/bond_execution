const civFundMonitoring = require('@civfund/fund-monitoring');
const { dbMongoose } = require('@civfund/fund-libraries');
const monitoringInfoTest = require('../monitoringInfo/monitoringInfoTest.json');
const researchAPICalls = require('../../research/apiCalls');
const priceStreams = require('../streams/priceStreams');

const getData = async (strategyName) => {
  const collectionName = strategyName + "-monitoring";
  try {
    let data = await dbMongoose.getCollection('Fund-Frontend', collectionName);
    return data[0].data;
  } catch (error) {
    console.error('Error fetching data:', error);
  }
};

const formatData = (object) => {
  let result = {};
  for (const key in object) {
    result[key] = [
      object[key].unixTimestamp * 1000,
      parseFloat(object[key]["presentVPS"])
    ]
  };
  return result;
}

const uploadPerformanceToMongoDB = async function (result) {
  let mongoDBModel = "performanceData";

  for (let strategy in result) {
    let mongoDBName = result[strategy].strategyName + "-monitoring";
    let timestamp = (new Date()).toISOString().replace(/T/, ' ').replace(/Z/, '').replace(/\..*/, "");
    let unixTimestamp = Math.floor(+new Date() / 1000);
    result[strategy].timestamp = timestamp;
    result[strategy].unixTimestamp = unixTimestamp;
    try {
      await dbMongoose.insertOne('bond-hive', mongoDBName, mongoDBModel, { 'strategy': result[strategy], 'timestamp': timestamp, 'unixTimestamp': unixTimestamp });  
    } catch (error) {
      console.error('Error uploading' + result[strategy].strategyName + 'to MongoDB');
      throw error;
    }
  }
}

const updateChartData = async (monitoringOutput) => {
  const newObj = formatData(monitoringOutput);
  for (const key in newObj) {
    const newPair = newObj[key];
    const collectionName = key + "-monitoring";
    try {
      console.log(newPair)
      await dbMongoose.pushToArray('Fund-Frontend', collectionName, newPair);
      console.log('INSERTED!')
    } catch (error) {
      console.error('Error updating chart data for', key, ':', error);
    }
  }
};

const getMonitoringInfo = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    
    let monitoringInfo = {};

    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; 
      if (plainDoc.type === 'lp') { // Check if type is 'lp'
        const strategyId = plainDoc.strategyId;
        if (strategyId) {
          monitoringInfo[strategyId] = plainDoc;
          delete monitoringInfo[strategyId].strategyId; 
        }
      }
    });

    if (Object.keys(monitoringInfo).length === 0) {
      throw new Error('No lp type documents found in the collection');
    }

    const GlobalInfo = await civFundMonitoring.getMonitoringInfo(monitoringInfo);
    uploadPerformanceToMongoDB(GlobalInfo);
    res.send(GlobalInfo);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const fetchMonitoringInfo = async () => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if (dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    
    let monitoringInfo = {};

    for (const document of dataCollections) {
      const plainDoc = document.toObject ? document.toObject() : document; 
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc;
        delete monitoringInfo[strategyId].strategyId;
      }
      
    }

    if (Object.keys(monitoringInfo).length === 0) {
      throw new Error('No lp type documents found in the collection');
    }

    const GlobalInfo = await civFundMonitoring.getMonitoringInfo(monitoringInfo);
    await uploadPerformanceToMongoDB(GlobalInfo);
    return "Completed fetchMonitoringInfo"; // Return meaningful data
  } catch (e) {
    console.error(e);
    throw e; // Rethrow the error for the caller to handle
  }
};

const getMonitoringFromMongo = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if (dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    
    let monitoringInfo = {};

    for (const document of dataCollections) {
      const plainDoc = document.toObject ? document.toObject() : document; 
      if (plainDoc.type === 'lp') { // Check if type is 'lp'
        const monitoringCollectionName = plainDoc.name+"-monitoring";
        try {
          let data = await dbMongoose.findLastDocument(dbName, monitoringCollectionName, 'monitoring', 'unixTimestamp');
          // Assuming data has 'strategy' field with 'strategyName' and 'date'
          if (data && data.strategy) {
            monitoringInfo[data.strategy.strategyName] = data.strategy;
          }
        } catch (error) {
          console.error('Error fetching last document:', error);
          // Handle individual document fetch errors
        }
      }
    }

    if (Object.keys(monitoringInfo).length === 0) {
      throw new Error('No lp type documents found in the collection');
    }

    res.status(200).send(monitoringInfo);
  } catch (e) {
    console.error(e);
    res.status(500).send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};


const getMonitoringFromMongoV4 = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if (dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    
    let monitoringInfo = {};

    for (const document of dataCollections) {
      const plainDoc = document.toObject ? document.toObject() : document; 
      if (plainDoc.type === 'v4' || plainDoc.type === 'v6' || plainDoc.type == 'feeArb') { // Check if type is 'lp'
        const monitoringCollectionName = plainDoc.name+"-monitoring";
        try {
          let data = await dbMongoose.findLastDocument(dbName, monitoringCollectionName, 'monitoring', 'unixTimestamp');
          // Assuming data has 'strategy' field with 'strategyName' and 'date'
          if (data && data.strategy) {
            monitoringInfo[data.strategy.strategyName] = data.strategy;
          }
        } catch (error) {
          console.error('Error fetching last document:', error);
          // Handle individual document fetch errors
        }
      }
    }

    if (Object.keys(monitoringInfo).length === 0) {
      throw new Error('No lp type documents found in the collection');
    }

    res.status(200).send(monitoringInfo);
  } catch (e) {
    console.error(e);
    res.status(500).send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getMonitoringInfov4 = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    
    let monitoringInfo = {};

    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; 
      if (plainDoc.type === 'v4' || plainDoc.type === 'v6' || plainDoc.type == 'feeArb') { // Check if type is 'lp'
        const strategyId = plainDoc.strategyId;
        if (strategyId) {
          monitoringInfo[strategyId] = plainDoc;
          delete monitoringInfo[strategyId].strategyId; 
        }
      }
    });

    if (Object.keys(monitoringInfo).length === 0) {
      throw new Error('No v4 type documents found in the collection');
    }

    const GlobalInfo = await civFundMonitoring.getMonitoringInfo(monitoringInfo);
    uploadPerformanceToMongoDB(GlobalInfo);
    res.send(GlobalInfo);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getMonitoringInfoTest = async (req, res) => {
  try {
    const GlobalInfo = await civFundMonitoring.getMonitoringInfo(monitoringInfoTest);
    // uploadPerformanceToMongoDB(GlobalInfo);
    res.send(GlobalInfo);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getInvestorsMonitoringInfo = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    // Create an empty object to collate the documents into
    let monitoringInfo = {};

    // Iterate over the fetched documents and collate them into the created object
    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; // Convert to plain object if it's a Mongoose document
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc; // assign the plainDoc to the strategyId key
        delete monitoringInfo[strategyId].strategyId; // remove strategyId from the nested object as it's already used as a key
      }
    });
    const GlobalInfo = await civFundMonitoring.getMonitoringInfo(monitoringInfo);
    await uploadPerformanceToMongoDB(GlobalInfo);
    updateChartData(GlobalInfo);
    res.send(GlobalInfo);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({ result: 'FAILURE', exception: e.message, error: e.stack });
  }
};

const getMarginRatios = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    // Create an empty object to collate the documents into
    let monitoringInfo = {};

    // Iterate over the fetched documents and collate them into the created object
    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; // Convert to plain object if it's a Mongoose document
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc; // assign the plainDoc to the strategyId key
        delete monitoringInfo[strategyId].strategyId; // remove strategyId from the nested object as it's already used as a key
      }
    });
    const GlobalInfo = await civFundMonitoring.getMarginRatios(monitoringInfo);
    res.send(GlobalInfo);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const masterResearchFunction = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.masterResearchFunction(),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const poolResearchFunction = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.poolResearchFunction(),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const masterFundingFee = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    // Create an empty object to collate the documents into
    let monitoringInfo = {};

    // Iterate over the fetched documents and collate them into the created object
    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; // Convert to plain object if it's a Mongoose document
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc; // assign the plainDoc to the strategyId key
        delete monitoringInfo[strategyId].strategyId; // remove strategyId from the nested object as it's already used as a key
      }
    });
    res.send(
      await civFundMonitoring.masterFundingFee(monitoringInfo),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getListOfOrders = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.getListOfOrders(
          req.params.exchangeName,
          req.params.subaccount,
          req.query.pair,
          req.params.startDate,
          req.query.exchangeFee
        ),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getListOfOrdersV2 = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.getListOfOrdersV2(
          req.params.exchangeName,
          req.query.subaccount,
          req.query.defaultStrategyId,
        ),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getGridData = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.getGridData(
        req.params.version,
        req.params.exchange,
        req.params.subaccount,
        req.params.timestamp,
      )
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const processAllGrids = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    // Create an empty object to collate the documents into
    let monitoringInfo = {};

    // Iterate over the fetched documents and collate them into the created object
    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; // Convert to plain object if it's a Mongoose document
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc; // assign the plainDoc to the strategyId key
        delete monitoringInfo[strategyId].strategyId; // remove strategyId from the nested object as it's already used as a key
      }
    });
    res.send(
      await researchAPICalls.processAllGrids(monitoringInfo)
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const cleanReportFromMongoDB = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    // Create an empty object to collate the documents into
    let monitoringInfo = {};

    // Iterate over the fetched documents and collate them into the created object
    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; // Convert to plain object if it's a Mongoose document
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc; // assign the plainDoc to the strategyId key
        delete monitoringInfo[strategyId].strategyId; // remove strategyId from the nested object as it's already used as a key
      }
    });
    res.send(
      await researchAPICalls.cleanReportFromMongoDB(monitoringInfo)
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const processAllReports = async (req, res) => {
  try {
    const dbName = 'bond-hive'; 
    const collectionName = 'monitoring'; 
    
    let dataCollections = await dbMongoose.getCollection(dbName, collectionName);
    
    if(dataCollections.length === 0) {
      throw new Error('No documents found in the collection');
    }
    // Create an empty object to collate the documents into
    let monitoringInfo = {};

    // Iterate over the fetched documents and collate them into the created object
    dataCollections.forEach(document => {
      const plainDoc = document.toObject ? document.toObject() : document; // Convert to plain object if it's a Mongoose document
      const strategyId = plainDoc.strategyId;
      if (strategyId) {
        monitoringInfo[strategyId] = plainDoc; // assign the plainDoc to the strategyId key
        delete monitoringInfo[strategyId].strategyId; // remove strategyId from the nested object as it's already used as a key
      }
    });
    res.send(
      await researchAPICalls.processAllReports(monitoringInfo)
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getConsoleReportFromMongoDB = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.getConsoleReportFromMongoDB(
        req.params.hours
      ),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getPerformanceReportFromMongoDB = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.getPerformanceReportFromMongoDB(),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const getFundingFees = async (req, res) => {
  try {
    res.send(
      await researchAPICalls.getFundingFees(
        req.params.exchange,
        req.params.pair,
        req.query.sinceDate
      ),
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

module.exports = {
  getMonitoringInfo,
  getMarginRatios,
  getInvestorsMonitoringInfo,
  getMonitoringInfov4,
  getMonitoringInfoTest,
  getConsoleReportFromMongoDB,
  getListOfOrders,
  getListOfOrdersV2,
  getPerformanceReportFromMongoDB,
  getFundingFees,
  getGridData,
  processAllGrids,
  processAllReports,
  cleanReportFromMongoDB,
  masterResearchFunction,
  poolResearchFunction,
  masterFundingFee,
  getMonitoringFromMongo,
  getMonitoringFromMongoV4,
  fetchMonitoringInfo,
};
