const { roundTo } = require("../utils/math");

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2
});

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatNumber(value) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  return percentFormatter.format(roundTo(Number(value)));
}

function formatPercent(value, { signed = false } = {}) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const numericValue = roundTo(Number(value));
  const absoluteValue = percentFormatter.format(Math.abs(numericValue));

  if (numericValue < 0) {
    return `-${absoluteValue}%`;
  }

  if (signed && numericValue > 0) {
    return `+${percentFormatter.format(numericValue)}%`;
  }

  return `${percentFormatter.format(numericValue)}%`;
}

function formatCurrency(value) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  return currencyFormatter.format(roundTo(Number(value)));
}

function humanizeCode(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .trim();
}

function getConfidenceLabel(finalScore) {
  const numericScore = Number(finalScore);

  if (!Number.isFinite(numericScore)) {
    return null;
  }

  if (numericScore >= 7) {
    return "strong signal";
  }

  if (numericScore <= 3) {
    return "weak signal";
  }

  return "moderate signal";
}

function getProfitLossPct(position) {
  const sellMetrics = position && position.sellAnalysis ? position.sellAnalysis.metrics : null;

  if (sellMetrics && isFiniteNumber(sellMetrics.profitLossPct)) {
    return Number(sellMetrics.profitLossPct);
  }

  const metrics = position && position.metrics ? position.metrics : null;

  if (metrics && isFiniteNumber(metrics.profitLossPct)) {
    return Number(metrics.profitLossPct);
  }

  return null;
}

function getHoldingType(position) {
  const classification = position && position.sellAnalysis ? position.sellAnalysis.classification : null;
  return classification && classification.holdingType ? classification.holdingType : null;
}

function getSuggestionCode(position) {
  const suggestion = position && position.sellAnalysis ? position.sellAnalysis.suggestion : null;
  return suggestion && suggestion.code ? suggestion.code : null;
}

function getSignalCodes(position) {
  const portfolioSignals = position && position.scoring ? position.scoring.portfolioSignals : null;
  return Array.isArray(portfolioSignals && portfolioSignals.signalCodes) ? portfolioSignals.signalCodes : [];
}

function getSentimentStrength(sentiment) {
  const score = Number(sentiment && sentiment.score);

  if (!Number.isFinite(score) || score === 0) {
    return score === 0 ? "neutral" : null;
  }

  if (Math.abs(score) >= 2) {
    return "strong";
  }

  return "moderate";
}

function buildSentimentFragment(sentiment) {
  const label = sentiment && sentiment.label;
  const strength = getSentimentStrength(sentiment);

  if (!label) {
    return null;
  }

  if (label === "neutral" || strength === "neutral" || !strength) {
    return `sentiment is ${label}`;
  }

  return `sentiment is ${label} and ${strength}`;
}

function buildLeadSignalSentence(position, confidenceLabel) {
  const portfolioSignals = position && position.scoring ? position.scoring.portfolioSignals : null;
  const signalCodes = getSignalCodes(position);
  const severity = portfolioSignals && portfolioSignals.overexposureSeverity
    ? portfolioSignals.overexposureSeverity
    : signalCodes.includes("high_overexposure")
      ? "high_overexposure"
      : signalCodes.includes("moderate_overexposure")
        ? "moderate_overexposure"
        : null;
  const penalty = portfolioSignals && isFiniteNumber(portfolioSignals.overexposurePenalty)
    ? Number(portfolioSignals.overexposurePenalty)
    : null;
  const allocationPct = position && position.metrics && isFiniteNumber(position.metrics.allocationPct)
    ? Number(position.metrics.allocationPct)
    : null;
  const profitLossPct = getProfitLossPct(position);
  const penaltyText = formatNumber(penalty);
  const allocationText = allocationPct === null ? null : formatPercent(allocationPct);
  const scoreSignalText = confidenceLabel || "moderate signal";
  const formattedProfitLossPct = isFiniteNumber(profitLossPct)
    ? formatPercent(profitLossPct, { signed: true })
    : null;

  if (severity === "high_overexposure") {
    if (allocationText && penaltyText) {
      return `High overexposure is the strongest signal here; this is a ${scoreSignalText} and the ${allocationText} allocation carries a ${penaltyText} portfolio penalty and materially raises portfolio risk.`;
    }

    if (allocationText) {
      return `High overexposure is the strongest signal here; this is a ${scoreSignalText} and the ${allocationText} allocation materially raises portfolio risk.`;
    }

    if (penaltyText) {
      return `High overexposure is the strongest signal here; this is a ${scoreSignalText} and it carries a ${penaltyText} portfolio penalty.`;
    }

    return `High overexposure is the strongest signal here; this is a ${scoreSignalText}.`;
  }

  if (severity === "moderate_overexposure") {
    if (allocationText && penaltyText) {
      return `Moderate overexposure is the strongest signal here; this is a ${scoreSignalText} and the ${allocationText} allocation carries a ${penaltyText} portfolio penalty and adds concentration risk.`;
    }

    if (allocationText) {
      return `Moderate overexposure is the strongest signal here; this is a ${scoreSignalText} and the ${allocationText} allocation adds concentration risk.`;
    }

    if (penaltyText) {
      return `Moderate overexposure is the strongest signal here; this is a ${scoreSignalText} and it carries a ${penaltyText} portfolio penalty.`;
    }

    return `Moderate overexposure is the strongest signal here; this is a ${scoreSignalText}.`;
  }

  if (signalCodes.includes("deep_drawdown") || (isFiniteNumber(profitLossPct) && profitLossPct <= -10)) {
    if (formattedProfitLossPct) {
      return `Drawdown is the strongest signal here; this is a ${scoreSignalText} and the ${formattedProfitLossPct} return shows meaningful downside pressure.`;
    }

    return `Drawdown is the strongest signal here; this is a ${scoreSignalText}.`;
  }

  if (signalCodes.includes("strong_unrealized_gain") || (isFiniteNumber(profitLossPct) && profitLossPct >= 12)) {
    if (formattedProfitLossPct) {
      return `Unrealized gain is the strongest signal here; this is a ${scoreSignalText} and the ${formattedProfitLossPct} return supports a profit-booking review.`;
    }

    return `Unrealized gain is the strongest signal here; this is a ${scoreSignalText}.`;
  }

  return `No dominant risk signal stands out here; this is a ${scoreSignalText} based on the current inputs.`;
}

function buildPerformanceFragment(profitLossPct) {
  if (!isFiniteNumber(profitLossPct)) {
    return null;
  }

  const formattedProfitLossPct = formatPercent(profitLossPct, { signed: true });

  if (Number(profitLossPct) > 0) {
    return `profitable (${formattedProfitLossPct})`;
  }

  if (Number(profitLossPct) < 0) {
    return `loss-making (${formattedProfitLossPct})`;
  }

  return "flat (0%)";
}

function buildSellSignalFragment(suggestionCode) {
  if (!suggestionCode) {
    return null;
  }

  if (suggestionCode === "booking_profit") {
    return "current sell signal is to consider booking profits";
  }

  if (suggestionCode === "hold_for_long_term") {
    return "current sell signal is to hold";
  }

  return `current sell signal is to ${humanizeCode(suggestionCode)}`;
}

function buildContextSentence(position) {
  const holdingType = getHoldingType(position);
  const profitLossPct = getProfitLossPct(position);
  const suggestionCode = getSuggestionCode(position);
  const sentiment = position && position.sentiment ? position.sentiment.sentiment : null;
  const performanceFragment = buildPerformanceFragment(profitLossPct);
  const suggestionFragment = buildSellSignalFragment(suggestionCode);
  const sentimentFragment = buildSentimentFragment(sentiment);
  const contextDetails = [];

  if (suggestionFragment) {
    contextDetails.push(suggestionFragment);
  }

  if (sentimentFragment) {
    contextDetails.push(sentimentFragment);
  }

  let primaryContext = null;

  if (holdingType === "short_term" && performanceFragment) {
    primaryContext = `The position is short-term and ${performanceFragment}`;
  } else if (holdingType === "long_term" && performanceFragment) {
    primaryContext = `The position is long-term and ${performanceFragment}`;
  } else if (holdingType === "short_term") {
    primaryContext = "The position is short-term";
  } else if (holdingType === "long_term") {
    primaryContext = "The position is long-term";
  } else if (performanceFragment) {
    primaryContext = `The position is ${performanceFragment}`;
  }

  if (primaryContext && contextDetails.length > 0) {
    return `${primaryContext}; ${contextDetails.join(", and ")}.`;
  }

  if (primaryContext) {
    return `${primaryContext}.`;
  }

  if (contextDetails.length > 0) {
    return `${contextDetails[0].charAt(0).toUpperCase()}${contextDetails[0].slice(1)}${contextDetails.length > 1 ? `, and ${contextDetails.slice(1).join(", and ")}` : ""}.`;
  }

  return null;
}

function buildScenarioSentence(projection, { prefix } = {}) {
  if (!projection || typeof projection !== "object") {
    return null;
  }

  const range = projection.range || {};
  const useInflationAdjustedRange = Boolean(
    projection.includeInflation &&
    isFiniteNumber(range.inflationAdjustedMin) &&
    isFiniteNumber(range.inflationAdjustedMax)
  );
  const minValue = useInflationAdjustedRange ? range.inflationAdjustedMin : range.nominalMin;
  const maxValue = useInflationAdjustedRange ? range.inflationAdjustedMax : range.nominalMax;

  if (!isFiniteNumber(minValue) || !isFiniteNumber(maxValue)) {
    return null;
  }

  const years = isFiniteNumber(projection.years) ? Number(projection.years) : null;
  const durationFragment = years === null ? "" : ` over ${years} year${years === 1 ? "" : "s"}`;
  const sentencePrefix = prefix || (
    useInflationAdjustedRange ? "Inflation-adjusted projected outcomes" : "Projected outcomes"
  );

  return `${sentencePrefix} range from ${formatCurrency(minValue)} to ${formatCurrency(maxValue)}${durationFragment} (scenario-based).`;
}

function buildPositionExplanations(position) {
  const confidenceLabel = getConfidenceLabel(position && position.scoring ? position.scoring.finalScore : null);

  return [
    buildLeadSignalSentence(position, confidenceLabel),
    buildContextSentence(position),
    buildScenarioSentence(position && position.scenarioProjection)
  ]
    .filter(Boolean)
    .slice(0, 3);
}

function buildPositionExplanationDetails(position) {
  const confidenceLabel = getConfidenceLabel(position && position.scoring ? position.scoring.finalScore : null);

  return {
    confidenceLabel,
    explanations: buildPositionExplanations(position)
  };
}

function buildPortfolioSummaryExplanation({ summary, portfolioScenarioProjection, positions = [] } = {}) {
  const explanations = [];

  if (summary && (isFiniteNumber(summary.totalProfitLoss) || isFiniteNumber(summary.totalProfitLossPct))) {
    const profitLossAmount = isFiniteNumber(summary.totalProfitLoss) ? formatCurrency(summary.totalProfitLoss) : null;
    const profitLossPct = isFiniteNumber(summary.totalProfitLossPct)
      ? formatPercent(summary.totalProfitLossPct, { signed: true })
      : null;
    const holdingsCount = isFiniteNumber(summary.holdingsCount) ? Number(summary.holdingsCount) : null;
    const performanceValue =
      profitLossPct && profitLossAmount
        ? `${profitLossPct} (${profitLossAmount})`
        : profitLossPct || profitLossAmount || null;

    if (Number(summary.totalProfitLoss) > 0) {
      explanations.push(
        `Portfolio is up ${performanceValue}${holdingsCount === null ? "" : ` across ${holdingsCount} holdings`}.`
      );
    } else if (Number(summary.totalProfitLoss) < 0) {
      explanations.push(
        `Portfolio is down ${performanceValue}${holdingsCount === null ? "" : ` across ${holdingsCount} holdings`}.`
      );
    } else {
      explanations.push(
        `Portfolio is flat${holdingsCount === null ? "" : ` across ${holdingsCount} holdings`}.`
      );
    }
  }

  if (Array.isArray(positions) && positions.length > 0) {
    const overexposedPositions = positions.filter((position) => {
      const portfolioSignals = position && position.scoring ? position.scoring.portfolioSignals : null;
      return Boolean(portfolioSignals && portfolioSignals.overexposureSeverity);
    });
    const largestPosition = [...positions]
      .filter((position) => position && position.metrics && isFiniteNumber(position.metrics.allocationPct))
      .sort((left, right) => Number(right.metrics.allocationPct) - Number(left.metrics.allocationPct))[0];

    if (overexposedPositions.length > 0 && largestPosition) {
      explanations.push(
        `Concentration risk is elevated with ${overexposedPositions.length} overexposed position${overexposedPositions.length === 1 ? "" : "s"}, led by ${largestPosition.symbol} at ${formatPercent(largestPosition.metrics.allocationPct)}.`
      );
    } else if (largestPosition) {
      explanations.push(
        `Concentration is within limits, with the largest position at ${formatPercent(largestPosition.metrics.allocationPct)}.`
      );
    }
  }

  const scenarioSentence = buildScenarioSentence(portfolioScenarioProjection, {
    prefix: "Scenario-based portfolio outcomes"
  });

  if (scenarioSentence) {
    explanations.push(scenarioSentence);
  }

  return explanations.join(" ") || null;
}

module.exports = {
  buildPositionExplanationDetails,
  buildPositionExplanations,
  buildPortfolioSummaryExplanation,
  getConfidenceLabel
};
