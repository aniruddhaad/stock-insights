const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const CompanyFundamental = require("../src/models/company-fundamental.model");
const {
  getCompanyFundamentals,
  mapParsedToDocument,
  normalizeSymbol,
  resolveMarketCapCategory,
  saveCompanyFundamentals
} = require("../src/services/fundamental-data.service");
const { ScreenerFundamentalParser } = require("../src/services/screener-parser.service");

const FIXTURES_DIR = path.join(__dirname, "fixtures", "screener");

test("normalizeSymbol trims and converts to uppercase", () => {
  assert.equal(normalizeSymbol("  tcs  "), "TCS");
  assert.equal(normalizeSymbol("sbin"), "SBIN");
  assert.equal(normalizeSymbol(""), "");
  assert.equal(normalizeSymbol(null), "");
  assert.equal(normalizeSymbol(undefined), "");
});

test("resolveMarketCapCategory categorizes correctly", () => {
  assert.equal(resolveMarketCapCategory(250000), "large");
  assert.equal(resolveMarketCapCategory(100000), "mid");
  assert.equal(resolveMarketCapCategory(25000), "small");
  assert.equal(resolveMarketCapCategory(0), "unknown");
  assert.equal(resolveMarketCapCategory(null), "unknown");
});

test("mapParsedToDocument maps parser output for TCS accurately", () => {
  const tcsPath = path.join(FIXTURES_DIR, "TCS.xlsx");
  const parsed = ScreenerFundamentalParser.parse(tcsPath);
  const doc = mapParsedToDocument(parsed, { sourceFileName: "TCS.xlsx", dataAsOf: "Mar-24" });

  assert.equal(doc.symbol, "TCS");
  assert.equal(doc.companyName, "TATA CONSULTANCY SERVICES LTD");
  assert.equal(doc.marketCap, 926071.97);
  assert.equal(doc.marketCapCategory, "large");
  assert.equal(doc.isFinancial, false);
  assert.equal(doc.growth.revenueGrowth3y, 10.01);
  assert.equal(doc.profitability.roce, 63.49);
  assert.equal(doc.profitability.roe, 51.24);
  assert.equal(doc.balanceSheet.debtToEquity, 0.1);
  assert.equal(doc.sourceFileName, "TCS.xlsx");
  assert.equal(doc.dataAsOf, "Mar-24");
  assert.ok(doc.series.sales.length >= 8);
});

test("mapParsedToDocument validates that symbol is required", () => {
  assert.throws(
    () => mapParsedToDocument({ identity: { symbol: "" } }),
    /Symbol is required/
  );
});

test("saveCompanyFundamentals executes an atomic findOneAndUpdate upsert", async () => {
  const originalFindOneAndUpdate = CompanyFundamental.findOneAndUpdate;
  let queryCaptured = null;
  let updateCaptured = null;
  let optionsCaptured = null;

  CompanyFundamental.findOneAndUpdate = async (query, update, options) => {
    queryCaptured = query;
    updateCaptured = update;
    optionsCaptured = options;
    return { ...update.$set, _id: "64b000000000000000000099" };
  };

  try {
    const tcsPath = path.join(FIXTURES_DIR, "TCS.xlsx");
    const parsed = ScreenerFundamentalParser.parse(tcsPath);
    const result = await saveCompanyFundamentals(parsed, { isFinancial: false });

    assert.deepEqual(queryCaptured, { symbol: "TCS" });
    assert.equal(updateCaptured.$set.symbol, "TCS");
    assert.equal(updateCaptured.$set.marketCapCategory, "large");
    assert.equal(optionsCaptured.upsert, true);
    assert.equal(optionsCaptured.new, true);
    assert.equal(result.symbol, "TCS");
  } finally {
    CompanyFundamental.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("getCompanyFundamentals normalizes symbol and returns document or null", async () => {
  const originalFindOne = CompanyFundamental.findOne;
  let queriedSymbol = null;

  CompanyFundamental.findOne = (query) => {
    queriedSymbol = query.symbol;
    return {
      lean() {
        if (query.symbol === "TCS") {
          return Promise.resolve({ symbol: "TCS", companyName: "TATA CONSULTANCY SERVICES LTD" });
        }
        return Promise.resolve(null);
      }
    };
  };

  try {
    const existing = await getCompanyFundamentals("  tcs ");
    assert.equal(queriedSymbol, "TCS");
    assert.equal(existing.symbol, "TCS");

    const nonExistent = await getCompanyFundamentals("UNKNOWN_SYM");
    assert.equal(queriedSymbol, "UNKNOWN_SYM");
    assert.equal(nonExistent, null);

    const empty = await getCompanyFundamentals("");
    assert.equal(empty, null);
  } finally {
    CompanyFundamental.findOne = originalFindOne;
  }
});

test("CompanyFundamental Mongoose schema validates required symbol and field constraints", () => {
  const doc = new CompanyFundamental({
    symbol: "pidilitind",
    companyName: "PIDILITE INDUSTRIES LTD",
    marketCap: 137859.28,
    marketCapCategory: "mid",
    isFinancial: false
  });

  assert.equal(doc.symbol, "PIDILITIND");
  assert.equal(doc.isFinancial, false);
  assert.equal(doc.source, "screener_xlsx");
  assert.ok(doc.importedAt instanceof Date);

  const invalidDoc = new CompanyFundamental({});
  const error = invalidDoc.validateSync();
  assert.ok(error && error.errors.symbol);
});
