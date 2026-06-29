const asyncHandler = require("../utils/async-handler");
const { defaultMarketDataService } = require("../services/market-data.service");

const getMarketDebug = asyncHandler(async (req, res) => {
  const debug = await defaultMarketDataService.debugSymbol(req.params.symbol);

  res.json({
    success: true,
    data: debug
  });
});

module.exports = {
  getMarketDebug
};
