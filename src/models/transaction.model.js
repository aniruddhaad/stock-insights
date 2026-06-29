const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: ["BUY", "SELL"]
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.0001
    },
    price: {
      type: Number,
      required: true,
      min: 0.01
    },
    transactionDate: {
      type: Date,
      required: true,
      index: true
    },
    acquisitionDate: {
      type: Date,
      default: null,
      index: true
    },
    broker: {
      type: String,
      trim: true,
      default: "manual"
    },
    brokerage: {
      type: Number,
      default: 0,
      min: 0
    },
    taxes: {
      type: Number,
      default: 0,
      min: 0
    },
    fees: {
      type: Number,
      default: 0,
      min: 0
    },
    feeBreakdown: {
      stt: { type: Number, default: 0, min: 0 },
      gst: { type: Number, default: 0, min: 0 },
      exchangeCharges: { type: Number, default: 0, min: 0 },
      stampDuty: { type: Number, default: 0, min: 0 },
      otherFees: { type: Number, default: 0, min: 0 }
    },
    netAmount: {
      type: Number,
      required: true
    },
    externalTransactionId: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      enum: ["csv", "broker", "manual", "BROKER_HOLDING_BOOTSTRAP"],
      default: "manual"
    },
    currentPrice: {
      type: Number,
      default: null,
      min: 0.01
    },
    synthetic: {
      type: Boolean,
      default: false,
      index: true
    },
    bootstrapImport: {
      type: Boolean,
      default: false,
      index: true
    },
    holdingAgeSource: {
      type: String,
      enum: ["broker_provided", "estimated", "unknown"],
      default: null
    },
    inferredHoldingDays: {
      type: Number,
      default: null,
      min: 0
    },
    acquisitionDateConfidence: {
      type: String,
      enum: ["high", "medium", "low", "unknown", null],
      default: null,
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    ignored: {
      type: Boolean,
      default: false,
      index: true
    },
    ignoredAt: {
      type: Date,
      default: null
    },
    ignoredReason: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: true
  }
);

transactionSchema.index({ user: 1, broker: 1, externalTransactionId: 1 }, { unique: true });

transactionSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Transaction", transactionSchema);
