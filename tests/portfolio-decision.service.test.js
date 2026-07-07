const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPortfolioDecision,
  toLegacySuggestion
} = require("../src/services/portfolio-decision.service");

function position({
  qualityScore,
  profitLossPct,
  allocationPct,
  technicalTrend = "neutral",
  momentum = "neutral",
  sentiment = "neutral",
  valuation = "fair",
  diversification = "good"
}) {
  return {
    metrics: { profitLossPct, allocationPct },
    decisionInputs: {
      qualityScore,
      technicalTrend,
      momentum,
      sentiment,
      valuation,
      diversification
    },
    sentiment: { sentiment: { label: sentiment, score: sentiment === "negative" ? -2 : sentiment === "positive" ? 2 : 0 } },
    scoring: {
      finalScore: qualityScore,
      portfolioSignals: { signalCodes: [] }
    }
  };
}

test("excellent company with 120% gain, small allocation, and healthy trend is held", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 9.2,
    profitLossPct: 120,
    allocationPct: 8,
    technicalTrend: "healthy",
    momentum: "strong",
    sentiment: "positive"
  }));

  assert.equal(decision.investmentQuality.label, "High");
  assert.equal(decision.portfolioAction.label, "Hold");
  assert.equal(decision.decisionStage, "long_term_compounder");
  assert.match(decision.explanation, /gain does not outweigh/i);
});

test("excellent company at 35% allocation is reduced for concentration risk", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 9.2,
    profitLossPct: 120,
    allocationPct: 35,
    technicalTrend: "healthy",
    momentum: "strong",
    sentiment: "positive"
  }));

  assert.equal(decision.portfolioAction.label, "Reduce Position");
  assert.equal(decision.primaryDriver.label, "Concentration risk");
  assert.equal(decision.decisionStage, "portfolio_risk");
  assert.doesNotMatch(decision.primaryDriver.label, /profit/i);
});

test("weak company with a loss and negative trend is exited", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 2.8,
    profitLossPct: -35,
    allocationPct: 10,
    technicalTrend: "negative",
    momentum: "weak",
    sentiment: "negative"
  }));

  assert.equal(decision.portfolioAction.label, "Exit");
  assert.equal(decision.primaryDriver.code, "deteriorating_investment_health");
  assert.equal(decision.decisionStage, "investment_health");
});

test("weak but not fully deteriorated company is reduced for investment health, not portfolio risk", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 3.8,
    profitLossPct: -5,
    allocationPct: 8,
    technicalTrend: "negative"
  }));

  assert.equal(decision.portfolioAction.label, "Reduce Position");
  assert.equal(decision.decisionStage, "investment_health");
  assert.equal(decision.primaryDriver.label, "Weak investment health");
  assert.doesNotMatch(decision.explanation, /driven by portfolio risk/i);
});

test("average company with 80% gain, weak momentum, and negative sentiment books partial profits", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 5.5,
    profitLossPct: 80,
    allocationPct: 12,
    technicalTrend: "neutral",
    momentum: "weak",
    sentiment: "negative"
  }));

  assert.equal(decision.portfolioAction.label, "Book Partial Profits");
  assert.equal(decision.decisionStage, "valuation_profit_taking");
  assert.ok(decision.supportingFactors.length >= 2);
});

test("excellent diversified compounder with 300% gain remains a hold", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 9.5,
    profitLossPct: 300,
    allocationPct: 14,
    technicalTrend: "healthy",
    momentum: "strong",
    sentiment: "positive",
    diversification: "good"
  }));

  assert.equal(decision.portfolioAction.label, "Hold");
  assert.notEqual(decision.portfolioAction.label, "Book Profits");
  assert.equal(decision.primaryDriver.label, "Strong long-term fundamentals");
});

test("a high gain by itself can never trigger profit booking", () => {
  for (const gain of [80, 120, 300, 1000]) {
    const decision = buildPortfolioDecision(position({
      qualityScore: 8.8,
      profitLossPct: gain,
      allocationPct: 10,
      technicalTrend: "healthy",
      momentum: "strong",
      sentiment: "positive"
    }));

    assert.equal(decision.portfolioAction.label, "Hold");
  }
});

test("legacy suggestion shape is retained but aligned to the authoritative action", () => {
  const decision = buildPortfolioDecision(position({
    qualityScore: 9.2,
    profitLossPct: 300,
    allocationPct: 10,
    technicalTrend: "healthy",
    momentum: "strong",
    sentiment: "positive"
  }));
  const suggestion = toLegacySuggestion(decision, {
    code: "booking_profit",
    reasonCodes: ["profit_target_reached"]
  });

  assert.equal(suggestion.code, "hold_for_long_term");
  assert.equal(suggestion.reasonCodes.includes("profit_target_reached"), false);
  assert.equal(suggestion.reasonCodes[0], "strong_long_term_fundamentals");
});
