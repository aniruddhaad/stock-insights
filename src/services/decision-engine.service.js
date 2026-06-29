const { buildPortfolioSummary } = require("./portfolio.service");
const { buildScoreBreakdown } = require("./scoring.service");
const { getSentiment } = require("./sentiment-client.service");
const {
  buildPositionExplanationDetails,
  buildPortfolioSummaryExplanation
} = require("./explanation.service");
const { getOverexposureProfile } = require("../utils/overexposure");

function toRankedPosition(position) {
  return {
    stockId: position.stockId,
    symbol: position.symbol,
    allocationPct: position.metrics.allocationPct,
    profitLossPct: position.metrics.profitLossPct,
    currentValue: position.metrics.currentValue,
    finalScore: position.scoring.finalScore,
    sentimentLabel: position.sentiment.sentiment.label,
    suggestionCode: position.sellAnalysis.suggestion.code,
    signalCodes: position.scoring.portfolioSignals.signalCodes
  };
}

function getPositionOverexposureProfile(position) {
  const portfolioSignals = position.scoring && position.scoring.portfolioSignals;

  if (
    portfolioSignals &&
    (portfolioSignals.overexposureSeverity !== undefined || portfolioSignals.overexposurePenalty !== undefined)
  ) {
    return {
      overexposureSeverity: portfolioSignals.overexposureSeverity || null,
      overexposurePenalty: Number.isFinite(Number(portfolioSignals.overexposurePenalty))
        ? Number(portfolioSignals.overexposurePenalty)
        : getOverexposureProfile(position.metrics.allocationPct).overexposurePenalty
    };
  }

  return getOverexposureProfile(position.metrics.allocationPct);
}

function compareByFinalScoreDesc(left, right) {
  const scoreDelta = right.scoring.finalScore - left.scoring.finalScore;

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return left.symbol.localeCompare(right.symbol);
}

function compareByFinalScoreAsc(left, right) {
  const scoreDelta = left.scoring.finalScore - right.scoring.finalScore;

  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return left.symbol.localeCompare(right.symbol);
}

function buildDecisionPayload({ summary, portfolioScenarioProjection, positions, options }) {
  const topPerformers = [...positions].sort(compareByFinalScoreDesc).slice(0, 3);
  const topPerformerIds = new Set(topPerformers.map((position) => position.stockId));
  const worstPerformers = positions
    .filter((position) => !topPerformerIds.has(position.stockId))
    .sort(compareByFinalScoreAsc)
    .slice(0, 3);
  const portfolioSummaryExplanation =
    (summary && summary.explanation) ||
    buildPortfolioSummaryExplanation({ summary, portfolioScenarioProjection, positions });

  return {
    options,
    portfolioSummary: {
      ...summary,
      explanation: portfolioSummaryExplanation
    },
    portfolioScenarioProjection,
    rankings: {
      topPerformers: topPerformers.map(toRankedPosition),
      worstPerformers: worstPerformers.map(toRankedPosition),
      overexposure: positions
        .filter((position) => getPositionOverexposureProfile(position).overexposureSeverity)
        .sort((left, right) => right.metrics.allocationPct - left.metrics.allocationPct)
        .map((position) => {
          const overexposureProfile = getPositionOverexposureProfile(position);

          return {
            ...toRankedPosition(position),
            severity: overexposureProfile.overexposureSeverity,
            overexposureSeverity: overexposureProfile.overexposureSeverity,
            overexposurePenalty: overexposureProfile.overexposurePenalty
          };
        })
    },
    positions: positions.map((position) => {
      const explanationDetails = buildPositionExplanationDetails(position);

      return {
        stockId: position.stockId,
        symbol: position.symbol,
        quantity: position.quantity,
        prices: position.prices,
        holding: position.holding,
        metrics: position.metrics,
        confidenceLabel: position.confidenceLabel || explanationDetails.confidenceLabel,
        explanations:
          (Array.isArray(position.explanations) && position.explanations.length > 0
            ? position.explanations
            : explanationDetails.explanations),
        sellAnalysis: position.sellAnalysis,
        scenarioProjection: position.scenarioProjection,
        sentiment: position.sentiment,
        scoring: position.scoring
      };
    })
  };
}

async function analyzePortfolio(stocks, options = {}) {
  const portfolio = await buildPortfolioSummary(stocks, options);

  const positions = await Promise.all(
    portfolio.positions.map(async (position) => {
      const sentiment = await getSentiment(position.symbol);
      const scoring = buildScoreBreakdown(position, sentiment.sentiment.score);

      return {
        ...position,
        sentiment,
        scoring
      };
    })
  );

  return buildDecisionPayload({
    summary: portfolio.summary,
    portfolioScenarioProjection: portfolio.portfolioScenarioProjection,
    positions,
    options: portfolio.options
  });
}

module.exports = {
  analyzePortfolio,
  buildDecisionPayload
};
