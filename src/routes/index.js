const express = require("express");
const authRoutes = require("./auth.routes");
const debugRoutes = require("./debug.routes");
const stockRoutes = require("./stock.routes");
const portfolioRoutes = require("./portfolio.routes");
const importRoutes = require("./import.routes");
const brokerRoutes = require("./broker.routes");
const transactionRoutes = require("./transaction.routes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      service: "stock-insights",
      status: "ok"
    }
  });
});

router.use("/auth", authRoutes);
router.use("/debug", debugRoutes);
router.use("/stocks", stockRoutes);
router.use("/portfolio", portfolioRoutes);
router.use("/import", importRoutes);
router.use("/broker", brokerRoutes);
router.use("/transactions", transactionRoutes);

module.exports = router;
