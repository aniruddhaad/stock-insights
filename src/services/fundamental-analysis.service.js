const RATINGS = Object.freeze({
  STRONG: "strong",
  HEALTHY: "healthy",
  MIXED: "mixed",
  WEAK: "weak",
  UNKNOWN: "unknown",
  CONTEXT_REQUIRED: "context_required"
});

const RATING_RANK = Object.freeze({
  [RATINGS.WEAK]: 1,
  [RATINGS.MIXED]: 2,
  [RATINGS.HEALTHY]: 3,
  [RATINGS.STRONG]: 4
});

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundTo(value, decimals = 2) {
  const number = toNumber(value);
  if (number === null) return null;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function rateByThresholds(value, thresholds) {
  const number = toNumber(value);
  if (number === null) return RATINGS.UNKNOWN;

  for (const threshold of thresholds) {
    if (threshold.matches(number)) return threshold.rating;
  }

  return RATINGS.UNKNOWN;
}

function combineRatings(ratings) {
  const usableRatings = ratings.filter((rating) => RATING_RANK[rating]);
  if (usableRatings.length === 0) return RATINGS.UNKNOWN;

  const averageRank = usableRatings.reduce((sum, rating) => sum + RATING_RANK[rating], 0) / usableRatings.length;
  const roundedRank = Math.round(averageRank);

  return Object.entries(RATING_RANK).find(([, rank]) => rank === roundedRank)[0];
}

function metricAssessment(value, thresholds) {
  const number = toNumber(value);
  return {
    value: number,
    rating: number === null ? RATINGS.UNKNOWN : rateByThresholds(number, thresholds)
  };
}

function createMetricSignals(metrics) {
  return Object.entries(metrics)
    .filter(([, assessment]) => assessment.rating !== RATINGS.UNKNOWN)
    .map(([name, assessment]) => `${name}_${assessment.rating}`);
}

const PROFITABILITY_THRESHOLDS = Object.freeze({
  roce: [
    { matches: (value) => value >= 20, rating: RATINGS.STRONG },
    { matches: (value) => value >= 15, rating: RATINGS.HEALTHY },
    { matches: (value) => value >= 10, rating: RATINGS.MIXED },
    { matches: (value) => value < 10, rating: RATINGS.WEAK }
  ],
  roe: [
    { matches: (value) => value >= 20, rating: RATINGS.STRONG },
    { matches: (value) => value >= 15, rating: RATINGS.HEALTHY },
    { matches: (value) => value >= 10, rating: RATINGS.MIXED },
    { matches: (value) => value < 10, rating: RATINGS.WEAK }
  ],
  operatingProfitMargin: [
    { matches: (value) => value >= 20, rating: RATINGS.STRONG },
    { matches: (value) => value >= 10, rating: RATINGS.HEALTHY },
    { matches: (value) => value >= 5, rating: RATINGS.MIXED },
    { matches: (value) => value < 5, rating: RATINGS.WEAK }
  ]
});

const GROWTH_THRESHOLDS = Object.freeze([
  { matches: (value) => value >= 15, rating: RATINGS.STRONG },
  { matches: (value) => value >= 10, rating: RATINGS.HEALTHY },
  { matches: (value) => value >= 5, rating: RATINGS.MIXED },
  { matches: (value) => value < 5, rating: RATINGS.WEAK }
]);

const FINANCIAL_STRENGTH_THRESHOLDS = Object.freeze({
  debtToEquity: [
    { matches: (value) => value <= 0.5, rating: RATINGS.STRONG },
    { matches: (value) => value <= 1, rating: RATINGS.HEALTHY },
    { matches: (value) => value <= 2, rating: RATINGS.MIXED },
    { matches: (value) => value > 2, rating: RATINGS.WEAK }
  ],
  interestCoverage: [
    { matches: (value) => value >= 10, rating: RATINGS.STRONG },
    { matches: (value) => value >= 5, rating: RATINGS.HEALTHY },
    { matches: (value) => value >= 2, rating: RATINGS.MIXED },
    { matches: (value) => value < 2, rating: RATINGS.WEAK }
  ]
});

const CASH_FLOW_THRESHOLDS = Object.freeze([
  { matches: (value) => value >= 1, rating: RATINGS.STRONG },
  { matches: (value) => value >= 0.8, rating: RATINGS.HEALTHY },
  { matches: (value) => value >= 0.5, rating: RATINGS.MIXED },
  { matches: (value) => value < 0.5, rating: RATINGS.WEAK }
]);

function analyzeProfitability(company) {
  const source = company.profitability || {};
  const metrics = {
    roce: metricAssessment(source.roce, PROFITABILITY_THRESHOLDS.roce),
    roe: metricAssessment(source.roe, PROFITABILITY_THRESHOLDS.roe),
    operatingProfitMargin: metricAssessment(
      source.operatingProfitMargin,
      PROFITABILITY_THRESHOLDS.operatingProfitMargin
    )
  };

  return {
    rating: combineRatings(Object.values(metrics).map((metric) => metric.rating)),
    metrics,
    signals: createMetricSignals(metrics)
  };
}

function analyzeGrowthTrend(growth) {
  const triples = [
    [growth.revenueGrowth5y, growth.revenueGrowth3y, growth.revenueGrowth1y],
    [growth.profitGrowth5y, growth.profitGrowth3y, growth.profitGrowth1y]
  ]
    .map((values) => values.map(toNumber))
    .filter((values) => values.every((value) => value !== null));

  if (triples.length === 0) return "stable_or_mixed";

  const acceleratingCount = triples.filter(([fiveYear, threeYear, oneYear]) => {
    return fiveYear <= threeYear && threeYear <= oneYear && fiveYear < oneYear;
  }).length;
  const slowingCount = triples.filter(([fiveYear, threeYear, oneYear]) => {
    return fiveYear >= threeYear && threeYear >= oneYear && fiveYear > oneYear;
  }).length;

  if (acceleratingCount === triples.length) return "accelerating";
  if (slowingCount === triples.length) return "slowing";
  return "stable_or_mixed";
}

function analyzeGrowth(company) {
  const growth = company.growth || {};
  const metrics = {
    revenueGrowth1y: metricAssessment(growth.revenueGrowth1y, GROWTH_THRESHOLDS),
    revenueGrowth3y: metricAssessment(growth.revenueGrowth3y, GROWTH_THRESHOLDS),
    revenueGrowth5y: metricAssessment(growth.revenueGrowth5y, GROWTH_THRESHOLDS),
    profitGrowth1y: metricAssessment(growth.profitGrowth1y, GROWTH_THRESHOLDS),
    profitGrowth3y: metricAssessment(growth.profitGrowth3y, GROWTH_THRESHOLDS),
    profitGrowth5y: metricAssessment(growth.profitGrowth5y, GROWTH_THRESHOLDS)
  };
  const trend = analyzeGrowthTrend(growth);
  const signals = createMetricSignals(metrics);

  signals.push(`growth_trend_${trend}`);
  if (growth.profitTurnaround === true) {
    signals.push("profit_turnaround");
  }

  return {
    rating: combineRatings(Object.values(metrics).map((metric) => metric.rating)),
    metrics,
    trend,
    signals
  };
}

function analyzeFinancialStrength(company) {
  const balanceSheet = company.balanceSheet || {};
  const metrics = {
    debtToEquity: metricAssessment(balanceSheet.debtToEquity, FINANCIAL_STRENGTH_THRESHOLDS.debtToEquity),
    interestCoverage: metricAssessment(
      balanceSheet.interestCoverage,
      FINANCIAL_STRENGTH_THRESHOLDS.interestCoverage
    )
  };

  return {
    rating: combineRatings(Object.values(metrics).map((metric) => metric.rating)),
    metrics,
    signals: createMetricSignals(metrics)
  };
}

function alignedSeriesPairs(firstSeries, secondSeries) {
  const first = Array.isArray(firstSeries) ? firstSeries : [];
  const second = Array.isArray(secondSeries) ? secondSeries : [];
  const length = Math.min(first.length, second.length);
  const pairs = [];

  for (let index = 0; index < length; index += 1) {
    pairs.push([toNumber(first[index]), toNumber(second[index])]);
  }

  return pairs;
}

function analyzeCashFlow(company) {
  const series = company.series || {};
  const conversions = alignedSeriesPairs(series.operatingCashFlow, series.netProfit)
    .filter(([operatingCashFlow, netProfit]) => operatingCashFlow !== null && netProfit !== null && netProfit > 0)
    .map(([operatingCashFlow, netProfit]) => operatingCashFlow / netProfit);

  if (conversions.length === 0) {
    return {
      rating: RATINGS.UNKNOWN,
      averageConversion: null,
      yearsAnalyzed: 0,
      signals: []
    };
  }

  const averageConversion = conversions.reduce((sum, value) => sum + value, 0) / conversions.length;
  const rating = rateByThresholds(averageConversion, CASH_FLOW_THRESHOLDS);
  const weakYears = conversions.filter((value) => value < 0.5).length;
  const signals = [`cash_conversion_${rating}`];

  if (weakYears >= 2 && weakYears / conversions.length >= 0.5) {
    signals.push("persistently_weak_cash_conversion");
  }

  return {
    rating,
    averageConversion: roundTo(averageConversion),
    yearsAnalyzed: conversions.length,
    signals
  };
}

function latestPositive(values) {
  const series = Array.isArray(values) ? values : [];
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = toNumber(series[index]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function analyzeValuation(company) {
  const marketCap = toNumber(company.marketCap);
  const netWorth = toNumber(company.balanceSheet && company.balanceSheet.netWorth);
  const latestPositiveNetProfit = latestPositive(company.series && company.series.netProfit);

  const approximatePE = marketCap !== null && marketCap > 0 && latestPositiveNetProfit !== null
    ? roundTo(marketCap / latestPositiveNetProfit)
    : null;
  const approximatePB = marketCap !== null && marketCap > 0 && netWorth !== null && netWorth > 0
    ? roundTo(marketCap / netWorth)
    : null;

  return {
    rating: approximatePE !== null || approximatePB !== null ? RATINGS.CONTEXT_REQUIRED : RATINGS.UNKNOWN,
    approximatePE,
    approximatePB
  };
}

function numericSeries(values) {
  return Array.isArray(values)
    ? values.map(toNumber).filter((value) => value !== null)
    : [];
}

function seriesDirection(values) {
  if (values.length < 2) return "unknown";

  let increases = 0;
  let decreases = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[index - 1]) increases += 1;
    if (values[index] < values[index - 1]) decreases += 1;
  }

  if (increases === values.length - 1) return "consistently_growing";
  if (decreases === values.length - 1) return "declining";
  if (increases > decreases && values[values.length - 1] > values[0]) return "generally_growing";
  if (decreases > increases && values[values.length - 1] < values[0]) return "generally_declining";
  return "mixed";
}

function hasVolatility(values) {
  if (values.length < 4) return false;

  let directionChanges = 0;
  let previousDirection = 0;
  for (let index = 1; index < values.length; index += 1) {
    const direction = Math.sign(values[index] - values[index - 1]);
    if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) {
      directionChanges += 1;
    }
    if (direction !== 0) previousDirection = direction;
  }

  return directionChanges >= 2;
}

function analyzeStability(company) {
  const series = company.series || {};
  const sales = numericSeries(series.sales);
  const netProfit = numericSeries(series.netProfit);
  const operatingCashFlow = numericSeries(series.operatingCashFlow);
  const signals = [];

  if (sales.length === 0 && netProfit.length === 0 && operatingCashFlow.length === 0) {
    return { rating: RATINGS.UNKNOWN, signals };
  }

  const salesDirection = seriesDirection(sales);
  const profitDirection = seriesDirection(netProfit);
  const cashDirection = seriesDirection(operatingCashFlow);
  const repeatedLosses = netProfit.filter((value) => value < 0).length >= 2;
  const inconsistentCash = operatingCashFlow.filter((value) => value <= 0).length >= 2;
  const volatile = [sales, netProfit, operatingCashFlow].some(hasVolatility);

  if (salesDirection === "consistently_growing" && profitDirection === "consistently_growing") {
    signals.push("consistently_growing");
  }
  if (salesDirection === "declining" || profitDirection === "declining") {
    signals.push("declining");
  }
  if (volatile) {
    signals.push("volatile");
  }
  if (repeatedLosses) {
    signals.push("repeated_losses");
  }
  if (inconsistentCash) {
    signals.push("inconsistent_cash_generation");
  }
  if (cashDirection === "consistently_growing") {
    signals.push("cash_flow_consistently_growing");
  }

  let rating = RATINGS.MIXED;
  if (repeatedLosses || (signals.includes("declining") && inconsistentCash)) {
    rating = RATINGS.WEAK;
  } else if (signals.includes("consistently_growing") && !volatile && !inconsistentCash) {
    rating = operatingCashFlow.length >= 2 && cashDirection !== "declining" ? RATINGS.STRONG : RATINGS.HEALTHY;
  } else if (salesDirection.includes("growing") || profitDirection.includes("growing")) {
    rating = volatile || inconsistentCash ? RATINGS.MIXED : RATINGS.HEALTHY;
  }

  return { rating, signals };
}

function notImplementedAssessment(sectionName) {
  return {
    rating: RATINGS.UNKNOWN,
    metrics: {},
    signals: [`financial_company_${sectionName}_analysis_not_implemented`]
  };
}

function analyzeFinancialCompany(company, context) {
  return {
    symbol: normalizeSymbol(company.symbol),
    context,
    profitability: notImplementedAssessment("profitability"),
    growth: {
      rating: RATINGS.UNKNOWN,
      metrics: {},
      trend: "stable_or_mixed",
      signals: ["financial_company_growth_analysis_not_implemented"]
    },
    financialStrength: notImplementedAssessment("financial_strength"),
    cashFlow: {
      rating: RATINGS.UNKNOWN,
      averageConversion: null,
      yearsAnalyzed: 0,
      signals: ["financial_company_cash_flow_analysis_not_implemented"]
    },
    valuation: {
      rating: RATINGS.UNKNOWN,
      approximatePE: null,
      approximatePB: null
    },
    stability: {
      rating: RATINGS.UNKNOWN,
      signals: ["financial_company_stability_analysis_not_implemented"]
    }
  };
}

function analyzeFundamentals(company = {}) {
  const context = {
    isFinancial: company.isFinancial === true,
    superSector: (company.classification && company.classification.superSector) || "unknown"
  };

  if (context.isFinancial) {
    return analyzeFinancialCompany(company, context);
  }

  return {
    symbol: normalizeSymbol(company.symbol),
    context,
    profitability: analyzeProfitability(company),
    growth: analyzeGrowth(company),
    financialStrength: analyzeFinancialStrength(company),
    cashFlow: analyzeCashFlow(company),
    valuation: analyzeValuation(company),
    stability: analyzeStability(company)
  };
}

module.exports = {
  RATINGS,
  analyzeCashFlow,
  analyzeFinancialStrength,
  analyzeFundamentals,
  analyzeGrowth,
  analyzeGrowthTrend,
  analyzeProfitability,
  analyzeStability,
  analyzeValuation,
  combineRatings,
  rateByThresholds
};
