const test = require("node:test");
const assert = require("node:assert/strict");
const { buildScenarioProjection } = require("../src/services/scenario.service");

test("scenario engine returns three projections and inflation-adjusted range", () => {
  const projection = buildScenarioProjection(100000, 2, {
    includeInflation: true,
    inflationRate: 6
  });

  assert.equal(projection.scenarios.length, 3);
  assert.equal(projection.scenarios[0].name, "conservative");
  assert.equal(projection.scenarios[0].nominalFutureValue, 110250);
  assert.equal(projection.scenarios[1].nominalFutureValue, 121000);
  assert.equal(projection.scenarios[2].nominalFutureValue, 132250);
  assert.ok(projection.range.inflationAdjustedMin < projection.range.inflationAdjustedMax);
});

