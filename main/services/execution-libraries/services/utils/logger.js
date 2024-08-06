const EventEmitter = require('events');
const { insertOne } = require('../libraries/mongoose.js');
class logger extends EventEmitter {
  constructor(databaseName, collection) {
    super();
    this.logs = [];
    this.databaseName = databaseName;
    this.collection = collection;

    const now = new Date();
    const nextSharpHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
    const timeToNextSharpHour = nextSharpHour.getTime() - now.getTime();

    setTimeout(() => {
      this.toDB();
      this.logs = [];
      this.intervalId = setInterval(() => {
        this.toDB();
        this.logs = [];
      }, 30 * 60 * 1000);
    }, timeToNextSharpHour);

    process.on('uncaughtException', error => {
      this.emit('error', [error.name, error.message, error.stack]);
    });
    
    process.on('unhandledRejection', error => {
      this.emit('error', [error.name, error.message, error.stack]);
    });
  }

  async toDB() {
    const date = new Date();
    const newDateString = date.toISOString().split(".")[0];
    await insertOne(this.databaseName || 'CivFund', this.collection || 'Console', 'logs', { date: newDateString, logs: this.logs });
  }

  log(...args) {
    let message = args.map(arg => JSON.stringify(arg));
    this.emit('log', message);
  }

  error(error) {
    this.emit('error', [error.name, error.message, error.stack]);
  }

  warn(...args) {
    let message = args.map(arg => JSON.stringify(arg));
    this.emit('warn', message);
  }

  info(...args) {
    let message = args.map(arg => JSON.stringify(arg));
    this.emit('info', message);
  }

  debug(...args) {
    let message = args.map(arg => JSON.stringify(arg));
    this.emit('debug', message);
  }
}

module.exports = logger;
