const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildDecisionPayload } = require("../src/services/decision-engine.service");

function buildPayload() {
  return buildDecisionPayload({
    summary: {
      totalInvestment: 100,
      totalCurrentValue: 180,
      totalProfitLoss: 80,
      totalProfitLossPct: 80,
      holdingsCount: 1,
      allocation: [{ symbol: "TEST", allocationPct: 12 }]
    },
    portfolioScenarioProjection: null,
    options: {},
    positions: [{
      stockId: "1",
      symbol: "TEST",
      quantity: 1,
      prices: { buyPrice: 100, currentPrice: 180 },
      holding: { holdingDays: 500, holdingType: "long_term" },
      metrics: { investedAmount: 100, currentValue: 180, profitLoss: 80, profitLossPct: 80, allocationPct: 12 },
      decisionInputs: {
        qualityScore: 5.5,
        technicalTrend: "neutral",
        momentum: "weak",
        sentiment: "negative"
      },
      sellAnalysis: {
        metrics: { totalInvestment: 100, currentValue: 180, profitLoss: 80, profitLossPct: 80 },
        classification: { holdingType: "long_term", thresholdDays: 365 },
        suggestion: { code: "booking_profit", reasonCodes: ["profit_target_reached"] },
        signals: { profitable: true, lossMaking: false }
      },
      sentiment: { sentiment: { label: "negative", score: -2 } },
      scoring: {
        finalScore: 5.5,
        normalizedScores: { technicalScore: 5, fundamentalScore: 6, sentimentScore: 3 },
        portfolioSignals: { signalCodes: ["strong_unrealized_gain"], overexposureSeverity: null }
      }
    }]
  });
}

test("decision payload exposes one explanation, action, confidence, and reasoning chain", () => {
  const position = buildPayload().positions[0];

  assert.equal(position.explanations.length, 1);
  assert.equal(new Set(position.explanations).size, 1);
  assert.equal(position.explanation, position.decision.explanation);
  assert.equal(position.explanations[0], position.decision.explanation);
  assert.deepEqual(position.portfolioAction, position.decision.portfolioAction);
  assert.deepEqual(position.confidence, position.decision.confidence);
  assert.deepEqual(position.primaryDriver, position.decision.primaryDriver);
  assert.deepEqual(position.supportingFactors, position.decision.supportingFactors);
  assert.equal(position.confidenceLabel, position.decision.confidence.label);
  assert.equal(position.decision.portfolioAction.label, "Book Partial Profits");
});

test("compatibility suggestion is derived from and agrees with the decision", () => {
  const position = buildPayload().positions[0];

  assert.equal(position.sellAnalysis.suggestion.code, "book_partial_profits");
  assert.equal(position.sellAnalysis.suggestion.reasonCodes[0], position.decision.primaryDriver.code);
  assert.deepEqual(
    position.sellAnalysis.suggestion.reasonCodes.slice(1),
    position.decision.supportingFactors.map((factor) => factor.code)
  );
  assert.equal(position.sellAnalysis.suggestion.reasonCodes.includes("profit_target_reached"), false);
});

test("one decision cannot contain contradictory sentiment or portfolio actions", () => {
  const position = buildPayload().positions[0];
  const serialized = JSON.stringify(position.decision);

  assert.equal(position.decision.evidence.sentiment, "negative");
  assert.doesNotMatch(serialized, /sentiment is neutral/i);
  assert.doesNotMatch(serialized, /current (sell|buy) signal/i);
  assert.equal((serialized.match(/"portfolioAction"/g) || []).length, 1);
});

test("frontend renders only decision.explanation and never iterates legacy explanations", () => {
  const frontend = fs.readFileSync(
    path.join(__dirname, "../public/assets/insights-page.js"),
    "utf8"
  );

  assert.match(frontend, /decision\.explanation/);
  assert.doesNotMatch(frontend, /position\.explanations/);
  assert.doesNotMatch(frontend, /mapExplanation/);
});
