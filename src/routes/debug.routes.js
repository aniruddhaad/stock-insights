const express = require("express");
const debugController = require("../controllers/debug.controller");

const router = express.Router();

router.get("/market/:symbol", debugController.getMarketDebug);

module.exports = router;
