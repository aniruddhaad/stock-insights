const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DATA_SOURCES,
  MarketDataService,
  buildYahooSymbols
} = require("../src/services/market-data.service");
const { buildPortfolioSummary } = require("../src/services/portfolio.service");

const baseStock = Object.freeze({
  _id: "stock-1",
  symbol: "RELIANCE",
  quantity: 2,
  buyPrice: 2500,
  buyDate: "2025-01-01T00:00:00.000Z",
  currentPrice: 2600,
  updatedAt: "2026-05-01T10:00:00.000Z"
});

test("market data service builds Indian exchange symbols first", () => {
  assert.deepEqual(buildYahooSymbols("RELIANCE"), ["RELIANCE.NS", "RELIANCE.BO", "RELIANCE"]);
  assert.deepEqual(buildYahooSymbols("TCS.NS"), ["TCS.NS"]);
});

test("market data service uses live price before stored price", async () => {
  const service = new MarketDataService({
    livePriceProvider: async () => ({
      price: 2975.25,
      lastUpdated: "2026-05-06T09:30:00.000Z"
    })
  });

  const priceSnapshot = await service.resolveCurrentPrice(baseStock);

  assert.deepEqual(priceSnapshot, {
    currentPrice: 2975.25,
    dataSource: DATA_SOURCES.LIVE,
    lastUpdated: "2026-05-06T09:30:00.000Z"
  });
});

test("market data service falls back to stored current price when live lookup fails", async () => {
  const service = new MarketDataService({
    livePriceProvider: async () => {
      throw new Error("market unavailable");
    }
  });

  const priceSnapshot = await service.resolveCurrentPrice(baseStock);

  assert.deepEqual(priceSnapshot, {
    currentPrice: 2600,
    dataSource: DATA_SOURCES.STORED,
    lastUpdated: "2026-05-01T10:00:00.000Z"
  });
});

test("market data service falls back to mock price when live and stored prices are unavailable", async () => {
  const service = new MarketDataService({
    livePriceProvider: async () => null
  });

  const priceSnapshot = await service.resolveCurrentPrice({
    ...baseStock,
    currentPrice: null
  });

  assert.equal(priceSnapshot.currentPrice, 2975);
  assert.equal(priceSnapshot.dataSource, DATA_SOURCES.MOCK);
  assert.match(priceSnapshot.lastUpdated, /^\d{4}-\d{2}-\d{2}T/);
});

test("portfolio summary includes price source metadata without changing calculations", async () => {
  const service = new MarketDataService({
    livePriceProvider: async () => ({
      price: 3000,
      lastUpdated: "2026-05-06T09:30:00.000Z"
    })
  });

  const summary = await buildPortfolioSummary([baseStock], {}, { marketDataService: service });
  const position = summary.positions[0];

  assert.equal(position.prices.currentPrice, 3000);
  assert.equal(position.prices.dataSource, DATA_SOURCES.LIVE);
  assert.equal(position.prices.lastUpdated, "2026-05-06T09:30:00.000Z");
  assert.equal(position.metrics.currentValue, 6000);
  assert.equal(position.metrics.profitLoss, 1000);
});
