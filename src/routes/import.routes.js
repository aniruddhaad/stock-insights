const express = require("express");
const ingestionController = require("../controllers/ingestion.controller");
const authenticate = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.post("/portfolio", ingestionController.importPortfolio);

module.exports = router;
