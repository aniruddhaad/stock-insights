const mongoose = require("mongoose");

const brokerConnectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    broker: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    credentials: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ["connected", "syncing", "auth_failed", "token_expired", "failed"],
      default: "connected"
    },
    lastSyncedAt: {
      type: Date,
      default: null
    },
    lastSyncCursor: {
      type: String,
      default: null
    },
    lastError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

brokerConnectionSchema.index({ user: 1, broker: 1 }, { unique: true });

brokerConnectionSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.credentials;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("BrokerConnection", brokerConnectionSchema);
