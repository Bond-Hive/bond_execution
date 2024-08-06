const WS = require('ws');
const EventEmitter = require('events');
const ReconnectingWebSocket = require('reconnecting-websocket');
const Web3 = require('web3');
const checkInternetConnected = require('check-internet-connected');
const { triggersFromList } = require('../../libraries/helpers.js');
const readJSON = require('../../utils/readJSON.js');
const { PriceWorker } = require('../../threads/priceWorker.js');
const ccxtPromised = require('../../libraries/promisedCcxt.js');
const binancePromised = require('../../libraries/promisedBinanceApiOrders.js')
const watchTrades = require('./watchTrades.js');
const utilities = require('./utilityFunctions.js');
const BN = Web3.utils.BN;

const UNISWAP_V3_PAIR_ABI = require("../abi/IUniswapV3Pair.json");
const UNISWAP_V2_PAIR_ABI = require("../abi/IUniswapV2Pair.json");

class PriceMonitor extends EventEmitter {
  constructor(
    type,
    symbol1,
    symbol2,
    exchange,
    subaccount,
    strategyVersion,
    list = null,
    emitter = false,
    dupesControl = false,
    tasks = null,
    controlTime = 12 * 10 ** 4,
    cacheLimit = 10000
  ) {
    super();
    this.ws1 = null;
    this.ws2 = null;
    this.price = null;
    this.price1 = null;
    this.price2 = null;
    // check the type of the list input
    if (typeof list === 'string') {
      // if the list input is a string, search for a file
      this.list = readJSON(list);
    } else if (Array.isArray(list)) {
      // if the list input is an array, just use the array as-is
      this.list = list;
    } else this.list = null;
    this.upperBoundIndex = null;
    this.lowerBoundIndex = null;
    this.upperBoundPrice = null;
    this.lowerBoundPrice = null;
    this.index = null;
    this.side = null;
    this.firstMessageReceived1 = false;
    this.firstMessageReceived2 = false;
    this.triggersInitialized = false;
    this.tasks = tasks;
    this.symbol1 = symbol1;
    this.symbol2 = symbol2;
    this.maxRetries = 5;
    this.controlTime = controlTime;
    this.timeoutId1 = null;
    this.timeoutId2 = null;
    this.timer1 = null;
    this.timer2 = null;
    this.exchange = exchange;
    this.serverTimeOffset = 0;
    this.closed = false;
    this.dupesControl = dupesControl;
    this.subaccount = subaccount;
    this.dupeChecker1 = null;
    this.dupeChecker2 = null;
    this.strategyVersion = strategyVersion;
    this.retries = 0;
    this.type = type;
    this.isDex = false;
    this.emitter = emitter;

    if (symbol2 && !symbol1) throw new Error('Symbol 2 can be defined only if symbol 1 is defined!');

    if (exchange === 'binanceusdm' || exchange === 'binancecoinm') {
      // Check the type of WebSocket to connect to
      if (type === 'mark') {
        this.ws1 = new ReconnectingWebSocket(`wss://fstream.binance.com/ws/${utilities.toLowercasePair(symbol1)}@markPrice@1s`, [], { WebSocket: WS });
        if (symbol2) this.ws2 = new ReconnectingWebSocket(`wss://fstream.binance.com/ws/${utilities.toLowercasePair(symbol2)}@markPrice@1s`, [], { WebSocket: WS });
      } else if (type === 'last') {
        this.ws1 = new ReconnectingWebSocket(`wss://fstream.binance.com/ws/${utilities.toLowercasePair(symbol1)}@ticker`, [], { WebSocket: WS });
        if (symbol2) this.ws2 = new ReconnectingWebSocket(`wss://fstream.binance.com/ws/${utilities.toLowercasePair(symbol2)}@ticker`, [], { WebSocket: WS });
      } else throw new Error(`Invalid WebSocket type on ${symbol1} and ${symbol2}`);
    } else if (exchange === 'okx') {
      if (type === 'mark') {
        this.ws1 = new ReconnectingWebSocket('wss://ws.okx.com:8443/ws/v5/public', [], { WebSocket: WS });
        if (symbol2) this.ws2 = new ReconnectingWebSocket('wss://ws.okx.com:8443/ws/v5/public', [], { WebSocket: WS });
      } else throw new Error(`OKX only supports MarkPrice on ${symbol1} and ${symbol2}`);
    } else if (exchange === 'binance') {
      if (type === 'last') {
        this.ws1 = new ReconnectingWebSocket(`wss://stream.binance.com/ws/${utilities.toLowercasePair(symbol1)}@ticker`, [], { WebSocket: WS });
        if (symbol2) this.ws2 = new ReconnectingWebSocket(`wss://stream.binance.com/ws/${utilities.toLowercasePair(symbol2)}@ticker`, [], { WebSocket: WS });
      } else throw new Error(`Invalid WebSocket type on ${symbol1} and ${symbol2}`);
    } else if (exchange === 'uniswapv2' || exchange === 'uniswapv3') {
      if (symbol1) {
        this.ws1 = this.connectToDex(process.env.WSS_API, symbol1, exchange.slice(-2));
        this.isDex = true;
      }
    } else throw new Error('Exchange not supported');

    if (!this.isDex) {
      this.subscribeToChannel(this.ws1, symbol1, exchange, 1);
      if (this.ws2) {
        this.subscribeToChannel(this.ws2, symbol2, exchange, 2);
      }

      if (this.dupesControl) {
        if (symbol1) {
          this.dupeChecker1 = new watchTrades(exchange, this.subaccount, symbol1, strategyVersion, cacheLimit);
        }
        if (symbol2) {
          this.dupeChecker2 = new watchTrades(exchange, this.subaccount, symbol2, strategyVersion, cacheLimit);
        }
      }

      this.ws1.onmessage = (event) => this.handleWebSocketMessage(event, 1, exchange, type, emitter);
      if (this.ws2) {
        this.ws2.onmessage = (event) => this.handleWebSocketMessage(event, 2, exchange, type, emitter);
      }

      this.ws1.onclose = () => {
        this.emitClose(1);
      }

      if (this.ws2) {
        this.ws2.onclose = () => {
          this.emitClose(2);
        }
      }

      this.ws1.onerror = (error) => {
        this.close(1);
        console.log(`Error on WebSocket connection ${symbol1}`);
        this.emit('error', error);
      }

      if (this.ws2) {
        this.ws2.onerror = (error) => {
          this.close(2);
          console.log(`Error on WebSocket connection ${symbol2}`);
          this.emit('error', error);
        }
      }
    } else {
      this.intervalId = setInterval(() => this.resetProvider(), 10 * 60 * 1000); // every 10 minutes
    }
  }

  resetTimer(wsId) {
    if (this.controlTime) {
      if (wsId === 1) {
        if (this.timeoutId1) {
          clearTimeout(this.timeoutId1);
        }
        this.timeoutId1 = setTimeout(() => this.onTimeout(wsId), this.controlTime);
      } else if (wsId === 2) {
        if (this.timeoutId2) {
          clearTimeout(this.timeoutId2);
        }
        this.timeoutId2 = setTimeout(() => this.onTimeout(wsId), this.controlTime);
      }
    }
  }

  onTimeout(wsId) {
    this.checkInternetConnection(wsId);
    this.emitTimeElapsed(wsId);
  }

  handleWebSocketMessage(event, wsNumber, exchange, type, emitter) {
    this.resetTimer(wsNumber);
    let stockPriceElement = null;

    if (exchange === 'binanceusdm') {
      const stockObject = JSON.parse(event.data);
      stockPriceElement = type === 'mark' ? parseFloat(stockObject.p) : parseFloat(stockObject.c);
    } else if (exchange === 'okx') {
      if (!this[`firstMessageReceived${wsNumber}`]) {
        this[`firstMessageReceived${wsNumber}`] = true;
        return;
      }
      stockPriceElement = JSON.parse(event.data).data[0].markPx;
    } else if (exchange === 'binance') {
      const stockObject = JSON.parse(event.data);
      stockPriceElement = parseFloat(stockObject.c);
    }

    this[`price${wsNumber}`] = Number(stockPriceElement);
    this.updatePricesAndCheckTriggers(wsNumber, emitter);
  }

  handleDexWebSocketMessage(price) {
    let stockPriceElement = null;

    stockPriceElement = parseFloat(price);
    if (Number(stockPriceElement) !== this.price) {
      this.price = Number(stockPriceElement);
      this.checkAndTrigger(1);
      if (this.emitter && this.price) this.emitPrice();
    }
  }

  iterateDistance(currentIndex, distance) {
    for (let index = currentIndex; index !== currentIndex + (this.side === 'upperBound' ? distance : -distance); index += (this.side === 'upperBound' ? 1 : -1)) {
      this.index = index;
      if (distance > 1 && this.index !== currentIndex) {
        if (this.tasks) {
          this.sendToWorker(this.index);
          this.emitTaskExecuted();
        }
        this.emitPriceTrigger();
      }
    }
  }

  checkAndTrigger(wsNumber) {
    if (this.list) {
      if (!this.triggersInitialized && this.price) {
        this.triggersInitialized = true;
        this.defineTriggers();
        this.emitInitialized();
      }

      let willTrigger = false;
      if (this.price > this.upperBoundPrice) {
        this.index = this.upperBoundIndex;
        this.side = 'upperBound';
        willTrigger = true;
      } else if (this.price < this.lowerBoundPrice) {
        this.index = this.lowerBoundIndex;
        this.side = 'lowerBound';
        willTrigger = true;
      }

      if (willTrigger) {
        this.defineTriggers();
        let currentIndex = this.index;
        if (this.tasks) {
          this.sendToWorker(this.index);
          this.emitTaskExecuted();
        }
        this.emitPriceTrigger();

        let distance = Math.abs(currentIndex - (this.side === 'upperBound' ? this.upperBoundIndex : this.lowerBoundIndex));
        this.iterateDistance(currentIndex, distance, wsNumber);
      }
    }
  }

  updatePricesAndCheckTriggers(wsNumber, emitter) {
    const otherWsNumber = wsNumber === 1 ? 2 : 1;
    const otherPrice = this[`price${otherWsNumber}`];
    const currentPrice = this[`price${wsNumber}`];

    if (otherPrice > 0 && this.price1 / this.price2 !== this.price) {
      this.price = this.price1 / this.price2;
      this.checkAndTrigger(wsNumber);
    } else if (!this[`symbol${otherWsNumber}`] && wsNumber === 1 && this.price !== currentPrice) {
      this.price = currentPrice;
      this.checkAndTrigger(wsNumber);
    }

    if (emitter && this.price) this.emitPrice();
  }

  subscribeToChannel(ws, symbol, exchange, wsNumber) {
    if (ws) {
      ws.onopen = () => {
        if (exchange === 'okx') {
          const subscribeParams = {
            "op": "subscribe",
            "args": [
              {
                "channel": "mark-price",
                "instId": `${utilities.toDashPair(symbol)}` + `-SWAP`
              }
            ]
          };
          ws.send(JSON.stringify(subscribeParams));
        }
        this.emitOpened(wsNumber);
      }
    }
  }

  getPrice(pairId) {
    if (!pairId) {
      return this.price;
    } else if (pairId === 1) {
      return this.price1;
    } else if (pairId === 2) {
      return this.price2;
    }
  }

  getTriggers() {
    return { upperBoundIndex: this.upperBoundIndex, lowerBoundIndex: this.lowerBoundIndex, upperBoundPrice: this.upperBoundPrice, lowerBoundPrice: this.lowerBoundPrice };
  }

  defineTriggers() {
    const results = triggersFromList(this.list, this.price);
    this.upperBoundIndex = results.upperBoundIndex;
    this.lowerBoundIndex = results.lowerBoundIndex;
    this.upperBoundPrice = results.upperBoundPrice;
    this.lowerBoundPrice = results.lowerBoundPrice;
  }

  async binanceCancelOrder(subaccount, pair, orderID, setupVars = null) {
    let retries = 0;

    if (!this.serverTimeOffset) {
      this.serverTimeOffset = await utilities.updateServerTimeOffset();
    }

    while (retries < this.maxRetries) {
      try {
        const symbol = utilities.toContinuePair(pair);
        const response = await binancePromised.binanceCancelOrder(this.exchange, subaccount, symbol.toUpperCase(), orderID, setupVars, this.serverTimeOffset);

        // Check if response exist, throw an error if not
        if (!response) {
          throw new Error('Order cancel failed');
        }

        // handle success
        this.emit('success', response);

        if (retries) {
          const summary = new Error(`error cancelling order, id: ${orderID}, pair: ${pair}, sent after ${retries} retries.`);
          this.emit('success', summary);
        }

        // exit loop
        break;
      } catch (error) {
        // handle error and retry
        retries++;

        error.method = 'Cancel Order';
        error.id = orderID;
        error.symbol = pair;

        console.log(`Error name: ${error.method}, id: ${error.id}, pair: ${error.symbol}.`);

        if (retries === this.maxRetries) {
          const new_error = new Error(`error cancelling order, id: ${orderID}, pair: ${pair}, failed all ${retries} retries.`);
          this.emit('error', new_error);
          break;
        }
      }
    }
  }

  async ccxtCancelOrder(cex, pair, orderID) {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const response = await ccxtPromised.ccxtPromisedCancelOrder(cex, pair, orderID);
        // handle success
        this.emit('success', response);
        // exit loop
        break;
      } catch (error) {
        // handle error and retry
        retries++;

        error.method = 'Cancel Order';
        error.orderID = orderID;
        error.symbol = pair;

        this.emit('error', error);

        if (retries === this.maxRetries) {
          break;
        }
      }
    }
  }

  async binanceEditOrder(subaccount, orderID, pair, type, side, amount, price = undefined, clientId = undefined, stopPrice = undefined, timeInForce = 'GTC', setupVars = null) {
    let retries = 0;

    if (!this.serverTimeOffset) {
      this.serverTimeOffset = await utilities.updateServerTimeOffset();
    }

    while (retries < this.maxRetries) {
      try {
        const symbol = utilities.toContinuePair(pair);
        const response = await binancePromised.binanceEditOrder(this.exchange, subaccount, symbol.toUpperCase(), orderID, type.toUpperCase(), side.toUpperCase(), amount, price, clientId, stopPrice, timeInForce, setupVars, this.serverTimeOffset);

        // Check if response exist, throw an error if not
        if (!response) {
          throw new Error('Order edit failed');
        }

        // handle success
        this.emit('success', response);

        if (retries) {
          const summary = new Error(`error editing order, id: ${orderID}, pair: ${pair}, sent after ${retries} retries.`);
          this.emit('success', summary);
        }

        // exit loop
        break;
      } catch (error) {
        // handle error and retry
        retries++;

        error.method = 'Edit Order';
        error.orderID = orderID;
        error.symbol = pair;

        console.log(`Error name: ${error.method}, id: ${error.orderID}, pair: ${error.symbol}.`);

        if (retries === this.maxRetries) {
          const new_error = new Error(`error creating order, pair: ${pair}, failed all ${retries} retries.\nInput: subaccount: ${subaccount}, orderId: ${orderID}, type: ${type}, side: ${side}, amount: ${amount}, price: ${price}, clientId: ${clientId}, stopPrice: ${stopPrice}, timeInForce: ${timeInForce}`);
          this.emit('error', new_error);
          break;
        }
      }
    }
  }

  async ccxtEditOrder(cex, exchangeName, orderID, symbol, type, side, amount, price = undefined, clientId = undefined, stopPrice = undefined) {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const response = await ccxtPromised.ccxtPromisedEditOrder(cex, orderID, symbol, type, side, amount, price, clientId, stopPrice);
        // handle success
        this.emit('success', response);
        // exit loop
        break;
      } catch (error) {
        // handle error and retry
        retries++;

        error.method = 'Cancel Order';
        error.orderID = orderID;
        error.symbol = symbol;
        error.type = type;
        error.side = side;
        error.amount = amount;
        error.price = price;
        error.clientId = clientId;
        error.stopPrice = stopPrice;
        error.exchangeName = exchangeName;

        this.emit('error', error);

        if (retries === this.maxRetries) {
          break;
        }
      }
    }
  }

  async binanceCreateOrder(subaccount, pair, type, side, amount, price = undefined, clientId = undefined, stopPrice = undefined, timeInForce = 'GTC', setupVars = null, recvWindow = undefined, sandbox = false) {
    let retries = 0;

    if (!this.serverTimeOffset) {
      this.serverTimeOffset = await utilities.updateServerTimeOffset();
    }

    while (retries < this.maxRetries) {
      try {
        const symbol = utilities.toContinuePair(pair);
        const response = await binancePromised.binanceCreateOrder(this.exchange, subaccount, symbol.toUpperCase(), type.toUpperCase(), side.toUpperCase(), amount, price, clientId, stopPrice, timeInForce, setupVars, this.serverTimeOffset, recvWindow, sandbox);

        // Check if response exist, throw an error if not
        if (!response) {
          throw new Error('Order creation failed');
        }

        if (pair === this.symbol1) {
          this.dupeChecker1?.deleteTradeFromCache(clientId);
        } else if (pair === this.symbol2) {
          this.dupeChecker2?.deleteTradeFromCache(clientId);
        }

        // handle success
        this.emit('success', response);

        if (retries) {
          const summary = new Error(`Error creating order, pair: ${pair}, sent after ${retries} retries.`)
          this.emit('success', summary);
        }

        // exit loop
        break;
      } catch (error) {
        // handle error and retry
        retries++;
        error.method = 'Create Order';
        error.symbol = pair;
        console.log('Error name: ', error.method, ', pair: ', error.symbol);

        if (retries === this.maxRetries) {
          const new_error = new Error(`error creating order, pair: ${pair}, failed all ${retries} retries.\nInput: subaccount: ${subaccount}, pair: ${pair}, type: ${type}, side: ${side}, amount: ${amount}, price: ${price}, clientId: ${clientId}, stopPrice: ${stopPrice}, timeInForce: ${timeInForce}`);

          this.emit('error', new_error);
          break;
        }

        if (pair === this.symbol1 && this.dupeChecker1?.getTradeFromCache(clientId)) {
          this.dupeChecker1?.deleteTradeFromCache(clientId);
          const new_error = new Error(`Order already created, pair: ${pair}, sent after ${retries} retries.\nInput: subaccount: ${subaccount}, pair: ${pair}, type: ${type}, side: ${side}, amount: ${amount}, price: ${price}, clientId: ${clientId}, stopPrice: ${stopPrice}, timeInForce: ${timeInForce}`);
          this.emit('error', new_error);

          break;
        } else if (pair === this.symbol2 && this.dupeChecker2?.getTradeFromCache(clientId)) {
          this.dupeChecker2?.deleteTradeFromCache(clientId);
          const new_error = new Error(`Order already created, pair: ${pair}, sent after ${retries} retries.\nInput: subaccount: ${subaccount}, pair: ${pair}, type: ${type}, side: ${side}, amount: ${amount}, price: ${price}, clientId: ${clientId}, stopPrice: ${stopPrice}, timeInForce: ${timeInForce}`);
          this.emit('error', new_error);

          break;
        }
      }
    }
  }

  async ccxtCreateOrder(cex, exchangeName, pair, type, side, amount, price = undefined, clientId = undefined, stopPrice = undefined) {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const response = await ccxtPromised.ccxtPromisedCreateOrder(cex, pair, type, side, amount, price, clientId, stopPrice);

        if (pair === this.symbol1) {
          this.dupeChecker1?.deleteTradeFromCache(clientId);
        } else if (pair === this.symbol2) {
          this.dupeChecker2?.deleteTradeFromCache(clientId);
        }
        // handle success
        this.emit('success', response);
        // exit loop
        break;
      } catch (error) {
        // handle error and retry
        retries++;

        error.method = 'Create Order';
        error.exchangeName = exchangeName;
        error.symbol = pair;
        error.type = type;
        error.side = side;
        error.amount = amount;
        error.price = price;
        error.clientId = clientId;
        error.stopPrice = stopPrice;

        this.emit('error', error);

        if (retries === this.maxRetries) {
          break;
        }

        if (pair === this.symbol1 && this.dupeChecker1?.getTradeFromCache(clientId)) {
          this.dupeChecker1?.deleteTradeFromCache(clientId);
          const new_error = new Error(`Order already created, pair: ${pair}, sent after ${retries} retries.\nInput: pair: ${pair}, type: ${type}, side: ${side}, amount: ${amount}, price: ${price}, clientId: ${clientId}, stopPrice: ${stopPrice}`);
          this.emit('error', new_error);

          break;
        } else if (pair === this.symbol2 && this.dupeChecker2?.getTradeFromCache(clientId)) {
          this.dupeChecker2?.deleteTradeFromCache(clientId);
          const new_error = new Error(`Order already created, pair: ${pair}, sent after ${retries} retries.\nInput: pair: ${pair}, type: ${type}, side: ${side}, amount: ${amount}, price: ${price}, clientId: ${clientId}, stopPrice: ${stopPrice}`);
          this.emit('error', new_error);
          break;
        }
      }
    }
  }

  checkInternetConnection(pairId) {
    if (this['timer' + pairId] === null) {
      this['timer' + pairId] = setInterval(() => {
        checkInternetConnected()
          .then(() => {
            if (!this.closed && this[`ws${pairId}`] && this[`ws${pairId}`].readyState !== ReconnectingWebSocket.OPEN) {
              this.open(pairId);
            }
            this.stopChecking(pairId);
          })
          .catch((ex) => {
            console.log(ex); // cannot connect to a server or error occurred.
          });
      }, 10 * 1000); // 10 seconds in milliseconds
    }
  }

  stopChecking(pairId) {
    if (this['timer' + pairId] !== null) {
      clearInterval(this['timer' + pairId]);
      this['timer' + pairId] = null;
    }
  }

  emitPriceTrigger() {
    this.emit('trigger', { index: this.index, price: this.price, side: this.side });
  }

  emitPrice() {
    this.emit('price', this.price);
  }

  emitOpened(pairId) {
    if (pairId === 1) {
      this.emit('opened', `WebSocket connection opened for ${this.symbol1}`);
    } else {
      this.emit('opened', `WebSocket connection opened for ${this.symbol2}`);
    }
  }

  emitClose(pairId) {
    if (pairId === 1) {
      this.emit('close', `WebSocket connection closed for ${this.symbol1}`);
    } else {
      this.emit('close', `WebSocket connection closed for ${this.symbol2}`);
    }
  }

  emitInitialized() {
    if (this.symbol2) {
      this.emit('initialized', `WebSocket connection initialized for ${this.symbol1} and ${this.symbol2}`);
    } else this.emit('initialized', `WebSocket connection initialized for ${this.symbol1}`);
  }

  emitTaskExecuted() {
    if (this.symbol2) {
      this.emit('taskExecuted', `Task executed for ${this.symbol1} and ${this.symbol2} at index ${this.index}`);
    } else this.emit('initialized', `Task executed for ${this.symbol1} at index ${this.index}`);
  }

  emitTimeElapsed(wsId) {
    if (wsId === 1 || wsId === 2) {
      this.emit('elapsed', `The control time for PriceMonitor at pair ${this['symbol' + wsId]} has passed, checking internet connection.`);
    }
  }

  setList(list) {
    this.list = list;
    this.triggersInitialized = false;
  }

  setTasks(tasks) {
    this.tasks = tasks;
  }

  sendToWorker(index) {
    const runner = new PriceWorker(this.tasks);
    runner.run(index);
  }

  createPriceList(price, diff, range) {
    let array = [];
    for (let i = price - (range * diff); i <= price + (range * diff); i += diff) {
      array.push(i);
    }
    return array;
  }

  async close(pairId) {
    if (!this.isDex) {
      return new Promise((resolve) => {
        const handleClose = () => {
          if (pairId === 1 || pairId === 2) {
            if (this[`timeoutId${pairId}`]) {
              clearTimeout(this[`timeoutId${pairId}`]);
            }

            // Stop checking the internet connection
            this.stopChecking(pairId);

            // Remove all event listeners attached to the websocket
            this[`ws${pairId}`].onopen = null;
            this[`ws${pairId}`].onmessage = null;
            this[`ws${pairId}`].onerror = null;
            this[`ws${pairId}`].onclose = null;
            this[`ws${pairId}`] = null;
            this[`price${pairId}`] = 0;
            if (this[`dupeChecker${pairId}`]) {
              this[`dupeChecker${pairId}`].stop;
            }
            resolve();
          }
        };

        if (!pairId || pairId === 1) {
          if (this.ws1) {
            this.ws1.onclose = handleClose;
            this.ws1.close(1000, "", { keepClosed: true, fastClose: true });
          }
        }

        if (!pairId || pairId === 2) {
          if (this.ws2) {
            this.ws2.onclose = handleClose;
            this.ws2.close(1000, "", { keepClosed: true, fastClose: true });
          }
        }

        if (!pairId) {
          this.stopChecking(1);
          this.stopChecking(2);
        }

        this.closed = true;
      });
    } else if (this.isDex) {
      clearInterval(this.intervalId);
      this.provider.disconnect();
      this.closed = true;
    }
  }

  open(pairId) {
    if (this.closed) {
      console.log('Ignoring attempt to open WebSocket after close() was called');
      return;
    }
    this.firstMessageReceived1 = false;
    this.firstMessageReceived2 = false;
    this.triggersInitialized = false;
    if (!pairId) {
      if (!this.ws1 || this.ws1.readyState === ReconnectingWebSocket.CLOSED) {
        this.ws1.reconnect();
      }
      if (this.ws2 && this.ws2.readyState === ReconnectingWebSocket.CLOSED) {
        this.ws2.reconnect();
      }
    } else if (pairId === 1) {
      if (!this.ws1 || this.ws1.readyState === ReconnectingWebSocket.CLOSED) {
        this.ws1.reconnect();
      }
    } else if (pairId === 2) {
      if (this.ws2 && this.ws2.readyState === ReconnectingWebSocket.CLOSED) {
        this.ws2.reconnect();
      }
    }
  }

  refreshProvider() {
    this.retries += 1;

    if (this.retries > 5) {
      console.log(`Max retries of 5 exceeding: ${this.retries} times tried`);
      setTimeout(() => this.connectToDex(this.apiKey, this.pairAddress, this.version), 5000);
    }

    this.connectToDex(this.apiKey, this.pairAddress, this.version);
  }

  async handleWebSocketConnectionError() {
    console.log(`WebSocket connection error on ${this.version}. Reconnecting...`);
    this.provider.disconnect();
    this.refreshProvider();
  }

  resetProvider() {
    if (this.provider) {
      this.provider.disconnect();
      this.connectToDex(this.apiKey, this.pairAddress, this.version);
    }
  }

  async connectToDex(apiKey, pairAddress, version) {
    if (this.closed) {
      console.log(`Ignoring attempt to open WebSocket ${version} after close() was called`);
      return null;
    }
    // Check if version is supported
    if (!['v2', 'v3'].includes(version)) {
      console.log('Unsupported Uniswap version');
      return;
    }

    if (!this.apiKey || !this.pairAddress || !this.version) {
      this.apiKey = apiKey;
      this.pairAddress = pairAddress;
      this.version = version;
    }

    this.provider = new Web3.providers.WebsocketProvider(
      `wss://mainnet.infura.io/ws/v3/${apiKey}`
    );

    this.web3 = new Web3(this.provider);
    const abi = version === 'v2' ? UNISWAP_V2_PAIR_ABI : UNISWAP_V3_PAIR_ABI;
    this.pairContract = new this.web3.eth.Contract(abi, pairAddress);

    // Handle disconnects
    this.provider.on('error', () => this.handleWebSocketConnectionError());
    this.provider.on('end', () => this.handleWebSocketConnectionError());

    const updateState = (data) => {
      // update state
      this.dexState.token0 = new BN(data.returnValues.reserve0);
      this.dexState.token1 = new BN(data.returnValues.reserve1);
      this.dexState.blockNumber = data.blockNumber;

      // Emit price event
      const price = this.dexState.token0.div(this.dexState.token1);
      this.emit('price', price.toString(), version, pairAddress);
    };

    let processValueTimeout; // Timeout identifier
    let lastReceivedValue; // Last received value

    const processLastValue = () => {
      // Logic to process last received value
      const tick = Number(lastReceivedValue.returnValues.tick);
      const price = Math.pow(1.0001, tick);
      this.handleDexWebSocketMessage(price);
    };

    if (version === "v2") {
      // Setup for Uniswap v2
      [this.dexState.token0, this.dexState.token1] = await this.pairContract.methods.getReserves().call();
      this.dexState.blockNumber = await this.web3.eth.getBlockNumber();
      this.pairContract.events.Sync({}).on("data", (data) => updateState(data));
      this.emit('price', this.dexState.token0.div(this.dexState.token1).toString(), version, pairAddress);
    } else if (version === "v3") {
      // Setup for Uniswap v3
      const slot0 = await this.pairContract.methods.slot0().call();
      const currentTick = Number(slot0.tick);
      const price = Math.pow(1.0001, currentTick);
      this.handleDexWebSocketMessage(price);

      this.pairContract.events.Swap()
        .on('data', (event) => {
          // Store the last received value
          lastReceivedValue = event;

          if (processValueTimeout) {
            clearTimeout(processValueTimeout);
          }

          // Set a new timeout to process the last received value after a 0.5-second delay
          processValueTimeout = setTimeout(processLastValue, 500);
        })
        .on('error', (error) => {
          console.log(error);
          if (error.code === 'ECONNRESET') {
            this.handleWebSocketConnectionError();
          }
        });
    }
    // Return the pairContract
    return this.pairContract;
  }

}

// Export the WebSocketClient class
module.exports = PriceMonitor;