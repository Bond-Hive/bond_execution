const mongoose = require("mongoose");

const createOrdersModel = (subaccount) => {
  const orderSchema = new mongoose.Schema({
    symbol: String,
    orderId: String,
    clientOrderId: String,
    transactTime: Number,
    price: String,
    origQty: String,
    executedQty: String,
    originalFees: String,
    fees:String,
    feesAsset:String,
    status: String,
    timeInForce: String,
    type: String,
    side: String,
    originalPrice: String,
    stopPrice:String,
  });

  // Check if the model is already compiled, and return it if it is
  return mongoose.models[subaccount + '_accounts'] || mongoose.model(subaccount + '_accounts', orderSchema);
};

const createOrdersModelParFilled = (subaccount) => {
  const orderSchema = new mongoose.Schema({
    symbol: String,
    orderId: String,
    clientOrderId: String,
    transactTime: Number,
    price: String,
    origQty: String,
    executedQty: String,
    fees:String,
    feesAsset:String,
    status: String,
    timeInForce: String,
    type: String,
    side: String,
    originalPrice: String,
    stopPrice:String,
    lastFilledQuantity:String,
  });

  // Check if the model is already compiled, and return it if it is
  return mongoose.models[subaccount + '_accounts_partial'] || mongoose.model(subaccount + '_accounts_partial', orderSchema);
};

const summarySchema = () => {
  const schema = new mongoose.Schema({
    startDate: Date,
    lastTradeAdded: Date,
    subaccountName: String,
    recentErrorInReconciliation: { type: Boolean, default: false }
  });
  
  // Check if the model is already compiled, and return it if it is
  return mongoose.models.Summary || mongoose.model("Summary", schema);
};

module.exports = {
  createOrdersModel,
  createOrdersModelParFilled,
  summarySchema
};
