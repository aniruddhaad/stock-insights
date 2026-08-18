const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const {
  ScreenerFundamentalParser,
  calculate1YGrowth,
  calculateCAGR,
  extractNumericRow,
  findDataWorksheet,
  normalizeLabel,
  toNumber
} = require("../src/services/screener-parser.service");

const FIXTURES_DIR = path.join(__dirname, "fixtures", "screener");

test("helper functions handle data normalization and numeric math correctly", () => {
  // toNumber
  assert.equal(toNumber(123.45), 123.45);
  assert.equal(toNumber("1,234.56"), 1234.56);
  assert.equal(toNumber(" - "), null);
  assert.equal(toNumber("N/A"), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(undefined), null);

  // normalizeLabel
  assert.equal(normalizeLabel("  Profit & Loss  "), "profit & loss");
  assert.equal(normalizeLabel("Return on Capital Emp."), "return on capital emp");
  assert.equal(normalizeLabel("Market Capitalization\n"), "market capitalization");

  // extractNumericRow
  const mockRow = ["Sales", 100, "200", "invalid", 400];
  assert.deepEqual(extractNumericRow(mockRow), [100, 200, 400]);

  // calculate1YGrowth
  assert.equal(calculate1YGrowth(["Sales", 100, 120]), 20);
  assert.equal(calculate1YGrowth(["Sales", 100, 80]), -20);
  assert.equal(calculate1YGrowth(["Sales", 100]), null);

  // calculateCAGR
  // 100 -> 121 in 2 years = 10%
  assert.equal(calculateCAGR(["Sales", 100, 110, 121], 2), 10);
  // Turnaround (-50 to +100) cannot compute standard CAGR -> returns null
  assert.equal(calculateCAGR(["Profit", -50, 10, 100], 2, true), null);
});

test("Screener parser extracts authentic metrics for TCS.xlsx", () => {
  const tcsPath = path.join(FIXTURES_DIR, "TCS.xlsx");
  const data = ScreenerFundamentalParser.parse(tcsPath);

  // Identity
  assert.equal(data.identity.symbol, "TCS");
  assert.equal(data.identity.companyName, "TATA CONSULTANCY SERVICES LTD");
  assert.equal(data.identity.marketCap, 926071.97);
  assert.equal(data.identity.currentPrice, 2559.2);
  assert.equal(data.identity.faceValue, 1);

  // Growth
  assert.equal(data.growth.revenueGrowth1y, 5.99);
  assert.equal(data.growth.revenueGrowth3y, 10.01);
  assert.equal(data.growth.revenueGrowth5y, 10.22);
  assert.equal(data.growth.profitGrowth1y, 5.76);
  assert.equal(data.growth.profitGrowth3y, 8.2);
  assert.equal(data.growth.profitGrowth5y, 8.47);
  assert.equal(data.growth.profitTurnaround, false);

  // Profitability & Capital Efficiency
  assert.equal(data.profitability.operatingProfitMargin, 26.4);
  assert.equal(data.profitability.roce, 63.49);
  assert.equal(data.profitability.roe, 51.24);

  // Balance Sheet & Leverage
  assert.equal(data.balanceSheet.totalDebt, 9392);
  assert.equal(data.balanceSheet.equityShareCapital, 362);
  assert.equal(data.balanceSheet.reserves, 94394);
  assert.equal(data.balanceSheet.netWorth, 94756);
  assert.equal(data.balanceSheet.capitalEmployed, 104148);
  assert.equal(data.balanceSheet.debtToEquity, 0.1);
  assert.equal(data.balanceSheet.interestCoverage, 83.07);

  // Series
  assert.ok(data.series.sales.length >= 8);
  assert.ok(data.series.netProfit.length >= 8);
  assert.ok(data.series.operatingCashFlow.length >= 8);
});

test("Screener parser extracts authentic metrics for SBIN.xlsx (Banking sector)", () => {
  const sbinPath = path.join(FIXTURES_DIR, "SBIN.xlsx");
  const data = ScreenerFundamentalParser.parse(sbinPath);

  // Identity
  assert.equal(data.identity.symbol, "SBIN");
  assert.equal(data.identity.companyName, "STATE BANK OF INDIA");
  assert.equal(data.identity.marketCap, 979878.78);
  assert.equal(data.identity.currentPrice, 1061.45);
  assert.equal(data.identity.faceValue, 1);

  // Growth
  assert.equal(data.growth.revenueGrowth1y, 11.78);
  assert.equal(data.growth.revenueGrowth3y, 19.19);
  assert.equal(data.growth.revenueGrowth5y, 12.71);
  assert.equal(data.growth.profitGrowth1y, 15.62);
  assert.equal(data.growth.profitGrowth3y, 29.91);
  assert.equal(data.growth.profitGrowth5y, 31.44);

  // Profitability
  assert.equal(data.profitability.roe, 15.93);
  assert.equal(data.profitability.roce, 6.23);

  // Balance sheet
  assert.equal(data.balanceSheet.netWorth, 487036.76);
  assert.equal(data.balanceSheet.totalDebt, 6050755.27);
  assert.equal(data.balanceSheet.debtToEquity, 12.42);
});

test("Screener parser extracts authentic metrics for PIDILITIND.xlsx (Manufacturing / Chemicals)", () => {
  const pidilitePath = path.join(FIXTURES_DIR, "PIDILITIND.xlsx");
  const buffer = fs.readFileSync(pidilitePath);
  const data = ScreenerFundamentalParser.parse(buffer, { symbol: "PIDILITIND" });

  // Identity
  assert.equal(data.identity.symbol, "PIDILITIND");
  assert.equal(data.identity.companyName, "PIDILITE INDUSTRIES LTD");
  assert.equal(data.identity.marketCap, 137859.28);
  assert.equal(data.identity.currentPrice, 1355);

  // Growth
  assert.equal(data.growth.revenueGrowth1y, 6.12);
  assert.equal(data.growth.revenueGrowth3y, 9.82);
  assert.equal(data.growth.revenueGrowth5y, 12.49);
  assert.equal(data.growth.profitGrowth1y, 20.06);
  assert.equal(data.growth.profitGrowth3y, 19.8);
  assert.equal(data.growth.profitGrowth5y, 13.21);

  // Profitability & Capital Efficiency
  assert.equal(data.profitability.operatingProfitMargin, 22.91);
  assert.equal(data.profitability.roce, 28.14);
  assert.equal(data.profitability.roe, 21.29);

  // Balance sheet
  assert.equal(data.balanceSheet.totalDebt, 454.14);
  assert.equal(data.balanceSheet.debtToEquity, 0.05);
  assert.equal(data.balanceSheet.interestCoverage, 57.06);
});

test("Screener parser returns nulls and empty series for incomplete / dummy inputs without crashing", () => {
  const XLSX = require("xlsx");
  const emptyBook = XLSX.utils.book_new();
  const emptySheet = XLSX.utils.aoa_to_sheet([["Data Sheet"], ["Some Unknown Row", "abc"]]);
  XLSX.utils.book_append_sheet(emptyBook, emptySheet, "Data Sheet");

  const parsed = ScreenerFundamentalParser.parse(emptyBook);
  assert.equal(parsed.identity.companyName, null);
  assert.equal(parsed.identity.marketCap, null);
  assert.equal(parsed.growth.revenueGrowth3y, null);
  assert.equal(parsed.growth.profitGrowth3y, null);
  assert.equal(parsed.profitability.roce, null);
  assert.equal(parsed.balanceSheet.debtToEquity, null);
  assert.deepEqual(parsed.series.sales, []);
});
