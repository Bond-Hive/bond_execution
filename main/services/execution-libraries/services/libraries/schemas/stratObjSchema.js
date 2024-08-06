const { Schema } = require("mongoose");

const executedSchema = new Schema(
    {
        tokenHedged: String,
        price: String,
    },
    { _id: false }
);

const feeObjSchema = new Schema(
    {
        feeTokenUnhedged: String,
        basePrice: String,
        baseQuantity: String,
        dexPrice: String,
        estimatedFeeToken: String,
        hedgedToken: String,
        unhedgedToken: String,
        executed: { type: Map, of: executedSchema },
    },
    { _id: false }
);

const actionListWithTriggersSchema = new Schema(
    {
        triggerPrice: String,
        gridLevel: String,
        triggerOnHigherPrice: {
            isTradesCounterTrue: { action: String },
            isTradesCounterFalse: { action: String },
        },
        triggerOnLowerPrice: {
            isTradesCounterTrue: { action: String },
            isTradesCounterFalse: { action: String },
        },
    },
    { _id: false }
);

const mainObjWithGridsSchema = new Schema(
    {
        price: String,
        buyPrice: String,
        sellPrice: String,
        quantity: String,
        percentagePosition: String,
        grid: String,
        tradesCounter: String,
    },
    { _id: false }
);

const unhedgedTokensSchema = new Schema(
    {
        sell: { type: Map, of: String },
        netAmount: String,
        netSellAmount: String,
        netBuyAmount: String,
        buy: { type: Map, of: String },
    },
    { _id: false }
);

const stratObjSchema = new Schema(
    {
        startQuantity: String,
        lowerPriceLimit: String,
        upperPriceLimit: String,
        tickSpacing: String,
        startPrice: String,
        inputVariablesObj: String,
        inputVariables: Schema.Types.Mixed,
        loaded: Boolean,
        dynamicOrderSwitchFlag: Boolean,
        tokenToHedgeSide: String,
        triggerNumber: String,
        missedGrids: Schema.Types.Mixed,
        calculateNextActions: Schema.Types.Mixed,
        netPosition: String,
        mainObjWithGrids: { type: Map, of: mainObjWithGridsSchema },
        priceListWithTriggers: [String],
        actionListWithTriggers: [actionListWithTriggersSchema],
        triggerData: Schema.Types.Mixed,
        unhedgedTokens: unhedgedTokensSchema,
        overHedgeScalping: Schema.Types.Mixed,
        runningFlag: Boolean,
        feeObj: feeObjSchema,
    }
);

module.exports = stratObjSchema;
