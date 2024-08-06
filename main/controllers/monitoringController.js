const yieldDisplay = require('../../strategy/carryTradeV1/yieldDisplay');
const mainFunction =  require('../../strategy/carryTradeV1/mainFunctionV1');
const treasuryOperations =  require('../../strategy/carryTradeV1/treasury_operations');

const WebSocket = require('ws');

// Create a WebSocket server
const wss = new WebSocket.Server({ port: 9080 });

// Broadcast to all clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Setup WebSocket connection listener
wss.on('connection', ws => {
  console.log('Client connected');
  ws.on('message', message => {
    console.log('Received: %s', message);
  });
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Function to fetch and send yields
function updateYields() {
  try {
    let formattedData = [];
    Object.keys(averageYieldsPostExecutionGlobal).forEach(symbolFuture => {
      const averageYieldPostExecution = averageYieldsPostExecutionGlobal[symbolFuture];
      formattedData.push({
        symbolFuture,
        averageYieldPostExecution: formatYieldAsRange(averageYieldPostExecution)
      });
    });
    const data = JSON.stringify(formattedData);
    broadcast(data);
  } catch (e) {
    console.error('Error updating yields:', e);
  }
}

// Send yields every second
setInterval(updateYields, 1000);


const { averageYieldsPostExecutionGlobal } = require('../../strategy/carryTradeV1/yieldDisplay'); // Adjust the path as necessary

const getYields = async (req, res) => {
  try {
    let formattedData = [];
    Object.keys(averageYieldsPostExecutionGlobal).forEach(symbolFuture => {
      const averageYieldPostExecution = averageYieldsPostExecutionGlobal[symbolFuture];
      formattedData.push({
        symbolFuture,
        averageYieldPostExecution: formatYieldAsRange(averageYieldPostExecution) // Use the same formatting function
      });
    });
    res.json(formattedData);
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const updateOracle = async (req, res) => {
  const { contractAddress, secretKey } = req.body; // Extract contract address and secret key from the body
  const password = req.headers.password; // Extract password from the headers

  if (password === process.env.ORACLE_UPDATE_PASSWORD) { // Use environment variable for the password
    try {
      const result = await mainFunction.oracleFunction(contractAddress, secretKey); // Handle await separately
      res.send(result); // Send the result
    } catch (e) {
      console.error(e);
      res.status(500).send({ result: 'FAILURE', exception: e.message, error: e.stack }); // Chain status and send correctly
    }
  } else {
    res.status(401).send("Wrong password"); // Use proper HTTP status code for unauthorized access
  }
};

const transferTreasury = async (req, res) => {
  const { contractAddress } = req.body; // Extract contract address and secret key from the body
  const password = req.headers.password; // Extract password from the headers

  if (password === process.env.ORACLE_UPDATE_PASSWORD) { // Use environment variable for the password
    try {
      const result = await treasuryOperations.checkTreasury(contractAddress); // Handle await separately
      res.send(result); // Send the result
    } catch (e) {
      console.error(e);
      res.status(500).send({ result: 'FAILURE', exception: e.message, error: e.stack }); // Chain status and send correctly
    }
  } else {
    res.status(401).send("Wrong password"); // Use proper HTTP status code for unauthorized access
  }
};

function formatYieldAsRange(value, rangePercentage = 1) {
  // Calculate the range values
  const lowerBound = value * (1 - rangePercentage / 100);
  const upperBound = value * (1 + rangePercentage / 100);
  
  // Convert to percentage format with two decimals
  const lowerBoundPercent = (lowerBound * 100).toFixed(2) + '%';
  const upperBoundPercent = (upperBound * 100).toFixed(2) + '%';
  
  return { lower: lowerBoundPercent, upper: upperBoundPercent };
}

const stopYieldCalc = async (req, res) => {
  try {
    res.send(
      yieldDisplay.stopWebSockets()
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};

const restartYieldCalc = async (req, res) => {
  try {
    res.send(
      yieldDisplay.restartYieldCalc()
    );
  } catch (e) {
    console.error(e);
    res.status(500);
    res.send({result: 'FAILURE', exception: e.message, error: e.stack});
  }
};


module.exports = {
  stopYieldCalc,
  restartYieldCalc,
  getYields,
  updateOracle,
  transferTreasury
};
