const crypto = require("crypto");
const mongoose = require("mongoose");
const Stock = require("../models/stock.model");
const Transaction = require("../models/transaction.model");
const ApiError = require("../utils/api-error");
const { calculateFees } = require("./portfolio-ingestion/normalization/transaction-normalizer");
const { deriveHoldingsFromTransactions } = require("./portfolio-ingestion/normalization/holdings-deriver");

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function isImportedTransaction(transaction) {
  return transaction.source === "broker" || transaction.source === "csv" || transaction.broker !== "manual";
}

function assertForcedConfirmation(options = {}) {
  if (options.force === true && String(options.confirmation || "").trim().toUpperCase() === "DELETE") {
    return;
  }

  throw new ApiError(
    409,
    "FORCED_CONFIRMATION_REQUIRED",
    "Imported transactions require force=true and confirmation=DELETE before they can be made inactive"
  );
}

function normalizeTransactionPayload(userId, payload, existing = null) {
  const base = {
    user: new mongoose.Types.ObjectId(userId),
    symbol: normalizeSymbol(payload.symbol !== undefined ? payload.symbol : existing && existing.symbol),
    type: String(payload.type !== undefined ? payload.type : existing && existing.type).trim().toUpperCase(),
    quantity: Number(payload.quantity !== undefined ? payload.quantity : existing && existing.quantity),
    price: Number(payload.price !== undefined ? payload.price : existing && existing.price),
    transactionDate: new Date(
      payload.transactionDate !== undefined ? payload.transactionDate : existing && existing.transactionDate
    ),
    broker: existing ? existing.broker : "manual",
    source: existing ? existing.source : "manual",
    externalTransactionId: existing ? existing.externalTransactionId : null,
    raw: existing ? existing.raw : null
  };
  base.acquisitionDate = base.transactionDate;
  base.holdingAgeSource = existing ? existing.holdingAgeSource : "broker_provided";
  base.acquisitionDateConfidence = existing ? existing.acquisitionDateConfidence : "high";

  const feeOverrides = {};

  if (payload.brokerage !== undefined) {
    feeOverrides.brokerage = Number(payload.brokerage);
  }

  if (payload.fees !== undefined) {
    feeOverrides.otherFees = Number(payload.fees);
  }

  if (payload.taxes !== undefined) {
    feeOverrides.stt = Number(payload.taxes);
  }

  const fees = calculateFees(base, "generic", feeOverrides);

  if (!base.externalTransactionId) {
    base.externalTransactionId = `manual:${crypto.randomUUID()}`;
  }

  return {
    ...base,
    ...fees,
    active: true
  };
}

function validateTransactionPayload(payload) {
  const errors = [];
  const symbol = normalizeSymbol(payload.symbol);
  const type = String(payload.type || "").trim().toUpperCase();
  const quantity = Number(payload.quantity);
  const price = Number(payload.price);
  const transactionDate = new Date(payload.transactionDate);

  if (!symbol || !/^[A-Z0-9.\-]{1,20}$/.test(symbol)) {
    errors.push({ field: "symbol", code: "SYMBOL_INVALID" });
  }

  if (!["BUY", "SELL"].includes(type)) {
    errors.push({ field: "type", code: "TYPE_INVALID" });
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push({ field: "quantity", code: "QUANTITY_INVALID" });
  }

  if (!Number.isFinite(price) || price <= 0) {
    errors.push({ field: "price", code: "PRICE_INVALID" });
  }

  if (!payload.transactionDate || Number.isNaN(transactionDate.getTime())) {
    errors.push({ field: "transactionDate", code: "TRANSACTION_DATE_INVALID" });
  }

  if (errors.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", errors);
  }
}

async function listTransactions(userId, filters = {}) {
  const query = { user: userId };

  if (filters.symbol) {
    query.symbol = normalizeSymbol(filters.symbol);
  }

  if (filters.includeInactive !== "true" && filters.includeInactive !== true) {
    query.active = { $ne: false };
  }

  return Transaction.find(query).sort({ transactionDate: -1, createdAt: -1 }).lean();
}

async function createManualTransaction(userId, payload) {
  validateTransactionPayload(payload);
  return Transaction.create(normalizeTransactionPayload(userId, payload));
}

async function getTransactionForUser(transactionId, userId) {
  const transaction = await Transaction.findOne({ _id: transactionId, user: userId });

  if (!transaction) {
    throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaction was not found");
  }

  return transaction;
}

async function updateManualTransaction(transactionId, userId, payload) {
  const transaction = await getTransactionForUser(transactionId, userId);

  if (transaction.active === false) {
    throw new ApiError(409, "TRANSACTION_INACTIVE", "Inactive transactions cannot be edited");
  }

  if (isImportedTransaction(transaction)) {
    throw new ApiError(403, "IMPORTED_TRANSACTION_READ_ONLY", "Imported transactions cannot be edited directly");
  }

  validateTransactionPayload({
    symbol: payload.symbol !== undefined ? payload.symbol : transaction.symbol,
    type: payload.type !== undefined ? payload.type : transaction.type,
    quantity: payload.quantity !== undefined ? payload.quantity : transaction.quantity,
    price: payload.price !== undefined ? payload.price : transaction.price,
    transactionDate: payload.transactionDate !== undefined ? payload.transactionDate : transaction.transactionDate
  });

  Object.assign(transaction, normalizeTransactionPayload(userId, payload, transaction));
  await transaction.save();
  return transaction;
}

async function deleteTransaction(transactionId, userId, options = {}) {
  const transaction = await getTransactionForUser(transactionId, userId);

  if (isImportedTransaction(transaction)) {
    assertForcedConfirmation(options);
    transaction.active = false;
    transaction.ignored = true;
    transaction.ignoredAt = new Date();
    transaction.ignoredReason = "transaction_deleted";
    await transaction.save();
    return { deleted: false, deactivated: true, transactionId };
  }

  await transaction.deleteOne();
  return { deleted: true, deactivated: false, transactionId };
}

async function deletePosition(userId, symbol, options = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    throw new ApiError(400, "SYMBOL_REQUIRED", "Symbol is required");
  }

  const transactions = await Transaction.find({
    user: userId,
    symbol: normalizedSymbol,
    active: { $ne: false }
  });
  const importedTransactions = transactions.filter(isImportedTransaction);
  const manualTransactions = transactions.filter((transaction) => !isImportedTransaction(transaction));
  const now = new Date();

  if (importedTransactions.length > 0) {
    assertForcedConfirmation(options);
    await Transaction.updateMany(
      {
        user: userId,
        _id: { $in: importedTransactions.map((transaction) => transaction._id) }
      },
      {
        $set: {
          active: false,
          ignored: true,
          ignoredAt: now,
          ignoredReason: "position_deleted"
        }
      }
    );
  }

  if (manualTransactions.length > 0) {
    await Transaction.deleteMany({
      user: userId,
      _id: { $in: manualTransactions.map((transaction) => transaction._id) }
    });
  }

  await Stock.deleteMany({ user: userId, symbol: normalizedSymbol });

  const remainingTransactions = await Transaction.find({
    user: userId,
    active: { $ne: false }
  })
    .sort({ transactionDate: 1, createdAt: 1 })
    .lean();
  const recomputedHoldings = deriveHoldingsFromTransactions(remainingTransactions);
  const deletedTransactionCount = manualTransactions.length;
  const ignoredTransactionCount = importedTransactions.length;

  console.info("[portfolio] position deleted", {
    userId: String(userId),
    symbol: normalizedSymbol,
    deletedTransactionCount,
    ignoredTransactionCount,
    affectedTransactionCount: deletedTransactionCount + ignoredTransactionCount,
    recomputedHoldingsCount: recomputedHoldings.length
  });

  return {
    symbol: normalizedSymbol,
    manualDeleted: deletedTransactionCount,
    importedDeactivated: ignoredTransactionCount,
    deletedTransactionCount,
    recomputedHoldingsCount: recomputedHoldings.length
  };
}

module.exports = {
  createManualTransaction,
  deletePosition,
  deleteTransaction,
  listTransactions,
  updateManualTransaction
};
