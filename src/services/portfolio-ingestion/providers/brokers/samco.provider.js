const axios = require("axios");
const PortfolioIngestionProvider = require("../../provider.interface");
const { normalizeTransaction } = require("../../normalization/transaction-normalizer");

const DEFAULT_BASE_URL = "https://tradeapi.samco.in";
const DEFAULT_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TRADE_SYNC_WINDOW_DAYS = 3650;
const DEFAULT_TRADE_BOOK_WINDOW_DAYS = 365;
const DEFAULT_TRADE_BOOK_PAGE_SIZE = 100;
const DEFAULT_TRADE_BOOK_MAX_PAGES = 100;
const DEFAULT_TRADE_BOOK_SEGMENTS = ["NSE", "BSE"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/-EQ$/, "")
    .replace(/\.NS$/, "");
}

function parseSamcoDate(dateValue, timeValue) {
  if (!dateValue) {
    return null;
  }

  const rawDate = String(dateValue).trim();
  const compact = rawDate.match(/^(\d{1,2})([A-Z]{3})(\d{4})$/i);

  if (compact) {
    return new Date(`${compact[1]} ${compact[2]} ${compact[3]} ${timeValue || ""}`.trim());
  }

  const parsed = new Date(`${rawDate} ${timeValue || ""}`.trim());
  return Number.isNaN(parsed.getTime()) ? rawDate : parsed;
}

function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function subtractUtcDays(date, days) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function addUtcDays(date, days) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function maxDate(left, right) {
  return left.getTime() > right.getTime() ? left : right;
}

function minDate(left, right) {
  return left.getTime() < right.getTime() ? left : right;
}

function extractArray(payload, keys) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  if (payload.data) {
    return extractArray(payload.data, keys);
  }

  return [];
}

function redactDebugValue(key, value) {
  if (/(token|secret|password|key|authorization|session)/i.test(String(key))) {
    return "[redacted]";
  }

  return value;
}

function sanitizeForDebug(value, depth = 0) {
  if (depth > 4) {
    return "[depth-limit]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 3).map((entry) => sanitizeForDebug(entry, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, sanitizeForDebug(redactDebugValue(key, entryValue), depth + 1)])
  );
}

function describePayloadShape(payload) {
  if (Array.isArray(payload)) {
    return { type: "array", length: payload.length };
  }

  if (!payload || typeof payload !== "object") {
    return { type: typeof payload };
  }

  const data = payload.data && typeof payload.data === "object" ? payload.data : null;

  return {
    type: "object",
    keys: Object.keys(payload),
    dataKeys: data && !Array.isArray(data) ? Object.keys(data) : undefined,
    dataType: Array.isArray(payload.data) ? "array" : typeof payload.data
  };
}

function findArrayPath(payload, keys, prefix = "") {
  if (Array.isArray(payload)) {
    return { path: prefix || "<root>", rows: payload };
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return { path: prefix ? `${prefix}.${key}` : key, rows: payload[key] };
    }
  }

  if (payload.data) {
    return findArrayPath(payload.data, keys, prefix ? `${prefix}.data` : "data");
  }

  return null;
}

function getPaginationMeta(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const source = { ...payload, ...data };

  return {
    page: parseNumber(source.page || source.pageNo || source.pageNumber || source.currentPage),
    pageSize: parseNumber(source.pageSize || source.limit || source.limitRows || source.recordsPerPage),
    totalPages: parseNumber(source.totalPages || source.pages || source.pageCount),
    totalRecords: parseNumber(source.totalRecords || source.totalCount || source.total || source.recordCount),
    hasNextPage:
      typeof source.hasNextPage === "boolean"
        ? source.hasNextPage
        : typeof source.hasNext === "boolean"
          ? source.hasNext
          : undefined,
    nextPage: parseNumber(source.nextPage || source.nextPageNumber)
  };
}

function compactTransactionPreview(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  return sanitizeForDebug({
    symbol: row.symbol,
    type: row.type,
    quantity: row.quantity,
    price: row.price,
    transactionDate: row.transactionDate,
    externalTransactionId: row.externalTransactionId,
    tradeId: row.tradeId,
    orderId: row.orderId,
    exchange: row.exchange,
    samcoSource: row.samcoSource
  });
}

function summarizeTradeDates(rows) {
  const timestamps = rows
    .map((row) => parseSamcoDate(row.tradeDate || row.orderDate || row.orderTime || row.transactionDate, row.tradeTime))
    .map((date) => (date instanceof Date ? date : new Date(date)))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getTime());

  if (timestamps.length === 0) {
    return {
      oldestTradeDate: null,
      newestTradeDate: null
    };
  }

  return {
    oldestTradeDate: new Date(Math.min(...timestamps)).toISOString(),
    newestTradeDate: new Date(Math.max(...timestamps)).toISOString()
  };
}

function summarizeOrderStatuses(rows) {
  return rows.reduce((summary, row) => {
    const status = String(row.orderStatus || row.exchangeOrderStatus || row.status || "unknown")
      .trim()
      .toLowerCase();
    summary[status || "unknown"] = (summary[status || "unknown"] || 0) + 1;
    return summary;
  }, {});
}

function getPayloadMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  return String(payload.statusMessage || payload.message || payload.error || (payload.data && getPayloadMessage(payload.data)) || "");
}

function getEmptyDatasetType(payload) {
  const message = getPayloadMessage(payload);

  if (/no\s+order\s+found/i.test(message)) {
    return "orders";
  }

  if (/no\s+trade\s+found/i.test(message)) {
    return "trades";
  }

  if (/no\s+holding|no\s+holdings|no\s+position|no\s+positions/i.test(message)) {
    return "holdings";
  }

  return null;
}

function isSuccessfulSamcoPayload(payload) {
  return !payload || !payload.status || String(payload.status).toLowerCase() === "success";
}

function isAuthError(error) {
  const status = error.response && error.response.status;
  const payload = error.response && error.response.data;
  const message = `${error.message || ""} ${payload && (payload.statusMessage || payload.message || payload.error || "")}`;

  return status === 401 || status === 403 || /session|token|auth|login/i.test(message);
}

function isRateLimitError(error) {
  return error.response && error.response.status === 429;
}

function sanitizeLogMessage(message) {
  return String(message || "").replace(/(token|secret|password|key)(=|:)\s*[^,\s}]+/gi, "$1$2 [redacted]");
}

class SamcoBrokerProvider extends PortfolioIngestionProvider {
  constructor(options = {}) {
    super();
    this.credentials = options.credentials || {};
    this.providerName = "samco";
    this.baseUrl = this.credentials.apiBaseUrl || DEFAULT_BASE_URL;
    this.accessToken = this.credentials.accessToken || null;
    this.sessionToken = this.credentials.sessionToken || null;
    this.sessionExpiresAt = this.sessionToken ? Date.now() + DEFAULT_SESSION_TTL_MS : 0;
    this.http = options.http || axios.create({ baseURL: this.baseUrl, timeout: this.credentials.timeoutMs || 60000 });
    this.maxRetries = Number.isInteger(this.credentials.maxRetries) ? this.credentials.maxRetries : 2;
    this.endpointPaths = {
      accessToken: this.credentials.accessTokenPath || "/accessToken/token",
      login: this.credentials.loginPath || "/login",
      tradeBook: [this.credentials.tradeBookPath || "/trade/tradeBook", "/tradeBook"],
      orderBook: [this.credentials.orderBookPath || "/order/orderBook", "/orderBook"],
      holdings: [this.credentials.holdingsPath || "/holding/getHolding", "/holding/getHoldings", "/holdings"]
    };
    this.tradeBookPagination = {
      enabled: this.credentials.tradeBookPagination !== false,
      pageSize: parseNumber(this.credentials.tradeBookPageSize) || DEFAULT_TRADE_BOOK_PAGE_SIZE,
      maxPages: parseNumber(this.credentials.tradeBookMaxPages) || DEFAULT_TRADE_BOOK_MAX_PAGES
    };
    this.tradeBookWindowDays =
      parseNumber(this.credentials.tradeBookWindowDays || this.credentials.historicalTradeWindowDays || process.env.SAMCO_TRADE_WINDOW_DAYS) ||
      DEFAULT_TRADE_BOOK_WINDOW_DAYS;
    this.incrementalOverlapDays =
      parseNumber(this.credentials.incrementalOverlapDays || this.credentials.tradeBookIncrementalOverlapDays || process.env.SAMCO_TRADE_INCREMENTAL_OVERLAP_DAYS) ||
      2;
  }

  getCredential(...keys) {
    for (const key of keys) {
      if (this.credentials[key] !== undefined && this.credentials[key] !== null && this.credentials[key] !== "") {
        return this.credentials[key];
      }
    }

    return undefined;
  }

  get userId() {
    return this.getCredential("userId", "uid", "clientId") || process.env.SAMCO_USER;
  }

  get password() {
    return this.getCredential("password") || process.env.SAMCO_PASSWORD;
  }

  get yob() {
    return this.getCredential("yob", "yearOfBirth");
  }

  get secretApiKey() {
    return this.getCredential("secretApiKey", "secretKey", "apiSecret") || process.env.SAMCO_SECRET_KEY;
  }

  log(message, details = undefined) {
    if (details === undefined) {
      console.log(`[samco] ${message}`);
      return;
    }

    console.log(`[samco] ${message}`, details);
  }

  authHeaders() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-session-token": this.sessionToken
    };
  }

  validateCredentials() {
    if (Array.isArray(this.credentials.transactions)) {
      return;
    }

    if (!this.userId || !this.password || !this.secretApiKey) {
      throw new Error("Samco credentials require userId, password, and secretApiKey");
    }
  }

  async generateAccessToken() {
    if (this.accessToken) {
      return this.accessToken;
    }

    const response = await this.http.post(
      this.endpointPaths.accessToken,
      {
        uid: this.userId,
        secretApiKey: this.secretApiKey
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    if (!isSuccessfulSamcoPayload(response.data) || !response.data.accessToken) {
      throw new Error(response.data && response.data.statusMessage ? response.data.statusMessage : "Samco access token request failed");
    }

    this.accessToken = response.data.accessToken;
    return this.accessToken;
  }

  async login() {
    const accessToken = await this.generateAccessToken();
    const body = {
      userId: this.userId,
      password: this.password,
      accessToken
    };

    if (this.yob) {
      body.yob = this.yob;
    }

    const response = await this.http.post(this.endpointPaths.login, body, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });

    if (!isSuccessfulSamcoPayload(response.data) || !response.data.sessionToken) {
      throw new Error(response.data && response.data.statusMessage ? response.data.statusMessage : "Samco login failed");
    }

    this.sessionToken = response.data.sessionToken;
    this.sessionExpiresAt = Date.now() + DEFAULT_SESSION_TTL_MS;
    return this.sessionToken;
  }

  async authenticate() {
    try {
      this.validateCredentials();

      if (Array.isArray(this.credentials.transactions)) {
        this.log("auth success", { mode: "provided-transactions" });
        return { authenticated: true };
      }

      if (!this.sessionToken || Date.now() >= this.sessionExpiresAt) {
        await this.login();
      }

      this.log("auth success", { userId: this.userId });
      return { authenticated: true, sessionToken: this.sessionToken };
    } catch (error) {
      this.log("auth failure", {
        message: sanitizeLogMessage(error.message),
        status: error.response && error.response.status
      });
      throw error;
    }
  }

  async refreshSession() {
    this.sessionToken = null;
    this.sessionExpiresAt = 0;
    await this.login();
  }

  async request(method, path, config = {}, options = {}) {
    await this.authenticate();

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.http.request({
          method,
          url: path,
          ...config,
          headers: {
            ...this.authHeaders(),
            ...(config.headers || {})
          }
        });

        if (!isSuccessfulSamcoPayload(response.data) && !(options.allowEmptyDataset && getEmptyDatasetType(response.data))) {
          throw new Error(response.data && response.data.statusMessage ? response.data.statusMessage : "Samco API request failed");
        }

        return response.data;
      } catch (error) {
        if (isRateLimitError(error) && attempt < this.maxRetries) {
          const retryAfter = Number(error.response.headers && error.response.headers["retry-after"]);
          const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * (attempt + 1);
          this.log("rate limited, retrying", { path, attempt: attempt + 1, delayMs });
          await sleep(delayMs);
          continue;
        }

        if (options.refreshOnAuthError !== false && isAuthError(error) && attempt === 0) {
          this.log("session expired, refreshing", { path });
          await this.refreshSession();
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Samco API request failed after retries: ${path}`);
  }

  async requestFirstAvailable(paths, arrayKeys) {
    let lastError = null;

    for (const path of paths) {
      try {
        const payload = await this.request("get", path, {}, { allowEmptyDataset: true });
        return extractArray(payload, arrayKeys);
      } catch (error) {
        lastError = error;
        if (!error.response || error.response.status !== 404) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Samco endpoint not available");
  }

  async requestFirstAvailableArray(label, paths, arrayKeys, config = {}) {
    let lastError = null;

    for (const path of paths) {
      try {
        const payload = await this.request("get", path, config, { allowEmptyDataset: true });
        const match = findArrayPath(payload, arrayKeys);
        const rows = match ? match.rows : [];
        const emptyDatasetType = getEmptyDatasetType(payload);

        this.log(`${label} raw response`, {
          path,
          params: sanitizeForDebug(config.params || null),
          shape: describePayloadShape(payload),
          expectedArrayKeys: arrayKeys,
          matchedArrayPath: match ? match.path : null,
          emptyDatasetType,
          preview: sanitizeForDebug(payload)
        });

        if (!match && !emptyDatasetType) {
          this.log(`${label} response shape mismatch`, {
            warning: "response shape does not match expectations",
            expectedArrayKeys: arrayKeys,
            shape: describePayloadShape(payload)
          });
        }

        this.log(`${label} extracted array count`, { path, count: rows.length });
        return rows;
      } catch (error) {
        lastError = error;
        if (!error.response || error.response.status !== 404) {
          throw error;
        }

        this.log(`${label} endpoint not found, trying fallback`, { path });
      }
    }

    throw lastError || new Error("Samco endpoint not available");
  }

  resolveTradeBookRange(options = {}) {
    const toDate =
      parseDateOnly(options.toDate) ||
      parseDateOnly(this.credentials.tradeBookToDate || this.credentials.toDate || process.env.SAMCO_TRADE_TO_DATE) ||
      new Date();
    const sinceDate = options.since ? subtractUtcDays(parseDateOnly(options.since) || new Date(options.since), this.incrementalOverlapDays) : null;
    const fromDate =
      parseDateOnly(options.fromDate) ||
      parseDateOnly(this.credentials.tradeBookFromDate || this.credentials.fromDate || process.env.SAMCO_TRADE_FROM_DATE) ||
      sinceDate ||
      subtractUtcDays(
        toDate,
        parseNumber(options.syncWindowDays || this.credentials.tradeBookSyncWindowDays || this.credentials.syncWindowDays || process.env.SAMCO_TRADE_SYNC_WINDOW_DAYS) ||
          DEFAULT_TRADE_SYNC_WINDOW_DAYS
      );

    return {
      fromDate: formatDateOnly(fromDate),
      toDate: formatDateOnly(toDate)
    };
  }

  resolveTradeBookWindows(options = {}) {
    const { fromDate, toDate } = this.resolveTradeBookRange(options);
    const start = parseDateOnly(fromDate);
    const end = parseDateOnly(toDate);
    const windowDays = parseNumber(options.windowDays || this.credentials.tradeBookWindowDays || this.credentials.historicalTradeWindowDays) || this.tradeBookWindowDays;

    if (!start || !end || start.getTime() > end.getTime()) {
      return [];
    }

    const windows = [];
    let windowStart = start;

    while (windowStart.getTime() <= end.getTime()) {
      const windowEnd = minDate(addUtcDays(windowStart, windowDays - 1), end);
      windows.push({
        fromDate: formatDateOnly(windowStart),
        toDate: formatDateOnly(windowEnd)
      });
      windowStart = maxDate(addUtcDays(windowEnd, 1), addUtcDays(windowStart, 1));
    }

    return windows;
  }

  resolveTradeBookSegments(options = {}) {
    const configured =
      options.segments ||
      options.segment ||
      this.credentials.tradeBookSegments ||
      this.credentials.segments ||
      process.env.SAMCO_TRADE_SEGMENTS;

    if (Array.isArray(configured)) {
      return configured.map((segment) => String(segment).trim()).filter(Boolean);
    }

    if (configured) {
      return String(configured)
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean);
    }

    return DEFAULT_TRADE_BOOK_SEGMENTS;
  }

  resolveTradeBookFinancialYear(options = {}) {
    return (
      options.financialYear ||
      this.credentials.tradeBookFinancialYear ||
      this.credentials.financialYear ||
      process.env.SAMCO_TRADE_FINANCIAL_YEAR ||
      undefined
    );
  }

  buildTradeBookParams({ fromDate, toDate, segment, page, pageSize, financialYear }) {
    const format = this.credentials.tradeBookDateFormat || "yyyy-mm-dd";
    const [fromDay, fromMonth, fromYear] = fromDate.split("-").reverse();
    const [toDay, toMonth, toYear] = toDate.split("-").reverse();
    const formattedFrom = format === "dd-mm-yyyy" ? `${fromDay}-${fromMonth}-${fromYear}` : fromDate;
    const formattedTo = format === "dd-mm-yyyy" ? `${toDay}-${toMonth}-${toYear}` : toDate;

    return {
      fromDate: formattedFrom,
      toDate: formattedTo,
      startDate: formattedFrom,
      endDate: formattedTo,
      financialYear,
      finYear: financialYear,
      segment,
      page,
      pageNumber: page,
      pageNo: page,
      pageSize,
      limit: pageSize
    };
  }

  async requestTradeBookPage({ path, fromDate, toDate, segment, page, pageSize, financialYear }) {
    const params = this.buildTradeBookParams({ fromDate, toDate, segment, page, pageSize, financialYear });
    const payload = await this.request("get", path, { params }, { allowEmptyDataset: true });
    const match = findArrayPath(payload, ["tradeBookDetails", "tradeBook", "trades", "tradeDetails", "orderBookDetails"]);
    const rows = match ? match.rows : [];
    const emptyDatasetType = getEmptyDatasetType(payload);

    this.log("trade-book page response", {
      path,
      range: { fromDate, toDate },
      financialYear: financialYear || null,
      segment,
      page,
      pageSize,
      returnedCount: rows.length,
      pagination: getPaginationMeta(payload),
      emptyDatasetType,
      matchedArrayPath: match ? match.path : null
    });

    return { rows, payload };
  }

  async fetchTradeBookRowsForWindow({ path, fromDate, toDate, segments, financialYear, pageSize, maxPages }) {
    const allRows = [];

    for (const segment of segments) {
      for (let page = 1; page <= maxPages; page += 1) {
        this.log("trade-book page request", { path, fromDate, toDate, financialYear: financialYear || null, segment, page, pageSize });
        const { rows, payload } = await this.requestTradeBookPage({ path, fromDate, toDate, segment, page, pageSize, financialYear });
        allRows.push(...rows);

        const pagination = getPaginationMeta(payload);
        const shouldContinue =
          this.tradeBookPagination.enabled &&
          rows.length > 0 &&
          (pagination.hasNextPage === true ||
            (pagination.totalPages ? page < pagination.totalPages : rows.length >= pageSize));

        this.log("trade-book pagination progress", {
          path,
          range: { fromDate, toDate },
          segment,
          page,
          returnedCount: rows.length,
          accumulatedCount: allRows.length,
          shouldContinue,
          totalPages: pagination.totalPages || null
        });

        if (!shouldContinue) {
          break;
        }
      }
    }

    return allRows;
  }

  async fetchTradeBookRows(options = {}) {
    const windows = this.resolveTradeBookWindows(options);
    const fullRange = windows.length > 0 ? { fromDate: windows[0].fromDate, toDate: windows[windows.length - 1].toDate } : this.resolveTradeBookRange(options);
    const segments = this.resolveTradeBookSegments(options);
    const financialYear = this.resolveTradeBookFinancialYear(options);
    const pageSize = parseNumber(options.pageSize || this.credentials.tradeBookPageSize) || this.tradeBookPagination.pageSize;
    const maxPages = parseNumber(options.maxPages || this.credentials.tradeBookMaxPages) || this.tradeBookPagination.maxPages;
    const rowsByKey = new Map();

    this.log("trade-book requested range", {
      fromDate: fullRange.fromDate,
      toDate: fullRange.toDate,
      syncWindowDays: parseNumber(options.syncWindowDays || this.credentials.tradeBookSyncWindowDays || this.credentials.syncWindowDays) || DEFAULT_TRADE_SYNC_WINDOW_DAYS,
      windowDays: parseNumber(options.windowDays || this.credentials.tradeBookWindowDays || this.credentials.historicalTradeWindowDays) || this.tradeBookWindowDays,
      windowCount: windows.length,
      financialYear: financialYear || null,
      segments,
      pageSize,
      paginationEnabled: this.tradeBookPagination.enabled
    });

    let lastError = null;

    for (const path of this.endpointPaths.tradeBook) {
      try {
        for (const window of windows) {
          this.log("trade-book window request", { path, ...window, financialYear: financialYear || null, segments });
          const windowRows = await this.fetchTradeBookRowsForWindow({
            path,
            fromDate: window.fromDate,
            toDate: window.toDate,
            segments,
            financialYear,
            pageSize,
            maxPages
          });

          for (const row of windowRows) {
            const key = [
              row.tradeNumber || row.exchangeOrderNumber || row.exchangeOrderNo || row.orderNumber,
              row.orderNumber,
              row.exchange,
              row.tradingSymbol || row.symbolName,
              row.tradeDate || row.orderTime,
              row.tradeTime || ""
            ]
              .filter(Boolean)
              .join(":");

            rowsByKey.set(key || JSON.stringify(row), row);
          }

          this.log("trade-book window complete", {
            path,
            ...window,
            returnedCount: windowRows.length,
            accumulatedUniqueCount: rowsByKey.size,
            ...summarizeTradeDates(windowRows)
          });
        }

        const allRows = Array.from(rowsByKey.values());
        this.log("trade-book historical fetch complete", {
          path,
          requestedRange: fullRange,
          windows: windows.length,
          returnedCount: allRows.length,
          ...summarizeTradeDates(allRows)
        });
        return allRows;
      } catch (error) {
        lastError = error;
        if (!error.response || error.response.status !== 404) {
          throw error;
        }

        this.log("trade-book endpoint not found, trying fallback", { path });
      }
    }

    throw lastError || new Error("Samco endpoint not available");
  }

  async syncHistoricalTrades(options = {}) {
    return this.fetchTransactions({
      ...options,
      since: options.incremental === true ? options.since : null
    });
  }

  async fetchTransactions(options = {}) {
    if (Array.isArray(this.credentials.transactions)) {
      return this.credentials.transactions;
    }

    this.log("sync fetch transactions start", {
      since: options.since || null,
      fromDate: options.fromDate || this.credentials.fromDate || this.credentials.tradeBookFromDate || null,
      toDate: options.toDate || this.credentials.toDate || this.credentials.tradeBookToDate || null
    });

    const tradeBookRows = await this.fetchTradeBookRows(options);
    if (tradeBookRows.length === 0) {
      this.log("No trades found");
    }

    const orderBookRows = await this.requestFirstAvailableArray("order-book", this.endpointPaths.orderBook, [
      "orderBookDetails",
      "orderBook",
      "orders"
    ]);
    if (orderBookRows.length === 0) {
      this.log("No orders found");
    }

    const rowsByExternalId = new Map();
    const counters = {
      skippedByRowMapping: 0,
      skippedSince: 0,
      duplicateExternalIds: 0
    };

    // Trade Book is Samco's authoritative record of executions. Order Book rows
    // are retained above for status/metadata visibility, but never become
    // portfolio BUY/SELL transactions (including completed orders).
    for (const row of tradeBookRows) {
      const normalized = this.toTransactionRow({ ...row, samcoSource: "tradeBook" });

      if (!normalized) {
        counters.skippedByRowMapping += 1;
        continue;
      }

      const transactionDate = normalized.transactionDate instanceof Date ? normalized.transactionDate : new Date(normalized.transactionDate);

      if (options.since && !Number.isNaN(transactionDate.getTime()) && transactionDate <= new Date(options.since)) {
        counters.skippedSince += 1;
        continue;
      }

      if (rowsByExternalId.has(normalized.externalTransactionId)) {
        counters.duplicateExternalIds += 1;
      }

      rowsByExternalId.set(normalized.externalTransactionId, normalized);
    }

    const rows = Array.from(rowsByExternalId.values());
    this.log("sync fetch transactions end", {
      tradeBookRows: tradeBookRows.length,
      orderBookRows: orderBookRows.length,
      orderBookStatuses: summarizeOrderStatuses(orderBookRows),
      normalizedRows: rows.length,
      ...counters,
      normalizedPreview: rows.slice(0, 2).map(compactTransactionPreview)
    });

    return rows;
  }

  async fetchHoldings() {
    if (Array.isArray(this.credentials.holdings)) {
      return this.credentials.holdings;
    }

    const holdings = await this.requestFirstAvailableArray("holdings", this.endpointPaths.holdings, [
      "holdingDetails",
      "holdings",
      "holding",
      "positions"
    ]);
    if (holdings.length === 0) {
      this.log("No holdings found");
    }

    this.log("holdings fetched", { count: holdings.length });
    return holdings;
  }

  toTransactionRow(row) {
    const source = row.samcoSource || "tradeBook";

    // An execution must exist in Trade Book before it can affect the portfolio.
    // Order Book remains useful to callers for order state and metadata only.
    if (source === "orderBook") {
      return null;
    }

    const filledQuantity = parseNumber(row.filledQuantity);
    const quantity = parseNumber(row.quantity || row.totalQuantity || row.totalQuanity);
    const transactionType = row.transactionType || row.buySell;
    const price = parseNumber(row.tradePrice || row.fillPrice || row.filledPrice || row.averagePrice || row.orderPrice);
    const symbol = normalizeSymbol(row.tradingSymbol || row.symbolName || row.symbol);

    if (!symbol) {
      this.log("samco row warning", {
        warning: "symbol missing",
        source,
        rowPreview: sanitizeForDebug(row)
      });
    }

    if (!transactionType) {
      this.log("samco row warning", {
        warning: "transactionType missing",
        source,
        rowPreview: sanitizeForDebug(row)
      });
    }

    if (!quantity || quantity <= 0) {
      this.log("samco row warning", {
        warning: "quantity missing",
        source,
        rowPreview: sanitizeForDebug(row)
      });
    }

    if (!price || price <= 0) {
      this.log("samco row warning", {
        warning: "price missing",
        source,
        rowPreview: sanitizeForDebug(row)
      });
    }

    if (!price || price <= 0) {
      return null;
    }

    const transactionDate = parseSamcoDate(row.tradeDate || row.orderDate || row.orderTime, row.tradeTime);
    const normalizedType = String(transactionType || "").trim().toUpperCase();

    return {
      symbol,
      type: transactionType,
      quantity: filledQuantity && filledQuantity > 0 ? filledQuantity : quantity,
      price,
      transactionDate,
      acquisitionDate: normalizedType === "BUY" ? transactionDate : null,
      holdingAgeSource: normalizedType === "BUY" ? "broker_provided" : null,
      acquisitionDateConfidence: normalizedType === "BUY" ? "high" : null,
      externalTransactionId: [
        row.tradeNumber || row.exchangeOrderNumber || row.exchangeOrderNo || row.orderNumber,
        row.orderNumber,
        row.exchange,
        row.tradingSymbol || row.symbolName,
        row.tradeDate || row.orderTime,
        row.tradeTime || ""
      ]
        .filter(Boolean)
        .join(":"),
      tradeId: row.tradeNumber,
      orderId: row.orderNumber,
      exchange: row.exchange,
      productCode: row.productCode || row.productType,
      samcoSource: source,
      samcoRaw: row
    };
  }

  normalize(rows, context = {}) {
    return rows.map((row) =>
      normalizeTransaction(row, {
        ...context,
        providerName: this.providerName,
        broker: this.providerName,
        source: "broker"
      })
    );
  }
}

module.exports = SamcoBrokerProvider;
