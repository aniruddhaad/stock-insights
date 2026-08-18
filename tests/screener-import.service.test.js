const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  discoverScreenerXlsxFiles,
  getCompanyMetadata,
  importScreenerXlsxFiles
} = require("../src/services/screener-import.service");

test("discoverScreenerXlsxFiles finds only .xlsx files in stable order", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "screener-import-"));

  try {
    await fs.writeFile(path.join(tempDir, "TCS.xlsx"), "");
    await fs.writeFile(path.join(tempDir, "SBIN.xlsx"), "");
    await fs.writeFile(path.join(tempDir, "ignore.txt"), "");
    await fs.writeFile(path.join(tempDir, "old.xls"), "");

    const files = await discoverScreenerXlsxFiles(tempDir);

    assert.deepEqual(files.map((file) => path.basename(file)), ["SBIN.xlsx", "TCS.xlsx"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("getCompanyMetadata defaults to unknown classification when provider has no data", async () => {
  assert.deepEqual(await getCompanyMetadata("SBIN", async () => null), {
    classification: {
      sector: null,
      industry: null,
      superSector: "unknown"
    }
  });
  assert.deepEqual(await getCompanyMetadata("UnknownBankLikeName", async () => null), {
    classification: {
      sector: null,
      industry: null,
      superSector: "unknown"
    }
  });
});

test("getCompanyMetadata normalizes provider classification", async () => {
  assert.deepEqual(
    await getCompanyMetadata("tcs", async (symbol) => {
      assert.equal(symbol, "TCS");
      return {
        sector: "Technology",
        industry: "IT Services"
      };
    }),
    {
      classification: {
        sector: "Technology",
        industry: "IT Services",
        superSector: "sensitive"
      }
    }
  );
});

test("importScreenerXlsxFiles handles successful imports and source metadata", async () => {
  const calls = [];
  const parser = {
    parse(filePath, options) {
      const symbol = path.basename(filePath, ".xlsx").toUpperCase();
      assert.equal(options.symbol, symbol);
      return {
        identity: { symbol, companyName: `${symbol} LTD` },
        metadata: { dataAsOf: "Mar-24" }
      };
    }
  };

  const summary = await importScreenerXlsxFiles({
    files: ["C:\\fixtures\\SBIN.xlsx", "C:\\fixtures\\TCS.xlsx"],
    parser,
    classificationProvider: async () => null,
    saveCompanyFundamentals: async (parsedData, metadata) => {
      calls.push({ parsedData, metadata });
      return { symbol: parsedData.identity.symbol };
    }
  });

  assert.equal(summary.totalFilesDiscovered, 2);
  assert.equal(summary.successfullyImported, 2);
  assert.equal(summary.failed, 0);
  assert.deepEqual(summary.symbolsImported, ["SBIN", "TCS"]);
  assert.equal(calls[0].metadata.source, "screener_xlsx");
  assert.equal(calls[0].metadata.sourceFileName, "SBIN.xlsx");
  assert.deepEqual(calls[0].metadata.classification, {
    sector: null,
    industry: null,
    superSector: "unknown"
  });
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].metadata, "isFinancial"), false);
  assert.equal(calls[0].metadata.dataAsOf, "Mar-24");
  assert.equal(calls[1].metadata.classification.superSector, "unknown");
});

test("importScreenerXlsxFiles passes provider classification through source metadata", async () => {
  const calls = [];
  const parser = {
    parse(filePath) {
      return { identity: { symbol: path.basename(filePath, ".xlsx").toUpperCase() } };
    }
  };

  const summary = await importScreenerXlsxFiles({
    files: ["C:\\fixtures\\TCS.xlsx"],
    parser,
    classificationProvider: async (symbol) => {
      assert.equal(symbol, "TCS");
      return {
        sector: "Technology",
        industry: "IT Services"
      };
    },
    saveCompanyFundamentals: async (parsedData, metadata) => {
      calls.push({ parsedData, metadata });
      return { symbol: parsedData.identity.symbol };
    }
  });

  assert.equal(summary.successfullyImported, 1);
  assert.deepEqual(calls[0].metadata.classification, {
    sector: "Technology",
    industry: "IT Services",
    superSector: "sensitive"
  });
});

test("importScreenerXlsxFiles continues after one file fails", async () => {
  const savedSymbols = [];
  const parser = {
    parse(filePath) {
      const symbol = path.basename(filePath, ".xlsx").toUpperCase();
      if (symbol === "BAD") {
        throw new Error("Invalid workbook");
      }
      return { identity: { symbol } };
    }
  };

  const summary = await importScreenerXlsxFiles({
    files: ["C:\\fixtures\\BAD.xlsx", "C:\\fixtures\\PIDILITIND.xlsx"],
    parser,
    saveCompanyFundamentals: async (parsedData) => {
      savedSymbols.push(parsedData.identity.symbol);
      return { symbol: parsedData.identity.symbol };
    }
  });

  assert.deepEqual(savedSymbols, ["PIDILITIND"]);
  assert.equal(summary.totalFilesDiscovered, 2);
  assert.equal(summary.successfullyImported, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.symbolsImported, ["PIDILITIND"]);
  assert.deepEqual(summary.failures, [{ fileName: "BAD.xlsx", reason: "Invalid workbook" }]);
});

test("importScreenerXlsxFiles summarizes save failures without stopping", async () => {
  const parser = {
    parse(filePath) {
      return { identity: { symbol: path.basename(filePath, ".xlsx").toUpperCase() } };
    }
  };

  const summary = await importScreenerXlsxFiles({
    files: ["C:\\fixtures\\TCS.xlsx", "C:\\fixtures\\SBIN.xlsx"],
    parser,
    saveCompanyFundamentals: async (parsedData) => {
      if (parsedData.identity.symbol === "TCS") {
        throw new Error("Database write failed");
      }
      return { symbol: parsedData.identity.symbol };
    }
  });

  assert.equal(summary.totalFilesDiscovered, 2);
  assert.equal(summary.successfullyImported, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.symbolsImported, ["SBIN"]);
  assert.deepEqual(summary.failures, [{ fileName: "TCS.xlsx", reason: "Database write failed" }]);
});
