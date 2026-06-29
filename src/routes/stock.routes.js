const express = require("express");
const stockController = require("../controllers/stock.controller");
const authenticate = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { validateCreateStock, validateUpdateStock } = require("../validators/stock.validator");

const router = express.Router();

router.use(authenticate);
router.get("/", stockController.listStocks);
router.post("/", validate(validateCreateStock), stockController.createStock);
router.get("/:stockId", stockController.getStock);
router.patch("/:stockId", validate(validateUpdateStock), stockController.updateStock);
router.delete("/:stockId", stockController.deleteStock);

module.exports = router;

