const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = require('express')();
dotenv.config();
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) req.rawBody = buf.toString(encoding || 'utf8');
};
const options = { verify: rawBodySaver };

console.log('Starting server...');

app.use(morgan('combined'));
app.use(bodyParser.json(options));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(cors());
app.use('/monitoring', require('../routes/monitoringRoutes.js'));
app.use('/frontend', require('../routes/frontendRoutes.js'));
app.use('/', require('../routes/frontendRoutes.js'));

module.exports = app;