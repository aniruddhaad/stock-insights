const crypto = require("crypto");
const { roundTo } = require("../../../utils/math");

const DEFAULT_FEE_RULES = {
  brokerageRate: 0.0003,
  brokerageMax: 20,
  sttBuyRate: 0.001,
  sttSellRate: 0.001,
  gstRate: 0.18,
  exchangeChargeRate: 0.0000325,
  stampDutyBuyRate: 0.00015
};

const PROVIDER_FEE_RULES = {
  generic: DEFAULT_FEE_RULES,
  samco: {
    ...DEFAULT_FEE_RULES,
    brokerageRate: 0.0002,
    brokerageMax: 20
  },
  zerodha: {
    ...DEFAULT_FEE_RULES,
    brokerageRate: 0,
    brokerageMax: 0
  }
};

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\.NS$/, "");
}

function normalizeType(value) {
  const normalized = String(value || "").trim().toUpperCase();

  if (["BUY", "B", "PURCHASE"].includes(normalized)) {
    return "BUY";
  }

  if (["SELL", "S", "SALE"].includes(normalized)) {
    return "SELL";
  }

  return null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const raw = String(value).trim();
  const ddmmyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (ddmmyyyy) {
    const year = ddmmyyyy[3].length === 2 ? `20${ddmmyyyy[3]}` : ddmmyyyy[3];
    const parsed = new Date(Number(year), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickFirst(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return undefined;
}

function stableExternalId(row, fallbackParts) {
  const sourceId = pickFirst(row, [
    "externalTransactionId",
    "external_transaction_id",
    "tradeId",
    "trade_id",
    "orderId",
    "order_id",
    "contractNote",
    "contract_note"
  ]);

  if (sourceId) {
    return String(sourceId).trim();
  }

  return crypto.createHash("sha1").update(fallbackParts.join("|")).digest("hex");
}

function calculateFees(transaction, providerName, overrides = {}) {
  const rules = {
    ...(PROVIDER_FEE_RULES[providerName] || DEFAULT_FEE_RULES),
    ...(overrides.rules || {})
  };
  const grossAmount = transaction.quantity * transaction.price;
  const brokerage =
    overrides.brokerage !== undefined
      ? Number(overrides.brokerage)
      : Math.min(grossAmount * rules.brokerageRate, rules.brokerageMax);
  const stt =
    overrides.stt !== undefined
      ? Number(overrides.stt)
      : grossAmount * (transaction.type === "BUY" ? rules.sttBuyRate : rules.sttSellRate);
  const exchangeCharges =
    overrides.exchangeCharges !== undefined
      ? Number(overrides.exchangeCharges)
      : grossAmount * rules.exchangeChargeRate;
  const gst =
    overrides.gst !== undefined
      ? Number(overrides.gst)
      : (brokerage + exchangeCharges) * rules.gstRate;
  const stampDuty =
    overrides.stampDuty !== undefined
      ? Number(overrides.stampDuty)
      : transaction.type === "BUY"
        ? grossAmount * rules.stampDutyBuyRate
        : 0;
  const otherFees = overrides.otherFees !== undefined ? Number(overrides.otherFees) : 0;
  const taxes = roundTo(stt + gst + stampDuty);
  const fees = roundTo(exchangeCharges + otherFees);
  const roundedBrokerage = roundTo(brokerage);
  const totalCharges = roundedBrokerage + taxes + fees;

  return {
    brokerage: roundedBrokerage,
    taxes,
    fees,
    feeBreakdown: {
      stt: roundTo(stt),
      gst: roundTo(gst),
      exchangeCharges: roundTo(exchangeCharges),
      stampDuty: roundTo(stampDuty),
      otherFees: roundTo(otherFees)
    },
    netAmount: roundTo(transaction.type === "BUY" ? grossAmount + totalCharges : grossAmount - totalCharges)
  };
}

function validateNormalizedTransaction(transaction) {
  const errors = [];

  if (!transaction.symbol || !/^[A-Z0-9.\-]{1,20}$/.test(transaction.symbol)) {
    errors.push({ field: "symbol", code: "SYMBOL_INVALID" });
  }

  if (!["BUY", "SELL"].includes(transaction.type)) {
    errors.push({ field: "type", code: "TYPE_INVALID" });
  }

  if (!Number.isFinite(transaction.quantity) || transaction.quantity <= 0) {
    errors.push({ field: "quantity", code: "QUANTITY_INVALID" });
  }

  if (!Number.isFinite(transaction.price) || transaction.price <= 0) {
    errors.push({ field: "price", code: "PRICE_INVALID" });
  }

  if (!transaction.transactionDate || Number.isNaN(new Date(transaction.transactionDate).getTime())) {
    errors.push({ field: "transactionDate", code: "TRANSACTION_DATE_INVALID" });
  }

  return errors;
}

function normalizeTransaction(row, context = {}) {
  const providerName = context.providerName || "generic";
  const symbol = normalizeSymbol(pickFirst(row, ["symbol", "Symbol", "tradingsymbol", "Trading Symbol", "scripName", "Scrip Name"]));
  const type = normalizeType(pickFirst(row, ["type", "Type", "transactionType", "Transaction Type", "buySell", "Buy/Sell"]));
  const quantity = parseNumber(pickFirst(row, ["quantity", "Quantity", "qty", "Qty"]));
  const price = parseNumber(pickFirst(row, ["price", "Price", "tradePrice", "Trade Price", "rate", "Rate"]));
  const transactionDate = parseDate(pickFirst(row, ["transactionDate", "Transaction Date", "tradeDate", "Trade Date", "date", "Date"]));
  const acquisitionDate = parseDate(pickFirst(row, ["acquisitionDate", "Acquisition Date"])) || (type === "BUY" ? transactionDate : null);
  const broker = String(context.broker || providerName || "generic").toLowerCase();
  const externalTransactionId = stableExternalId(row, [
    broker,
    symbol,
    type,
    quantity,
    price,
    transactionDate ? transactionDate.toISOString() : ""
  ]);

  const base = {
    user: context.userId,
    symbol,
    type,
    quantity,
    price,
    transactionDate,
    acquisitionDate,
    broker,
    externalTransactionId,
    source: context.source || "csv",
    holdingAgeSource: pickFirst(row, ["holdingAgeSource"]) || (type === "BUY" && acquisitionDate ? "broker_provided" : null),
    acquisitionDateConfidence: pickFirst(row, ["acquisitionDateConfidence"]) || (type === "BUY" && acquisitionDate ? "high" : null),
    raw: row
  };
  const overrideValues = {
    brokerage: parseNumber(pickFirst(row, ["brokerage", "Brokerage"])),
    stt: parseNumber(pickFirst(row, ["stt", "STT"])),
    gst: parseNumber(pickFirst(row, ["gst", "GST"])),
    exchangeCharges: parseNumber(pickFirst(row, ["exchangeCharges", "Exchange Charges"])),
    stampDuty: parseNumber(pickFirst(row, ["stampDuty", "Stamp Duty"])),
    otherFees: parseNumber(pickFirst(row, ["otherFees", "Other Fees"])),
    rules: context.feeRules
  };
  const feeOverrides = Object.fromEntries(
    Object.entries(overrideValues).filter(([, value]) => value !== null && value !== undefined)
  );
  const transaction = {
    ...base,
    ...calculateFees(base, providerName, feeOverrides)
  };
  const errors = validateNormalizedTransaction(transaction);

  return {
    transaction,
    errors,
    valid: errors.length === 0
  };
}

module.exports = {
  calculateFees,
  normalizeSymbol,
  normalizeTransaction,
  parseDate,
  parseNumber,
  validateNormalizedTransaction
};
