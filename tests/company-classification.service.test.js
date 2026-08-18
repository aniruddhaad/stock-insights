const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SUPER_SECTORS,
  normalizeClassification,
  resolveSuperSector
} = require("../src/services/company-classification.service");

test("resolveSuperSector maps cyclical sectors deterministically", () => {
  assert.equal(resolveSuperSector("Basic Materials"), SUPER_SECTORS.CYCLICAL);
  assert.equal(resolveSuperSector("Consumer Cyclical"), SUPER_SECTORS.CYCLICAL);
  assert.equal(resolveSuperSector("Financial Services"), SUPER_SECTORS.CYCLICAL);
  assert.equal(resolveSuperSector("Real Estate"), SUPER_SECTORS.CYCLICAL);
});

test("resolveSuperSector maps defensive sectors deterministically", () => {
  assert.equal(resolveSuperSector("Consumer Defensive"), SUPER_SECTORS.DEFENSIVE);
  assert.equal(resolveSuperSector("Healthcare"), SUPER_SECTORS.DEFENSIVE);
  assert.equal(resolveSuperSector("Utilities"), SUPER_SECTORS.DEFENSIVE);
});

test("resolveSuperSector maps sensitive sectors deterministically", () => {
  assert.equal(resolveSuperSector("Communication Services"), SUPER_SECTORS.SENSITIVE);
  assert.equal(resolveSuperSector("Energy"), SUPER_SECTORS.SENSITIVE);
  assert.equal(resolveSuperSector("Industrials"), SUPER_SECTORS.SENSITIVE);
  assert.equal(resolveSuperSector("Technology"), SUPER_SECTORS.SENSITIVE);
});

test("resolveSuperSector handles unknown and empty sectors safely", () => {
  assert.equal(resolveSuperSector("Unknown"), SUPER_SECTORS.UNKNOWN);
  assert.equal(resolveSuperSector(null), SUPER_SECTORS.UNKNOWN);
  assert.equal(resolveSuperSector(undefined), SUPER_SECTORS.UNKNOWN);
  assert.equal(resolveSuperSector(""), SUPER_SECTORS.UNKNOWN);
});

test("normalizeClassification preserves supplied sector and industry without guessing", () => {
  assert.deepEqual(
    normalizeClassification({ sector: " Technology ", industry: " IT Services " }),
    {
      sector: "Technology",
      industry: "IT Services",
      superSector: SUPER_SECTORS.SENSITIVE
    }
  );

  assert.deepEqual(normalizeClassification(null), {
    sector: null,
    industry: null,
    superSector: SUPER_SECTORS.UNKNOWN
  });
});
