// Description:
// This file is the main entry point for the application. It exports all the
// modules and libraries that are used by the application.
//-----------------------------------------------------------------------------
// Imports:
const basePath = './services/';
//-----------------------------------------------------------------------------
// Paths:
const ccxt = require(basePath + 'libraries/ccxtFunctions.js')
    , { initializeCcxt, initializeProCcxt } = require(basePath + 'libraries/initializeCcxt.js')
    , Bucket = require(basePath + 'libraries/initializeObject.js')
    , { ccxtSyncroCancelOrder, ccxtSyncroCreateOrder, ccxtSyncroEditOrder } = require(basePath + 'libraries/synchronousCcxt.js') 
    , WatchOrders = require(basePath + 'streams/watchOrders.js')
    , PriceMonitor = require(basePath + 'streams/PriceMonitor/priceMonitor.js')
    , CheckOrders = require(basePath + 'streams/checkOrders.js')
    , db = require(basePath + 'libraries/mongoDB.js')
    , dbMongoose = require(basePath + 'libraries/mongoose.js')
    , leanMongoose = require(basePath + 'libraries/leanMongoose.js')
    , validatePassword = require(basePath + 'auth/validatePassword.js')
    , AutoSaveMongoDB = require(basePath + 'autosave/mongoAutoSave.js')
    , logger = require(basePath + 'utils/logger.js')
    , stratObjSchema = require(basePath + 'libraries/schemas/stratObjSchema.js')
    , LocalJsonDB = require(basePath + 'localDB/localDB.js');
//-----------------------------------------------------------------------------
// Exports:
module.exports = {
    ccxt,
    initializeCcxt,
    initializeProCcxt,
    Bucket,
    ccxtSyncroCancelOrder,
    ccxtSyncroCreateOrder,
    ccxtSyncroEditOrder,
    WatchOrders,
    PriceMonitor,
    CheckOrders,
    db,
    validatePassword,
    AutoSaveMongoDB,
    logger,
    dbMongoose,
    leanMongoose,
    stratObjSchema,
    LocalJsonDB
};
