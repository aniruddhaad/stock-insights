const asyncHandler = require("../utils/async-handler");
const ingestionService = require("../services/portfolio-ingestion/ingestion.service");

const importPortfolio = asyncHandler(async (req, res) => {
  const mode = String(req.body.mode || "preview").toLowerCase();
  const result =
    mode === "commit"
      ? await ingestionService.importCsv(req.user.userId, req.body)
      : await ingestionService.previewCsvImport(req.user.userId, req.body);

  res.status(mode === "commit" ? 201 : 200).json({
    success: true,
    data: result
  });
});

const connectBroker = asyncHandler(async (req, res) => {
  const connection = await ingestionService.connectBroker(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: connection
  });
});

const syncBroker = asyncHandler(async (req, res) => {
  const result = await ingestionService.syncBroker(req.user.userId, req.body);

  res.json({
    success: true,
    data: result
  });
});

const debugBrokerSync = asyncHandler(async (req, res) => {
  const result = await ingestionService.debugBrokerSync(req.user.userId, req.body);

  res.json({
    success: true,
    data: result
  });
});

const syncHistoricalTrades = asyncHandler(async (req, res) => {
  const result = await ingestionService.syncHistoricalTrades(req.user.userId, req.body);

  res.json({
    success: true,
    data: result
  });
});

const migrateSamcoBootstrap = asyncHandler(async (req, res) => {
  const result = await ingestionService.migrateSamcoBootstrapToHistorical(req.user.userId, req.body);

  res.json({
    success: true,
    data: result
  });
});

const getBrokerStatus = asyncHandler(async (req, res) => {
  const status = await ingestionService.getBrokerStatus(req.user.userId);

  res.json({
    success: true,
    data: status
  });
});

module.exports = {
  connectBroker,
  debugBrokerSync,
  getBrokerStatus,
  importPortfolio,
  migrateSamcoBootstrap,
  syncHistoricalTrades,
  syncBroker
};
