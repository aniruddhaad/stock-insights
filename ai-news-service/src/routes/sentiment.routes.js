const express = require("express");
const sentimentController = require("../controllers/sentiment.controller");

const router = express.Router();

router.get("/sentiment/:symbol", sentimentController.getSentiment);

module.exports = router;

