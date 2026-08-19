const { RATINGS } = require("./fundamental-analysis.service");

const PARTICIPATING_SECTIONS = [
  "profitability",
  "growth",
  "financialStrength",
  "cashFlow",
  "stability"
];

const RATING_CONTRIBUTION = {
  [RATINGS.STRONG]: 1.0,
  [RATINGS.HEALTHY]: 0.5,
  [RATINGS.WEAK]: -0.5,
  [RATINGS.UNKNOWN]: 0,
  [RATINGS.CONTEXT_REQUIRED]: 0
};

const ADJUSTMENT_CAP = 1.5;

function calculateRawAdjustment(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return 0;
  }

  if (analysis.context && analysis.context.isFinancial === true) {
    return 0;
  }

  let sum = 0;
  for (const section of PARTICIPATING_SECTIONS) {
    const sectionData = analysis[section];
    if (sectionData && typeof sectionData.rating === "string") {
      sum += RATING_CONTRIBUTION[sectionData.rating] || 0;
    }
  }

  return Math.max(Math.min(sum, ADJUSTMENT_CAP), -ADJUSTMENT_CAP);
}

function collectSignals(analysis) {
  const signals = [];
  if (!analysis || typeof analysis !== "object") {
    return signals;
  }

  for (const section of PARTICIPATING_SECTIONS) {
    const sectionData = analysis[section];
    if (sectionData && typeof sectionData.rating === "string" && sectionData.rating !== RATINGS.UNKNOWN) {
      signals.push(`${section}_${sectionData.rating.toLowerCase()}`);
    }
  }

  return signals;
}

function buildFundamentalScoreAdjustment(analysis) {
  const rawAdjustment = calculateRawAdjustment(analysis);
  const signals = collectSignals(analysis);

  return {
    rawAdjustment: Number(rawAdjustment.toFixed(4)),
    signals
  };
}

module.exports = {
  buildFundamentalScoreAdjustment,
  PARTICIPATING_SECTIONS,
  RATING_CONTRIBUTION,
  ADJUSTMENT_CAP
};
