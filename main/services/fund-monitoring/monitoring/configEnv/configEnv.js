const dotenv = require('dotenv');
const path = require('path');

// Construct path to .env file
const envPath = path.join(__dirname, '..', '..', '..', '..', '..', '.env');

// Load environment variables from .env file
dotenv.config({ path: envPath });

// Export the environment variables
module.exports = process.env;