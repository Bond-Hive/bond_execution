const WebSocket = require('ws');
class BinanceWebSocketClient {
  constructor(url, symbol) {
    this.url = url;
    this.symbol = symbol;
    this.ws = null;
    this.reconnectInterval = 23 * 60 * 60 * 1000; // 23 hours
    this.inactivityTimeout = 3 * 60 * 1000; // 2 minutes
    this.isReconnecting = false;
    this.onOpen = this.onOpen.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onError = this.onError.bind(this);
    this.price = "";

    this.connect();
  }

  onOpen() {
    console.log('Price Socket Connected');
    this.resetTimer();
  }

  onMessage(data) {
    this.setupInactivityCheck();
    let message = JSON.parse(data.data);
    this.price = message.p;
  }

  onClose() {
    if (!this.isReconnecting) {
      console.log('Connection closed unexpectedly. Reconnecting...');
      this.reconnect();
    }
  }

  onError(error) {
    if (!this.isReconnecting) {
      console.error('WebSocket error:', error);
      this.reconnect();
    }
  }

  connect() {
    this.isReconnecting = false;
    this.ws = new WebSocket(`${this.url}/${this.symbol}@trade`);

    this.ws.addEventListener('open', this.onOpen);
    this.ws.addEventListener('message', this.onMessage);
    this.ws.addEventListener('close', this.onClose);
    this.ws.addEventListener('error', this.onError);
  }

  resetTimer() {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnect();
    }, this.reconnectInterval);
  }

  setupInactivityCheck() {
    clearTimeout(this.inactivityCheckTimeout);
    this.inactivityCheckTimeout = setTimeout(() => {
      console.log('Inactivity detected reconnecting...');
      this.reconnect();
    }, this.inactivityTimeout);
  }

  reconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    if (this.ws) {
      this.ws.removeEventListener('open', this.onOpen);
      this.ws.removeEventListener('message', this.onMessage);
      this.ws.removeEventListener('close', this.onClose);
      this.ws.removeEventListener('error', this.onError);

      this.ws.close();
      this.ws = null;
    }
    setTimeout(() => this.connect(), 2000);
  }

  close() {
    if (this.ws) {
      this.ws.removeEventListener('open', this.onOpen);
      this.ws.removeEventListener('message', this.onMessage);
      this.ws.removeEventListener('close', this.onClose);
      this.ws.removeEventListener('error', this.onError);
      this.ws.close();
      this.ws = null;
    }
  }

  getPrice() {
    return this.price;
  }
}

module.exports = { BinanceWebSocketClient };