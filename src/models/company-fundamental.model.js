const mongoose = require("mongoose");

const companyFundamentalSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
      index: true
    },
    companyName: {
      type: String,
      trim: true,
      default: null
    },
    marketCap: {
      type: Number,
      default: null
    },
    currentPrice: {
      type: Number,
      default: null
    },
    faceValue: {
      type: Number,
      default: null
    },
    marketCapCategory: {
      type: String,
      enum: ["large", "mid", "small", "unknown"],
      default: "unknown"
    },
    isFinancial: {
      type: Boolean,
      default: false
    },
    growth: {
      revenueGrowth1y: { type: Number, default: null },
      revenueGrowth3y: { type: Number, default: null },
      revenueGrowth5y: { type: Number, default: null },
      profitGrowth1y: { type: Number, default: null },
      profitGrowth3y: { type: Number, default: null },
      profitGrowth5y: { type: Number, default: null },
      profitTurnaround: { type: Boolean, default: false }
    },
    profitability: {
      operatingProfitMargin: { type: Number, default: null },
      roce: { type: Number, default: null },
      roe: { type: Number, default: null }
    },
    balanceSheet: {
      totalDebt: { type: Number, default: null },
      equityShareCapital: { type: Number, default: null },
      reserves: { type: Number, default: null },
      netWorth: { type: Number, default: null },
      capitalEmployed: { type: Number, default: null },
      debtToEquity: { type: Number, default: null },
      interestCoverage: { type: Number, default: null }
    },
    series: {
      sales: [{ type: Number }],
      netProfit: [{ type: Number }],
      borrowings: [{ type: Number }],
      reserves: [{ type: Number }],
      equityCapital: [{ type: Number }],
      pbt: [{ type: Number }],
      interest: [{ type: Number }],
      depreciation: [{ type: Number }],
      operatingCashFlow: [{ type: Number }]
    },
    source: {
      type: String,
      default: "screener_xlsx"
    },
    sourceFileName: {
      type: String,
      trim: true,
      default: null
    },
    dataAsOf: {
      type: String,
      trim: true,
      default: null
    },
    importedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

companyFundamentalSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("CompanyFundamental", companyFundamentalSchema);
