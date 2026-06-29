function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function validateCreateStock(req) {
  const errors = [];
  const { symbol, quantity, buyPrice, buyDate, currentPrice } = req.body;

  if (!symbol || !/^[A-Za-z.\-]{1,15}$/.test(String(symbol).trim())) {
    errors.push({ field: "symbol", code: "SYMBOL_INVALID" });
  }

  if (!isPositiveNumber(quantity)) {
    errors.push({ field: "quantity", code: "QUANTITY_INVALID" });
  }

  if (!isPositiveNumber(buyPrice)) {
    errors.push({ field: "buyPrice", code: "BUY_PRICE_INVALID" });
  }

  if (!buyDate || !isValidDate(buyDate)) {
    errors.push({ field: "buyDate", code: "BUY_DATE_INVALID" });
  }

  if (currentPrice !== undefined && currentPrice !== null && !isPositiveNumber(currentPrice)) {
    errors.push({ field: "currentPrice", code: "CURRENT_PRICE_INVALID" });
  }

  return errors;
}

function validateUpdateStock(req) {
  const errors = [];
  const { symbol, quantity, buyPrice, buyDate, currentPrice } = req.body;

  if (symbol !== undefined && !/^[A-Za-z.\-]{1,15}$/.test(String(symbol).trim())) {
    errors.push({ field: "symbol", code: "SYMBOL_INVALID" });
  }

  if (quantity !== undefined && !isPositiveNumber(quantity)) {
    errors.push({ field: "quantity", code: "QUANTITY_INVALID" });
  }

  if (buyPrice !== undefined && !isPositiveNumber(buyPrice)) {
    errors.push({ field: "buyPrice", code: "BUY_PRICE_INVALID" });
  }

  if (buyDate !== undefined && !isValidDate(buyDate)) {
    errors.push({ field: "buyDate", code: "BUY_DATE_INVALID" });
  }

  if (currentPrice !== undefined && currentPrice !== null && !isPositiveNumber(currentPrice)) {
    errors.push({ field: "currentPrice", code: "CURRENT_PRICE_INVALID" });
  }

  return errors;
}

function validateSellAnalysis(req) {
  const errors = [];
  const { buyPrice, quantity, currentPrice, holdingDurationDays } = req.body;

  if (!isPositiveNumber(buyPrice)) {
    errors.push({ field: "buyPrice", code: "BUY_PRICE_INVALID" });
  }

  if (!isPositiveNumber(quantity)) {
    errors.push({ field: "quantity", code: "QUANTITY_INVALID" });
  }

  if (!isPositiveNumber(currentPrice)) {
    errors.push({ field: "currentPrice", code: "CURRENT_PRICE_INVALID" });
  }

  if (!Number.isFinite(Number(holdingDurationDays)) || Number(holdingDurationDays) < 0) {
    errors.push({ field: "holdingDurationDays", code: "HOLDING_DURATION_INVALID" });
  }

  return errors;
}

function validateScenarioProjection(req) {
  const errors = [];
  const { principal, years, inflationRate } = req.body;

  if (!isPositiveNumber(principal)) {
    errors.push({ field: "principal", code: "PRINCIPAL_INVALID" });
  }

  if (!isPositiveNumber(years)) {
    errors.push({ field: "years", code: "YEARS_INVALID" });
  }

  if (
    inflationRate !== undefined &&
    inflationRate !== null &&
    (!Number.isFinite(Number(inflationRate)) || Number(inflationRate) < 0)
  ) {
    errors.push({ field: "inflationRate", code: "INFLATION_RATE_INVALID" });
  }

  return errors;
}

module.exports = {
  validateCreateStock,
  validateUpdateStock,
  validateSellAnalysis,
  validateScenarioProjection
};

