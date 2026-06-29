const express = require("express");
const portfolioController = require("../controllers/portfolio.controller");
const authenticate = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  validateSellAnalysis,
  validateScenarioProjection
} = require("../validators/stock.validator");

const router = express.Router();

router.use(authenticate);
router.get("/summary", portfolioController.getPortfolioSummary);
router.get("/insights", portfolioController.getPortfolioInsights);
router.post("/sell-analysis", validate(validateSellAnalysis), portfolioController.runSellAnalysis);
router.post("/scenarios", validate(validateScenarioProjection), portfolioController.runScenarioProjection);
router.delete("/positions/:symbol", portfolioController.deletePosition);

module.exports = router;
