const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema(
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
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.0001
    },
    buyPrice: {
      type: Number,
      required: true,
      min: 0.01
    },
    buyDate: {
      type: Date,
      required: true
    },
    acquisitionDate: {
      type: Date,
      default: null
    },
    holdingAgeSource: {
      type: String,
      enum: ["broker_provided", "estimated", "unknown"],
      default: "broker_provided"
    },
    acquisitionDateConfidence: {
      type: String,
      enum: ["high", "medium", "low", "unknown"],
      default: "high"
    },
    currentPrice: {
      type: Number,
      default: null,
      min: 0.01
    },
    note: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: true
  }
);

stockSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("Stock", stockSchema);
