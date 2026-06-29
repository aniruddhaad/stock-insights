const asyncHandler = require("../utils/async-handler");
const stockService = require("../services/stock.service");
const { buildPortfolioSummary, normalizeOptions } = require("../services/portfolio.service");
const { analyzePortfolio } = require("../services/decision-engine.service");
const { analyzeSell } = require("../services/sell-analysis.service");
const { buildScenarioProjection } = require("../services/scenario.service");
const transactionService = require("../services/transaction.service");

const getPortfolioSummary = asyncHandler(async (req, res) => {
  const stocks = await stockService.listStocksByUser(req.user.userId);
  const summary = await buildPortfolioSummary(stocks, req.query);

  res.json({
    success: true,
    data: summary
  });
});

const getPortfolioInsights = asyncHandler(async (req, res) => {
  const stocks = await stockService.listStocksByUser(req.user.userId);
  const insights = await analyzePortfolio(stocks, req.query);

  res.json({
    success: true,
    data: insights
  });
});

const runSellAnalysis = asyncHandler(async (req, res) => {
  const analysis = analyzeSell(req.body);

  res.json({
    success: true,
    data: analysis
  });
});

const runScenarioProjection = asyncHandler(async (req, res) => {
  const options = normalizeOptions(req.body);
  const projection = buildScenarioProjection(req.body.principal, req.body.years, {
    includeInflation: options.includeInflation,
    inflationRate: options.inflationRate
  });

  res.json({
    success: true,
    data: projection
  });
});

const deletePosition = asyncHandler(async (req, res) => {
  const result = await transactionService.deletePosition(req.user.userId, req.params.symbol, req.body || {});

  res.json({
    success: true,
    data: result
  });
});

module.exports = {
  deletePosition,
  getPortfolioSummary,
  getPortfolioInsights,
  runSellAnalysis,
  runScenarioProjection
};
