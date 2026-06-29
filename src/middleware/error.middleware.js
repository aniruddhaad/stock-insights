module.exports = function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  const payload = {
    success: false,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "Unexpected server error"
    }
  };

  if (err.details) {
    payload.error.details = err.details;
  }

  if (process.env.NODE_ENV !== "production" && err.stack) {
    payload.error.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};

