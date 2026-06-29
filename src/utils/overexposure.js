const scoringConfig = require("../config/scoring.config");
const { roundTo } = require("./math");

const OVEREXPOSURE_SEVERITY = Object.freeze({
  moderate: "moderate_overexposure",
  high: "high_overexposure"
});

function resolveThreshold(candidateValue, fallbackValue) {
  if (candidateValue === null || candidateValue === undefined || candidateValue === "") {
    return fallbackValue;
  }

  const numericValue = Number(candidateValue);

  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return fallbackValue;
}

function getOverexposureThresholds(config = scoringConfig) {
  const fallbackAllocationConfig = scoringConfig.dynamicAdjustments.allocation;
  const dynamicAdjustments = config && typeof config === "object" ? config.dynamicAdjustments : null;
  const allocationConfig = dynamicAdjustments && typeof dynamicAdjustments === "object" ? dynamicAdjustments.allocation : null;
  const moderatePenaltyRate = resolveThreshold(
    allocationConfig && allocationConfig.moderatePenaltyRate,
    fallbackAllocationConfig.moderatePenaltyRate
  );
  const fallbackHighPenaltyRate = fallbackAllocationConfig.highPenaltyRate;
  const candidateHighPenaltyRate = resolveThreshold(
    allocationConfig && allocationConfig.highPenaltyRate,
    fallbackHighPenaltyRate
  );
  const highPenaltyRate =
    candidateHighPenaltyRate > moderatePenaltyRate
      ? candidateHighPenaltyRate
      : Math.max(fallbackHighPenaltyRate, moderatePenaltyRate + 0.01);
  const minimumPenalty = Math.min(
    resolveThreshold(allocationConfig && allocationConfig.minimumPenalty, fallbackAllocationConfig.minimumPenalty),
    0
  );
  const maximumPenalty = Math.min(
    Math.max(
      resolveThreshold(allocationConfig && allocationConfig.maximumPenalty, fallbackAllocationConfig.maximumPenalty),
      minimumPenalty
    ),
    0
  );

  return {
    moderateThresholdPct: resolveThreshold(
      allocationConfig && allocationConfig.overexposureThresholdPct,
      fallbackAllocationConfig.overexposureThresholdPct
    ),
    highThresholdPct: resolveThreshold(
      allocationConfig && allocationConfig.highOverexposureThresholdPct,
      fallbackAllocationConfig.highOverexposureThresholdPct
    ),
    moderatePenaltyRate,
    highPenaltyRate,
    minimumPenalty,
    maximumPenalty
  };
}

function clampPenalty(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getOverexposureProfile(allocationPct, config = scoringConfig) {
  const numericAllocationPct = Number(allocationPct);

  if (!Number.isFinite(numericAllocationPct)) {
    return {
      overexposureSeverity: null,
      overexposurePenalty: 0
    };
  }

  const thresholds = getOverexposureThresholds(config);
  const maxModeratePenaltyMagnitude =
    (thresholds.highThresholdPct - thresholds.moderateThresholdPct) * thresholds.moderatePenaltyRate;

  if (numericAllocationPct > thresholds.highThresholdPct) {
    return {
      overexposureSeverity: OVEREXPOSURE_SEVERITY.high,
      overexposurePenalty: roundTo(
        clampPenalty(
          -(maxModeratePenaltyMagnitude + (numericAllocationPct - thresholds.highThresholdPct) * thresholds.highPenaltyRate),
          thresholds.minimumPenalty,
          thresholds.maximumPenalty
        )
      )
    };
  }

  if (numericAllocationPct >= thresholds.moderateThresholdPct) {
    return {
      overexposureSeverity: OVEREXPOSURE_SEVERITY.moderate,
      overexposurePenalty: roundTo(
        clampPenalty(
          -(numericAllocationPct - thresholds.moderateThresholdPct) * thresholds.moderatePenaltyRate,
          thresholds.minimumPenalty,
          thresholds.maximumPenalty
        )
      )
    };
  }

  return {
    overexposureSeverity: null,
    overexposurePenalty: 0
  };
}

function getOverexposureSeverity(allocationPct, config = scoringConfig) {
  return getOverexposureProfile(allocationPct, config).overexposureSeverity;
}

function getOverexposurePenalty(allocationPct, config = scoringConfig) {
  return getOverexposureProfile(allocationPct, config).overexposurePenalty;
}

module.exports = {
  OVEREXPOSURE_SEVERITY,
  getOverexposurePenalty,
  getOverexposureProfile,
  getOverexposureSeverity
};
