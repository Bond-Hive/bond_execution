const fs = require('fs');
const path = require('path');

function readJSON(fileName) {
  // define the base path for the JSON files
  const basePath = '../data/';

  try {
    // read the JSON file synchronously
    const data = fs.readFileSync(path.join(__dirname, basePath, fileName), 'utf8');
    // parse the JSON string to an object
    const dataOutput = JSON.parse(data);
    // return the object
    return dataOutput;
  } catch (error) {
    // handle errors (file reading or JSON parsing)
    console.error('Error reading JSON file:', error);
    return null;
  }
}

// read the file '../data/data.json'
module.exports = readJSON;
