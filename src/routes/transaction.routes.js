const express = require("express");
const transactionController = require("../controllers/transaction.controller");
const authenticate = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.get("/", transactionController.listTransactions);
router.post("/", transactionController.createTransaction);
router.patch("/:transactionId", transactionController.updateTransaction);
router.delete("/:transactionId", transactionController.deleteTransaction);

module.exports = router;
