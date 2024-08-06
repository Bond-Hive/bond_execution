const EventEmitter = require('events');
const { Worker } = require('worker_threads');
const { initializeProCcxt } = require('../libraries/initializeCcxt.js');
const path = require('path');
const axios = require('axios');

// Construct path to file
const workerPath = path.join(__dirname, '..', 'threads', 'watch-worker.js');

class WatchOrders extends EventEmitter {
  constructor(cex, subaccount = "None", symbol, api = 'None', pwd = 'None', pwds = 'None') {
    super();
    this.cex = cex;
    this.subaccount = subaccount;
    this.symbol = symbol;
    this.order = null;
    this.orders = [];
    this.openOrders = [];
    this.run = true;
    this.api = api;
    this.pwd = pwd;
    this.pwds = pwds;
    this.watchOrders();
  }

  async watchOrders() {
    // backtick
    const exchange = initializeProCcxt(this.cex, this.subaccount, `${this.api}`, `${this.pwd}`, `${this.pwds}`);
  
    this.openOrders = await exchange.fetchOpenOrders(this.symbol);
    this.orders = this.openOrders.map(item => ({...item}));
    this.emitStartUpdate(); 
    // this.exchange.verbose = true; // uncomment for debugging purposes if necessary
    while (this.run) {
      try {
        this.order = (await exchange.watchOrders())[0];
  
        const worker = new Worker(workerPath);
        worker.on('message', (event) => {
          const updatedObj = event;
          this.orders = updatedObj.orders;
          this.openOrders = updatedObj.openOrders;
          this.emitOrderUpdate();
          // worker.terminate();
        });
        worker.postMessage({order: this.order, orders: this.orders, openOrders: this.openOrders});
      } catch (e) {
        if (e.constructor.name === "RequestTimeout" || e.constructor.name === "NetworkError") {
          console.log("Request timeout occurred, checking internet connection...");
          if (await this.checkInternetConnection()) { // check if internet connection is active
            console.log("Internet connection is active, retrying request...");
          } else {
            console.log("Internet connection is not active, waiting 5 seconds before checking again...");
            await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5 seconds before checking again
          }
        } else {
          break;
        }
      }
    }
  }

  async checkInternetConnection() {
    try {
      const response = await axios.head('https://google.com');
      return response.status >= 200 && response.status < 300;
    } catch (e) {
      return false;
    }
  }

  addOrder(element) {
    // Check if the element already exists in the orders array
    const i = this.orders.findIndex(_element => _element.id === element.id);
    if (i === -1) {
      // If the element does not already exist in the orders array, add it
      this.orders.push(element);
    } else {
      // If the element already exists in the orders array, update it
      this.orders[i] = element;
  
      // Move the updated element to the latest position in the orders array
      this.orders.push(this.orders.splice(i, 1)[0]);
    }
  
    // If the orders array has more than 40 elements, remove the oldest element
    if (this.orders.length > 40) {
      this.orders.splice(0, 1);
    }
  }
  
  updateOpenOrders(element) {
    const unvalidStatuses = ['closed', 'canceled', 'expired'];
  
    // Check if the element's status is valid
    if (unvalidStatuses.includes(element.status)) {
      // Find the index of the element in the openOrders array
      const i = this.openOrders.findIndex(_element => _element.id === element.id);
  
      // If the element exists in the openOrders array, remove it
      if (i > -1) {
        this.openOrders.splice(i, 1);
      }
    } else if (element.status === 'open') {
      // If the element's status is 'open', add it to the openOrders array
      this.openOrders.push(element);
    }
  }
  
  getOrders(orderType) {
    let _orders = [];
  
    // Select the array to iterate over based on the orderType
    let array;
    if (orderType === 'open') {
      array = this.openOrders;
    } else {
      array = this.orders;
    }
  
    // Iterate over the selected array and push the desired properties to the _orders array
    array.forEach(element => {
      _orders.push({
        "clientOrderId": element.clientOrderId,
        "status": element.status,
        "symbol": element.symbol,
        "datetime": element.datetime,
        "timestamp": element.timestamp,
        "side": element.side,
        "price": element.price,
        "amount": element.amount,
      });
    });
  
    return _orders;
  }  

  getOrder() {
    return this.order;
  }

  emitOrderUpdate() {
    this.emit('order', {order: this.order, orders: this.orders, openOrders: this.openOrders});
  }

  stop() {
    this.run = false;
  }

  start() {
    this.run = true;
    this.watchOrders();
  }

  emitStartUpdate() {
    this.emit('start', `Watching orders for ${this.symbol} on ${this.cex}...`);
  }
}

module.exports = WatchOrders;
