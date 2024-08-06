const { parentPort } = require('worker_threads');

parentPort.on('message', (data) => {
  const fn = eval(data.run);
  fn();
  parentPort.close();
});
