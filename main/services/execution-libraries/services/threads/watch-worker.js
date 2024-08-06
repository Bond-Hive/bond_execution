const { parentPort } = require('worker_threads');

parentPort.on('message', (data) => {
  // Check if the element already exists in the orders array
  const i = data.orders.findIndex(element => element.id === data.order.id);
  if (i === -1) {
    // If the element does not already exist in the orders array, add it
    data.orders.push(data.order);
  } else {
    // If the element already exists in the orders array, update it
    data.orders[i] = data.order;

    // Move the updated element to the latest position in the orders array
    data.orders.push(data.orders.splice(i, 1)[0]);
  }

  // If the orders array has more than 40 elements, remove the oldest element
  if (data.orders.length > 40) {
    data.orders.splice(0, 1);
  }

  const unvalidStatuses = ['closed', 'canceled', 'expired'];
  
  // Check if the element's status is valid
  if (unvalidStatuses.includes(data.order.status)) {
      // Find the index of the element in the openOrders array
      const i = data.openOrders.findIndex(element => element.id === data.order.id);
  
      // If the element exists in the openOrders array, remove it
      if (i > -1) {
        data.openOrders.splice(i, 1);
      }
    } else if (data.order.status === 'open') {
      // If the element's status is 'open', add it to the openOrders array
      data.openOrders.push(data.order);
    }

  parentPort.postMessage(data);
  parentPort.close();
});
