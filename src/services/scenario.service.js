const env = require("../config/env");
const { roundTo } = require("../utils/math");

const scenarioRates = {
  conservative: 0.05,
  moderate: 0.1,
  aggressive: 0.15
};

function calculateFutureValue(principal, annualRate, years) {
  return roundTo(Number(principal) * Math.pow(1 + annualRate, Number(years)));
}

function adjustForInflation(value, inflationRate, years) {
  return roundTo(Number(value) / Math.pow(1 + Number(inflationRate) / 100, Number(years)));
}

function buildScenarioProjection(
  principal,
  years = env.defaultScenarioYears,
  { includeInflation = false, inflationRate = env.defaultInflationRate } = {}
) {
  const amount = Number(principal);
  const durationYears = Number(years);

  const scenarios = Object.entries(scenarioRates).map(([name, annualRate]) => {
    const nominalFutureValue = calculateFutureValue(amount, annualRate, durationYears);
    const inflationAdjustedFutureValue = includeInflation
      ? adjustForInflation(nominalFutureValue, inflationRate, durationYears)
      : null;

    return {
      name,
      annualRatePct: annualRate * 100,
      nominalFutureValue,
      inflationAdjustedFutureValue
    };
  });

  return {
    principal: roundTo(amount),
    years: durationYears,
    includeInflation,
    inflationRatePct: includeInflation ? Number(inflationRate) : null,
    scenarios,
    range: {
      nominalMin: scenarios[0].nominalFutureValue,
      nominalMax: scenarios[scenarios.length - 1].nominalFutureValue,
      inflationAdjustedMin: includeInflation ? scenarios[0].inflationAdjustedFutureValue : null,
      inflationAdjustedMax: includeInflation
        ? scenarios[scenarios.length - 1].inflationAdjustedFutureValue
        : null
    }
  };
}

module.exports = {
  scenarioRates,
  calculateFutureValue,
  buildScenarioProjection
};

