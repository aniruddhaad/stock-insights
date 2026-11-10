const test = require("node:test");
const assert = require("node:assert/strict");

const { RATINGS } = require("../src/services/fundamental-analysis.service");

const {
  buildFundamentalScoreAdjustment,
  PARTICIPATING_SECTIONS,
  RATING_CONTRIBUTION,
  ADJUSTMENT_CAP
} = require("../src/services/fundamental-score-adapter.service");

test("buildFundamentalScoreAdjustment returns correct rawAdjustment for mixed ratings", () => {
  const analysis = {
    context: { isFinancial: false, superSector: "technology" },
    profitability: { rating: RATINGS.STRONG },
    growth: { rating: RATINGS.HEALTHY },
    financialStrength: { rating: RATINGS.WEAK },
    cashFlow: { rating: RATINGS.STRONG },
    stability: { rating: RATINGS.HEALTHY }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  // 1.0 + 0.5 - 0.5 + 1.0 + 0.5 = 2.5, capped at 1.5
  assert.equal(result.rawAdjustment, ADJUSTMENT_CAP);
});

test("positive adjustments are capped at +1.5", () => {
  const analysis = {
    context: { isFinancial: false },
    profitability: { rating: RATINGS.STRONG },
    growth: { rating: RATINGS.STRONG },
    financialStrength: { rating: RATINGS.STRONG },
    cashFlow: { rating: RATINGS.STRONG },
    stability: { rating: RATINGS.STRONG }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  assert.equal(result.rawAdjustment, ADJUSTMENT_CAP);
});

test("negative adjustments are capped at -1.5", () => {
  const analysis = {
    context: { isFinancial: false },
    profitability: { rating: RATINGS.WEAK },
    growth: { rating: RATINGS.WEAK },
    financialStrength: { rating: RATINGS.WEAK },
    cashFlow: { rating: RATINGS.WEAK },
    stability: { rating: RATINGS.WEAK }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  assert.equal(result.rawAdjustment, -ADJUSTMENT_CAP);
});

test("UNKNOWN ratings contribute 0 and do not create signals", () => {
  const analysis = {
    context: { isFinancial: false },
    profitability: { rating: RATINGS.UNKNOWN },
    growth: { rating: RATINGS.UNKNOWN },
    financialStrength: { rating: RATINGS.UNKNOWN },
    cashFlow: { rating: RATINGS.UNKNOWN },
    stability: { rating: RATINGS.UNKNOWN }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  assert.equal(result.rawAdjustment, 0);
  assert.deepEqual(result.signals, []);
});

test("CONTEXT_REQUIRED contributes 0", () => {
  const analysis = {
    context: { isFinancial: false },
    profitability: { rating: RATINGS.CONTEXT_REQUIRED },
    growth: { rating: RATINGS.CONTEXT_REQUIRED },
    financialStrength: { rating: RATINGS.CONTEXT_REQUIRED },
    cashFlow: { rating: RATINGS.CONTEXT_REQUIRED },
    stability: { rating: RATINGS.CONTEXT_REQUIRED }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  assert.equal(result.rawAdjustment, 0);
});

test("financial companies always produce rawAdjustment 0 and no signals", () => {
  const analysis = {
    context: { isFinancial: true },
    profitability: { rating: RATINGS.STRONG },
    growth: { rating: RATINGS.STRONG },
    financialStrength: { rating: RATINGS.STRONG },
    cashFlow: { rating: RATINGS.STRONG },
    stability: { rating: RATINGS.STRONG }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  assert.equal(result.rawAdjustment, 0);
  assert.deepEqual(result.signals, []);
});

test("missing or invalid analysis produces rawAdjustment 0 and no signals", () => {
  for (const analysis of [null, undefined, "invalid", {}]) {
    const result = buildFundamentalScoreAdjustment(analysis);

    assert.equal(result.rawAdjustment, 0);
    assert.deepEqual(result.signals, []);
  }
});

test("valuation does not affect the adjustment", () => {
  const analysis = {
    context: { isFinancial: false },
    profitability: { rating: RATINGS.STRONG },
    growth: { rating: RATINGS.HEALTHY },
    financialStrength: { rating: RATINGS.WEAK },
    cashFlow: { rating: RATINGS.STRONG },
    stability: { rating: RATINGS.HEALTHY },
    valuation: { rating: RATINGS.STRONG }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  // Participating sections total 2.5 and are capped at 1.5.
  // Valuation must not affect the result.
  assert.equal(result.rawAdjustment, ADJUSTMENT_CAP);
});

test("signals are generated for participating sections with non-UNKNOWN ratings", () => {
  const analysis = {
    context: { isFinancial: false },
    profitability: { rating: RATINGS.STRONG },
    growth: { rating: RATINGS.HEALTHY },
    financialStrength: { rating: RATINGS.WEAK },
    cashFlow: { rating: RATINGS.STRONG },
    stability: { rating: RATINGS.HEALTHY }
  };

  const result = buildFundamentalScoreAdjustment(analysis);

  assert.deepEqual(
    result.signals.sort(),
    [
      "profitability_strong",
      "growth_healthy",
      "financialStrength_weak",
      "cashFlow_strong",
      "stability_healthy"
    ].sort()
  );
});

test("PARTICIPATING_SECTIONS contains exactly the expected sections", () => {
  assert.deepEqual(PARTICIPATING_SECTIONS, [
    "profitability",
    "growth",
    "financialStrength",
    "cashFlow",
    "stability"
  ]);
});

test("RATING_CONTRIBUTION maps ratings to expected values", () => {
  assert.equal(RATING_CONTRIBUTION[RATINGS.STRONG], 1.0);
  assert.equal(RATING_CONTRIBUTION[RATINGS.HEALTHY], 0.5);
  assert.equal(RATING_CONTRIBUTION[RATINGS.WEAK], -0.5);
  assert.equal(RATING_CONTRIBUTION[RATINGS.UNKNOWN], 0);
  assert.equal(RATING_CONTRIBUTION[RATINGS.CONTEXT_REQUIRED], 0);
});

test("ADJUSTMENT_CAP is 1.5", () => {
  assert.equal(ADJUSTMENT_CAP, 1.5);
});