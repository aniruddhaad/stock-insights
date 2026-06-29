const mongoose = require("mongoose");
const Transaction = require("../../models/transaction.model");
const BrokerConnection = require("../../models/broker-connection.model");
const ApiError = require("../../utils/api-error");
const { roundTo } = require("../../utils/math");
const { differenceInDays } = require("../../utils/date");
const { normalizeConfidence } = require("../../utils/holding-period");
const { getBrokerProvider, getCsvProvider } = require("./provider-factory");
const { parseDate } = require("./normalization/transaction-normalizer");

function toUserObjectId(userId) {
  return new mongoose.Types.ObjectId(userId);
}

function summarizePreview(normalizedRows, existingIds = new Set()) {
  return normalizedRows.map((entry) => ({
    ...entry,
    duplicate: entry.valid
      ? existingIds.has(`${entry.transaction.broker}:${entry.transaction.externalTransactionId}`)
      : false
  }));
}

function filterImportableTransactions(normalizedRows, existingIds = new Set()) {
  return normalizedRows
    .filter((entry) => entry.valid && !existingIds.has(`${entry.transaction.broker}:${entry.transaction.externalTransactionId}`))
    .map((entry) => entry.transaction);
}

function parseBrokerNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirst(payload, keys) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      return payload[key];
    }
  }

  return undefined;
}

function normalizeBrokerSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/-EQ$/, "")
    .replace(/\.NS$/, "");
}

function subtractDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - Number(days));
  return result;
}

function parseHoldingDays(value) {
  const parsed = parseBrokerNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function resolveEstimatedHoldingDays(holding, options = {}) {
  return parseHoldingDays(
    pickFirst(holding, [
      "holdingDays",
      "holdingDurationDays",
      "daysHeld",
      "ageDays",
      "holdingAgeDays",
      "noOfDays",
      "days"
    ])
  );
}

function resolveHoldingAcquisitionDate(holding, importTimestamp = new Date(), options = {}) {
  const brokerDate = parseDate(
    pickFirst(holding, [
      "acquisitionDate",
      "acquiredDate",
      "purchaseDate",
      "buyDate",
      "averageBuyDate",
      "avgBuyDate",
      "firstBuyDate",
      "holdingSince",
      "investmentDate"
    ])
  );

  if (brokerDate) {
    return {
      acquisitionDate: brokerDate,
      holdingAgeSource: "broker_provided",
      inferredHoldingDays: differenceInDays(brokerDate, importTimestamp),
      acquisitionDateConfidence: "high"
    };
  }

  const estimatedDays = resolveEstimatedHoldingDays(holding, options);

  if (estimatedDays !== null) {
    const estimatedDate = subtractDays(importTimestamp, estimatedDays);

    return {
      acquisitionDate: estimatedDate,
      holdingAgeSource: "estimated",
      inferredHoldingDays: estimatedDays,
      acquisitionDateConfidence: pickFirst(holding, [
        "holdingDays",
        "holdingDurationDays",
        "daysHeld",
        "ageDays",
        "holdingAgeDays",
        "noOfDays",
        "days"
      ])
        ? "medium"
        : "low"
    };
  }

  return {
    acquisitionDate: null,
    holdingAgeSource: "unknown",
    inferredHoldingDays: null,
    acquisitionDateConfidence: "unknown"
  };
}

function summarizeBootstrapAcquisition(syntheticTransactions) {
  return syntheticTransactions.reduce(
    (summary, transaction) => {
      const source = transaction.holdingAgeSource || "unknown";
      summary.bySource[source] = (summary.bySource[source] || 0) + 1;

      if (!transaction.acquisitionDate) {
        summary.missingAcquisitionDate += 1;
        summary.missingSymbols.push(transaction.symbol);
      }

      return summary;
    },
    {
      bySource: {},
      missingAcquisitionDate: 0,
      missingSymbols: []
    }
  );
}

function buildSyntheticHoldingTransactions({
  broker,
  holdings,
  userId,
  importTimestamp = new Date(),
  estimationStrategy,
  estimatedDays
}) {
  return (Array.isArray(holdings) ? holdings : [])
    .map((holding) => {
      const symbol = normalizeBrokerSymbol(
        pickFirst(holding, ["symbol", "tradingSymbol", "symbolName", "scripName", "instrument", "tradingsymbol"])
      );
      const quantity = parseBrokerNumber(
        pickFirst(holding, [
          "quantity",
          "netQuantity",
          "holdingQuantity",
          "holdingsQuantity",
          "totalQuantity",
          "availableQuantity",
          "qty"
        ])
      );
      const price = parseBrokerNumber(
        pickFirst(holding, ["averagePrice", "avgPrice", "costPrice", "buyPrice", "averageCostPrice", "avgCostPrice"])
      );
      const currentPrice = parseBrokerNumber(
        pickFirst(holding, ["currentPrice", "lastTradedPrice", "ltp", "marketPrice", "closePrice"])
      );

      if (!symbol || !quantity || quantity <= 0 || !price || price <= 0) {
        return null;
      }

      const acquisition = resolveHoldingAcquisitionDate(holding, importTimestamp, {
        estimationStrategy,
        estimatedDays
      });

      return {
        user: toUserObjectId(userId),
        symbol,
        type: "BUY",
        quantity,
        price,
        currentPrice: currentPrice && currentPrice > 0 ? currentPrice : null,
        transactionDate: acquisition.acquisitionDate || importTimestamp,
        acquisitionDate: acquisition.acquisitionDate,
        broker,
        brokerage: 0,
        taxes: 0,
        fees: 0,
        feeBreakdown: {
          stt: 0,
          gst: 0,
          exchangeCharges: 0,
          stampDuty: 0,
          otherFees: 0
        },
        netAmount: roundTo(quantity * price),
        externalTransactionId: `${broker.toUpperCase()}-HOLDING-${symbol}-${quantity}-${price}`,
        source: "BROKER_HOLDING_BOOTSTRAP",
        synthetic: true,
        bootstrapImport: true,
        holdingAgeSource: acquisition.holdingAgeSource,
        inferredHoldingDays: acquisition.inferredHoldingDays,
        acquisitionDateConfidence: normalizeConfidence(acquisition.acquisitionDateConfidence),
        raw: {
          bootstrapImport: true,
          importTimestamp,
          acquisitionDate: acquisition.acquisitionDate,
          holdingAgeSource: acquisition.holdingAgeSource,
          inferredHoldingDays: acquisition.inferredHoldingDays,
          acquisitionDateConfidence: normalizeConfidence(acquisition.acquisitionDateConfidence),
          holding
        }
      };
    })
    .filter(Boolean);
}

function toValidTransactionEntries(transactions) {
  return transactions.map((transaction) => ({
    valid: true,
    errors: [],
    transaction
  }));
}

const brokerCredentialRequirements = {
  samco: {
    required: ["userId", "password", "secretApiKey"],
    optional: ["sessionToken"]
  },
  zerodha: {
    required: ["apiKey", "apiSecret"],
    oneOf: [["requestToken", "sessionToken"]]
  }
};

function hasCredential(credentials, key) {
  return credentials[key] !== undefined && credentials[key] !== null && String(credentials[key]).trim() !== "";
}

function validateBrokerCredentials(broker, credentials) {
  const rules = brokerCredentialRequirements[broker];

  if (!rules) {
    return;
  }

  const missing = (rules.required || []).filter((field) => !hasCredential(credentials, field));

  for (const group of rules.oneOf || []) {
    if (!group.some((field) => hasCredential(credentials, field))) {
      missing.push(group.join(" or "));
    }
  }

  if (missing.length > 0) {
    throw new ApiError(
      400,
      "BROKER_AUTH_FIELDS_REQUIRED",
      `Missing ${broker} authentication fields: ${missing.join(", ")}`,
      missing.map((field) => ({ field, code: "REQUIRED" }))
    );
  }
}

function sanitizeErrorMessage(error, fallbackMessage) {
  const message = error && error.message ? error.message : fallbackMessage;

  return String(message || fallbackMessage).replace(/(token|secret|password|key)(=|:)\s*[^,\s}]+/gi, "$1$2 [redacted]");
}

function sanitizeForDebug(value, depth = 0) {
  if (depth > 4) {
    return "[depth-limit]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, 3).map((entry) => sanitizeForDebug(entry, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      /(token|secret|password|key|authorization|session)/i.test(key) ? "[redacted]" : sanitizeForDebug(entryValue, depth + 1)
    ])
  );
}

function summarizeNormalizedEntry(entry) {
  if (!entry) {
    return entry;
  }

  return sanitizeForDebug({
    valid: entry.valid,
    errors: entry.errors,
    transaction: entry.transaction
      ? {
          symbol: entry.transaction.symbol,
          type: entry.transaction.type,
          quantity: entry.transaction.quantity,
          price: entry.transaction.price,
          transactionDate: entry.transaction.transactionDate,
          broker: entry.transaction.broker,
          externalTransactionId: entry.transaction.externalTransactionId,
          source: entry.transaction.source,
          netAmount: entry.transaction.netAmount
        }
      : null
  });
}

function getAuthFailureStatus(error) {
  const statusCode = error && error.response && error.response.status;
  const message = `${(error && error.code) || ""} ${(error && error.message) || ""}`;

  if (/expired|session/i.test(message)) {
    return "token_expired";
  }

  if (statusCode === 401 || statusCode === 403 || /auth|credential|token|login|password|secret|unauthorized|forbidden/i.test(message)) {
    return "auth_failed";
  }

  return "failed";
}

async function findExistingTransactionIds(userId, transactions) {
  const keys = transactions
    .filter((entry) => entry.valid)
    .map((entry) => ({
      broker: entry.transaction.broker,
      externalTransactionId: entry.transaction.externalTransactionId
    }));

  if (keys.length === 0) {
    return new Set();
  }

  const existing = await Transaction.find({
    user: userId,
    $or: keys
  })
    .select("broker externalTransactionId")
    .lean();

  return new Set(existing.map((transaction) => `${transaction.broker}:${transaction.externalTransactionId}`));
}

function getImportFileExtension(payload = {}) {
  const explicitExtension = String(payload.fileExtension || "").replace(/^\./, "").toLowerCase();

  if (explicitExtension) {
    return explicitExtension;
  }

  const match = String(payload.fileName || "").toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "csv";
}

function isSamcoExcelImport(payload = {}) {
  return String(payload.provider || "").toLowerCase() === "samco" && ["xlsx", "xls"].includes(getImportFileExtension(payload));
}

async function previewCsvImport(userId, payload) {
  const provider = getCsvProvider(payload.provider || "generic");
  const rows = provider.parse(payload.fileContent || payload.csv || payload.csvContent || "", {
    fileEncoding: payload.fileEncoding,
    fileExtension: getImportFileExtension(payload),
    fileName: payload.fileName,
    fileType: payload.fileType
  });
  const normalizedRows = provider.normalize(rows, { userId: toUserObjectId(userId) });
  const existingIds = await findExistingTransactionIds(userId, normalizedRows);

  return {
    provider: payload.provider || "generic",
    totalRows: rows.length,
    validRows: normalizedRows.filter((entry) => entry.valid).length,
    invalidRows: normalizedRows.filter((entry) => !entry.valid).length,
    duplicates: normalizedRows.filter(
      (entry) => entry.valid && existingIds.has(`${entry.transaction.broker}:${entry.transaction.externalTransactionId}`)
    ).length,
    rows: summarizePreview(normalizedRows, existingIds)
  };
}

async function importCsv(userId, payload) {
  const preview = await previewCsvImport(userId, payload);
  const importable = preview.rows.filter((entry) => entry.valid && !entry.duplicate).map((entry) => entry.transaction);

  if (preview.invalidRows > 0 && payload.allowPartial !== true) {
    throw new ApiError(400, "IMPORT_HAS_INVALID_ROWS", "CSV contains malformed rows", preview.rows);
  }

  let removedBootstrapTransactions = 0;

  if (isSamcoExcelImport(payload) && preview.validRows > 0) {
    const deletion = await Transaction.deleteMany({
      user: userId,
      broker: "samco",
      source: "BROKER_HOLDING_BOOTSTRAP",
      synthetic: true,
      bootstrapImport: true
    });
    removedBootstrapTransactions = deletion.deletedCount || 0;
  }

  if (importable.length > 0) {
    await Transaction.insertMany(importable, { ordered: false });
  }

  return {
    ...preview,
    imported: importable.length,
    removedBootstrapTransactions,
    skippedDuplicates: preview.duplicates
  };
}

async function connectBroker(userId, payload) {
  const broker = String(payload.broker || "").toLowerCase();
  const credentials = payload.credentials || {};

  validateBrokerCredentials(broker, credentials);

  const provider = getBrokerProvider(broker, { credentials });

  try {
    await provider.authenticate();
  } catch (error) {
    const failureStatus = getAuthFailureStatus(error);

    await BrokerConnection.findOneAndUpdate(
      { user: userId, broker },
      {
        user: toUserObjectId(userId),
        broker,
        status: failureStatus,
        lastError: sanitizeErrorMessage(error, "Broker authentication failed")
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    throw new ApiError(401, "BROKER_AUTH_FAILED", sanitizeErrorMessage(error, "Broker authentication failed"));
  }

  const connection = await BrokerConnection.findOneAndUpdate(
    { user: userId, broker },
    {
      user: toUserObjectId(userId),
      broker,
      credentials,
      status: "connected",
      lastError: null
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return connection;
}

async function syncBroker(userId, payload) {
  const broker = String(payload.broker || "").toLowerCase();
  const connection = await BrokerConnection.findOne({ user: userId, broker });

  if (!connection) {
    throw new ApiError(404, "BROKER_NOT_CONNECTED", "Connect this broker before syncing");
  }

  const provider = getBrokerProvider(broker, { credentials: connection.credentials || {} });
  const since = payload.fullSync === true ? null : connection.lastSyncCursor || connection.lastSyncedAt;
  const fetchOptions = {
    since,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    syncWindowDays: payload.syncWindowDays,
    financialYear: payload.financialYear,
    segments: payload.segments || payload.segment,
    pageSize: payload.pageSize,
    maxPages: payload.maxPages
  };

  console.log(`[${broker}] broker sync start`, {
    userId: String(userId),
    since: since || null,
    fromDate: fetchOptions.fromDate || null,
    toDate: fetchOptions.toDate || null,
    syncWindowDays: fetchOptions.syncWindowDays || null,
    financialYear: fetchOptions.financialYear || null,
    segments: fetchOptions.segments || null
  });

  connection.status = "syncing";
  await connection.save();

  try {
    const rawTransactions = await provider.fetchTransactions(fetchOptions);
    const holdings = await provider.fetchHoldings();
    const normalizedRows = provider.normalize(rawTransactions, { userId: toUserObjectId(userId) });
    const invalidRows = normalizedRows.filter((entry) => !entry.valid);

    console.log(`[${broker}] broker sync normalized payload preview`, {
      rawTransactionCount: rawTransactions.length,
      holdingsCount: Array.isArray(holdings) ? holdings.length : 0,
      normalizedTransactionCount: normalizedRows.length,
      invalidTransactionCount: invalidRows.length,
      normalizedPreview: normalizedRows.slice(0, 2).map(summarizeNormalizedEntry),
      invalidPreview: invalidRows.slice(0, 2).map(summarizeNormalizedEntry)
    });

    const existingIds = await findExistingTransactionIds(userId, normalizedRows);
    let importable = filterImportableTransactions(normalizedRows, existingIds);
    const skippedDuplicates = normalizedRows.filter(
      (entry) => entry.valid && existingIds.has(`${entry.transaction.broker}:${entry.transaction.externalTransactionId}`)
    ).length;
    let bootstrapHoldingCount = 0;
    let syntheticTransactionCount = 0;
    let skippedBootstrapDuplicates = 0;
    let insertedCount = 0;

    if (rawTransactions.length === 0 && Array.isArray(holdings) && holdings.length > 0) {
      const fallbackReason = "no_historical_trades_retrieved";
      const syntheticTransactions = buildSyntheticHoldingTransactions({
        broker,
        holdings,
        userId,
        importTimestamp: new Date()
      });
      const syntheticRows = toValidTransactionEntries(syntheticTransactions);
      const existingSyntheticIds = await findExistingTransactionIds(userId, syntheticRows);
      const syntheticImportable = filterImportableTransactions(syntheticRows, existingSyntheticIds);

      bootstrapHoldingCount = holdings.length;
      syntheticTransactionCount = syntheticTransactions.length;
      skippedBootstrapDuplicates = syntheticTransactionCount - syntheticImportable.length;
      importable = syntheticImportable;
      const bootstrapAcquisitionSummary = summarizeBootstrapAcquisition(syntheticTransactions);

      console.log(`[${broker}] broker sync holding bootstrap`, {
        fallbackReason,
        bootstrapHoldingsCount: bootstrapHoldingCount,
        syntheticTransactionCount,
        skippedDuplicates: skippedBootstrapDuplicates,
        importableCount: syntheticImportable.length,
        acquisitionDateSources: bootstrapAcquisitionSummary.bySource,
        missingAcquisitionDateCount: bootstrapAcquisitionSummary.missingAcquisitionDate,
        missingAcquisitionDateSymbols: bootstrapAcquisitionSummary.missingSymbols,
        syntheticPreview: syntheticTransactions.slice(0, 2).map(sanitizeForDebug)
      });
    }

    if (rawTransactions.length > 0 && importable.length === 0) {
      console.log(`[${broker}] broker sync skipped holding bootstrap`, {
        reason: "historical_trades_retrieved",
        rawTransactionCount: rawTransactions.length,
        dedupeCount: skippedDuplicates,
        invalidRows: invalidRows.length
      });
    }

    console.log(`[${broker}] broker sync imported transaction preview`, {
      validRows: normalizedRows.filter((entry) => entry.valid).length,
      invalidRows: invalidRows.length,
      dedupeCount: skippedDuplicates,
      bootstrapHoldingsCount: bootstrapHoldingCount,
      syntheticTransactionCount,
      skippedBootstrapDuplicates,
      importableCount: importable.length,
      importablePreview: importable.slice(0, 2).map(sanitizeForDebug)
    });

    if (importable.length > 0) {
      const inserted = await Transaction.insertMany(importable, { ordered: false });
      insertedCount = inserted.length;
    }

    connection.status = "connected";
    connection.lastSyncedAt = new Date();
    connection.lastSyncCursor = connection.lastSyncedAt.toISOString();
    connection.lastError = null;
    await connection.save();

    console.log(`[${broker}] broker sync end`, {
      fetched: rawTransactions.length,
      imported: insertedCount,
      skippedDuplicates,
      bootstrapHoldingsCount: bootstrapHoldingCount,
      syntheticTransactionCount,
      skippedBootstrapDuplicates,
      invalidRows: invalidRows.length,
      finalInsertedCount: insertedCount
    });

    return {
      broker,
      fetched: rawTransactions.length,
      imported: insertedCount,
      invalidRows: invalidRows.length,
      skippedDuplicates,
      bootstrapHoldingsCount: bootstrapHoldingCount,
      syntheticTransactionCount,
      skippedBootstrapDuplicates,
      lastSyncedAt: connection.lastSyncedAt
    };
  } catch (error) {
    const failureStatus = getAuthFailureStatus(error);
    const sanitizedMessage = sanitizeErrorMessage(error, "Broker sync failed");

    console.log(`[${broker}] broker sync failed`, { message: sanitizedMessage });
    connection.status = failureStatus;
    connection.lastError = sanitizedMessage;
    await connection.save();

    if (failureStatus === "token_expired") {
      throw new ApiError(401, "BROKER_TOKEN_EXPIRED", sanitizedMessage);
    }

    if (failureStatus === "auth_failed") {
      throw new ApiError(401, "BROKER_AUTH_FAILED", sanitizedMessage);
    }

    throw new ApiError(error.statusCode || 502, error.code || "BROKER_SYNC_FAILED", sanitizedMessage);
  }
}

async function syncHistoricalTrades(userId, payload = {}) {
  const broker = String(payload.broker || "samco").toLowerCase();

  if (broker !== "samco") {
    throw new ApiError(400, "BROKER_UNSUPPORTED", "Historical trade sync is currently implemented for Samco");
  }

  return syncBroker(userId, {
    ...payload,
    broker,
    fullSync: payload.incremental !== true
  });
}

async function debugBrokerSync(userId, payload) {
  const broker = String(payload.broker || "").toLowerCase();
  const connection = await BrokerConnection.findOne({ user: userId, broker });

  if (!connection) {
    throw new ApiError(404, "BROKER_NOT_CONNECTED", "Connect this broker before debugging sync");
  }

  const provider = getBrokerProvider(broker, { credentials: connection.credentials || {} });
  const since = payload.fullSync === true ? null : connection.lastSyncCursor || connection.lastSyncedAt;

  console.log(`[${broker}] broker debug sync preview start`, { userId: String(userId), since: since || null });

  const fetchOptions = {
    since,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    syncWindowDays: payload.syncWindowDays,
    financialYear: payload.financialYear,
    segments: payload.segments || payload.segment,
    pageSize: payload.pageSize,
    maxPages: payload.maxPages
  };
  const rawTransactions = await provider.fetchTransactions(fetchOptions);
  const holdings = await provider.fetchHoldings();
  const normalizedRows = provider.normalize(rawTransactions, { userId: toUserObjectId(userId) });
  const existingIds = await findExistingTransactionIds(userId, normalizedRows);
  const importable = filterImportableTransactions(normalizedRows, existingIds);
  const invalidRows = normalizedRows.filter((entry) => !entry.valid);
  const skippedDuplicates = normalizedRows.filter(
    (entry) => entry.valid && existingIds.has(`${entry.transaction.broker}:${entry.transaction.externalTransactionId}`)
  );
  const syntheticTransactions =
    rawTransactions.length === 0 && Array.isArray(holdings) && holdings.length > 0
      ? buildSyntheticHoldingTransactions({
          broker,
          holdings,
          userId,
          importTimestamp: new Date()
        })
      : [];
  const syntheticRows = toValidTransactionEntries(syntheticTransactions);
  const existingSyntheticIds = await findExistingTransactionIds(userId, syntheticRows);
  const syntheticImportable = filterImportableTransactions(syntheticRows, existingSyntheticIds);

  const preview = {
    broker,
    since,
    fromDate: fetchOptions.fromDate || null,
    toDate: fetchOptions.toDate || null,
    syncWindowDays: fetchOptions.syncWindowDays || null,
    financialYear: fetchOptions.financialYear || null,
    segments: fetchOptions.segments || null,
    rawTransactionCount: rawTransactions.length,
    holdingsCount: Array.isArray(holdings) ? holdings.length : 0,
    normalizedTransactionCount: normalizedRows.length,
    validTransactionCount: normalizedRows.filter((entry) => entry.valid).length,
    invalidTransactionCount: invalidRows.length,
    dedupeCount: skippedDuplicates.length,
    importableCount: importable.length,
    bootstrapHoldingsCount: Array.isArray(holdings) ? holdings.length : 0,
    syntheticTransactionCount: syntheticTransactions.length,
    skippedBootstrapDuplicates: syntheticTransactions.length - syntheticImportable.length,
    syntheticImportableCount: syntheticImportable.length,
    bootstrapAcquisitionSummary: summarizeBootstrapAcquisition(syntheticTransactions),
    finalInsertedCount: 0,
    rawTransactionPreview: rawTransactions.slice(0, 2).map(sanitizeForDebug),
    normalizedPayloadPreview: normalizedRows.slice(0, 2).map(summarizeNormalizedEntry),
    invalidPreview: invalidRows.slice(0, 2).map(summarizeNormalizedEntry),
    importedTransactionPreview: (importable.length > 0 ? importable : syntheticImportable).slice(0, 2).map(sanitizeForDebug)
  };

  console.log(`[${broker}] broker debug sync preview end`, preview);

  return preview;
}

async function migrateSamcoBootstrapToHistorical(userId, payload) {
  const broker = String(payload.broker || "samco").toLowerCase();

  if (broker !== "samco") {
    throw new ApiError(400, "BROKER_UNSUPPORTED", "Bootstrap historical migration is currently supported for Samco only");
  }

  const connection = await BrokerConnection.findOne({ user: userId, broker });

  if (!connection) {
    throw new ApiError(404, "BROKER_NOT_CONNECTED", "Connect Samco before migrating bootstrap transactions");
  }

  const filter = {
    user: userId,
    broker,
    synthetic: true,
    bootstrapImport: true
  };
  const existingBootstrapCount = await Transaction.countDocuments(filter);

  if (payload.dryRun === true) {
    return {
      broker,
      dryRun: true,
      removedBootstrapTransactions: 0,
      existingBootstrapTransactions: existingBootstrapCount
    };
  }

  const deletion = await Transaction.deleteMany(filter);
  connection.lastSyncCursor = null;
  connection.lastSyncedAt = null;
  await connection.save();

  console.log("[samco] bootstrap migration removed synthetic transactions", {
    userId: String(userId),
    removedBootstrapTransactions: deletion.deletedCount || 0,
    fromDate: payload.fromDate || null,
    toDate: payload.toDate || null,
    syncWindowDays: payload.syncWindowDays || null
  });

  const syncResult = await syncBroker(userId, {
    ...payload,
    broker,
    fullSync: true
  });

  return {
    broker,
    dryRun: false,
    removedBootstrapTransactions: deletion.deletedCount || 0,
    sync: syncResult
  };
}

async function getBrokerStatus(userId) {
  return BrokerConnection.find({ user: userId }).select("-credentials").sort({ broker: 1 }).lean();
}

module.exports = {
  connectBroker,
  buildSyntheticHoldingTransactions,
  debugBrokerSync,
  filterImportableTransactions,
  getBrokerStatus,
  importCsv,
  migrateSamcoBootstrapToHistorical,
  previewCsvImport,
  summarizeBootstrapAcquisition,
  syncHistoricalTrades,
  resolveHoldingAcquisitionDate,
  syncBroker
};
