const { Worker } = require('worker_threads');
const path = require('path');

// Construct path to worker file
const workerPath = path.join(__dirname, 'price-worker.js');

class PriceWorker {
  constructor(tasks) {
    this.tasks = tasks;
  }

  run(index) {
    const worker = new Worker(workerPath);

    const data = this.tasks[index];
    worker.postMessage(data);
  }
}

module.exports = {
  PriceWorker
}