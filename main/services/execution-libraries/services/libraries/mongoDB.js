const axios = require('axios');
require('../config/configEnv.js');

let MONGODB_API_ID = process.env.MONGODB_API_ID;
let MONGODB_API_KEY = process.env.MONGODB_API_KEY;
let MONGODB_CLUSTER = process.env.MONGODB_CLUSTER;

async function findOne(dbName, collectionName, filterField, filterValue) {
  const findOneUrl = 'https://data.mongodb-api.com/app/data-'+MONGODB_API_ID+'/endpoint/data/v1/action/'+'findOne';
  const header = {headers: {'api-key': MONGODB_API_KEY}};
  const filter = {};
  filter[filterField] = filterValue;
  const baseDataFindOne = {'dataSource': MONGODB_CLUSTER, 'database': dbName, 'collection': collectionName, 'filter': filter};
  const response = await axios.post(findOneUrl, baseDataFindOne, header).catch((err) => console.log(err));
  return response.data.document;
}

async function getCollection(dbName, collectionName) {
  const findUrl = 'https://data.mongodb-api.com/app/data-'+MONGODB_API_ID+'/endpoint/data/v1/action/'+'find';
  const header = {headers: {'api-key': MONGODB_API_KEY}};
  const baseDataFind = {'dataSource': MONGODB_CLUSTER, 'database': dbName, 'collection': collectionName};
  const response = await axios.post(findUrl, baseDataFind, header).catch((err) => console.log(err));
  return response.data.documents;
}

async function deleteAll(dbName, collectionName) {
  const findAllUrl = 'https://data.mongodb-api.com/app/data-'+MONGODB_API_ID+'/endpoint/data/v1/action/'+'deleteMany';
  const header = {headers: {'api-key': MONGODB_API_KEY}};
  const baseDataFindall = {'dataSource': MONGODB_CLUSTER, 'database': dbName, 'collection': collectionName, 'filter': ({})};
  const response = await axios.post(findAllUrl, baseDataFindall, header).catch((err) => console.log(err));
  return response.data;
}

async function insertOne(dbName, collectionName, document) {
  const insertOneUrl = 'https://data.mongodb-api.com/app/data-'+MONGODB_API_ID+'/endpoint/data/v1/action/'+'insertOne';
  const header = {headers: {'api-key': MONGODB_API_KEY}};
  const formInfo = {document};
  const baseDataInsertOne = {'dataSource': MONGODB_CLUSTER, 'database': dbName, 'collection': collectionName, 'document': {}};
  const dataWithDocument = {...baseDataInsertOne, ...formInfo}; // add the document array to payload
  const result = await axios.post(insertOneUrl, dataWithDocument, header).catch((err) => console.log(err));
  return result;
}

async function replaceOne(dbName, collectionName, filterField, filterValue, replacement) {
  const insertOneUrl = 'https://data.mongodb-api.com/app/data-'+MONGODB_API_ID+'/endpoint/data/v1/action/'+'replaceOne';
  const header = {headers: {'api-key': MONGODB_API_KEY}};
  const filter = {};
  filter[filterField] = filterValue;
  const formInfo = {replacement};
  const baseDataInsertOne = {'dataSource': MONGODB_CLUSTER, 'database': dbName, 'collection': collectionName, 'filter': filter, 'replacement': {}};
  const dataWithDocument = {...baseDataInsertOne, ...formInfo}; // add the document array to payload
  const result = await axios.post(insertOneUrl, dataWithDocument, header).catch((err) => console.log(err));
  return result.data;
}

module.exports = {
  findOne,
  insertOne,
  replaceOne,
  deleteAll,
  getCollection
};
