const asyncHandler = require("../utils/async-handler");
const stockService = require("../services/stock.service");

const createStock = asyncHandler(async (req, res) => {
  const stock = await stockService.createStock(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: stock
  });
});

const listStocks = asyncHandler(async (req, res) => {
  const stocks = await stockService.listStocksByUser(req.user.userId);

  res.json({
    success: true,
    data: stocks
  });
});

const getStock = asyncHandler(async (req, res) => {
  const stock = await stockService.getStockByIdForUser(req.params.stockId, req.user.userId);

  res.json({
    success: true,
    data: stock
  });
});

const updateStock = asyncHandler(async (req, res) => {
  const stock = await stockService.updateStock(req.params.stockId, req.user.userId, req.body);

  res.json({
    success: true,
    data: stock
  });
});

const deleteStock = asyncHandler(async (req, res) => {
  await stockService.deleteStock(req.params.stockId, req.user.userId);

  res.json({
    success: true,
    data: {
      deleted: true,
      stockId: req.params.stockId
    }
  });
});

module.exports = {
  createStock,
  listStocks,
  getStock,
  updateStock,
  deleteStock
};

