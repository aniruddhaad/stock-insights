const test = require("node:test");
const assert = require("node:assert/strict");
const scoringConfig = require("../src/config/scoring.config");
const { buildScoreBreakdown, resolveScoreWeights } = require("../src/services/scoring.service");

function createPosition({ profitLossPct, allocationPct, holdingDays }) {
  return {
    metrics: {
      profitLossPct,
      allocationPct
    },
    holding: {
      holdingDays
    }
  };
}

test("scoring service keeps default weights when no dynamic adjustments apply", () => {
  const scoring = buildScoreBreakdown(
    createPosition({
      profitLossPct: 3,
      allocationPct: 25,
      holdingDays: 200,
      suggestionCode: "hold_for_long_term"
    }),
    0
  );

  assert.deepEqual(scoring.defaultWeights, scoringConfig.defaultWeights);
  assert.deepEqual(scoring.weights, scoringConfig.defaultWeights);
  assert.deepEqual(scoring.weightAdjustments, []);
  assert.deepEqual(scoring.normalizedScores, {
    technicalScore: 5,
    fundamentalScore: 3.33,
    sentimentScore: 5,
    portfolioSignals: 5
  });
  assert.deepEqual(scoring.weightedScores, {
    technicalScore: 1.75,
    fundamentalScore: 0.83,
    sentimentScore: 0.75,
    portfolioSignals: 1.25
  });
  assert.deepEqual(scoring.scoreScale, {
    min: 0,
    max: 10
  });
  assert.equal(scoring.finalScore, 4.58);
});

test("scoring service applies a small proportional moderate penalty at 45% allocation", () => {
  const scoring = buildScoreBreakdown(
    createPosition({
      profitLossPct: 14,
      allocationPct: 45,
      holdingDays: 120,
      suggestionCode: "booking_profit"
    }),
    2
  );

  assert.deepEqual(scoring.weights, {
    technicalScore: 0.37,
    fundamentalScore: 0.08,
    sentimentScore: 0.25,
    portfolioSignals: 0.3
  });
  assert.deepEqual(scoring.weightAdjustments, [
    "overexposure_emphasis",
    "short_term_technical_emphasis",
    "strong_sentiment_emphasis"
  ]);
  assert.deepEqual(scoring.portfolioSignals, {
    score: 1.5,
    signalCodes: ["moderate_overexposure", "strong_unrealized_gain"],
    overexposureSeverity: "moderate_overexposure",
    overexposurePenalty: -0.5
  });
  assert.equal(scoring.finalScore, 7.53);
});

test("scoring service applies the max moderate-boundary penalty at 60% allocation", () => {
  const scoring = buildScoreBreakdown(
    createPosition({
      profitLossPct: 14,
      allocationPct: 60,
      holdingDays: 120,
      suggestionCode: "booking_profit"
    }),
    2
  );

  assert.deepEqual(scoring.weights, {
    technicalScore: 0.37,
    fundamentalScore: 0.08,
    sentimentScore: 0.25,
    portfolioSignals: 0.3
  });
  assert.deepEqual(scoring.portfolioSignals, {
    score: 0,
    signalCodes: ["moderate_overexposure", "strong_unrealized_gain"],
    overexposureSeverity: "moderate_overexposure",
    overexposurePenalty: -2
  });
  assert.equal(scoring.finalScore, 6.78);
});

test("scoring service applies a stronger high-severity penalty at 75% allocation", () => {
  const scoring = buildScoreBreakdown(
    createPosition({
      profitLossPct: 14,
      allocationPct: 75,
      holdingDays: 120,
      suggestionCode: "booking_profit"
    }),
    2
  );

  assert.deepEqual(scoring.weights, {
    technicalScore: 0.34,
    fundamentalScore: 0.05,
    sentimentScore: 0.22,
    portfolioSignals: 0.39
  });
  assert.deepEqual(scoring.weightAdjustments, [
    "overexposure_emphasis",
    "short_term_technical_emphasis",
    "strong_sentiment_emphasis"
  ]);
  assert.deepEqual(scoring.portfolioSignals, {
    score: -3,
    signalCodes: ["high_overexposure", "strong_unrealized_gain"],
    overexposureSeverity: "high_overexposure",
    overexposurePenalty: -5
  });
  assert.equal(scoring.finalScore, 5.87);
});

test("scoring service increases fundamental weight for long-term positions", () => {
  const weightProfile = resolveScoreWeights(
    createPosition({
      profitLossPct: 12,
      allocationPct: 20,
      holdingDays: 500,
      suggestionCode: "hold_for_long_term"
    }),
    0
  );

  assert.deepEqual(weightProfile.effectiveWeights, {
    technicalScore: 0.3,
    fundamentalScore: 0.35,
    sentimentScore: 0.13,
    portfolioSignals: 0.22
  });
  assert.deepEqual(weightProfile.appliedAdjustments, ["long_term_fundamental_emphasis"]);
});

test("scoring service falls back to default weights when config weights are invalid", () => {
  const scoring = buildScoreBreakdown(
    createPosition({
      profitLossPct: 3,
      allocationPct: 25,
      holdingDays: 200,
      suggestionCode: "hold_for_long_term"
    }),
    0,
    {
      defaultWeights: {
        technicalScore: -1,
        fundamentalScore: 0,
        sentimentScore: "invalid",
        portfolioSignals: null
      },
      minimumWeight: -10
    }
  );

  assert.deepEqual(scoring.defaultWeights, scoringConfig.defaultWeights);
  assert.deepEqual(scoring.weights, scoringConfig.defaultWeights);
  assert.equal(scoring.finalScore, 4.58);
});

test("scoring service penalties stay monotonic as allocation increases", () => {
  const scoring45 = buildScoreBreakdown(
    createPosition({
      profitLossPct: 14,
      allocationPct: 45,
      holdingDays: 120,
      suggestionCode: "booking_profit"
    }),
    2
  );
  const scoring60 = buildScoreBreakdown(
    createPosition({
      profitLossPct: 14,
      allocationPct: 60,
      holdingDays: 120,
      suggestionCode: "booking_profit"
    }),
    2
  );
  const scoring75 = buildScoreBreakdown(
    createPosition({
      profitLossPct: 14,
      allocationPct: 75,
      holdingDays: 120,
      suggestionCode: "booking_profit"
    }),
    2
  );

  assert.equal(scoring45.portfolioSignals.overexposurePenalty, -0.5);
  assert.equal(scoring60.portfolioSignals.overexposurePenalty, -2);
  assert.equal(scoring75.portfolioSignals.overexposurePenalty, -5);
  assert.equal(scoring45.finalScore > scoring60.finalScore, true);
  assert.equal(scoring60.finalScore > scoring75.finalScore, true);
  assert.equal(scoring45.portfolioSignals.score > scoring60.portfolioSignals.score, true);
  assert.equal(scoring60.portfolioSignals.score > scoring75.portfolioSignals.score, true);
});

test("scoring service stays deterministic for repeated inputs and clamps the range", () => {
  const position = createPosition({
    profitLossPct: 25,
    allocationPct: 20,
    holdingDays: 800,
    suggestionCode: "booking_profit"
  });
  const strongestScoring = buildScoreBreakdown(position, 2);
  const repeatedStrongestScoring = buildScoreBreakdown(position, 2);
  const weakestScoring = buildScoreBreakdown(
    createPosition({
      profitLossPct: -20,
      allocationPct: 75,
      holdingDays: 30,
      suggestionCode: "hold_for_long_term"
    }),
    -2
  );

  assert.deepEqual(repeatedStrongestScoring, strongestScoring);
  assert.equal(strongestScoring.finalScore, 9.72);
  assert.deepEqual(strongestScoring.weightAdjustments, [
    "long_term_fundamental_emphasis",
    "strong_sentiment_emphasis"
  ]);
  assert.deepEqual(strongestScoring.portfolioSignals.signalCodes, ["strong_unrealized_gain"]);
  assert.equal(weakestScoring.finalScore, 0);
  assert.deepEqual(weakestScoring.portfolioSignals.signalCodes, [
    "high_overexposure",
    "deep_drawdown"
  ]);
  assert.equal(weakestScoring.portfolioSignals.overexposurePenalty, -5);
});
