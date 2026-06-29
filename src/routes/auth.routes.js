const express = require("express");
const authController = require("../controllers/auth.controller");
const validate = require("../middleware/validate.middleware");
const { validateSignup, validateLogin } = require("../validators/auth.validator");

const router = express.Router();

router.post("/signup", validate(validateSignup), authController.signup);
router.post("/login", validate(validateLogin), authController.login);

module.exports = router;

