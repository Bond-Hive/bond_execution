const mongoose = require('mongoose');
const MongoClient = require('mongodb').MongoClient;
mongoose.set('strictQuery', false);
const helpers = require('./helpers.js');
require('../config/configEnv.js');
const userSchema = require('./models/user.js');
const orderSchema = require('./models/modelOrders.js')

let MONGODB_URL = process.env.MONGODB_URL;

const connectionMap = new Map(); // Create a map to store connections for each database
const modelMap = new Map();
const clientMap = new Map();

const connectionMapInterface = async (dbName) => {
  const key = dbName;
  if (!connectionMap.has(key)) {
    try {
      const connection = await new Promise((resolve, reject) => {
        const conn = mongoose.createConnection(helpers.getDatabaseUrl(MONGODB_URL, dbName));

        conn.on('connected', () => {
          console.log(`Mongoose connection ${dbName} established.`);
          resolve(conn);
        });

        conn.on('error', (err) => {
          console.log(`Mongoose connection ${dbName} error:`, err);
          reject(err);
        });

        conn.on('disconnected', () => {
          console.log(`Mongoose connection ${dbName} disconnected`);
        });

        conn.on('close', () => {
          console.log(`Mongoose connection ${dbName} closed`);
        });
      });
      connectionMap.set(key, connection);
      return connectionMap.get(key);
    } catch (err) {
      console.log(`Error creating connection db for ${key}`);
      throw err;
    }
  } else {
    return connectionMap.get(key);
  }
};

// Function to get or create a MongoClient instance for a given dbName.
const getClient = async (dbName) => {
  if (clientMap.has(dbName)) {
    const client = clientMap.get(dbName);
    if (client.topology.isConnected()) { // if the client is connected
      return client;
    } else { // if the client is not connected, delete it from the map so a new one will be created
      clientMap.delete(dbName);
    }
  }

  try {
    const client = new MongoClient(helpers.getDatabaseUrl(MONGODB_URL, dbName), { useUnifiedTopology: true });
    await client.connect();
    clientMap.set(dbName, client);
    return client;
  } catch (err) {
    console.log(`Error creating MongoClient for db ${dbName}`);
    throw err;
  }
};

const getUserModel = async (dbName, collectionName) => {
  const name = dbName + '_' + collectionName + '_User';
  if (!modelMap.has(name)) {
    try {
      const connection = await connectionMapInterface(dbName);
      const Model = connection.model(name, userSchema, collectionName);
      modelMap.set(name, Model); // Store the Model for future use
      return Model;
    } catch (err) {
      console.log('Error getting user Model for' + dbName + ' at ' + collectionName);
      throw err;
    }
  } else {
    return modelMap.get(name);
  }
};

const getOrderModel = async (dbName, collectionName) => {
  const name = dbName + '_' + collectionName + '_Order';
  if (!modelMap.has(name)) {
    try {
      const connection = await connectionMapInterface(dbName);
      const Model = connection.model(name, orderSchema, collectionName);
      modelMap.set(name, Model); // Store the Model for future use
      return Model;
    } catch (err) {
      console.log('Error getting order Model for' + dbName + ' at ' + collectionName);
      throw err;
    }
  } else {
    return modelMap.get(name);
  }
};

const insertOneOrder = async (dbName, collectionName, document) => {
  try {
    const Model = await getOrderModel(dbName, collectionName);
    const newOrder = new Model(document);
    const result = await newOrder.save();
    return result;
  } catch (err) {
    console.log('Error to insert order to ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const insertOneUser = async (dbName, collectionName, document) => {
  try {
    const Model = await getUserModel(dbName, collectionName);
    const newUser = new Model(document);
    const result = await newUser.save();
    return result;
  } catch (err) {
    console.log('Error to insert user to ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const findOneUser = async (dbName, collectionName, filterField, filterValue) => {
  try {
    const Model = await getUserModel(dbName, collectionName);
    const document = await Model.findOne({ [filterField]: filterValue }).lean();
    return document;
  } catch (err) {
    console.log('Error finding user for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const replaceOneUser = async (dbName, collectionName, filterField, filterValue, replacement) => {
  try {
    const Model = await getUserModel(dbName, collectionName);
    const result = await Model.replaceOne({ [filterField]: filterValue }, replacement);
    if (result.matchedCount === 0) {
      return await insertOneUser(dbName, collectionName, replacement);
    }
    return result;
  } catch (err) {
    console.log('Error replacing user for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const deleteOneUser = async (dbName, collectionName, filterField, filterValue) => {
  try {
    const Model = await getUserModel(dbName, collectionName);
    const result = await Model.deleteOne({ [filterField]: filterValue });
    return result;
  } catch (err) {
    console.log('Error deleting user for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const insertOne = async (dbName, collectionName, modelName, document) => {
  try {
    const updatedDocument = helpers.addDefaultToEmptyObjects(document);
    const connection = await connectionMapInterface(dbName); // Get the connection for the given database and collection
    let Model;
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (!modelMap.has(name)) {
      const mySchemaDefinition = helpers.getSchemaDefinition(updatedDocument);
      const mySchema = new mongoose.Schema(mySchemaDefinition);
      Model = connection.model(name, mySchema, collectionName);
      modelMap.set(name, Model); // Store the Model for future use
    } else {
      Model = modelMap.get(name);
    }
    const newDocument = new Model(updatedDocument);
    const result = await newDocument.save();
    return result;
  } catch (err) {
    console.log('Error inserting document for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const deleteOne = async (dbName, collectionName, filterField, filterValue, modelName = null) => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const result = await Model.deleteOne({ [filterField]: filterValue });
      return result;
    } else {
      const client = await getClient(dbName);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const result = await collection.deleteOne({ [filterField]: filterValue });

      return result;
    }
  } catch (err) {
    console.log('Error deleting document for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const findOne = async (dbName, collectionName, filterField, filterValue, modelName = null) => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const document = await Model.findOne({ [filterField]: filterValue }).lean();
      const updatedDocument = helpers.removeDefaultFromEmptyObjects(document);
      return updatedDocument;
    } else {
      const client = await getClient(dbName);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const document = await collection.findOne({ [filterField]: filterValue });
      const updatedDocument = helpers.removeDefaultFromEmptyObjects(document);

      return updatedDocument;
    }
  } catch (err) {
    console.log('Error finding document for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const getDBFindAll = async (dbName, collectionName) => {
  try {
    const client = await getClient(dbName);

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    let skip = 0;
    let finalResponse = [];
    let docs = [];

    do {
      docs = await collection.find().skip(skip * 50000).limit(50000).toArray();
      finalResponse.push(...docs);
      skip++;
    } while (docs.length > 0);

    return finalResponse;
  } catch (err) {
    console.log('Error finding all documents for ' + dbName + ' at ' + collectionName);
    throw err;
  }
}

const getCollection = async (dbName, collectionName) => {
  const name = dbName + '_' + collectionName;
  let DataCollection;
  if (modelMap.has(name)) {
    DataCollection = modelMap.get(name);
  } else {
    const connection = await connectionMapInterface(dbName);

    const mainSchema = new mongoose.Schema({
      data: {
        type: 'object'
      }
    });

    DataCollection = connection.model(name, mainSchema, collectionName);
    modelMap.set(name, DataCollection); // Store the Model for future use
  }

  const dataCollections = await DataCollection.find({}).exec();
  return dataCollections;
};

const deleteAll = async (dbName, collectionName) => {
  const name = dbName + '_' + collectionName;
  let DataDeletion;
  if (modelMap.has(name)) {
    DataDeletion = modelMap.get(name);
  } else {
    const connection = await connectionMapInterface(dbName);

    const mainSchema = new mongoose.Schema({
      data: {
        type: 'object'
      }
    });

    DataDeletion = connection.model(name, mainSchema, collectionName);
    modelMap.set(name, DataDeletion); // Store the Model for future use
  }

  const dataDeletions = await DataDeletion.deleteMany().exec();
  return dataDeletions;
};

const replaceOne = async (dbName, collectionName, modelName, filterField, filterValue, replacement) => {
  try {
    const updatedReplacement = helpers.addDefaultToEmptyObjects(replacement);
    const connection = await connectionMapInterface(dbName, collectionName); // Get the connection for the given database and collection
    let Model;
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (!modelMap.has(name)) {
      const mySchemaDefinition = helpers.getSchemaDefinition(updatedReplacement);
      const mySchema = new mongoose.Schema(mySchemaDefinition);
      Model = connection.model(name, mySchema, collectionName);
      modelMap.set(name, Model); // Store the Model for future use
    } else {
      Model = modelMap.get(name);
    }
    if (Model) {
      const result = await Model.replaceOne({ [filterField]: filterValue }, updatedReplacement);
      if (result.matchedCount === 0) {
        return await insertOne(dbName, collectionName, modelName, updatedReplacement); // Call insertOne
      }
      return result;
    } else {
      const client = await getClient(dbName);

      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const result = await collection.replaceOne({ [filterField]: filterValue }, updatedReplacement);
      if (result.matchedCount === 0) { // If no document is matched
        return await insertOne(dbName, collectionName, modelName, updatedReplacement); // Call insertOne
      }

      return result;
    }
  } catch (err) {
    console.log('Error replacing one document for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const updateURL = async (url) => {
  if (typeof url !== 'string') {
    return 'Invalid input: URL must be a string.';
  }

  try {
    await closeAllConnections(); // Close all existing connections
    connectionMap.clear(); // Clear connectionMap
    modelMap.clear(); // Clear modelMap
    MONGODB_URL = url; // Update the MongoDB URL
    return 'MongoDB URL updated and all existing connections closed.';
  } catch (err) {
    console.log('Error updating mongoURL');
    return 'Error updating MongoDB URL and closing connections.';
  }
};

const setURL = (url) => {
  MONGODB_URL = url; // Update the MongoDB URL
};

const getModels = () => {
  return helpers.getAllKeysFromMap(modelMap);
}

const getConnections = () => {
  return helpers.getAllKeysFromMap(connectionMap);
}

const closeAllConnections = () => {
  const closePromises = [];
  for (const key of connectionMap) {
    closePromises.push(closeConnection(key));
  }
  for (const key of clientMap) {
    closePromises.push(closeClientConnection(key));
  }
  return Promise.all(closePromises);
};

const closeConnection = (key) => {
  if (connectionMap.has(key)) {
    return new Promise((resolve, reject) => {
      connectionMap.get(key).close((err) => {
        if (err) {
          console.log(`Error closing connection for ${key}`);
          console.error(err);
          reject(err);
        } else {
          connectionMap.delete(key); // Remove the key from the connectionMap
          for (const [modelKey] of modelMap) {
            if (modelKey.startsWith(key)) {
              modelMap.delete(modelKey);
            }
          }
          resolve(true);
        }
      });
    });
  } else {
    return Promise.resolve(false); // Return a resolved Promise
  }
};

const closeClientConnection = (key) => {
  if (clientMap.has(key)) {
    return new Promise((resolve, reject) => {
      clientMap.get(key).close((err) => {
        if (err) {
          console.log(`Error closing client connection for ${key}`);
          console.error(err);
          reject(err);
        } else {
          clientMap.delete(key); // Remove the key from the clientMap
          resolve(true);
        }
      });
    });
  } else {
    return Promise.resolve(false); // Return a resolved Promise
  }
};

const findSorted = async (dbName, collectionName, sortField, sortOrder, numItems, modelName = null) => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;

    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const documents = await Model.find()
        .sort({ [sortField]: sortOrder })
        .limit(numItems)
        .lean();
      const updatedDocuments = documents.map(doc => helpers.removeDefaultFromEmptyObjects(doc));
      return updatedDocuments;
    } else {
      const client = await getClient(dbName);

      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const cursor = collection.find()
        .sort({ [sortField]: sortOrder })
        .limit(numItems);
      const documents = await cursor.toArray();
      const updatedDocuments = documents.map(doc => helpers.removeDefaultFromEmptyObjects(doc));

      return updatedDocuments;
    }
  } catch (err) {
    console.log('Error finding sorted documents for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const findAfterSkipping = async (dbName, collectionName, skipCount, modelName = null) => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;

    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const documents = await Model.find()
        .skip(skipCount)
        .lean();
      const updatedDocuments = documents.map(doc => helpers.removeDefaultFromEmptyObjects(doc));
      return updatedDocuments;
    } else {
      const client = await getClient(dbName);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const cursor = collection.find()
        .skip(skipCount);
      const documents = await cursor.toArray();
      const updatedDocuments = documents.map(doc => helpers.removeDefaultFromEmptyObjects(doc));

      return updatedDocuments;
    }
  } catch (err) {
    console.log('Error finding after skipping documents for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const findAllQuery = async (dbName, collectionName, query, modelName = null) => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const documents = await Model.find(query).lean();
      const updatedDocuments = documents.map(document => helpers.removeDefaultFromEmptyObjects(document));
      return updatedDocuments;
    } else {
      const client = await getClient(dbName);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const documents = await collection.find(query).toArray();
      const updatedDocuments = documents.map(document => helpers.removeDefaultFromEmptyObjects(document));

      return updatedDocuments;
    }
  } catch (err) {
    console.log('Error finding all documents with query for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const findLastDocument = async (dbName, collectionName, modelName = null, sortField = '_id') => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const document = await Model.find()
        .sort({ [sortField]: -1 })
        .limit(1)
        .lean();
      return document[0];
    } else {
      const client = await getClient(dbName);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const cursor = collection.find()
        .sort({ [sortField]: -1 })
        .limit(1);
      const documents = await cursor.toArray();
      
      return documents[0];
    }
  } catch (err) {
    console.log('Error finding last document for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const deleteMany = async (dbName, collectionName, filterField, filterValue, modelName = null) => {
  try {
    const name = dbName + '_' + collectionName + '_' + modelName;
    if (modelName !== null && modelMap.has(name)) {
      const Model = modelMap.get(name);
      const result = await Model.deleteMany({ [filterField]: filterValue });
      return result;
    } else {
      const client = await getClient(dbName);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      const result = await collection.deleteMany({ [filterField]: filterValue });
      return result;
    }
  } catch (err) {
    console.log('Error deleting many documents for ' + dbName + ' at ' + collectionName);
    throw err;
  }
};

const pushToArray = async (dbName, collectionName, newItem) => {
  try {
    const client = await getClient(dbName);
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const update = { $push: { data: newItem } };
    const result = await collection.updateOne({}, update); // Update the first document in the collection
    return result;
  } catch (err) {
    console.log(`Error pushing to array for ${dbName} at ${collectionName}: ${err}`);
    throw err;
  }
};


module.exports = {
  insertOne,
  findOne,
  getCollection,
  deleteAll,
  replaceOne,
  setURL,
  getModels,
  getConnections,
  closeAllConnections,
  closeConnection,
  closeClientConnection,
  getDBFindAll,
  findOneUser,
  replaceOneUser,
  deleteOneUser,
  insertOneUser,
  insertOneOrder,
  deleteOne,
  findSorted,
  findAfterSkipping,
  findAllQuery,
  findLastDocument,
  updateURL,
  deleteMany,
  pushToArray
};
