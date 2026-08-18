const XLSX = require("xlsx");
const path = require("path");

function toNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const str = String(val).replace(/,/g, "").trim();
  if (str === "" || str === "-" || str === "N/A" || str === "NaN") return null;
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : null;
}

function roundTo(num, decimals = 2) {
  if (num === null || num === undefined || !Number.isFinite(num)) return null;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function normalizeLabel(val) {
  return String(val || "")
    .toLowerCase()
    .replace(/[^\w\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumericRow(row, allowNegative = false) {
  if (!Array.isArray(row)) return [];
  const values = [];
  for (let i = 1; i < row.length; i++) {
    const num = toNumber(row[i]);
    if (num === null) continue;
    if (allowNegative || num > 0) {
      values.push(num);
    }
  }
  return values;
}

function calculateCAGR(rowOrArray, years = 3, allowNegative = false) {
  const values = Array.isArray(rowOrArray)
    ? (typeof rowOrArray[0] === "string" ? extractNumericRow(rowOrArray, allowNegative) : rowOrArray)
    : [];

  if (values.length < years + 1) return null;

  const latest = values[values.length - 1];
  const past = values[values.length - 1 - years];

  if (past === null || past === undefined || past === 0) return null;
  if (past < 0 && latest > 0) return null;
  if (past < 0 && latest < 0) {
    return roundTo((Math.pow(Math.abs(latest) / Math.abs(past), 1 / years) - 1) * 100);
  }
  if (latest <= 0) return null;
  return roundTo((Math.pow(latest / past, 1 / years) - 1) * 100);
}

function calculate1YGrowth(rowOrArray, allowNegative = false) {
  const values = Array.isArray(rowOrArray)
    ? (typeof rowOrArray[0] === "string" ? extractNumericRow(rowOrArray, allowNegative) : rowOrArray)
    : [];

  if (values.length < 2) return null;
  const latest = values[values.length - 1];
  const prev = values[values.length - 2];
  if (prev === null || prev === undefined || prev === 0) return null;
  return roundTo(((latest - prev) / Math.abs(prev)) * 100);
}

function findDataWorksheet(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error("Invalid workbook: no sheets found");
  }

  const dataSheetName = workbook.SheetNames.find((name) => {
    const norm = normalizeLabel(name);
    return norm.includes("data sheet") || norm === "data";
  });

  const selectedSheetName = dataSheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[selectedSheetName];

  if (!sheet) {
    throw new Error(`Worksheet '${selectedSheetName}' could not be loaded`);
  }

  return { name: selectedSheetName, sheet };
}

class ScreenerFundamentalParser {
  static parse(workbookInput, options = {}) {
    let workbook;
    let inferredSymbol = options.symbol || null;

    if (Buffer.isBuffer(workbookInput)) {
      workbook = XLSX.read(workbookInput, { type: "buffer" });
    } else if (typeof workbookInput === "string") {
      workbook = XLSX.readFile(workbookInput);
      if (!inferredSymbol) {
        const basename = path.basename(workbookInput, path.extname(workbookInput));
        if (basename && basename.length > 0) {
          inferredSymbol = basename.toUpperCase();
        }
      }
    } else if (workbookInput && typeof workbookInput === "object" && workbookInput.Sheets) {
      workbook = workbookInput;
    } else {
      throw new Error("Invalid workbook input: expected file path, Buffer, or XLSX workbook object");
    }

    const { sheet } = findDataWorksheet(workbook);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    const result = {
      identity: {
        symbol: inferredSymbol,
        companyName: null,
        marketCap: null,
        currentPrice: null,
        faceValue: null
      },
      growth: {
        revenueGrowth1y: null,
        revenueGrowth3y: null,
        revenueGrowth5y: null,
        profitGrowth1y: null,
        profitGrowth3y: null,
        profitGrowth5y: null,
        profitTurnaround: false
      },
      profitability: {
        operatingProfitMargin: null,
        roce: null,
        roe: null
      },
      balanceSheet: {
        totalDebt: null,
        equityShareCapital: null,
        reserves: null,
        netWorth: null,
        capitalEmployed: null,
        debtToEquity: null,
        interestCoverage: null
      },
      series: {
        sales: [],
        netProfit: [],
        borrowings: [],
        reserves: [],
        equityCapital: [],
        pbt: [],
        interest: [],
        depreciation: [],
        operatingCashFlow: []
      }
    };

    let currentSection = "meta";
    const rowMap = new Map();

    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;
      const rawLabel = row[0];
      const norm = normalizeLabel(rawLabel);
      if (!norm) continue;

      if (norm === "profit & loss" || norm === "profit and loss") {
        currentSection = "pl";
        continue;
      } else if (norm === "quarters") {
        currentSection = "quarters";
        continue;
      } else if (norm === "balance sheet") {
        currentSection = "bs";
        continue;
      } else if (norm.startsWith("cash flow")) {
        currentSection = "cf";
        continue;
      } else if (norm.startsWith("price")) {
        currentSection = "price";
      }

      const key = `${currentSection}:${norm}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, row);
      }
      if (!rowMap.has(norm)) {
        rowMap.set(norm, row);
      }
    }

    // --- Identity ---
    const companyNameRow = rowMap.get("meta:company name") || rowMap.get("company name");
    if (companyNameRow && companyNameRow[1]) {
      result.identity.companyName = String(companyNameRow[1]).trim();
    }

    const marketCapRow = rowMap.get("meta:market capitalization") || rowMap.get("market capitalization");
    if (marketCapRow) {
      for (let i = 1; i < marketCapRow.length; i++) {
        const v = toNumber(marketCapRow[i]);
        if (v !== null && v > 0) {
          result.identity.marketCap = roundTo(v, 2);
          break;
        }
      }
    }

    const currentPriceRow = rowMap.get("meta:current price") || rowMap.get("current price");
    if (currentPriceRow) {
      for (let i = 1; i < currentPriceRow.length; i++) {
        const v = toNumber(currentPriceRow[i]);
        if (v !== null && v > 0) {
          result.identity.currentPrice = roundTo(v, 2);
          break;
        }
      }
    }

    const faceValueRow = rowMap.get("meta:face value") || rowMap.get("face value");
    if (faceValueRow) {
      for (let i = 1; i < faceValueRow.length; i++) {
        const v = toNumber(faceValueRow[i]);
        if (v !== null && v > 0) {
          result.identity.faceValue = roundTo(v, 2);
          break;
        }
      }
    }

    // --- Growth & P&L Series ---
    const salesRow = rowMap.get("pl:sales") || rowMap.get("sales");
    if (salesRow) {
      result.growth.revenueGrowth1y = calculate1YGrowth(salesRow);
      result.growth.revenueGrowth3y = calculateCAGR(salesRow, 3);
      result.growth.revenueGrowth5y = calculateCAGR(salesRow, 5);
      result.series.sales = extractNumericRow(salesRow);
    }

    const profitRow = rowMap.get("pl:net profit") || rowMap.get("net profit");
    if (profitRow) {
      result.growth.profitGrowth1y = calculate1YGrowth(profitRow, true);
      result.growth.profitGrowth3y = calculateCAGR(profitRow, 3, true);
      result.growth.profitGrowth5y = calculateCAGR(profitRow, 5, true);
      result.series.netProfit = extractNumericRow(profitRow, true);

      const profitVals = result.series.netProfit;
      if (profitVals.length >= 4) {
        const past3 = profitVals[profitVals.length - 4];
        const latest = profitVals[profitVals.length - 1];
        if (past3 < 0 && latest > 0) {
          result.growth.profitTurnaround = true;
        }
      }
    }

    const pbtRow = rowMap.get("pl:profit before tax") || rowMap.get("profit before tax");
    if (pbtRow) result.series.pbt = extractNumericRow(pbtRow, true);

    const interestRow = rowMap.get("pl:interest") || rowMap.get("interest");
    if (interestRow) result.series.interest = extractNumericRow(interestRow, true);

    const depRow = rowMap.get("pl:depreciation") || rowMap.get("depreciation");
    if (depRow) result.series.depreciation = extractNumericRow(depRow, true);

    // --- Balance Sheet Series ---
    const equityCapRow = rowMap.get("bs:equity share capital") || rowMap.get("equity share capital");
    if (equityCapRow) result.series.equityCapital = extractNumericRow(equityCapRow);

    const reservesRow = rowMap.get("bs:reserves") || rowMap.get("reserves");
    if (reservesRow) result.series.reserves = extractNumericRow(reservesRow, true);

    const borrowingsRow = rowMap.get("bs:borrowings") || rowMap.get("borrowings");
    if (borrowingsRow) result.series.borrowings = extractNumericRow(borrowingsRow);

    const cfOperRow = rowMap.get("cf:cash from operating activity") || rowMap.get("cash from operating activity");
    if (cfOperRow) result.series.operatingCashFlow = extractNumericRow(cfOperRow, true);

    // --- Derived Balance Sheet & Capital Efficiency Ratios ---
    const latestSales = result.series.sales.length > 0
      ? result.series.sales[result.series.sales.length - 1]
      : null;
    const latestNetProfit = result.series.netProfit.length > 0
      ? result.series.netProfit[result.series.netProfit.length - 1]
      : null;
    const latestPbt = result.series.pbt.length > 0
      ? result.series.pbt[result.series.pbt.length - 1]
      : null;
    const latestInterest = result.series.interest.length > 0
      ? result.series.interest[result.series.interest.length - 1]
      : 0;
    const latestBorrowings = result.series.borrowings.length > 0
      ? result.series.borrowings[result.series.borrowings.length - 1]
      : null;
    const latestReserves = result.series.reserves.length > 0
      ? result.series.reserves[result.series.reserves.length - 1]
      : null;
    const latestEquityCap = result.series.equityCapital.length > 0
      ? result.series.equityCapital[result.series.equityCapital.length - 1]
      : null;

    if (latestEquityCap !== null && latestReserves !== null) {
      const netWorth = latestEquityCap + latestReserves;
      result.balanceSheet.equityShareCapital = roundTo(latestEquityCap, 2);
      result.balanceSheet.reserves = roundTo(latestReserves, 2);
      result.balanceSheet.netWorth = roundTo(netWorth, 2);

      if (latestNetProfit !== null && netWorth > 0) {
        result.profitability.roe = roundTo((latestNetProfit / netWorth) * 100, 2);
      }

      if (latestBorrowings !== null) {
        result.balanceSheet.totalDebt = roundTo(latestBorrowings, 2);
        if (netWorth > 0) {
          result.balanceSheet.debtToEquity = roundTo(latestBorrowings / netWorth, 2);
        }
        const capitalEmployed = netWorth + latestBorrowings;
        result.balanceSheet.capitalEmployed = roundTo(capitalEmployed, 2);

        if (latestPbt !== null && capitalEmployed > 0) {
          const ebit = latestPbt + (latestInterest || 0);
          result.profitability.roce = roundTo((ebit / capitalEmployed) * 100, 2);
        }
      }
    }

    // Operating Profit Margin (OPM %)
    const otherIncomeRow = rowMap.get("pl:other income") || rowMap.get("other income");
    const latestOtherIncome = otherIncomeRow
      ? toNumber(otherIncomeRow[otherIncomeRow.length - 1]) || 0
      : 0;
    const latestDepreciation = result.series.depreciation.length > 0
      ? result.series.depreciation[result.series.depreciation.length - 1]
      : 0;

    if (latestPbt !== null && latestSales !== null && latestSales > 0) {
      const operatingProfit = latestPbt + (latestInterest || 0) + latestDepreciation - latestOtherIncome;
      result.profitability.operatingProfitMargin = roundTo((operatingProfit / latestSales) * 100, 2);
    }

    // Interest coverage = EBIT / Interest
    if (latestPbt !== null && latestInterest !== null && latestInterest > 0) {
      const ebit = latestPbt + latestInterest;
      result.balanceSheet.interestCoverage = roundTo(ebit / latestInterest, 2);
    }

    return result;
  }
}

module.exports = {
  ScreenerFundamentalParser,
  calculate1YGrowth,
  calculateCAGR,
  extractNumericRow,
  findDataWorksheet,
  normalizeLabel,
  toNumber
};
