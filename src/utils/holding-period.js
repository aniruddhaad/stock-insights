const { differenceInDays } = require("./date");

const LONG_TERM_HOLDING_DAYS = 365;

function normalizeConfidence(value, fallback = "unknown") {
  if (["high", "medium", "low", "unknown"].includes(value)) {
    return value;
  }

  if (typeof value === "number") {
    if (value >= 0.9) {
      return "high";
    }

    if (value >= 0.5) {
      return "medium";
    }

    return "low";
  }

  return fallback;
}

function buildHoldingPeriod(acquisitionDate, asOfDate = new Date(), options = {}) {
  if (!acquisitionDate) {
    return {
      acquisitionDate: null,
      holdingDays: null,
      holdingMonths: null,
      holdingYears: null,
      holdingType: "unknown"
    };
  }

  const holdingDays = differenceInDays(acquisitionDate, asOfDate);
  const thresholdDays = Number(options.longTermHoldingDays || LONG_TERM_HOLDING_DAYS);

  return {
    acquisitionDate: new Date(acquisitionDate).toISOString(),
    holdingDays,
    holdingMonths: Math.floor(holdingDays / 30),
    holdingYears: Math.floor(holdingDays / 365),
    holdingType: holdingDays >= thresholdDays ? "long_term" : "short_term"
  };
}

module.exports = {
  buildHoldingPeriod,
  normalizeConfidence
};
