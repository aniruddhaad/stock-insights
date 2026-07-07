const { roundTo } = require("../utils/math");
const {
  OVEREXPOSURE_SEVERITY,
  getOverexposureProfile,
  getOverexposureSeverity
} = require("../utils/overexposure");
const scoringConfig = require("../config/scoring.config");

const SCORE_SCALE = Object.freeze({
  min: 0,
  max: 10
});

const RAW_SCORE_RANGES = Object.freeze({
  technicalScore: {
    min: -4,
    neutral: 0,
    max: 4
  },
  fundamentalScore: {
    min: 0,
    max: 3
  },
  sentimentScore: {
    min: -2,
    neutral: 0,
    max: 2
  },
  portfolioSignals: {
    min: -7,
    neutral: 0,
    max: 3
  }
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeScore(rawScore, range) {
  const numericScore = Number(rawScore || 0);

  if (typeof range.neutral === "number") {
    if (numericScore === range.neutral) {
      return 5;
    }

    if (numericScore > range.neutral) {
      const positiveSpan = range.max - range.neutral;
      const scaledPositive = 5 + ((numericScore - range.neutral) / positiveSpan) * 5;

      return clamp(scaledPositive, SCORE_SCALE.min, SCORE_SCALE.max);
    }

    const negativeSpan = range.neutral - range.min;
    const scaledNegative = 5 - ((range.neutral - numericScore) / negativeSpan) * 5;

    return clamp(scaledNegative, SCORE_SCALE.min, SCORE_SCALE.max);
  }

  const scaledScore = ((numericScore - range.min) / (range.max - range.min)) * 10;

  return clamp(scaledScore, SCORE_SCALE.min, SCORE_SCALE.max);
}

function buildWeightedScoreComponent(rawScore, weight, range) {
  const normalizedScore = roundTo(normalizeScore(rawScore, range));
  const weightedContribution = roundTo(normalizedScore * weight);

  return {
    normalizedScore,
    weight,
    weightedContribution
  };
}

function getDefaultWeights(config = scoringConfig) {
  const fallbackWeights = scoringConfig.defaultWeights;
  const candidateWeights = config && typeof config === "object" ? config.defaultWeights : null;

  if (!candidateWeights || typeof candidateWeights !== "object") {
    return fallbackWeights;
  }

  const sanitizedWeights = {};

  for (const weightKey of scoringConfig.weightKeys) {
    const candidateValue = Number(candidateWeights[weightKey]);

    if (!Number.isFinite(candidateValue) || candidateValue <= 0) {
      return fallbackWeights;
    }

    sanitizedWeights[weightKey] = candidateValue;
  }

  const totalWeight = Object.values(sanitizedWeights).reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return fallbackWeights;
  }

  return normalizeWeights(sanitizedWeights, 0, fallbackWeights);
}

function getMinimumWeight(config = scoringConfig) {
  const candidateMinimumWeight = Number(config && config.minimumWeight);

  if (!Number.isFinite(candidateMinimumWeight) || candidateMinimumWeight < 0) {
    return scoringConfig.minimumWeight;
  }

  return candidateMinimumWeight;
}

function normalizeWeights(weights, minimumWeight, fallbackWeights) {
  const normalizedWeights = {};

  for (const weightKey of scoringConfig.weightKeys) {
    const candidateWeight = Number(weights[weightKey]);

    if (!Number.isFinite(candidateWeight)) {
      return fallbackWeights;
    }

    normalizedWeights[weightKey] = Math.max(candidateWeight, minimumWeight);
  }

  const totalWeight = Object.values(normalizedWeights).reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return fallbackWeights;
  }

  return scoringConfig.weightKeys.reduce((result, weightKey) => {
    result[weightKey] = roundTo(normalizedWeights[weightKey] / totalWeight, 4);
    return result;
  }, {});
}

function getApplicableWeightAdjustments(position, sentimentScore, config = scoringConfig) {
  const adjustments = [];
  const dynamicAdjustments = config && typeof config === "object" ? config.dynamicAdjustments : null;

  if (!dynamicAdjustments || typeof dynamicAdjustments !== "object") {
    return adjustments;
  }

  const allocationConfig = dynamicAdjustments.allocation;
  const overexposureSeverity = getOverexposureSeverity(position.metrics.allocationPct, config);

  if (allocationConfig && overexposureSeverity) {
    if (overexposureSeverity === OVEREXPOSURE_SEVERITY.high && allocationConfig.highOverexposure) {
      adjustments.push(allocationConfig.highOverexposure);
    } else if (allocationConfig.moderateOverexposure || allocationConfig.overexposed) {
      adjustments.push(allocationConfig.moderateOverexposure || allocationConfig.overexposed);
    }
  }

  const holdingDurationConfig = dynamicAdjustments.holdingDuration;
  const holdingDays = Number(position.holding.holdingDays);

  if (holdingDurationConfig && position.holding.holdingDays !== null && Number.isFinite(holdingDays)) {
    if (holdingDays <= Number(holdingDurationConfig.shortTermMaxDays) && holdingDurationConfig.shortTerm) {
      adjustments.push(holdingDurationConfig.shortTerm);
    } else if (holdingDays >= Number(holdingDurationConfig.longTermMinDays) && holdingDurationConfig.longTerm) {
      adjustments.push(holdingDurationConfig.longTerm);
    }
  }

  const sentimentStrengthConfig = dynamicAdjustments.sentimentStrength;
  const absoluteSentimentScore = Math.abs(Number(sentimentScore || 0));

  if (
    sentimentStrengthConfig &&
    absoluteSentimentScore >= Number(sentimentStrengthConfig.strongThreshold) &&
    sentimentStrengthConfig.strong
  ) {
    adjustments.push(sentimentStrengthConfig.strong);
  }

  return adjustments;
}

function resolveScoreWeights(position, sentimentScore, config = scoringConfig) {
  const defaultWeights = getDefaultWeights(config);
  const minimumWeight = getMinimumWeight(config);
  const applicableAdjustments = getApplicableWeightAdjustments(position, sentimentScore, config);
  const adjustedWeights = {
    ...defaultWeights
  };

  for (const adjustment of applicableAdjustments) {
    if (!adjustment || typeof adjustment !== "object" || !adjustment.shifts) {
      continue;
    }

    for (const weightKey of scoringConfig.weightKeys) {
      adjustedWeights[weightKey] += Number(adjustment.shifts[weightKey] || 0);
    }
  }

  return {
    defaultWeights,
    effectiveWeights: normalizeWeights(adjustedWeights, minimumWeight, defaultWeights),
    appliedAdjustments: applicableAdjustments.map((adjustment) => adjustment.reasonCode).filter(Boolean)
  };
}

function getTechnicalScore(position) {
  // TODO(scoring-calibration): these coarse P/L bands, together with the
  // discrete holding-duration and sentiment inputs below, can cluster
  // unrelated positions at identical final scores. Calibration is intentionally
  // deferred because this service is metric-only in the decision refactor.
  const pnl = position.metrics.profitLossPct;

  if (pnl >= 20) return 4;
  if (pnl >= 8) return 2;
  if (pnl > -5) return 0;
  if (pnl > -15) return -2;
  return -4;
}

function getFundamentalScore(position) {
  const holdingDays = position.holding.holdingDays;

  if (holdingDays === null || holdingDays === undefined || !Number.isFinite(Number(holdingDays))) {
    return 0;
  }

  if (holdingDays >= 730) return 3;
  if (holdingDays >= 365) return 2;
  if (holdingDays >= 180) return 1;
  return 0;
}

function getPortfolioSignals(position, config = scoringConfig) {
  let score = 0;
  const signalCodes = [];
  const { overexposureSeverity, overexposurePenalty } = getOverexposureProfile(position.metrics.allocationPct, config);

  if (overexposureSeverity === OVEREXPOSURE_SEVERITY.high) {
    score += overexposurePenalty;
    signalCodes.push(OVEREXPOSURE_SEVERITY.high);
  } else if (overexposureSeverity === OVEREXPOSURE_SEVERITY.moderate) {
    score += overexposurePenalty;
    signalCodes.push(OVEREXPOSURE_SEVERITY.moderate);
  }

  if (position.metrics.profitLossPct >= 12) {
    score += 2;
    signalCodes.push("strong_unrealized_gain");
  }

  if (position.metrics.profitLossPct <= -10) {
    score -= 2;
    signalCodes.push("deep_drawdown");
  }

  return {
    score: roundTo(score),
    signalCodes,
    overexposureSeverity,
    overexposurePenalty
  };
}

function buildScoreBreakdown(position, sentimentScore, config = scoringConfig) {
  const technicalScore = getTechnicalScore(position);
  const fundamentalScore = getFundamentalScore(position);
  const rawSentimentScore = Number(sentimentScore || 0);
  const portfolioSignals = getPortfolioSignals(position, config);
  const weightProfile = resolveScoreWeights(position, rawSentimentScore, config);
  const scoreComponents = {
    technicalScore: buildWeightedScoreComponent(
      technicalScore,
      weightProfile.effectiveWeights.technicalScore,
      RAW_SCORE_RANGES.technicalScore
    ),
    fundamentalScore: buildWeightedScoreComponent(
      fundamentalScore,
      weightProfile.effectiveWeights.fundamentalScore,
      RAW_SCORE_RANGES.fundamentalScore
    ),
    sentimentScore: buildWeightedScoreComponent(
      rawSentimentScore,
      weightProfile.effectiveWeights.sentimentScore,
      RAW_SCORE_RANGES.sentimentScore
    ),
    portfolioSignals: buildWeightedScoreComponent(
      portfolioSignals.score,
      weightProfile.effectiveWeights.portfolioSignals,
      RAW_SCORE_RANGES.portfolioSignals
    )
  };
  const finalScore = clamp(
    roundTo(
      scoreComponents.technicalScore.weightedContribution +
      scoreComponents.fundamentalScore.weightedContribution +
      scoreComponents.sentimentScore.weightedContribution +
      scoreComponents.portfolioSignals.weightedContribution
    ),
    SCORE_SCALE.min,
    SCORE_SCALE.max
  );

  return {
    technicalScore,
    fundamentalScore,
    sentimentScore: rawSentimentScore,
    portfolioSignals,
    defaultWeights: weightProfile.defaultWeights,
    weights: weightProfile.effectiveWeights,
    weightAdjustments: weightProfile.appliedAdjustments,
    normalizedScores: {
      technicalScore: scoreComponents.technicalScore.normalizedScore,
      fundamentalScore: scoreComponents.fundamentalScore.normalizedScore,
      sentimentScore: scoreComponents.sentimentScore.normalizedScore,
      portfolioSignals: scoreComponents.portfolioSignals.normalizedScore
    },
    weightedScores: {
      technicalScore: scoreComponents.technicalScore.weightedContribution,
      fundamentalScore: scoreComponents.fundamentalScore.weightedContribution,
      sentimentScore: scoreComponents.sentimentScore.weightedContribution,
      portfolioSignals: scoreComponents.portfolioSignals.weightedContribution
    },
    scoreScale: SCORE_SCALE,
    finalScore
  };
}

module.exports = {
  buildScoreBreakdown,
  resolveScoreWeights
};
