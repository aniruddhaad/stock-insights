const dotenv = require("dotenv");

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 4000),
  mongoUri: process.env.MONGO_URI,
  mongoDbName: process.env.MONGO_DB_NAME || "stock_insights",
  jwtSecret: process.env.JWT_SECRET || "stock-insights-super-secret-key",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  aiNewsServiceUrl: process.env.AI_NEWS_SERVICE_URL || "http://localhost:4001",
  aiNewsServicePort: toNumber(process.env.AI_NEWS_SERVICE_PORT, 4001),
  defaultScenarioYears: toNumber(process.env.DEFAULT_SCENARIO_YEARS, 3),
  defaultInflationRate: toNumber(process.env.DEFAULT_INFLATION_RATE, 6),
  longTermHoldingDays: toNumber(process.env.LONG_TERM_HOLDING_DAYS, 365),
  holdingBootstrapEstimationStrategy: process.env.HOLDING_BOOTSTRAP_ESTIMATION_STRATEGY || "long_term",
  holdingBootstrapEstimatedDays: toNumber(process.env.HOLDING_BOOTSTRAP_ESTIMATED_DAYS, 366),
  aiNewsTimeoutMs: toNumber(process.env.AI_NEWS_TIMEOUT_MS, 2500),
  marketDataTimeoutMs: toNumber(process.env.MARKET_DATA_TIMEOUT_MS, 2500)
};
