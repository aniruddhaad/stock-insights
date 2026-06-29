const env = require("../config/env");
const { roundTo, percentage } = require("../utils/math");
const { buildHoldingPeriod } = require("../utils/holding-period");

function classifyHoldingPeriod(holdingDurationDays) {
  if (holdingDurationDays === null || holdingDurationDays === undefined || !Number.isFinite(Number(holdingDurationDays))) {
    return "unknown";
  }

  return Number(holdingDurationDays) >= env.longTermHoldingDays ? "long_term" : "short_term";
}

function buildSuggestion(holdingType, profitLossPct, signals) {
  const longTermProfitThreshold = 20;
  const shortTermProfitThreshold = 12;
  const shouldBookProfit =
    (holdingType === "short_term" && profitLossPct >= shortTermProfitThreshold) ||
    (holdingType === "long_term" && profitLossPct >= longTermProfitThreshold);

  if (holdingType === "unknown") {
    return {
      code: "review_holding_period",
      reasonCodes: [...signals, "holding_period_unknown"]
    };
  }

  return {
    code: shouldBookProfit ? "booking_profit" : "hold_for_long_term",
    reasonCodes: shouldBookProfit
      ? [...signals, "profit_target_reached"]
      : holdingType === "long_term"
        ? [...signals, "long_term_window_active"]
        : [...signals, "monitor_position"]
  };
}

function resolveHoldingInputs({ acquisitionDate, holdingDurationDays, holdingType }, asOfDate = new Date()) {
  if (acquisitionDate) {
    return buildHoldingPeriod(acquisitionDate, asOfDate, {
      longTermHoldingDays: env.longTermHoldingDays
    });
  }

  if (holdingDurationDays === null || holdingDurationDays === undefined || !Number.isFinite(Number(holdingDurationDays))) {
    return {
      acquisitionDate: null,
      holdingDays: null,
      holdingMonths: null,
      holdingYears: null,
      holdingType: "unknown"
    };
  }

  const days = Math.max(0, Number(holdingDurationDays));

  return {
    acquisitionDate: null,
    holdingDays: days,
    holdingMonths: Math.floor(days / 30),
    holdingYears: Math.floor(days / 365),
    holdingType: holdingType || classifyHoldingPeriod(days)
  };
}

function analyzeSell({ buyPrice, quantity, currentPrice, acquisitionDate, holdingDurationDays, holdingType, asOfDate }) {
  const totalInvestment = roundTo(Number(buyPrice) * Number(quantity));
  const currentValue = roundTo(Number(currentPrice) * Number(quantity));
  const profitLoss = roundTo(currentValue - totalInvestment);
  const profitLossPct = percentage(profitLoss, totalInvestment);
  const holding = resolveHoldingInputs({ acquisitionDate, holdingDurationDays, holdingType }, asOfDate);
  const resolvedHoldingType = holding.holdingType;
  const signals = [];

  if (profitLoss > 0) {
    signals.push("position_in_profit");
  } else if (profitLoss < 0) {
    signals.push("position_in_drawdown");
  } else {
    signals.push("position_flat");
  }

  if (resolvedHoldingType === "long_term") {
    signals.push("long_term_holding");
  } else if (resolvedHoldingType === "short_term") {
    signals.push("short_term_holding");
  } else {
    signals.push("holding_period_unknown");
  }

  return {
    inputs: {
      buyPrice: roundTo(buyPrice),
      quantity: roundTo(quantity, 4),
      currentPrice: roundTo(currentPrice),
      acquisitionDate: holding.acquisitionDate,
      holdingDurationDays: holding.holdingDays,
      holdingMonths: holding.holdingMonths,
      holdingYears: holding.holdingYears
    },
    metrics: {
      totalInvestment,
      currentValue,
      profitLoss,
      profitLossPct
    },
    classification: {
      holdingType: resolvedHoldingType,
      thresholdDays: env.longTermHoldingDays
    },
    suggestion: buildSuggestion(resolvedHoldingType, profitLossPct, signals),
    signals: {
      profitable: profitLoss > 0,
      lossMaking: profitLoss < 0
    }
  };
}

module.exports = {
  classifyHoldingPeriod,
  resolveHoldingInputs,
  analyzeSell
};
