const CompanyFundamental = require("../models/company-fundamental.model");

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function resolveMarketCapCategory(marketCap) {
  const num = Number(marketCap);
  if (!Number.isFinite(num) || num <= 0) return "unknown";
  if (num > 200000) return "large";
  if (num > 50000) return "mid";
  return "small";
}

function mapParsedToDocument(parsedData, metadata = {}) {
  const identity = parsedData.identity || {};
  const growth = parsedData.growth || {};
  const profitability = parsedData.profitability || {};
  const balanceSheet = parsedData.balanceSheet || {};
  const series = parsedData.series || {};

  const symbol = normalizeSymbol(identity.symbol || metadata.symbol);
  if (!symbol) {
    throw new Error("Symbol is required to save company fundamentals");
  }

  const marketCap = identity.marketCap !== undefined ? identity.marketCap : null;
  const marketCapCategory = metadata.marketCapCategory || resolveMarketCapCategory(marketCap);

  return {
    symbol,
    companyName: identity.companyName || null,
    marketCap,
    currentPrice: identity.currentPrice !== undefined ? identity.currentPrice : null,
    faceValue: identity.faceValue !== undefined ? identity.faceValue : null,
    marketCapCategory,
    isFinancial: metadata.isFinancial === true,
    growth: {
      revenueGrowth1y: growth.revenueGrowth1y !== undefined ? growth.revenueGrowth1y : null,
      revenueGrowth3y: growth.revenueGrowth3y !== undefined ? growth.revenueGrowth3y : null,
      revenueGrowth5y: growth.revenueGrowth5y !== undefined ? growth.revenueGrowth5y : null,
      profitGrowth1y: growth.profitGrowth1y !== undefined ? growth.profitGrowth1y : null,
      profitGrowth3y: growth.profitGrowth3y !== undefined ? growth.profitGrowth3y : null,
      profitGrowth5y: growth.profitGrowth5y !== undefined ? growth.profitGrowth5y : null,
      profitTurnaround: Boolean(growth.profitTurnaround)
    },
    profitability: {
      operatingProfitMargin: profitability.operatingProfitMargin !== undefined ? profitability.operatingProfitMargin : null,
      roce: profitability.roce !== undefined ? profitability.roce : null,
      roe: profitability.roe !== undefined ? profitability.roe : null
    },
    balanceSheet: {
      totalDebt: balanceSheet.totalDebt !== undefined ? balanceSheet.totalDebt : null,
      equityShareCapital: balanceSheet.equityShareCapital !== undefined ? balanceSheet.equityShareCapital : null,
      reserves: balanceSheet.reserves !== undefined ? balanceSheet.reserves : null,
      netWorth: balanceSheet.netWorth !== undefined ? balanceSheet.netWorth : null,
      capitalEmployed: balanceSheet.capitalEmployed !== undefined ? balanceSheet.capitalEmployed : null,
      debtToEquity: balanceSheet.debtToEquity !== undefined ? balanceSheet.debtToEquity : null,
      interestCoverage: balanceSheet.interestCoverage !== undefined ? balanceSheet.interestCoverage : null
    },
    series: {
      sales: Array.isArray(series.sales) ? series.sales : [],
      netProfit: Array.isArray(series.netProfit) ? series.netProfit : [],
      borrowings: Array.isArray(series.borrowings) ? series.borrowings : [],
      reserves: Array.isArray(series.reserves) ? series.reserves : [],
      equityCapital: Array.isArray(series.equityCapital) ? series.equityCapital : [],
      pbt: Array.isArray(series.pbt) ? series.pbt : [],
      interest: Array.isArray(series.interest) ? series.interest : [],
      depreciation: Array.isArray(series.depreciation) ? series.depreciation : [],
      operatingCashFlow: Array.isArray(series.operatingCashFlow) ? series.operatingCashFlow : []
    },
    source: metadata.source || "screener_xlsx",
    sourceFileName: metadata.sourceFileName || null,
    dataAsOf: metadata.dataAsOf || null,
    importedAt: metadata.importedAt || new Date()
  };
}

async function saveCompanyFundamentals(parsedData, metadata = {}) {
  if (!parsedData || typeof parsedData !== "object") {
    throw new Error("Parsed data object is required");
  }

  const doc = mapParsedToDocument(parsedData, metadata);

  const updated = await CompanyFundamental.findOneAndUpdate(
    { symbol: doc.symbol },
    { $set: doc },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return updated;
}

async function getCompanyFundamentals(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return null;
  }

  const record = await CompanyFundamental.findOne({ symbol: normalized }).lean();
  return record || null;
}

module.exports = {
  getCompanyFundamentals,
  mapParsedToDocument,
  normalizeSymbol,
  resolveMarketCapCategory,
  saveCompanyFundamentals
};
