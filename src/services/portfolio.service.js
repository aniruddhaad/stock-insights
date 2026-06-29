const env = require("../config/env");
const { percentage, roundTo } = require("../utils/math");
const { buildHoldingPeriod, normalizeConfidence } = require("../utils/holding-period");
const { defaultMarketDataService } = require("./market-data.service");
const { analyzeSell } = require("./sell-analysis.service");
const { buildScenarioProjection } = require("./scenario.service");

function normalizeOptions(options = {}) {
  return {
    years: Number(options.years || env.defaultScenarioYears),
    includeInflation:
      options.includeInflation === true ||
      options.includeInflation === "true" ||
      options.includeInflation === 1 ||
      options.includeInflation === "1",
    inflationRate:
      options.inflationRate !== undefined && options.inflationRate !== null
        ? Number(options.inflationRate)
        : env.defaultInflationRate
  };
}

function resolvePositionAcquisitionDate(stock) {
  if (stock.acquisitionDate) {
    return stock.acquisitionDate;
  }

  if (stock.holdingAgeSource === "unknown") {
    return null;
  }

  return stock.buyDate;
}

async function createBasePosition(stock, asOfDate = new Date(), marketDataService = defaultMarketDataService) {
  const priceSnapshot = await marketDataService.resolveCurrentPrice(stock);
  const currentPrice = priceSnapshot.currentPrice;
  const investedAmount = roundTo(
    stock.investedAmount !== undefined && stock.investedAmount !== null
      ? Number(stock.investedAmount)
      : Number(stock.buyPrice) * Number(stock.quantity)
  );
  const currentValue = roundTo(currentPrice * Number(stock.quantity));
  const profitLoss = roundTo(currentValue - investedAmount);
  const acquisitionDate = resolvePositionAcquisitionDate(stock);
  const holdingPeriod = buildHoldingPeriod(acquisitionDate, asOfDate, {
    longTermHoldingDays: env.longTermHoldingDays
  });

  return {
    stockId: String(stock._id),
    symbol: stock.symbol,
    quantity: roundTo(stock.quantity, 4),
    note: stock.note || null,
    prices: {
      buyPrice: roundTo(stock.buyPrice),
      currentPrice,
      dataSource: priceSnapshot.dataSource,
      lastUpdated: priceSnapshot.lastUpdated
    },
    holding: {
      buyDate: new Date(stock.buyDate).toISOString(),
      acquisitionDate: holdingPeriod.acquisitionDate,
      holdingDays: holdingPeriod.holdingDays,
      holdingMonths: holdingPeriod.holdingMonths,
      holdingYears: holdingPeriod.holdingYears,
      holdingType: holdingPeriod.holdingType,
      holdingAgeSource: stock.holdingAgeSource || "broker_provided",
      inferredHoldingDays:
        stock.inferredHoldingDays !== undefined && stock.inferredHoldingDays !== null
          ? Number(stock.inferredHoldingDays)
          : null,
      acquisitionDateConfidence:
        stock.acquisitionDateConfidence !== undefined && stock.acquisitionDateConfidence !== null
          ? normalizeConfidence(stock.acquisitionDateConfidence)
          : stock.holdingAgeSource === "unknown"
            ? "unknown"
            : "high"
    },
    metrics: {
      investedAmount,
      currentValue,
      profitLoss,
      profitLossPct: percentage(profitLoss, investedAmount),
      allocationPct: 0
    }
  };
}

async function buildPortfolioSummary(stocks, options = {}, dependencies = {}) {
  const normalizedOptions = normalizeOptions(options);
  const marketDataService = dependencies.marketDataService || defaultMarketDataService;
  const asOfDate = dependencies.asOfDate || new Date();
  const basePositions = await Promise.all(
    stocks.map((stock) => createBasePosition(stock, asOfDate, marketDataService))
  );
  const totalInvestment = roundTo(
    basePositions.reduce((sum, position) => sum + position.metrics.investedAmount, 0)
  );
  const totalCurrentValue = roundTo(
    basePositions.reduce((sum, position) => sum + position.metrics.currentValue, 0)
  );
  const totalProfitLoss = roundTo(totalCurrentValue - totalInvestment);

  const positions = basePositions.map((position) => {
    const allocationPct = percentage(position.metrics.currentValue, totalCurrentValue);
    const sellAnalysis = analyzeSell({
      buyPrice: position.prices.buyPrice,
      quantity: position.quantity,
      currentPrice: position.prices.currentPrice,
      acquisitionDate: position.holding.acquisitionDate,
      holdingDurationDays: position.holding.holdingDays,
      holdingType: position.holding.holdingType
    });
    const scenarioProjection = buildScenarioProjection(position.metrics.currentValue, normalizedOptions.years, {
      includeInflation: normalizedOptions.includeInflation,
      inflationRate: normalizedOptions.inflationRate
    });

    return {
      ...position,
      metrics: {
        ...position.metrics,
        allocationPct
      },
      sellAnalysis,
      scenarioProjection
    };
  });

  return {
    options: {
      years: normalizedOptions.years,
      includeInflation: normalizedOptions.includeInflation,
      inflationRatePct: normalizedOptions.includeInflation ? normalizedOptions.inflationRate : null
    },
    summary: {
      totalInvestment,
      totalCurrentValue,
      totalProfitLoss,
      totalProfitLossPct: percentage(totalProfitLoss, totalInvestment),
      holdingsCount: positions.length,
      allocation: positions.map((position) => ({
        symbol: position.symbol,
        allocationPct: position.metrics.allocationPct
      }))
    },
    portfolioScenarioProjection: buildScenarioProjection(
      totalCurrentValue || totalInvestment,
      normalizedOptions.years,
      {
        includeInflation: normalizedOptions.includeInflation,
        inflationRate: normalizedOptions.inflationRate
      }
    ),
    positions
  };
}

module.exports = {
  buildPortfolioSummary,
  normalizeOptions,
  resolvePositionAcquisitionDate
};
