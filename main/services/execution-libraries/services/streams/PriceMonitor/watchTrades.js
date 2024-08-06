const EventEmitter = require('events');
const { initializeProCcxt } = require('../../libraries/initializeCcxt.js');
const axios = require('axios');

class WatchTrades extends EventEmitter {
    constructor(cex, subaccount = "None", symbol, strategyVersion, cacheLimit = 10000) {
        super();
        this.cex = cex;
        this.subaccount = subaccount;
        this.tradeCache = new Map();
        this.cacheLimit = cacheLimit;
        this.cacheKeys = []; // to track the order of keys
        this.run = true;
        this.symbol = symbol;
        this.strategyVersion = strategyVersion;
        this.watchTrades();
    }

    async watchTrades() {
        const exchange = initializeProCcxt(this.cex, this.subaccount);
        this.emitStartUpdate();
        while (this.run) {
            try {
                let trade = (await exchange.watchMyTrades(this.symbol))[0];
                if (trade && trade.type === 'market' && trade.info['X'] === 'FILLED' && trade.info.c.startsWith(this.strategyVersion)) {
                    if (this.tradeCache.size >= this.cacheLimit) {
                        let oldestKey = this.cacheKeys.shift();
                        this.tradeCache.delete(oldestKey);
                    }
                    this.tradeCache.set(trade.info.c, trade);
                    this.cacheKeys.push(trade.info.c);
                }
            } catch (e) {
                if (e.constructor.name === "RequestTimeout" || e.constructor.name === "NetworkError") {
                    console.log("Request timeout occurred, checking internet connection...");
                    if (await this.checkInternetConnection()) {
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

    getTradeFromCache(id) {
        return this.tradeCache.get(id) || null;
    }

    deleteTradeFromCache(id) {
        const index = this.cacheKeys.indexOf(id);
        if (index > -1) {
            this.cacheKeys.splice(index, 1);
        }
        return this.tradeCache.delete(id);
    }

    async checkInternetConnection() {
        try {
            const response = await axios.head('https://google.com');
            return response.status >= 200 && response.status < 300;
        } catch (e) {
            return false;
        }
    }

    stop() {
        this.run = false;
    }

    start() {
        if (!this.run) {
            this.run = true;
            this.watchTrades();
        }
    }

    emitStartUpdate() {
        this.emit('start', `Watching trades for ${this.subaccount} on ${this.cex} for pair ${this.symbol}...`);
    }
}

module.exports = WatchTrades;
