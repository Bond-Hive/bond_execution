'use strict';

const EventEmitter = require('events');
const { initializeProCcxt } = require('../libraries/initializeCcxt.js'); // Assuming you have an initializeCCXT module
const axios = require('axios');
const { insertOneOrder } = require('../libraries/mongoose.js')

class CheckOrders extends EventEmitter {
    constructor(exchangeName, subaccount, dBName, queueLabel = 'addToQueue', orderDelay = 5000) {
        super();
        this.queue = [];
        this.balance = null;
        this.running = false;
        this.exchange = null;
        this.exchangeName = exchangeName;
        this.subaccount = subaccount;
        this.queueLabel = queueLabel;
        this.dBName = dBName;
        this.orderDelay = orderDelay;
        this.initializeExchange();
        this.on(queueLabel, this.addOrderToQueue);
        this.counter = 0;
    }

    async initializeExchange() {
        this.exchange = await initializeProCcxt(this.exchangeName, this.subaccount);
        await this.watchBalance();
    }

    addOrderToQueue(order) {
        this.queue.push(order);

        if (order.type === 'MARKET') {
            const timeoutId = setTimeout(() => {
                this.emit('unmatchedOrder', order);
            }, this.orderDelay);

            order.timeoutId = timeoutId;
        }
    }

    async watchBalance() {
        this.running = true;

        while (this.running) {
            try {
                this.balance = await this.exchange.watchMyTrades();
                if (this.balance[0].info.X === 'FILLED') {
                    // Compare the received order with the queue array
                    for (let i = 0; i < this.queue.length; i++) {
                        if (this.queue[i].clientOrderId === this.balance[0].info.c) {
                            this.counter++;
                            // Matched order found, remove it from the queue
                            this.balance[0].subaccount = this.queue[i].subaccount;

                            // Clear the unmatchedOrder timer if it's a market order and the timeout is still present
                            if (this.queue[i].type === 'MARKET' && this.queue[i].timeoutId) {
                                clearTimeout(this.queue[i].timeoutId);
                                this.queue[i].timeoutId = null;
                            }

                            this.queue.splice(i, 1);
                            this.emit('matchedOrder', this.balance[0]);
                            this.addConfirmedTradeToDB(this.balance[0], this.counter);

                            break;
                        }
                    }
                }
            } catch (e) {
                this.handleErrors(e);
                break;
            }
        }
    }

    emitAddToQueue(order) {
        this.emit(this.queueLabel, order);
    }

    stopWatching() {
        this.running = false;
    }

    async reconnect() {
        this.stopWatching();
        await this.initializeExchange();
    }

    async checkInternetConnection() {
        try {
            const response = await axios.head('https://google.com');
            return response.status >= 200 && response.status < 300;
        } catch (e) {
            return false;
        }
    }

    async handleErrors(error) {
        const online = await this.checkInternetConnection();
        if (online) {
            this.reconnect();
        } else {
            console.log("Internet connection lost. Retrying in 10 seconds.");
            setTimeout(() => {
                this.handleErrors(error);
            }, 10000);
        }
    }

    async addConfirmedTradeToDB(trade, counter) {
        const subaccount = trade.subaccount;
        const modeledTrade = {
            number: counter,
            orderId: Number(trade.order),
            symbol: trade.info.s,
            status: trade.info.X,
            clientOrderId: trade.info.c,
            price: trade.price.toString(),
            avgPrice: trade.info.ap,
            origQty: trade.info.q,
            executedQty: trade.info.l,
            cumQuote: Number(trade.info.z),
            timeInForce: trade.info.f,
            type: trade.info.o,
            reduceOnly: trade.info.R,
            closePosition: trade.info.cp,
            side: trade.info.S,
            positionSide: trade.info.ps,
            stopPrice: trade.info.sp,
            workingType: trade.info.wt,
            priceProtect: trade.info.pP,
            origType: trade.info.ot,
            time: trade.info.T,
            updateTime: Math.floor(new Date().getTime() / 1000),
        };
        const collectionName = subaccount;
        await insertOneOrder(this.dBName, collectionName, modeledTrade);
    }
}

module.exports = CheckOrders;
