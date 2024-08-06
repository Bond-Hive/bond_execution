const request = require('request');
const env = require('../configEnv/configEnv.js');

const proxy = env.QUOTAGUARDSTATIC_URL;

const proxyRequest = (url, params = {}, apiKey) => {
  return new Promise((resolve, reject) => {
    const options = {
      url: url,
      method: 'GET',
      proxy: proxy,
      json: true,
      qs: params,
    };

    if (apiKey) {
      options.headers = {
        'X-MBX-APIKEY': apiKey,
      };
    }

    request(options, (error, response, body) => {
      if (error) {
        reject(error);
      } else {
        resolve({ response, body });
      }
    });
  });
};

module.exports = proxyRequest;
