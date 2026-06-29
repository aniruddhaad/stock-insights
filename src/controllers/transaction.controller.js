const asyncHandler = require("../utils/async-handler");
const transactionService = require("../services/transaction.service");

const listTransactions = asyncHandler(async (req, res) => {
  const transactions = await transactionService.listTransactions(req.user.userId, req.query);

  res.json({
    success: true,
    data: transactions
  });
});

const createTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.createManualTransaction(req.user.userId, req.body);

  res.status(201).json({
    success: true,
    data: transaction
  });
});

const updateTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.updateManualTransaction(
    req.params.transactionId,
    req.user.userId,
    req.body
  );

  res.json({
    success: true,
    data: transaction
  });
});

const deleteTransaction = asyncHandler(async (req, res) => {
  const result = await transactionService.deleteTransaction(req.params.transactionId, req.user.userId, req.body || {});

  res.json({
    success: true,
    data: result
  });
});

module.exports = {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction
};
