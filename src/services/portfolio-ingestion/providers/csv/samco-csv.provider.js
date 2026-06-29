const { GenericCsvProvider } = require("./generic-csv.provider");
const { parseDate } = require("../../normalization/transaction-normalizer");
const ApiError = require("../../../../utils/api-error");
const XLSX = require("xlsx");

const COLUMN_ALIASES = {
  transactionDate: ["tradedate", "transactiondate", "date"],
  transactionTime: ["tradetime", "transactiontime", "time"],
  exchange: ["exchange", "exch"],
  symbol: ["symbol", "tradingsymbol", "scrip", "scripname"],
  series: ["series"],
  type: ["buysell", "transactiontype", "type", "bs"],
  quantity: ["quantity", "qty", "tradequantity"],
  price: ["rate", "price", "tradeprice"],
  orderId: ["ordernumber", "orderno", "orderid"],
  tradeId: ["tradenumber", "tradeno", "tradeid"]
};
const REQUIRED_HEADER_FIELDS = ["transactionDate", "symbol", "type", "quantity", "price"];

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildHeaderMap(row) {
  const normalizedCells = row.map(normalizeHeader);

  return Object.fromEntries(
    Object.entries(COLUMN_ALIASES)
      .map(([field, aliases]) => [field, normalizedCells.findIndex((cell) => aliases.includes(cell))])
      .filter(([, index]) => index >= 0)
  );
}

function findSamcoHeader(matrix) {
  let bestMatch = null;

  matrix.forEach((row, rowIndex) => {
    const headerMap = buildHeaderMap(Array.isArray(row) ? row : []);

    if (!REQUIRED_HEADER_FIELDS.every((field) => headerMap[field] !== undefined)) {
      return;
    }

    const score = Object.keys(headerMap).length;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { headerMap, rowIndex, score };
    }
  });

  return bestMatch;
}

function cellText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseTimeParts(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hours: value.getUTCHours(),
      minutes: value.getUTCMinutes(),
      seconds: value.getUTCSeconds()
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalSeconds = Math.round((value % 1) * 24 * 60 * 60);
    return {
      hours: Math.floor(totalSeconds / 3600) % 24,
      minutes: Math.floor(totalSeconds / 60) % 60,
      seconds: totalSeconds % 60
    };
  }

  const match = cellText(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const meridiem = String(match[4] || "").toUpperCase();

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  } else if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  return {
    hours,
    minutes: Number(match[2]),
    seconds: Number(match[3] || 0)
  };
}

function formatTransactionTime(value) {
  const parts = parseTimeParts(value);

  if (!parts || typeof value === "string") {
    return cellText(value);
  }

  return [parts.hours, parts.minutes, parts.seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function combineTradeDateAndTime(dateValue, timeValue) {
  const date = parseDate(dateValue);
  const time = parseTimeParts(timeValue);

  if (!date || !time) {
    return dateValue;
  }

  const combined = new Date(date);
  combined.setHours(time.hours, time.minutes, time.seconds, 0);
  return combined;
}

function parseSamcoWorkbook(content, options = {}) {
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content || ""), options.fileEncoding === "base64" ? "base64" : "binary");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true
    });
    const match = findSamcoHeader(matrix);

    if (!match) {
      continue;
    }

    return matrix
      .slice(match.rowIndex + 1)
      .map((row, index) => {
        const value = (field) => row[match.headerMap[field]];
        const tradeId = cellText(value("tradeId"));
        const orderId = cellText(value("orderId"));
        const transactionTime = value("transactionTime");

        return {
          rowNumber: match.rowIndex + index + 2,
          transactionDate: combineTradeDateAndTime(value("transactionDate"), transactionTime),
          transactionTime: formatTransactionTime(transactionTime),
          exchange: cellText(value("exchange")),
          symbol: cellText(value("symbol")),
          series: cellText(value("series")),
          type: cellText(value("type")),
          quantity: value("quantity"),
          price: value("price"),
          orderId,
          tradeId,
          externalTransactionId: tradeId || orderId
        };
      })
      .filter((row) =>
        [row.transactionDate, row.symbol, row.type, row.quantity, row.price, row.orderId, row.tradeId].some(
          (value) => value !== "" && value !== null && value !== undefined
        )
      );
  }

  throw new ApiError(400, "SAMCO_HEADER_NOT_FOUND", "Unable to locate the Samco trade header in this workbook");
}

class SamcoCsvProvider extends GenericCsvProvider {
  constructor() {
    super({ providerName: "samco", broker: "samco" });
  }

  parse(content, options = {}) {
    if (["xlsx", "xls"].includes(String(options.fileExtension || "").toLowerCase())) {
      return parseSamcoWorkbook(content, options);
    }

    return super.parse(content);
  }
}

module.exports = SamcoCsvProvider;
