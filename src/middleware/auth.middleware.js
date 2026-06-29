const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/api-error");

module.exports = function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication token is required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = {
      userId: payload.sub,
      email: payload.email
    };
    return next();
  } catch (error) {
    return next(new ApiError(401, "AUTH_TOKEN_INVALID", "Authentication token is invalid"));
  }
};

