const ApiError = require("../utils/api-error");

module.exports = function validate(validator) {
  return function validationMiddleware(req, res, next) {
    const errors = validator(req);

    if (errors.length > 0) {
      return next(new ApiError(400, "VALIDATION_ERROR", "Validation failed", errors));
    }

    return next();
  };
};

