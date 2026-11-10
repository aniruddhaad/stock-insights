const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeSell } = require("../src/services/sell-analysis.service");

test("sell analysis returns short-term performance metrics without recommending an action", () => {
  const analysis = analyzeSell({
    buyPrice: 100,
    quantity: 10,
    currentPrice: 130,
    holdingDurationDays: 120
  });

  assert.equal(analysis.classification.holdingType, "short_term");
  assert.equal(analysis.metrics.profitLoss, 300);
  assert.equal(analysis.metrics.profitLossPct, 30);
  assert.equal(analysis.suggestion.code, null);
  assert.deepEqual(analysis.suggestion.reasonCodes, ["position_in_profit", "short_term_holding"]);
});

test("sell analysis returns long-term metrics without recommending an action", () => {
  const analysis = analyzeSell({
    buyPrice: 100,
    quantity: 10,
    currentPrice: 108,
    holdingDurationDays: 420
  });

  assert.equal(analysis.classification.holdingType, "long_term");
  assert.equal(analysis.suggestion.code, null);
  assert.ok(analysis.suggestion.reasonCodes.includes("long_term_holding"));
});

test("sell analysis derives holding period from acquisition date", () => {
  const analysis = analyzeSell({
    buyPrice: 100,
    quantity: 10,
    currentPrice: 118,
    acquisitionDate: "2025-01-01T00:00:00.000Z",
    asOfDate: new Date("2026-05-18T00:00:00.000Z")
  });

  assert.equal(analysis.inputs.holdingDurationDays, 502);
  assert.equal(analysis.inputs.holdingMonths, 16);
  assert.equal(analysis.inputs.holdingYears, 1);
  assert.equal(analysis.classification.holdingType, "long_term");
  assert.equal(analysis.suggestion.code, null);
});
