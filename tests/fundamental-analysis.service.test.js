const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RATINGS,
  analyzeCashFlow,
  analyzeFundamentals,
  analyzeGrowthTrend,
  combineRatings,
  rateByThresholds
} = require("../src/services/fundamental-analysis.service");

function nonFinancialCompany(overrides = {}) {
  return {
    symbol: "tcs",
    isFinancial: false,
    classification: {
      superSector: "sensitive"
    },
    marketCap: 120000,
    growth: {
      revenueGrowth1y: 22,
      revenueGrowth3y: 18,
      revenueGrowth5y: 15,
      profitGrowth1y: 24,
      profitGrowth3y: 19,
      profitGrowth5y: 16
    },
    profitability: {
      roce: 31,
      roe: 28,
      operatingProfitMargin: 26
    },
    balanceSheet: {
      debtToEquity: 0.2,
      interestCoverage: 18,
      netWorth: 30000
    },
    series: {
      sales: [1000, 1200, 1450, 1700],
      netProfit: [150, 190, 240, 300],
      operatingCashFlow: [170, 210, 275, 330]
    },
    ...overrides
  };
}

test("helper functions rate and combine descriptive ratings", () => {
  const thresholds = [
    { matches: (value) => value >= 10, rating: RATINGS.STRONG },
    { matches: (value) => value < 10, rating: RATINGS.WEAK }
  ];

  assert.equal(rateByThresholds(12, thresholds), RATINGS.STRONG);
  assert.equal(rateByThresholds(null, thresholds), RATINGS.UNKNOWN);
  assert.equal(combineRatings([RATINGS.STRONG, RATINGS.HEALTHY, RATINGS.HEALTHY]), RATINGS.HEALTHY);
  assert.equal(combineRatings([RATINGS.UNKNOWN]), RATINGS.UNKNOWN);
});

test("analyzes strong non-financial fundamentals without database access", () => {
  const analysis = analyzeFundamentals(nonFinancialCompany());

  assert.equal(analysis.symbol, "TCS");
  assert.deepEqual(analysis.context, {
    isFinancial: false,
    superSector: "sensitive"
  });
  assert.equal(analysis.profitability.rating, RATINGS.STRONG);
  assert.equal(analysis.growth.rating, RATINGS.STRONG);
  assert.equal(analysis.growth.trend, "accelerating");
  assert.equal(analysis.financialStrength.rating, RATINGS.STRONG);
  assert.equal(analysis.cashFlow.rating, RATINGS.STRONG);
  assert.equal(analysis.cashFlow.averageConversion, 1.12);
  assert.equal(analysis.cashFlow.yearsAnalyzed, 4);
  assert.equal(analysis.valuation.rating, RATINGS.CONTEXT_REQUIRED);
  assert.equal(analysis.valuation.approximatePE, 400);
  assert.equal(analysis.valuation.approximatePB, 4);
  assert.equal(analysis.stability.rating, RATINGS.STRONG);
  assert.ok(analysis.stability.signals.includes("consistently_growing"));
});

test("analyzes weak profitability, high debt, weak cash conversion, and instability", () => {
  const analysis = analyzeFundamentals(nonFinancialCompany({
    symbol: "weakco",
    growth: {
      revenueGrowth1y: 2,
      revenueGrowth3y: 4,
      revenueGrowth5y: 6,
      profitGrowth1y: -8,
      profitGrowth3y: 1,
      profitGrowth5y: 7
    },
    profitability: {
      roce: 7,
      roe: 4,
      operatingProfitMargin: 3
    },
    balanceSheet: {
      debtToEquity: 3.5,
      interestCoverage: 1.4,
      netWorth: 10000
    },
    series: {
      sales: [1000, 900, 850, 700],
      netProfit: [100, -20, -40, 30],
      operatingCashFlow: [20, -15, -10, 8]
    }
  }));

  assert.equal(analysis.symbol, "WEAKCO");
  assert.equal(analysis.profitability.rating, RATINGS.WEAK);
  assert.equal(analysis.growth.rating, RATINGS.WEAK);
  assert.equal(analysis.growth.trend, "slowing");
  assert.equal(analysis.financialStrength.rating, RATINGS.WEAK);
  assert.ok(analysis.financialStrength.signals.includes("debtToEquity_weak"));
  assert.equal(analysis.cashFlow.rating, RATINGS.WEAK);
  assert.equal(analysis.cashFlow.averageConversion, 0.23);
  assert.equal(analysis.cashFlow.yearsAnalyzed, 2);
  assert.ok(analysis.cashFlow.signals.includes("persistently_weak_cash_conversion"));
  assert.equal(analysis.stability.rating, RATINGS.WEAK);
  assert.ok(analysis.stability.signals.includes("declining"));
  assert.ok(analysis.stability.signals.includes("repeated_losses"));
  assert.ok(analysis.stability.signals.includes("inconsistent_cash_generation"));
});

test("handles missing and null metrics without failing", () => {
  const analysis = analyzeFundamentals({
    symbol: "MISSING",
    isFinancial: false,
    classification: {},
    growth: {
      revenueGrowth1y: null
    },
    profitability: {
      roce: null
    },
    balanceSheet: {},
    series: {}
  });

  assert.equal(analysis.context.superSector, "unknown");
  assert.equal(analysis.profitability.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.growth.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.financialStrength.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.cashFlow.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.cashFlow.averageConversion, null);
  assert.equal(analysis.cashFlow.yearsAnalyzed, 0);
  assert.equal(analysis.valuation.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.stability.rating, RATINGS.UNKNOWN);
});

test("cash conversion uses only years with positive net profit and paired values", () => {
  const cashFlow = analyzeCashFlow({
    series: {
      operatingCashFlow: [90, 40, null, 120, 60],
      netProfit: [100, -10, 80, 100, 100]
    }
  });

  assert.equal(cashFlow.rating, RATINGS.HEALTHY);
  assert.equal(cashFlow.averageConversion, 0.9);
  assert.equal(cashFlow.yearsAnalyzed, 3);
});

test("growth trend detects acceleration, slowdown, and mixed paths", () => {
  assert.equal(
    analyzeGrowthTrend({
      revenueGrowth5y: 5,
      revenueGrowth3y: 10,
      revenueGrowth1y: 15
    }),
    "accelerating"
  );
  assert.equal(
    analyzeGrowthTrend({
      profitGrowth5y: 18,
      profitGrowth3y: 10,
      profitGrowth1y: 3
    }),
    "slowing"
  );
  assert.equal(
    analyzeGrowthTrend({
      revenueGrowth5y: 8,
      revenueGrowth3y: 12,
      revenueGrowth1y: 9
    }),
    "stable_or_mixed"
  );
});

test("valuation calculates only ratios with valid available data", () => {
  const onlyPe = analyzeFundamentals(nonFinancialCompany({
    marketCap: 5000,
    balanceSheet: {
      netWorth: null
    },
    series: {
      netProfit: [-20, 0, 250],
      sales: [],
      operatingCashFlow: []
    }
  }));

  assert.equal(onlyPe.valuation.rating, RATINGS.CONTEXT_REQUIRED);
  assert.equal(onlyPe.valuation.approximatePE, 20);
  assert.equal(onlyPe.valuation.approximatePB, null);
});

test("financial companies use the not-yet-implemented assessment path", () => {
  const analysis = analyzeFundamentals(nonFinancialCompany({
    symbol: "hdfcbank",
    isFinancial: true,
    classification: {
      superSector: "cyclical"
    },
    balanceSheet: {
      debtToEquity: 8,
      interestCoverage: 1
    }
  }));

  assert.equal(analysis.symbol, "HDFCBANK");
  assert.equal(analysis.context.isFinancial, true);
  assert.equal(analysis.profitability.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.growth.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.financialStrength.rating, RATINGS.UNKNOWN);
  assert.deepEqual(analysis.financialStrength.metrics, {});
  assert.ok(analysis.financialStrength.signals.includes("financial_company_financial_strength_analysis_not_implemented"));
  assert.equal(analysis.cashFlow.yearsAnalyzed, 0);
  assert.equal(analysis.valuation.rating, RATINGS.UNKNOWN);
  assert.equal(analysis.stability.rating, RATINGS.UNKNOWN);
});
