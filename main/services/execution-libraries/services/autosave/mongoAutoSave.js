class AutoSaveMongoDB {
  constructor(interval, databaseName, collectionName, prefix) {
    const db = require('../libraries/mongoose.js');
    this.interval = interval;
    this.databaseName = databaseName;
    this.collectionName = collectionName;
    this.prefix = prefix;
    this.db = db;
    this.start();
  }

  async start() {
    this.intervalId = setInterval(() => {
      this.saveData();
    }, this.interval);
  }

  async saveData() {
    for (const key in this) {
      if (key.startsWith(this.prefix)) {
        const result = await this.db.replaceOne(this.databaseName, this.collectionName, 'autosave','name', key, {data: this[key], name: `${key}`});
        if (result.matchedCount === 0) {
          this.db.insertOne(this.databaseName, this.collectionName, 'autosave', {data: this[key], name: `${key}`});
        }
      }
    }
  }

  async loadData() {
    // Find all documents in the collection and return as an array
    const docs = await this.db.getDBFindAll(this.databaseName, this.collectionName);
    docs.forEach(function(obj) {
      delete obj._id;
      delete obj.__v;
    });
    return docs;
  }

  stop(interval = null, reset = false, deleteAll = false) {
    clearInterval(this.intervalId);

    if (interval !== null)
    this.interval = interval;
    if (reset)
    this.reset();
    if (deleteAll)
    this.db.deleteAll(this.databaseName, this.collectionName);
  }

  reset() {
    for (const key in this) {
      if (key.startsWith(this.prefix)) {
        delete this[key];
      }
    }
  }
}

module.exports = AutoSaveMongoDB;
