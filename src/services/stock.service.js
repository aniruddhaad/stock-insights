const mongoose = require("mongoose");
const Stock = require("../models/stock.model");
const Transaction = require("../models/transaction.model");
const ApiError = require("../utils/api-error");
const { deriveHoldingsFromTransactions } = require("./portfolio-ingestion/normalization/holdings-deriver");

function normalizeStockPayload(payload) {
  const normalized = {};

  if (payload.symbol !== undefined) {
    normalized.symbol = String(payload.symbol).trim().toUpperCase();
  }

  if (payload.quantity !== undefined) {
    normalized.quantity = Number(payload.quantity);
  }

  if (payload.buyPrice !== undefined) {
    normalized.buyPrice = Number(payload.buyPrice);
  }

  if (payload.buyDate !== undefined) {
    normalized.buyDate = new Date(payload.buyDate);
    normalized.acquisitionDate = normalized.buyDate;
  }

  if (payload.currentPrice !== undefined) {
    normalized.currentPrice = payload.currentPrice === null ? null : Number(payload.currentPrice);
  }

  if (payload.note !== undefined) {
    normalized.note = payload.note === null ? null : String(payload.note).trim();
  }

  return normalized;
}

async function createStock(userId, payload) {
  const stock = await Stock.create({
    user: new mongoose.Types.ObjectId(userId),
    ...normalizeStockPayload(payload)
  });

  return stock;
}

async function listStocksByUser(userId) {
  const transactions = await Transaction.find({ user: userId, active: { $ne: false } })
    .sort({ transactionDate: 1, createdAt: 1 })
    .lean();

  if (transactions.length > 0) {
    return deriveHoldingsFromTransactions(transactions);
  }

  return Stock.find({ user: userId }).sort({ buyDate: -1, createdAt: -1 }).lean();
}

async function getStockByIdForUser(stockId, userId) {
  const stock = await Stock.findOne({ _id: stockId, user: userId });

  if (!stock) {
    throw new ApiError(404, "STOCK_NOT_FOUND", "Stock position was not found");
  }

  return stock;
}

async function updateStock(stockId, userId, payload) {
  const stock = await getStockByIdForUser(stockId, userId);
  Object.assign(stock, normalizeStockPayload(payload));
  await stock.save();
  return stock;
}

async function deleteStock(stockId, userId) {
  const stock = await getStockByIdForUser(stockId, userId);
  await stock.deleteOne();
}

module.exports = {
  createStock,
  listStocksByUser,
  getStockByIdForUser,
  updateStock,
  deleteStock
};
