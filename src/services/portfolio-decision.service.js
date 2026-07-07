const decisionConfig = require("../config/decision.config");
const { roundTo } = require("../utils/math");

const ACTIONS = Object.freeze({
  hold: Object.freeze({ code: "hold", label: "Hold" }),
  reduce: Object.freeze({ code: "reduce_position", label: "Reduce Position" }),
  exit: Object.freeze({ code: "exit", label: "Exit" }),
  bookPartialProfits: Object.freeze({
    code: "book_partial_profits",
    label: "Book Partial Profits"
  })
});

function finiteNumber(...values) {
  for (const value of values) {
    const numericValue = Number(value);
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(numericValue)) {
      return numericValue;
    }
  }
  return null;
}

function clamp(value, min = 0, max = 10) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
}

function indicatorState(value, numericValue, config) {
  const label = normalizeLabel(value);
  const negativeLabels = new Set([
    "negative", "weak", "weakening", "bearish", "downtrend", "sell", "underperform",
    "deteriorating", "stretched", "overvalued"
  ]);
  const positiveLabels = new Set([
    "positive", "strong", "healthy", "strengthening", "bullish", "uptrend", "buy",
    "outperform", "undervalued", "fair"
  ]);

  if (negativeLabels.has(label)) return "negative";
  if (positiveLabels.has(label)) return "positive";
  if (numericValue !== null && numericValue <= config.investmentHealth.weakIndicatorScore) return "negative";
  if (numericValue !== null && numericValue >= config.investmentHealth.healthyIndicatorScore) return "positive";
  return "neutral";
}

function computeInvestmentQuality(position) {
  const scoring = position.scoring || {};
  const normalized = scoring.normalizedScores || {};
  const explicitScore = finiteNumber(
    position.decisionInputs && position.decisionInputs.qualityScore,
    position.qualityScore,
    position.investmentQuality && position.investmentQuality.score
  );
  let score = explicitScore;

  if (score === null) {
    const components = [
      finiteNumber(normalized.technicalScore),
      finiteNumber(normalized.fundamentalScore),
      finiteNumber(normalized.sentimentScore)
    ].filter((value) => value !== null);

    score = components.length > 0
      ? components.reduce((sum, value) => sum + value, 0) / components.length
      : finiteNumber(scoring.finalScore, 5);
  }

  score = roundTo(clamp(score));

  return {
    score,
    scale: 10,
    label: score >= 7.5 ? "High" : score <= 4 ? "Low" : "Average"
  };
}

function collectEvidence(position, quality, config) {
  const inputs = position.decisionInputs || {};
  const indicators = position.indicators || {};
  const scoring = position.scoring || {};
  const normalized = scoring.normalizedScores || {};
  const sentiment = position.sentiment && position.sentiment.sentiment
    ? position.sentiment.sentiment
    : {};
  const technicalScore = finiteNumber(inputs.technicalScore, indicators.technicalScore, normalized.technicalScore);
  const momentumScore = finiteNumber(inputs.momentumScore, indicators.momentumScore);
  const technical = indicatorState(
    inputs.technicalTrend || indicators.technicalTrend || indicators.trend,
    technicalScore,
    config
  );
  const momentum = indicatorState(inputs.momentum || indicators.momentum, momentumScore, config);
  const sentimentState = indicatorState(inputs.sentiment || sentiment.label, finiteNumber(sentiment.score), config);
  const news = indicatorState(inputs.news || indicators.news, finiteNumber(inputs.newsScore), config);
  const analyst = indicatorState(
    inputs.analystConsensus || indicators.analystConsensus,
    finiteNumber(inputs.analystScore),
    config
  );
  const valuationLabel = normalizeLabel(inputs.valuation || indicators.valuation);
  const stretchedValuation = inputs.stretchedValuation === true ||
    ["stretched", "overvalued", "expensive"].includes(valuationLabel);

  return {
    quality,
    technical,
    momentum,
    sentiment: sentimentState,
    news,
    analyst,
    stretchedValuation,
    knownHealthFactors: [technical, momentum, sentimentState, news, analyst].filter((state) => state !== "neutral").length,
    negativeHealthFactors: [technical, momentum, sentimentState, news, analyst].filter((state) => state === "negative").length,
    positiveHealthFactors: [technical, momentum, sentimentState, news, analyst].filter((state) => state === "positive").length
  };
}

function collectPortfolioRisk(position, config) {
  const inputs = position.decisionInputs || {};
  const metrics = position.metrics || {};
  const allocationPct = finiteNumber(metrics.allocationPct, inputs.positionAllocationPct, 0);
  const sectorAllocationPct = finiteNumber(inputs.sectorAllocationPct, metrics.sectorAllocationPct);
  const topHoldingsAllocationPct = finiteNumber(inputs.topHoldingsAllocationPct, metrics.topHoldingsAllocationPct);
  const diversification = normalizeLabel(inputs.diversification || metrics.diversification);
  const reasons = [];

  if (allocationPct >= config.concentration.positionAllocationPct) reasons.push("position_concentration");
  if (sectorAllocationPct !== null && sectorAllocationPct >= config.concentration.sectorAllocationPct) {
    reasons.push("sector_concentration");
  }
  if (topHoldingsAllocationPct !== null && topHoldingsAllocationPct >= config.concentration.topHoldingsAllocationPct) {
    reasons.push("portfolio_concentration");
  }
  if (["poor", "low", "undiversified"].includes(diversification)) reasons.push("poor_diversification");

  return { allocationPct, sectorAllocationPct, topHoldingsAllocationPct, reasons, excessive: reasons.length > 0 };
}

function factor(code, label, type = "supporting") {
  return { code, label, type };
}

function buildConfidence(evidence, risk, action) {
  const agreement = action.code === ACTIONS.exit.code
    ? evidence.negativeHealthFactors
    : action.code === ACTIONS.hold.code
      ? evidence.positiveHealthFactors + (evidence.quality.label === "High" ? 1 : 0)
      : 2 + risk.reasons.length;
  const label = agreement >= 3 ? "High" : agreement >= 2 ? "Medium" : "Low";
  return { label, code: label.toLowerCase() };
}

function buildExplanation({ quality, action, primaryDriver, supportingFactors, risk, profitLossPct, conflict }) {
  const supportText = supportingFactors.slice(0, 3).map((item) => item.label.toLowerCase()).join(", ");
  const gainText = profitLossPct > 0 ? ` The position has an unrealized gain of ${roundTo(profitLossPct)}%.` : "";
  const conflictText = conflict ? ` ${conflict}` : "";

  if (action.code === ACTIONS.reduce.code) {
    if (risk.excessive) {
      return `This is a ${quality.label.toLowerCase()}-quality holding, but ${primaryDriver.label.toLowerCase()} outweighs the company view.${gainText} Reduce the position to restore portfolio balance; the action is driven by portfolio risk, not by the gain.${conflictText}`;
    }

    return `The position does not yet warrant a full exit, but ${primaryDriver.label.toLowerCase()} is reinforced by ${supportText}. Reduce exposure while monitoring for either recovery or further deterioration; profit or loss is not the primary reason.${conflictText}`;
  }
  if (action.code === ACTIONS.exit.code) {
    return `The investment case has deteriorated. ${primaryDriver.label} is reinforced by ${supportText || "multiple weak health signals"}. Exit because investment health is weak, not because of the position's profit or loss.${conflictText}`;
  }
  if (action.code === ACTIONS.bookPartialProfits.code) {
    return `The gain alone does not justify selling. However, ${primaryDriver.label.toLowerCase()} is reinforced by ${supportText}, so booking partial profits is appropriate while retaining some exposure.${conflictText}`;
  }
  return `This is a ${quality.label.toLowerCase()}-quality long-term holding. ${primaryDriver.label}.${gainText} Allocation is acceptable and no decisive deterioration or concentration risk has been detected. Continue holding; partial profit booking is optional only if rebalancing is desired.${conflictText}`;
}

function buildDecisionEvidence({ quality, evidence, risk, profitLossPct }) {
  return {
    investmentQuality: {
      score: quality.score,
      scale: quality.scale,
      label: quality.label
    },
    technicalTrend: evidence.technical,
    momentum: evidence.momentum,
    sentiment: evidence.sentiment,
    news: evidence.news,
    analystConsensus: evidence.analyst,
    valuation: evidence.stretchedValuation ? "stretched" : "not_stretched_or_unavailable",
    portfolioAllocationPct: risk.allocationPct,
    sectorAllocationPct: risk.sectorAllocationPct,
    topHoldingsAllocationPct: risk.topHoldingsAllocationPct,
    concentrationRisk: risk.excessive,
    concentrationReasons: [...risk.reasons],
    unrealizedGainPct: profitLossPct
  };
}

function buildPortfolioSummaryExplanation({ summary, positions = [] } = {}) {
  if (!summary) return null;

  const holdingsCount = Number.isFinite(Number(summary.holdingsCount)) ? Number(summary.holdingsCount) : 0;
  const returnPct = Number.isFinite(Number(summary.totalProfitLossPct))
    ? `${Number(summary.totalProfitLossPct) >= 0 ? "+" : ""}${roundTo(Number(summary.totalProfitLossPct))}%`
    : "unavailable";
  const largestPosition = [...positions]
    .filter((position) => Number.isFinite(Number(position.metrics && position.metrics.allocationPct)))
    .sort((left, right) => Number(right.metrics.allocationPct) - Number(left.metrics.allocationPct))[0];
  const concentrationText = largestPosition
    ? ` The largest position is ${largestPosition.symbol} at ${roundTo(largestPosition.metrics.allocationPct)}%.`
    : "";

  return `The portfolio contains ${holdingsCount} holding${holdingsCount === 1 ? "" : "s"} with a total return of ${returnPct}.${concentrationText}`;
}

function buildPortfolioDecision(position, config = decisionConfig) {
  const quality = computeInvestmentQuality(position);
  const evidence = collectEvidence(position, quality, config);
  const risk = collectPortfolioRisk(position, config);
  const profitLossPct = finiteNumber(position.metrics && position.metrics.profitLossPct, 0);
  let action;
  let stage;
  let primaryDriver;
  let supportingFactors = [];
  let conflict = null;

  // Stage 1: portfolio construction outranks company quality and return.
  if (risk.excessive) {
    action = ACTIONS.reduce;
    stage = "portfolio_risk";
    primaryDriver = factor("concentration_risk", "Concentration risk", "primary");
    supportingFactors = risk.reasons.map((reason) => factor(reason, {
      position_concentration: `Position allocation is ${roundTo(risk.allocationPct)}%`,
      sector_concentration: `Sector allocation is ${roundTo(risk.sectorAllocationPct)}%`,
      portfolio_concentration: "Portfolio is concentrated in its largest holdings",
      poor_diversification: "Diversification is insufficient"
    }[reason]));
    if (quality.label === "High") conflict = "Company quality remains strong, but position sizing takes priority.";
  // Stage 2: exit only when weak quality is corroborated by deterioration.
  } else if (quality.score <= config.investmentHealth.exitQualityScore && evidence.negativeHealthFactors >= 2) {
    action = ACTIONS.exit;
    stage = "investment_health";
    primaryDriver = factor("deteriorating_investment_health", "Deteriorating investment health", "primary");
    supportingFactors = [
      factor("low_quality", `Investment quality is ${quality.score}/10`),
      evidence.technical === "negative" && factor("weak_trend", "Technical trend is weak"),
      evidence.momentum === "negative" && factor("weak_momentum", "Momentum is weakening"),
      evidence.sentiment === "negative" && factor("negative_sentiment", "Sentiment is negative"),
      evidence.news === "negative" && factor("negative_news", "News flow is negative"),
      evidence.analyst === "negative" && factor("negative_consensus", "Analyst consensus is negative")
    ].filter(Boolean);
  } else if (quality.score <= config.investmentHealth.weakQualityScore && evidence.negativeHealthFactors >= 1) {
    action = ACTIONS.reduce;
    stage = "investment_health";
    primaryDriver = factor("weak_investment_health", "Weak investment health", "primary");
    supportingFactors = [
      factor("low_quality", `Investment quality is ${quality.score}/10`),
      evidence.technical === "negative" && factor("weak_trend", "Technical trend is weak"),
      evidence.momentum === "negative" && factor("weak_momentum", "Momentum is weakening"),
      evidence.sentiment === "negative" && factor("negative_sentiment", "Sentiment is negative"),
      evidence.news === "negative" && factor("negative_news", "News flow is negative")
    ].filter(Boolean);
  // Stage 3: a qualifying gain needs at least one independent warning.
  } else if (
    profitLossPct >= config.profitTaking.minimumGainPct &&
    (evidence.stretchedValuation || evidence.negativeHealthFactors >= 1)
  ) {
    action = ACTIONS.bookPartialProfits;
    stage = "valuation_profit_taking";
    primaryDriver = factor(
      evidence.stretchedValuation ? "stretched_valuation" : "weakening_investment_health",
      evidence.stretchedValuation ? "Stretched valuation" : "Weakening investment health",
      "primary"
    );
    supportingFactors = [
      factor("gain_threshold_met", `Unrealized gain of ${roundTo(profitLossPct)}% exceeds the review threshold`),
      evidence.technical === "negative" && factor("weak_trend", "Technical trend is weak"),
      evidence.momentum === "negative" && factor("weak_momentum", "Momentum is weakening"),
      evidence.sentiment === "negative" && factor("negative_sentiment", "Sentiment is negative"),
      evidence.news === "negative" && factor("negative_news", "News flow is negative")
    ].filter(Boolean);
    if (quality.label === "High") conflict = "Quality is still high, but the corroborating warning signs justify trimming rather than exiting.";
  // Stage 4: gains are explicitly non-decisive for a healthy, appropriately sized holding.
  } else {
    action = ACTIONS.hold;
    stage = "long_term_compounder";
    primaryDriver = factor(
      quality.label === "High" ? "strong_long_term_fundamentals" : "stable_investment_case",
      quality.label === "High" ? "Strong long-term fundamentals" : "Stable investment case",
      "primary"
    );
    supportingFactors = [
      evidence.technical === "positive" && factor("positive_trend", "Trend is positive"),
      evidence.momentum === "positive" && factor("good_momentum", "Momentum is healthy"),
      factor("acceptable_allocation", `Allocation is acceptable at ${roundTo(risk.allocationPct)}%`),
      profitLossPct >= config.profitTaking.minimumGainPct &&
        factor("gain_without_concentration", "Profit is high but concentration is low"),
      evidence.sentiment === "positive" && factor("positive_sentiment", "Sentiment is positive")
    ].filter(Boolean);
    if (profitLossPct >= config.profitTaking.minimumGainPct) {
      conflict = "The large gain does not outweigh healthy investment and portfolio conditions.";
    }
  }

  const confidence = buildConfidence(evidence, risk, action);
  const decisionEvidence = buildDecisionEvidence({ quality, evidence, risk, profitLossPct });
  const explanation = buildExplanation({
    quality,
    action,
    primaryDriver,
    supportingFactors,
    risk,
    profitLossPct,
    conflict
  });

  return {
    investmentQuality: quality,
    portfolioAction: action,
    confidence,
    primaryDriver,
    supportingFactors,
    evidence: decisionEvidence,
    explanation,
    decisionStage: stage
  };
}

function toLegacySuggestion(decision, existingSuggestion = {}) {
  const codeByAction = {
    hold: "hold_for_long_term",
    reduce_position: "reduce_position",
    exit: "exit_position",
    book_partial_profits: "book_partial_profits"
  };

  return {
    ...existingSuggestion,
    code: codeByAction[decision.portfolioAction.code],
    reasonCodes: [
      decision.primaryDriver.code,
      ...decision.supportingFactors.map((item) => item.code)
    ]
  };
}

module.exports = {
  ACTIONS,
  buildPortfolioDecision,
  buildPortfolioSummaryExplanation,
  computeInvestmentQuality,
  toLegacySuggestion
};
