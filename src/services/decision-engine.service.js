const { buildPortfolioSummary } = require("./portfolio.service");
const { buildScoreBreakdown } = require("./scoring.service");
const { getSentiment } = require("./sentiment-client.service");
const { getOverexposureProfile } = require("../utils/overexposure");
const {
  buildPortfolioDecision,
  buildPortfolioSummaryExplanation,
  toLegacySuggestion
} = require("./portfolio-decision.service");

function toRankedPosition(position) {
  const decision = position.decision || buildPortfolioDecision(position);

  return {
    stockId: position.stockId,
    symbol: position.symbol,
    allocationPct: position.metrics.allocationPct,
    profitLossPct: position.metrics.profitLossPct,
    currentValue: position.metrics.currentValue,
    finalScore: position.scoring.finalScore,
    sentimentLabel: position.sentiment.sentiment.label,
    suggestionCode: toLegacySuggestion(
      decision,
      position.sellAnalysis && position.sellAnalysis.suggestion
    ).code,
    portfolioActionCode: decision.portfolioAction.code,
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
    buildPortfolioSummaryExplanation({ summary, positions });

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
      const decision = position.decision || buildPortfolioDecision(position);
      const alignedSellAnalysis = {
        ...position.sellAnalysis,
        suggestion: toLegacySuggestion(decision, position.sellAnalysis && position.sellAnalysis.suggestion)
      };
      return {
        stockId: position.stockId,
        symbol: position.symbol,
        quantity: position.quantity,
        prices: position.prices,
        holding: position.holding,
        metrics: position.metrics,
        investmentQuality: decision.investmentQuality,
        portfolioAction: decision.portfolioAction,
        confidence: decision.confidence,
        primaryDriver: decision.primaryDriver,
        supportingFactors: decision.supportingFactors,
        explanation: decision.explanation,
        decisionStage: decision.decisionStage,
        decision,
        confidenceLabel: decision.confidence.label,
        explanations: [decision.explanation],
        sellAnalysis: alignedSellAnalysis,
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
