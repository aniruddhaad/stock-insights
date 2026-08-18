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

const FIXTURES_DIR = path.join(__dirname, "..", "data", "screener");

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
  assert.equal(data.identity.marketCap, 826733.07);
  assert.equal(data.identity.currentPrice, 2285);
  assert.equal(data.identity.faceValue, 1);

  // Growth
  assert.equal(data.growth.revenueGrowth1y, 4.58);
  assert.equal(data.growth.revenueGrowth3y, 5.8);
  assert.equal(data.growth.revenueGrowth5y, 10.22);
  assert.equal(data.growth.profitGrowth1y, 1.35);
  assert.equal(data.growth.profitGrowth3y, 5.3);
  assert.equal(data.growth.profitGrowth5y, 8.7);
  assert.equal(data.growth.profitTurnaround, false);

  // Profitability & Capital Efficiency
  assert.equal(data.profitability.operatingProfitMargin, 27.11);
  assert.equal(data.profitability.roce, 56.29);
  assert.equal(data.profitability.roe, 45.89);

  // Balance Sheet & Leverage
  assert.equal(data.balanceSheet.totalDebt, 11283);
  assert.equal(data.balanceSheet.equityShareCapital, 362);
  assert.equal(data.balanceSheet.reserves, 106878);
  assert.equal(data.balanceSheet.netWorth, 107240);
  assert.equal(data.balanceSheet.capitalEmployed, 118523);
  assert.equal(data.balanceSheet.debtToEquity, 0.11);
  assert.equal(data.balanceSheet.interestCoverage, 54.37);

  // Series
  assert.ok(data.series.sales.length >= 8);
  assert.ok(data.series.netProfit.length >= 8);
  assert.ok(data.series.operatingCashFlow.length >= 8);
});

test("Screener parser extracts authentic metrics for SBIN.xlsx", () => {
  const sbinPath = path.join(FIXTURES_DIR, "SBIN.xlsx");
  const data = ScreenerFundamentalParser.parse(sbinPath);

  // Identity
  assert.equal(data.identity.symbol, "SBIN");
  assert.equal(data.identity.companyName, "STATE BANK OF INDIA");
  assert.equal(data.identity.marketCap, 974707.14);
  assert.equal(data.identity.currentPrice, 1055.95);
  assert.equal(data.identity.faceValue, 1);

  // Growth
  assert.equal(data.growth.revenueGrowth1y, 5.02);
  assert.equal(data.growth.revenueGrowth3y, 13.64);
  assert.equal(data.growth.revenueGrowth5y, 13.11);
  assert.equal(data.growth.profitGrowth1y, 7.4);
  assert.equal(data.growth.profitGrowth3y, 14.39);
  assert.equal(data.growth.profitGrowth5y, 30.03);

  // Profitability
  assert.equal(data.profitability.roe, 13.97);
  assert.equal(data.profitability.roce, 5.78);

  // Balance sheet
  assert.equal(data.balanceSheet.netWorth, 596130.87);
  assert.equal(data.balanceSheet.totalDebt, 6820399.27);
  assert.equal(data.balanceSheet.debtToEquity, 11.44);
});

test("Screener parser extracts authentic metrics for PIDILITIND.xlsx", () => {
  const pidilitePath = path.join(FIXTURES_DIR, "PIDILITIND.xlsx");
  const buffer = fs.readFileSync(pidilitePath);
  const data = ScreenerFundamentalParser.parse(buffer, { symbol: "PIDILITIND" });

  // Identity
  assert.equal(data.identity.symbol, "PIDILITIND");
  assert.equal(data.identity.companyName, "PIDILITE INDUSTRIES LTD");
  assert.equal(data.identity.marketCap, 169869.21);
  assert.equal(data.identity.currentPrice, 1669);

  // Growth
  assert.equal(data.growth.revenueGrowth1y, 11.11);
  assert.equal(data.growth.revenueGrowth3y, 7.36);
  assert.equal(data.growth.revenueGrowth5y, 14.89);
  assert.equal(data.growth.profitGrowth1y, 17.95);
  assert.equal(data.growth.profitGrowth3y, 24.36);
  assert.equal(data.growth.profitGrowth5y, 16.7);

  // Profitability & Capital Efficiency
  assert.equal(data.profitability.operatingProfitMargin, 24.12);
  assert.equal(data.profitability.roce, 30);
  assert.equal(data.profitability.roe, 22.61);

  // Balance sheet
  assert.equal(data.balanceSheet.totalDebt, 417.21);
  assert.equal(data.balanceSheet.debtToEquity, 0.04);
  assert.equal(data.balanceSheet.interestCoverage, 62.24);
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
