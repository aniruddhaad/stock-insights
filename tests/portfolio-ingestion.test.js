const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { parseCsv } = require("../src/services/portfolio-ingestion/providers/csv/generic-csv.provider");
const SamcoCsvProvider = require("../src/services/portfolio-ingestion/providers/csv/samco-csv.provider");
const SamcoBrokerProvider = require("../src/services/portfolio-ingestion/providers/brokers/samco.provider");
const ZerodhaBrokerProvider = require("../src/services/portfolio-ingestion/providers/brokers/zerodha.provider");
const Transaction = require("../src/models/transaction.model");
const BrokerConnection = require("../src/models/broker-connection.model");
const {
  calculateFees,
  normalizeTransaction
} = require("../src/services/portfolio-ingestion/normalization/transaction-normalizer");
const { deriveHoldingsFromTransactions } = require("../src/services/portfolio-ingestion/normalization/holdings-deriver");
const { buildPortfolioSummary } = require("../src/services/portfolio.service");
const {
  buildSyntheticHoldingTransactions,
  connectBroker,
  filterImportableTransactions,
  importCsv,
  resolveHoldingAcquisitionDate,
  summarizeBootstrapAcquisition,
  syncBroker
} = require("../src/services/portfolio-ingestion/ingestion.service");

function createSamcoWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Trade Book");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function withBrokerSyncStubs({ holdings, transactions = [], existingExternalIds = new Set() }, run) {
  const originals = {
    brokerConnectionFindOne: BrokerConnection.findOne,
    transactionFind: Transaction.find,
    transactionInsertMany: Transaction.insertMany,
    consoleLog: console.log
  };
  const inserted = [];
  const connection = {
    credentials: {
      transactions,
      holdings
    },
    lastSyncCursor: null,
    lastSyncedAt: null,
    status: "connected",
    lastError: null,
    save: async () => connection
  };

  BrokerConnection.findOne = async () => connection;
  Transaction.find = (query) => ({
    select() {
      return {
        lean: async () =>
          (query.$or || [])
            .filter((entry) => existingExternalIds.has(`${entry.broker}:${entry.externalTransactionId}`))
            .map((entry) => ({
              broker: entry.broker,
              externalTransactionId: entry.externalTransactionId
            }))
      };
    }
  });
  Transaction.insertMany = async (transactions) => {
    inserted.push(...transactions);
    transactions.forEach((transaction) => {
      existingExternalIds.add(`${transaction.broker}:${transaction.externalTransactionId}`);
    });
    return transactions;
  };
  console.log = () => {};

  try {
    await run({ inserted, existingExternalIds });
  } finally {
    BrokerConnection.findOne = originals.brokerConnectionFindOne;
    Transaction.find = originals.transactionFind;
    Transaction.insertMany = originals.transactionInsertMany;
    console.log = originals.consoleLog;
  }
}

test("CSV parser handles quoted fields and normalizes rows", () => {
  const rows = parseCsv('symbol,type,quantity,price,date\n"TCS, EQ",BUY,10,3500,2026-01-10');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "TCS, EQ");
  assert.equal(rows[0].type, "BUY");
  assert.equal(rows[0].rowNumber, 2);
});

test("Samco Excel parser finds a dynamic header and maps canonical transaction fields", () => {
  const workbook = createSamcoWorkbook([
    ["SAMCO Securities"],
    ["Client", "U123"],
    [],
    [
      "Trade Date",
      "Trade Time",
      "Exchange",
      "Symbol",
      "Series",
      "Buy/Sell",
      "Quantity",
      "Rate",
      "Order Number",
      "Trade Number"
    ],
    ["17/06/2020", "10:15:30 AM", "NSE", "INFY", "EQ", "BUY", 3, 1500, "ORDER-1", "TRADE-1"],
    ["18/06/2020", "02:45:00 PM", "BSE", "TCS", "EQ", "SELL", 2, 2010, "ORDER-2", ""]
  ]);
  const provider = new SamcoCsvProvider();
  const rows = provider.parse(workbook.toString("base64"), {
    fileEncoding: "base64",
    fileExtension: "xlsx"
  });
  const normalized = provider.normalize(rows, { userId: "64b000000000000000000000" });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowNumber, 5);
  assert.equal(rows[0].transactionTime, "10:15:30 AM");
  assert.equal(rows[0].exchange, "NSE");
  assert.equal(rows[0].series, "EQ");
  assert.equal(rows[0].tradeId, "TRADE-1");
  assert.equal(rows[0].orderId, "ORDER-1");
  assert.equal(normalized[0].valid, true);
  assert.equal(normalized[0].transaction.externalTransactionId, "TRADE-1");
  assert.equal(normalized[0].transaction.transactionDate.getHours(), 10);
  assert.equal(normalized[1].transaction.externalTransactionId, "ORDER-2");
  assert.equal(normalized[1].transaction.transactionDate.getHours(), 14);
});

test("Samco Excel commit removes only the exact bootstrap signature before inserting", async () => {
  const workbook = createSamcoWorkbook([
    ["metadata"],
    ["Trade Date", "Trade Time", "Exchange", "Symbol", "Buy/Sell", "Quantity", "Rate", "Order Number", "Trade Number"],
    ["17/06/2020", "10:15:30 AM", "NSE", "INFY", "BUY", 3, 1500, "ORDER-1", "TRADE-1"]
  ]);
  const originals = {
    find: Transaction.find,
    deleteMany: Transaction.deleteMany,
    insertMany: Transaction.insertMany
  };
  let deletionFilter = null;
  let inserted = [];

  Transaction.find = () => ({
    select() {
      return { lean: async () => [] };
    }
  });
  Transaction.deleteMany = async (filter) => {
    deletionFilter = filter;
    return { deletedCount: 2 };
  };
  Transaction.insertMany = async (transactions) => {
    inserted = transactions;
    return transactions;
  };

  try {
    const result = await importCsv("64b000000000000000000000", {
      provider: "samco",
      fileContent: workbook.toString("base64"),
      fileEncoding: "base64",
      fileExtension: "xlsx",
      fileName: "samco-history.xlsx",
      allowPartial: true
    });

    assert.equal(result.imported, 1);
    assert.equal(result.removedBootstrapTransactions, 2);
    assert.equal(inserted.length, 1);
    assert.deepEqual(deletionFilter, {
      user: "64b000000000000000000000",
      broker: "samco",
      source: "BROKER_HOLDING_BOOTSTRAP",
      synthetic: true,
      bootstrapImport: true
    });
  } finally {
    Transaction.find = originals.find;
    Transaction.deleteMany = originals.deleteMany;
    Transaction.insertMany = originals.insertMany;
  }
});

test("transaction normalizer validates malformed rows", () => {
  const normalized = normalizeTransaction(
    { symbol: "", type: "HOLD", quantity: "x", price: "0", date: "bad-date" },
    { providerName: "generic", broker: "generic" }
  );

  assert.equal(normalized.valid, false);
  assert.deepEqual(
    normalized.errors.map((error) => error.code),
    [
      "SYMBOL_INVALID",
      "TYPE_INVALID",
      "QUANTITY_INVALID",
      "PRICE_INVALID",
      "TRANSACTION_DATE_INVALID"
    ]
  );
});

test("fee calculation includes brokerage, taxes, exchange charges, stamp duty, and net amount", () => {
  const fees = calculateFees(
    { type: "BUY", quantity: 10, price: 100 },
    "samco",
    { brokerage: 10, stt: 1, gst: 2, exchangeCharges: 3, stampDuty: 4 }
  );

  assert.equal(fees.brokerage, 10);
  assert.equal(fees.taxes, 7);
  assert.equal(fees.fees, 3);
  assert.equal(fees.netAmount, 1020);
});

test("duplicate prevention skips normalized transactions by broker external id", () => {
  const rows = [
    {
      valid: true,
      transaction: {
        broker: "zerodha",
        externalTransactionId: "abc"
      }
    },
    {
      valid: true,
      transaction: {
        broker: "zerodha",
        externalTransactionId: "def"
      }
    }
  ];

  const importable = filterImportableTransactions(rows, new Set(["zerodha:abc"]));

  assert.equal(importable.length, 1);
  assert.equal(importable[0].externalTransactionId, "def");
});

test("partial sell handling derives remaining holdings with FIFO cost basis", () => {
  const holdings = deriveHoldingsFromTransactions([
    {
      symbol: "INFY",
      type: "BUY",
      quantity: 10,
      price: 100,
      netAmount: 1010,
      transactionDate: new Date("2026-01-01"),
      broker: "generic",
      externalTransactionId: "b1"
    },
    {
      symbol: "INFY",
      type: "SELL",
      quantity: 4,
      price: 120,
      netAmount: 475,
      transactionDate: new Date("2026-02-01"),
      broker: "generic",
      externalTransactionId: "s1"
    }
  ]);

  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].quantity, 6);
  assert.equal(holdings[0].investedAmount, 606);
  assert.equal(holdings[0].buyPrice, 101);
});

test("FIFO lot reconstruction keeps the surviving lot acquisition date after partial sells", async () => {
  const asOfDate = new Date("2026-05-18T00:00:00.000Z");
  const holdings = deriveHoldingsFromTransactions([
    {
      symbol: "INFY",
      type: "BUY",
      quantity: 10,
      price: 100,
      netAmount: 1000,
      transactionDate: new Date("2024-01-01"),
      acquisitionDate: new Date("2024-01-01"),
      broker: "samco",
      holdingAgeSource: "broker_provided",
      acquisitionDateConfidence: "high",
      externalTransactionId: "b1"
    },
    {
      symbol: "INFY",
      type: "BUY",
      quantity: 5,
      price: 200,
      netAmount: 1000,
      transactionDate: new Date("2026-01-01"),
      acquisitionDate: new Date("2026-01-01"),
      broker: "samco",
      holdingAgeSource: "broker_provided",
      acquisitionDateConfidence: "high",
      externalTransactionId: "b2"
    },
    {
      symbol: "INFY",
      type: "SELL",
      quantity: 10,
      price: 150,
      netAmount: 1500,
      transactionDate: new Date("2026-02-01"),
      broker: "samco",
      externalTransactionId: "s1"
    }
  ]);
  const marketDataService = {
    resolveCurrentPrice: async (stock) => ({
      currentPrice: stock.buyPrice,
      dataSource: "test",
      lastUpdated: asOfDate
    })
  };
  const summary = await buildPortfolioSummary(holdings, {}, { marketDataService, asOfDate });
  const position = summary.positions[0];

  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].quantity, 5);
  assert.equal(holdings[0].buyPrice, 200);
  assert.equal(holdings[0].acquisitionDate.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(position.holding.holdingType, "short_term");
  assert.equal(position.sellAnalysis.classification.holdingType, "short_term");
});

test("inactive imported transactions are ignored during holding derivation", () => {
  const holdings = deriveHoldingsFromTransactions([
    {
      symbol: "INFY",
      type: "BUY",
      quantity: 10,
      price: 100,
      netAmount: 1010,
      transactionDate: new Date("2026-01-01"),
      broker: "zerodha",
      externalTransactionId: "b1",
      active: false
    }
  ]);

  assert.equal(holdings.length, 0);
});

test("broker sync deduplication uses the same external transaction guard", () => {
  const rows = [
    {
      valid: true,
      transaction: { broker: "samco", externalTransactionId: "trade-1" }
    },
    {
      valid: false,
      transaction: { broker: "samco", externalTransactionId: "bad" }
    }
  ];

  assert.deepEqual(filterImportableTransactions(rows, new Set(["samco:trade-1"])), []);
});

test("holdings-only broker sync imports synthetic bootstrap transactions", async () => {
  await withBrokerSyncStubs(
    {
      holdings: [
        {
          tradingSymbol: "TCS-EQ",
          netQuantity: "4",
          averagePrice: "3500.50",
          lastTradedPrice: "3610"
        }
      ]
    },
    async ({ inserted }) => {
      const result = await syncBroker("64b000000000000000000010", {
        broker: "samco",
        fullSync: true
      });

      assert.equal(result.imported, 1);
      assert.equal(result.syntheticTransactionCount, 1);
      assert.equal(result.bootstrapHoldingsCount, 1);
      assert.equal(inserted.length, 1);
      assert.equal(inserted[0].symbol, "TCS");
      assert.equal(inserted[0].type, "BUY");
      assert.equal(inserted[0].source, "BROKER_HOLDING_BOOTSTRAP");
      assert.equal(inserted[0].synthetic, true);
      assert.equal(inserted[0].bootstrapImport, true);
      assert.equal(inserted[0].currentPrice, 3610);
      assert.equal(inserted[0].externalTransactionId, "SAMCO-HOLDING-TCS-4-3500.5");
    }
  );
});

test("repeated holdings bootstrap sync does not duplicate synthetic transactions", async () => {
  await withBrokerSyncStubs(
    {
      holdings: [
        {
          tradingSymbol: "INFY",
          quantity: "2",
          costPrice: "1500"
        }
      ]
    },
    async ({ inserted }) => {
      const first = await syncBroker("64b000000000000000000011", {
        broker: "samco",
        fullSync: true
      });
      const second = await syncBroker("64b000000000000000000011", {
        broker: "samco",
        fullSync: true
      });

      assert.equal(first.imported, 1);
      assert.equal(second.imported, 0);
      assert.equal(second.skippedBootstrapDuplicates, 1);
      assert.equal(inserted.length, 1);
    }
  );
});

test("broker sync does not bootstrap holdings when historical trades were retrieved but deduped", async () => {
  await withBrokerSyncStubs(
    {
      transactions: [
        {
          symbol: "INFY",
          type: "BUY",
          quantity: 2,
          price: 1500,
          transactionDate: "2024-01-10",
          externalTransactionId: "trade-1"
        }
      ],
      holdings: [
        {
          tradingSymbol: "INFY",
          quantity: "2",
          costPrice: "1500"
        }
      ],
      existingExternalIds: new Set(["samco:trade-1"])
    },
    async ({ inserted }) => {
      const result = await syncBroker("64b000000000000000000019", {
        broker: "samco",
        fullSync: true
      });

      assert.equal(result.imported, 0);
      assert.equal(result.syntheticTransactionCount, 0);
      assert.equal(result.bootstrapHoldingsCount, 0);
      assert.equal(inserted.length, 0);
    }
  );
});

test("portfolio holdings derive correctly from synthetic bootstrap transactions", () => {
  const [transaction] = buildSyntheticHoldingTransactions({
    broker: "samco",
    userId: "64b000000000000000000012",
    importTimestamp: new Date("2026-05-18T10:00:00.000Z"),
    holdings: [
      {
        symbol: "RELIANCE-EQ",
        holdingsQuantity: "3",
        avgPrice: "2500",
        ltp: "2600"
      }
    ]
  });
  const holdings = deriveHoldingsFromTransactions([transaction]);

  assert.equal(transaction.externalTransactionId, "SAMCO-HOLDING-RELIANCE-3-2500");
  assert.equal(transaction.synthetic, true);
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].symbol, "RELIANCE");
  assert.equal(holdings[0].quantity, 3);
  assert.equal(holdings[0].buyPrice, 2500);
  assert.equal(holdings[0].investedAmount, 7500);
});

test("holdings bootstrap uses broker-provided acquisition date when available", () => {
  const [transaction] = buildSyntheticHoldingTransactions({
    broker: "zerodha",
    userId: "64b000000000000000000013",
    importTimestamp: new Date("2026-05-18T10:00:00.000Z"),
    holdings: [
      {
        tradingsymbol: "HDFCBANK",
        quantity: "5",
        averagePrice: "1500",
        acquisitionDate: "2024-04-10"
      }
    ]
  });

  assert.equal(transaction.transactionDate.toISOString().slice(0, 10), "2024-04-10");
  assert.equal(transaction.acquisitionDate.toISOString().slice(0, 10), "2024-04-10");
  assert.equal(transaction.holdingAgeSource, "broker_provided");
  assert.equal(transaction.inferredHoldingDays, 768);
  assert.equal(transaction.acquisitionDateConfidence, "high");
});

test("holdings bootstrap estimates acquisition date from holding metadata", () => {
  const [transaction] = buildSyntheticHoldingTransactions({
    broker: "samco",
    userId: "64b000000000000000000014",
    importTimestamp: new Date("2026-05-18T00:00:00.000Z"),
    holdings: [
      {
        symbol: "ITC",
        quantity: "7",
        averagePrice: "420",
        holdingDays: "420"
      }
    ]
  });

  assert.equal(transaction.transactionDate.toISOString().slice(0, 10), "2025-03-24");
  assert.equal(transaction.acquisitionDate.toISOString().slice(0, 10), "2025-03-24");
  assert.equal(transaction.holdingAgeSource, "estimated");
  assert.equal(transaction.inferredHoldingDays, 420);
  assert.equal(transaction.acquisitionDateConfidence, "medium");
});

test("holdings bootstrap leaves acquisition date unknown when broker data is unavailable", () => {
  const acquisition = resolveHoldingAcquisitionDate(
    { symbol: "SBIN", quantity: "2", averagePrice: "600" },
    new Date("2026-05-18T00:00:00.000Z"),
    { estimationStrategy: "import_date" }
  );

  assert.equal(acquisition.acquisitionDate, null);
  assert.equal(acquisition.holdingAgeSource, "unknown");
  assert.equal(acquisition.inferredHoldingDays, null);
  assert.equal(acquisition.acquisitionDateConfidence, "unknown");
});

test("unknown bootstrap acquisition date does not become a zero-day holding", async () => {
  const importTimestamp = new Date("2026-05-18T00:00:00.000Z");
  const [transaction] = buildSyntheticHoldingTransactions({
    broker: "samco",
    userId: "64b000000000000000000017",
    importTimestamp,
    estimationStrategy: "import_date",
    holdings: [
      {
        symbol: "SBIN",
        quantity: "2",
        averagePrice: "600"
      }
    ]
  });
  const [holding] = deriveHoldingsFromTransactions([transaction]);
  const marketDataService = {
    resolveCurrentPrice: async (stock) => ({
      currentPrice: stock.buyPrice,
      dataSource: "test",
      lastUpdated: importTimestamp
    })
  };
  const summary = await buildPortfolioSummary([holding], {}, { marketDataService, asOfDate: importTimestamp });
  const position = summary.positions[0];

  assert.equal(transaction.transactionDate.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(transaction.acquisitionDate, null);
  assert.equal(holding.acquisitionDate, null);
  assert.equal(position.holding.acquisitionDate, null);
  assert.equal(position.holding.holdingDays, null);
  assert.equal(position.holding.holdingType, "unknown");
  assert.equal(position.sellAnalysis.classification.holdingType, "unknown");
  assert.ok(position.sellAnalysis.suggestion.reasonCodes.includes("holding_period_unknown"));
});

test("bootstrap acquisition summary logs missing acquisition date counts", () => {
  const transactions = buildSyntheticHoldingTransactions({
    broker: "samco",
    userId: "64b000000000000000000018",
    importTimestamp: new Date("2026-05-18T00:00:00.000Z"),
    estimationStrategy: "import_date",
    holdings: [
      {
        symbol: "SBIN",
        quantity: "2",
        averagePrice: "600"
      },
      {
        symbol: "HDFCBANK",
        quantity: "1",
        averagePrice: "1500",
        acquisitionDate: "2024-04-10"
      }
    ]
  });
  const summary = summarizeBootstrapAcquisition(transactions);

  assert.equal(summary.missingAcquisitionDate, 1);
  assert.deepEqual(summary.missingSymbols, ["SBIN"]);
  assert.equal(summary.bySource.unknown, 1);
  assert.equal(summary.bySource.broker_provided, 1);
});

test("bootstrap acquisition dates drive long-term vs short-term classification", async () => {
  const importTimestamp = new Date("2026-05-18T00:00:00.000Z");
  const transactions = buildSyntheticHoldingTransactions({
    broker: "samco",
    userId: "64b000000000000000000015",
    importTimestamp,
    holdings: [
      {
        symbol: "LTIM",
        quantity: "1",
        averagePrice: "1000",
        holdingDays: "366"
      },
      {
        symbol: "DMART",
        quantity: "1",
        averagePrice: "1000",
        holdingDays: "30"
      }
    ]
  });
  const holdings = deriveHoldingsFromTransactions(transactions);
  const marketDataService = {
    resolveCurrentPrice: async (stock) => ({
      currentPrice: stock.buyPrice,
      dataSource: "test",
      lastUpdated: importTimestamp
    })
  };
  const summary = await buildPortfolioSummary(holdings, {}, { marketDataService, asOfDate: importTimestamp });
  const bySymbol = new Map(summary.positions.map((position) => [position.symbol, position]));

  assert.equal(bySymbol.get("LTIM").sellAnalysis.classification.holdingType, "long_term");
  assert.equal(bySymbol.get("DMART").sellAnalysis.classification.holdingType, "short_term");
  assert.equal(bySymbol.get("LTIM").holding.holdingType, "long_term");
  assert.equal(bySymbol.get("LTIM").holding.holdingDays, 366);
  assert.equal(bySymbol.get("LTIM").holding.holdingMonths, 12);
  assert.equal(bySymbol.get("LTIM").holding.holdingYears, 1);
  assert.equal(bySymbol.get("LTIM").holding.holdingAgeSource, "estimated");
  assert.equal(bySymbol.get("LTIM").holding.acquisitionDateConfidence, "medium");
});

test("broker-provided acquisition dates flow through derived holdings metadata", async () => {
  const importTimestamp = new Date("2026-05-18T00:00:00.000Z");
  const [transaction] = buildSyntheticHoldingTransactions({
    broker: "zerodha",
    userId: "64b000000000000000000016",
    importTimestamp,
    holdings: [
      {
        symbol: "NESTLEIND",
        quantity: "2",
        averagePrice: "2400",
        firstBuyDate: "2023-05-01"
      }
    ]
  });
  const [holding] = deriveHoldingsFromTransactions([transaction]);
  const marketDataService = {
    resolveCurrentPrice: async (stock) => ({
      currentPrice: stock.buyPrice,
      dataSource: "test",
      lastUpdated: importTimestamp
    })
  };
  const summary = await buildPortfolioSummary([holding], {}, { marketDataService, asOfDate: importTimestamp });
  const position = summary.positions[0];

  assert.equal(holding.acquisitionDate.toISOString().slice(0, 10), "2023-05-01");
  assert.equal(position.holding.acquisitionDate.slice(0, 10), "2023-05-01");
  assert.equal(position.holding.holdingAgeSource, "broker_provided");
  assert.equal(position.holding.acquisitionDateConfidence, "high");
  assert.equal(position.sellAnalysis.classification.holdingType, "long_term");
});

test("Samco broker provider normalizes trade book rows into transaction schema", () => {
  const provider = new SamcoBrokerProvider({
    credentials: {
      transactions: []
    }
  });

  const rawRow = {
    orderNumber: "200617000000380",
    exchange: "BSE",
    tradingSymbol: "TCS",
    transactionType: "SELL",
    quantity: "10",
    tradeNumber: "25400",
    tradePrice: "2010.00",
    tradeDate: "17JUN2020",
    tradeTime: "06:39:49 PM",
    samcoSource: "tradeBook"
  };
  const normalizedRow = provider.toTransactionRow(rawRow);
  const [normalized] = provider.normalize([normalizedRow], { userId: "64b000000000000000000000" });

  assert.equal(normalized.valid, true);
  assert.equal(normalized.transaction.symbol, "TCS");
  assert.equal(normalized.transaction.type, "SELL");
  assert.equal(normalized.transaction.quantity, 10);
  assert.equal(normalized.transaction.price, 2010);
  assert.equal(normalized.transaction.broker, "samco");
  assert.match(normalized.transaction.externalTransactionId, /^25400:/);
});

test("Samco broker provider marks real BUY trades as high-confidence acquisition dates", () => {
  const provider = new SamcoBrokerProvider({
    credentials: {
      transactions: []
    }
  });

  const normalizedRow = provider.toTransactionRow({
    orderNumber: "200617000000381",
    exchange: "NSE",
    tradingSymbol: "INFY",
    transactionType: "BUY",
    quantity: "3",
    tradeNumber: "25401",
    tradePrice: "1500.00",
    tradeDate: "17JUN2020",
    tradeTime: "10:15:00 AM",
    samcoSource: "tradeBook"
  });
  const [normalized] = provider.normalize([normalizedRow], { userId: "64b000000000000000000000" });

  assert.equal(normalized.valid, true);
  assert.equal(normalized.transaction.acquisitionDate.toISOString().slice(0, 10), "2020-06-17");
  assert.equal(normalized.transaction.holdingAgeSource, "broker_provided");
  assert.equal(normalized.transaction.acquisitionDateConfidence, "high");
});

test("Samco broker provider ignores non-executed order book rows", () => {
  const provider = new SamcoBrokerProvider({
    credentials: {
      transactions: []
    }
  });

  assert.equal(
    provider.toTransactionRow({
      orderNumber: "200616000000350",
      tradingSymbol: "RELIANCE",
      transactionType: "BUY",
      filledQuantity: "0",
      orderPrice: "1282.00",
      orderStatus: "Open",
      orderTime: "16-Jun-2020 18:03:47",
      samcoSource: "orderBook"
    }),
    null
  );
});

test("Samco broker provider never maps completed order book rows to portfolio transactions", () => {
  const provider = new SamcoBrokerProvider({
    credentials: {
      transactions: []
    }
  });

  assert.equal(
    provider.toTransactionRow({
      orderNumber: "200617000000380",
      exchangeOrderNumber: "EXCHANGE-1",
      exchange: "BSE",
      tradingSymbol: "TCS",
      transactionType: "BUY",
      filledQuantity: "10",
      averagePrice: "2010.00",
      orderStatus: "Completed",
      orderTime: "17-Jun-2020 18:39:49",
      samcoSource: "orderBook"
    }),
    null
  );
});

test("Samco broker provider uses Trade Book exclusively when Order Book contains completed executions", async () => {
  const provider = new SamcoBrokerProvider({
    credentials: {
      userId: "U123",
      password: "secret",
      secretApiKey: "secret-key",
      sessionToken: "session-token"
    },
    http: {
      request: async ({ url }) => {
        if (url.includes("trade")) {
          return {
            data: {
              status: "Success",
              tradeBookDetails: [
                {
                  orderNumber: "ORDER-1",
                  exchange: "NSE",
                  tradingSymbol: "INFY",
                  transactionType: "BUY",
                  quantity: "2",
                  tradeNumber: "TRADE-1",
                  tradePrice: "1500",
                  tradeDate: "17JUN2020",
                  tradeTime: "10:15:00 AM"
                }
              ]
            }
          };
        }

        return {
          data: {
            status: "Success",
            orderBookDetails: [
              {
                orderNumber: "ORDER-1",
                exchange: "NSE",
                tradingSymbol: "INFY",
                transactionType: "BUY",
                filledQuantity: "2",
                averagePrice: "1500",
                orderStatus: "Completed",
                orderTime: "17-Jun-2020 10:15:00"
              },
              {
                orderNumber: "ORDER-2",
                exchange: "NSE",
                tradingSymbol: "TCS",
                transactionType: "SELL",
                filledQuantity: "1",
                averagePrice: "2000",
                orderStatus: "Executed",
                orderTime: "17-Jun-2020 11:00:00"
              }
            ]
          }
        };
      }
    }
  });
  provider.log = () => {};

  const rows = await provider.fetchTransactions();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "INFY");
  assert.equal(rows[0].externalTransactionId.startsWith("TRADE-1:"), true);
  assert.equal(rows[0].samcoSource, "tradeBook");
});

test("Samco broker provider treats empty order book response as no orders", async () => {
  const logs = [];
  const provider = new SamcoBrokerProvider({
    credentials: {
      userId: "U123",
      password: "secret",
      secretApiKey: "secret-key",
      sessionToken: "session-token"
    },
    http: {
      request: async ({ url }) => {
        if (url.includes("trade")) {
          return {
            data: {
              status: "Success",
              tradeBookDetails: [
                {
                  orderNumber: "1",
                  exchange: "BSE",
                  tradingSymbol: "TCS",
                  transactionType: "BUY",
                  quantity: "1",
                  tradeNumber: "T1",
                  tradePrice: "100",
                  tradeDate: "17JUN2020",
                  tradeTime: "06:39:49 PM"
                }
              ]
            }
          };
        }

        return {
          data: {
            status: "Failure",
            statusMessage: "No Order Found in Order Book"
          }
        };
      }
    }
  });
  provider.log = (message, details) => logs.push({ message, details });

  const rows = await provider.fetchTransactions();

  assert.equal(rows.length, 1);
  assert.ok(logs.some((entry) => entry.message === "No orders found"));
});

test("Samco broker provider requests configured historical trade-book ranges with pagination", async () => {
  const calls = [];
  const provider = new SamcoBrokerProvider({
    credentials: {
      userId: "U123",
      password: "secret",
      secretApiKey: "secret-key",
      sessionToken: "session-token",
      tradeBookSegments: ["NSE"],
      tradeBookPageSize: 1,
      tradeBookMaxPages: 3
    },
    http: {
      request: async ({ url, params }) => {
        calls.push({ url, params });

        if (url.includes("trade")) {
          return {
            data: {
              status: "Success",
              pageNumber: params.pageNumber,
              totalPages: 2,
              tradeBookDetails:
                params.pageNumber === 1
                  ? [
                      {
                        orderNumber: "1",
                        exchange: "NSE",
                        tradingSymbol: "TCS",
                        transactionType: "BUY",
                        quantity: "1",
                        tradeNumber: "T1",
                        tradePrice: "100",
                        tradeDate: "17JUN2020",
                        tradeTime: "06:39:49 PM"
                      }
                    ]
                  : [
                      {
                        orderNumber: "2",
                        exchange: "NSE",
                        tradingSymbol: "INFY",
                        transactionType: "BUY",
                        quantity: "1",
                        tradeNumber: "T2",
                        tradePrice: "200",
                        tradeDate: "18JUN2020",
                        tradeTime: "10:00:00 AM"
                      }
                    ]
            }
          };
        }

        return {
          data: {
            status: "Success",
            orderBookDetails: []
          }
        };
      }
    }
  });
  provider.log = () => {};

  const rows = await provider.fetchTransactions({
    fromDate: "2020-06-01",
    toDate: "2020-06-30",
    financialYear: "2020-2021"
  });

  assert.equal(rows.length, 2);
  assert.equal(calls[0].params.fromDate, "2020-06-01");
  assert.equal(calls[0].params.toDate, "2020-06-30");
  assert.equal(calls[0].params.financialYear, "2020-2021");
  assert.equal(calls[0].params.segment, "NSE");
  assert.equal(calls[0].params.pageNumber, 1);
  assert.equal(calls[1].params.pageNumber, 2);
});

test("Samco broker provider walks multi-year historical trade windows and dedupes results", async () => {
  const tradeCalls = [];
  const provider = new SamcoBrokerProvider({
    credentials: {
      userId: "U123",
      password: "secret",
      secretApiKey: "secret-key",
      sessionToken: "session-token",
      tradeBookSegments: ["NSE"],
      tradeBookPageSize: 10,
      tradeBookMaxPages: 2,
      tradeBookWindowDays: 365
    },
    http: {
      request: async ({ url, params }) => {
        if (url.includes("trade")) {
          tradeCalls.push({ url, params });
          return {
            data: {
              status: "Success",
              tradeBookDetails: [
                {
                  orderNumber: "1",
                  exchange: "NSE",
                  tradingSymbol: params.fromDate.startsWith("2022") ? "TCS" : "INFY",
                  transactionType: "BUY",
                  quantity: "1",
                  tradeNumber: params.fromDate.startsWith("2022") ? "T1" : "T2",
                  tradePrice: params.fromDate.startsWith("2022") ? "100" : "200",
                  tradeDate: params.fromDate.startsWith("2022") ? "01JUN2022" : "01JUN2023",
                  tradeTime: "10:00:00 AM"
                }
              ]
            }
          };
        }

        return {
          data: {
            status: "Success",
            orderBookDetails: []
          }
        };
      }
    }
  });
  provider.log = () => {};

  const rows = await provider.fetchTransactions({
    fromDate: "2022-01-01",
    toDate: "2023-12-31",
    windowDays: 365
  });

  assert.equal(rows.length, 2);
  assert.equal(tradeCalls.length, 2);
  assert.deepEqual(
    tradeCalls.map((call) => [call.params.fromDate, call.params.toDate]),
    [
      ["2022-01-01", "2022-12-31"],
      ["2023-01-01", "2023-12-31"]
    ]
  );
  assert.deepEqual(
    rows.map((row) => row.symbol).sort(),
    ["INFY", "TCS"]
  );
});

test("Samco broker provider treats empty trade book response as no trades", async () => {
  const logs = [];
  const provider = new SamcoBrokerProvider({
    credentials: {
      userId: "U123",
      password: "secret",
      secretApiKey: "secret-key",
      sessionToken: "session-token"
    },
    http: {
      request: async ({ url }) => {
        if (url.includes("trade")) {
          return {
            data: {
              status: "Failure",
              statusMessage: "No Trade Found in Trade Book"
            }
          };
        }

        return {
          data: {
            status: "Success",
            orderBookDetails: []
          }
        };
      }
    }
  });
  provider.log = (message, details) => logs.push({ message, details });

  const rows = await provider.fetchTransactions();

  assert.deepEqual(rows, []);
  assert.ok(logs.some((entry) => entry.message === "No trades found"));
});

test("Samco broker provider treats empty holdings response as no holdings", async () => {
  const logs = [];
  const provider = new SamcoBrokerProvider({
    credentials: {
      userId: "U123",
      password: "secret",
      secretApiKey: "secret-key",
      sessionToken: "session-token"
    },
    http: {
      request: async () => ({
        data: {
          status: "Failure",
          statusMessage: "No Holdings Found"
        }
      })
    }
  });
  provider.log = (message, details) => logs.push({ message, details });

  const holdings = await provider.fetchHoldings();

  assert.deepEqual(holdings, []);
  assert.ok(logs.some((entry) => entry.message === "No holdings found"));
});

test("broker connection validation requires Samco provider-specific fields", async () => {
  await assert.rejects(
    () =>
      connectBroker("64b000000000000000000000", {
        broker: "samco",
        credentials: {
          userId: "U123",
          password: "secret"
        }
      }),
    {
      code: "BROKER_AUTH_FIELDS_REQUIRED"
    }
  );
});

test("Zerodha broker provider accepts api credentials with a request token", async () => {
  const provider = new ZerodhaBrokerProvider({
    credentials: {
      apiKey: "key",
      apiSecret: "secret",
      requestToken: "request-token"
    }
  });

  await assert.doesNotReject(() => provider.authenticate());
});

test("Zerodha broker provider requires request token or session token", async () => {
  const provider = new ZerodhaBrokerProvider({
    credentials: {
      apiKey: "key",
      apiSecret: "secret"
    }
  });

  await assert.rejects(() => provider.authenticate(), /requestToken or sessionToken/);
});
