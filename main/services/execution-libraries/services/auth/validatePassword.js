// a middleware function for validating the password included in the request body
const bcrypt = require('bcrypt');
require('../config/configEnv.js');

async function validatePassword(req, res, next) {
    try {
        // get the password from the request body
        const plainTextPassword = req.query.password;

        // find the user in the .env file
        const username = req.query.username;
        const hashedPassword = process.env[username];

        if (!hashedPassword) {
          throw new Error('User is not present');
        }

        // compare the plain text password to the hashed password
        const isMatch = await bcrypt.compare(plainTextPassword, hashedPassword);

        if (!isMatch) {
            throw new Error('Invalid password');
        }
        // if the password is valid, proceed to the route handler
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = validatePassword;
