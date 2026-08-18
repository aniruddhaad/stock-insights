const fs = require("fs/promises");
const path = require("path");
const { ScreenerFundamentalParser } = require("./screener-parser.service");
const { getCompanyClassification, normalizeClassification } = require("./company-classification.service");
const { saveCompanyFundamentals } = require("./fundamental-data.service");

const DEFAULT_SCREENER_DIR = path.join(__dirname, "..", "..", "data", "screener");

function normalizeSymbolFromFilename(fileName) {
  return path.basename(fileName, path.extname(fileName)).trim().toUpperCase();
}

async function getCompanyMetadata(symbol, classificationProvider = getCompanyClassification) {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const classification = classificationProvider
    ? await classificationProvider(normalizedSymbol)
    : null;

  return {
    classification: normalizeClassification(classification)
  };
}

function resolveDataAsOf(parsedData) {
  if (!parsedData || typeof parsedData !== "object") {
    return null;
  }

  if (parsedData.dataAsOf) {
    return parsedData.dataAsOf;
  }

  if (parsedData.metadata && parsedData.metadata.dataAsOf) {
    return parsedData.metadata.dataAsOf;
  }

  return null;
}

async function discoverScreenerXlsxFiles(directoryPath = DEFAULT_SCREENER_DIR) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".xlsx")
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function createEmptySummary(totalFiles) {
  return {
    totalFilesDiscovered: totalFiles,
    successfullyImported: 0,
    failed: 0,
    symbolsImported: [],
    failures: []
  };
}

async function importScreenerXlsxFiles(options = {}) {
  const directoryPath = options.directoryPath || DEFAULT_SCREENER_DIR;
  const parser = options.parser || ScreenerFundamentalParser;
  const save = options.saveCompanyFundamentals || saveCompanyFundamentals;
  const classificationProvider = options.classificationProvider || getCompanyClassification;
  const files = options.files || await discoverScreenerXlsxFiles(directoryPath);
  const summary = createEmptySummary(files.length);

  for (const filePath of files) {
    const sourceFileName = path.basename(filePath);
    const symbolFromFilename = normalizeSymbolFromFilename(sourceFileName);

    try {
      const parsedData = parser.parse(filePath, { symbol: symbolFromFilename });
      const symbol = parsedData.identity?.symbol || symbolFromFilename;
      const metadata = {
        ...await getCompanyMetadata(symbol, classificationProvider),
        source: "screener_xlsx",
        sourceFileName,
        dataAsOf: resolveDataAsOf(parsedData)
      };

      const saved = await save(parsedData, metadata);
      const savedSymbol = saved?.symbol || symbol;

      summary.successfullyImported += 1;
      summary.symbolsImported.push(savedSymbol);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        fileName: sourceFileName,
        reason: error && error.message ? error.message : String(error)
      });
    }
  }

  return summary;
}

module.exports = {
  DEFAULT_SCREENER_DIR,
  discoverScreenerXlsxFiles,
  getCompanyMetadata,
  importScreenerXlsxFiles,
  normalizeSymbolFromFilename,
  resolveDataAsOf
};
