const axios = require("axios");
const env = require("../config/env");
const { roundTo } = require("../utils/math");

const DATA_SOURCES = Object.freeze({
  LIVE: "live",
  STORED: "stored",
  MOCK: "mock"
});

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

const knownMockPrices = Object.freeze({
  AAPL: 198,
  MSFT: 423,
  NVDA: 911,
  RELIANCE: 2975,
  TCS: 4015,
  INFY: 1624,
  HDFCBANK: 1510,
  SBIN: 807
});

function buildSymbolHash(symbol) {
  return String(symbol)
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
}

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

function buildYahooSymbols(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);

  if (!normalizedSymbol) {
    return [];
  }

  if (normalizedSymbol.endsWith(".NS") || normalizedSymbol.endsWith(".BO")) {
    return [normalizedSymbol];
  }

  return [`${normalizedSymbol}.NS`, `${normalizedSymbol}.BO`, normalizedSymbol];
}

function buildYahooChartUrl(symbol) {
  const params = new URLSearchParams({
    range: "1d",
    interval: "1d"
  });

  return `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params.toString()}`;
}

function getMockPrice(stock) {
  const symbol = normalizeSymbol(stock && stock.symbol);

  if (knownMockPrices[symbol]) {
    return roundTo(knownMockPrices[symbol]);
  }

  const hash = buildSymbolHash(symbol);
  const multiplier = 0.88 + ((hash % 36) / 100);
  return roundTo(Number(stock.buyPrice) * multiplier);
}

function toIsoTimestamp(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;

  if (Number.isNaN(date.getTime())) {
    return fallback.toISOString();
  }

  return date.toISOString();
}

class MarketDataService {
  constructor(options = {}) {
    this.httpClient = options.httpClient || axios;
    this.timeoutMs = Number(options.timeoutMs || env.marketDataTimeoutMs);
    this.livePriceProvider = options.livePriceProvider || null;
  }

  async fetchLivePrice(symbol) {
    if (this.livePriceProvider) {
      return this.livePriceProvider(symbol);
    }

    const details = await this.fetchLivePriceDetails(symbol);

    if (!details.price) {
      return null;
    }

    return {
      price: details.price,
      lastUpdated: details.lastUpdated,
      yahooSymbol: details.selectedYahooSymbol
    };
  }

  async fetchLivePriceDetails(symbol) {
    const requestedSymbol = normalizeSymbol(symbol);
    const yahooSymbols = buildYahooSymbols(requestedSymbol);
    const requestUrl = yahooSymbols.length > 0 ? buildYahooChartUrl(yahooSymbols[0]) : null;
    const details = {
      requestedSymbol,
      yahooSymbols,
      attemptedYahooSymbol: yahooSymbols[0] || null,
      requestUrl,
      responseStatus: null,
      parsedPrice: null,
      selectedYahooSymbol: null,
      lastUpdated: null,
      attempts: [],
      error: null
    };

    if (this.livePriceProvider) {
      try {
        const livePrice = await this.livePriceProvider(requestedSymbol);

        details.parsedPrice = livePrice && Number(livePrice.price) > 0 ? roundTo(livePrice.price) : null;
        details.selectedYahooSymbol = requestedSymbol || null;
        details.lastUpdated = livePrice && livePrice.lastUpdated ? toIsoTimestamp(livePrice.lastUpdated) : null;

        return {
          ...details,
          price: details.parsedPrice
        };
      } catch (error) {
        return {
          ...details,
          price: null,
          error: {
            message: error.message,
            code: error.code || null
          }
        };
      }
    }

    if (yahooSymbols.length === 0) {
      return {
        ...details,
        price: null,
        error: {
          message: "Stock symbol is required",
          code: "SYMBOL_REQUIRED"
        }
      };
    }

    for (const yahooSymbol of yahooSymbols) {
      const symbolRequestUrl = buildYahooChartUrl(yahooSymbol);
      const attempt = {
        yahooSymbol,
        requestUrl: symbolRequestUrl,
        responseStatus: null,
        parsedPrice: null,
        error: null
      };

      try {
        const response = await this.httpClient.get(`${YAHOO_CHART_URL}/${encodeURIComponent(yahooSymbol)}`, {
          params: {
            range: "1d",
            interval: "1d"
          },
          headers: {
            "User-Agent": "Mozilla/5.0"
          },
          timeout: this.timeoutMs
        });

        attempt.responseStatus = response.status || null;

        const result =
          response &&
          response.data &&
          response.data.chart &&
          Array.isArray(response.data.chart.result)
            ? response.data.chart.result[0]
            : null;
        const meta = result && result.meta ? result.meta : {};
        const parsedPrice = Number(meta.regularMarketPrice);

        if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
          attempt.parsedPrice = roundTo(parsedPrice);
          details.attempts.push(attempt);
          details.requestUrl = symbolRequestUrl;
          details.responseStatus = attempt.responseStatus;
          details.parsedPrice = attempt.parsedPrice;
          details.selectedYahooSymbol = meta.symbol || yahooSymbol;
          details.lastUpdated = meta.regularMarketTime
            ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
            : new Date().toISOString();

          return {
            ...details,
            price: details.parsedPrice
          };
        }

        attempt.error = {
          message: "Yahoo chart response did not contain a positive regularMarketPrice",
          code: "PRICE_NOT_FOUND"
        };
      } catch (error) {
        attempt.responseStatus = error.response && error.response.status ? error.response.status : null;
        attempt.error = {
          message: error.message,
          code: error.code || null,
          status: error.response && error.response.status ? error.response.status : null
        };
      }

      details.attempts.push(attempt);
    }

    const lastAttempt = details.attempts[details.attempts.length - 1];

    return {
      ...details,
      requestUrl: lastAttempt ? lastAttempt.requestUrl : details.requestUrl,
      responseStatus: lastAttempt ? lastAttempt.responseStatus : details.responseStatus,
      price: null,
      error:
        lastAttempt && lastAttempt.error
          ? lastAttempt.error
          : {
              message: "Live price was not available from Yahoo chart",
              code: "PRICE_NOT_FOUND"
            }
    };
  }

  logResolution(debug) {
    console.log("[MarketDataService]", {
      requestedSymbol: debug.requestedSymbol,
      yahooSymbols: debug.yahooSymbols,
      requestUrl: debug.requestUrl,
      responseStatus: debug.responseStatus,
      parsedPrice: debug.parsedPrice,
      attempts: debug.attempts,
      fallbackReason: debug.fallbackReason,
      finalDataSource: debug.finalSelected.dataSource
    });
  }

  async resolveCurrentPrice(stock, options = {}) {
    const shouldLog = options.debug === true || env.nodeEnv !== "test";
    const liveDetails = await this.fetchLivePriceDetails(stock.symbol);
    const debug = {
      requestedSymbol: liveDetails.requestedSymbol,
      yahooSymbols: liveDetails.yahooSymbols,
      attemptedYahooSymbol: liveDetails.attemptedYahooSymbol,
      selectedYahooSymbol: liveDetails.selectedYahooSymbol,
      requestUrl: liveDetails.requestUrl,
      responseStatus: liveDetails.responseStatus,
      parsedPrice: liveDetails.parsedPrice,
      attempts: liveDetails.attempts,
      fallbackReason: null,
      liveError: liveDetails.error,
      finalSelected: null
    };

    if (liveDetails.price && Number(liveDetails.price) > 0) {
      debug.finalSelected = {
        currentPrice: roundTo(liveDetails.price),
        dataSource: DATA_SOURCES.LIVE,
        lastUpdated: toIsoTimestamp(liveDetails.lastUpdated)
      };
      if (shouldLog) {
        this.logResolution(debug);
      }
      return options.includeDebug ? { ...debug.finalSelected, debug } : debug.finalSelected;
    }

    if (Number(stock.currentPrice) > 0) {
      debug.fallbackReason =
        liveDetails.error && liveDetails.error.message
          ? liveDetails.error.message
          : "Live price was not available";
      debug.finalSelected = {
        currentPrice: roundTo(Number(stock.currentPrice)),
        dataSource: DATA_SOURCES.STORED,
        lastUpdated: toIsoTimestamp(stock.updatedAt || stock.createdAt)
      };
      if (shouldLog) {
        this.logResolution(debug);
      }
      return options.includeDebug ? { ...debug.finalSelected, debug } : debug.finalSelected;
    }

    debug.fallbackReason =
      liveDetails.error && liveDetails.error.message
        ? `${liveDetails.error.message}; stored currentPrice unavailable`
        : "Live price and stored currentPrice were not available";
    debug.finalSelected = {
      currentPrice: getMockPrice(stock),
      dataSource: DATA_SOURCES.MOCK,
      lastUpdated: new Date().toISOString()
    };
    if (shouldLog) {
      this.logResolution(debug);
    }
    return options.includeDebug ? { ...debug.finalSelected, debug } : debug.finalSelected;
  }

  async debugSymbol(symbol) {
    const snapshot = await this.resolveCurrentPrice(
      {
        symbol,
        buyPrice: 1,
        currentPrice: null
      },
      {
        debug: true,
        includeDebug: true
      }
    );

    return {
      requestedSymbol: snapshot.debug.requestedSymbol,
      attemptedYahooSymbol: snapshot.debug.attemptedYahooSymbol,
      selectedYahooSymbol: snapshot.debug.selectedYahooSymbol,
      yahooSymbols: snapshot.debug.yahooSymbols,
      requestUrl: snapshot.debug.requestUrl,
      apiResponseStatus: snapshot.debug.responseStatus,
      attempts: snapshot.debug.attempts,
      fetchedLivePrice: snapshot.debug.parsedPrice,
      fallbackPathUsed: snapshot.debug.fallbackReason
        ? `live -> ${snapshot.dataSource}`
        : "live",
      finalSelectedValue: snapshot.currentPrice,
      finalDataSource: snapshot.dataSource,
      lastUpdated: snapshot.lastUpdated,
      error: snapshot.debug.liveError
    };
  }
}

const defaultMarketDataService = new MarketDataService();

module.exports = {
  DATA_SOURCES,
  MarketDataService,
  buildYahooChartUrl,
  buildYahooSymbols,
  defaultMarketDataService,
  getMockPrice
};
