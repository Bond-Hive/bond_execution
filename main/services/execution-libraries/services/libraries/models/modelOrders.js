const mongoose = require("mongoose");

// this will be our data base's data structure
const orderSchema = new mongoose.Schema(
    {
        number: {
            type: Number,
            require: true,
        },
        orderId: {
            type: Number,
            require: true,
            maxLength: 100,
        },
        symbol: {
            type: String,
            require: true,
            maxLength: 100,
        },
        status: {
            type: String,
            require: true,
            maxLength: 100,
        },
        clientOrderId: {
            type: String,
            require: true,
            maxLength: 100,
        },
        price: {
            type: String,
            require: true,
            maxLength: 100,
        },
        avgPrice: {
            type: String,
            require: true,
            maxLength: 100,
        },
        origQty: {
            type: String,
            require: true,
            maxLength: 100,
        },
        executedQty: {
            type: String,
            require: true,
            maxLength: 100,
        },
        cumQuote: {
            type: Number,
            require: true,
            maxLength: 100,
        },
        timeInForce: {
            type: String,
            require: true,
            maxLength: 100,
        },
        type: {
            type: String,
            require: true,
            maxLength: 100,
        },
        reduceOnly: {
            type: Boolean,
            require: true,
        },
        closePosition: {
            type: Boolean,
            require: true,
        },
        side: {
            type: String,
            require: true,
            maxLength: 100,
        },
        positionSide: {
            type: String,
            require: true,
            maxLength: 100,
        },
        stopPrice: {
            type: String,
            require: true,
            maxLength: 100,
        },
        workingType: {
            type: String,
            require: true,
            maxLength: 100,
        },
        priceProtect: {
            type: Boolean,
            require: true,
            maxLength: 100,
        },
        origType: {
            type: String,
            require: true,
            maxLength: 100,
        },
        time: {
            type: Number,
            require: true,
            maxLength: 100,
        },
        updateTime: {
            type: Number,
            require: true,
            maxLength: 100,
        },
    },
    { versionKey: false, timestamps: true }
);

// export the new Schema so we could modify it using Node.js
module.exports = orderSchema;