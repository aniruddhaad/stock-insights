const express = require("express");
const ingestionController = require("../controllers/ingestion.controller");
const authenticate = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.post("/connect", ingestionController.connectBroker);
router.post("/sync", ingestionController.syncBroker);
router.post("/debug-sync", ingestionController.debugBrokerSync);
router.post("/samco/sync-historical-trades", ingestionController.syncHistoricalTrades);
router.post("/samco/migrate-bootstrap", ingestionController.migrateSamcoBootstrap);
router.get("/status", ingestionController.getBrokerStatus);

module.exports = router;
