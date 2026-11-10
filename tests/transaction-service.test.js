const test = require("node:test");
const assert = require("node:assert/strict");
const Transaction = require("../src/models/transaction.model");
const Stock = require("../src/models/stock.model");
const transactionService = require("../src/services/transaction.service");

function createFindStub({ positionTransactions, remainingTransactions }) {
  return (query) => {
    if (query && query.symbol) {
      return Promise.resolve(positionTransactions);
    }

    return {
      sort() {
        return {
          lean() {
            return Promise.resolve(remainingTransactions);
          }
        };
      }
    };
  };
}

async function withModelStubs(stubs, run) {
  const originals = {
    transactionFind: Transaction.find,
    transactionUpdateMany: Transaction.updateMany,
    transactionDeleteMany: Transaction.deleteMany,
    stockDeleteMany: Stock.deleteMany,
    consoleInfo: console.info
  };

  Transaction.find = stubs.find;
  Transaction.updateMany = stubs.updateMany || (async () => ({ modifiedCount: 0 }));
  Transaction.deleteMany = stubs.deleteMany || (async () => ({ deletedCount: 0 }));
  Stock.deleteMany = stubs.stockDeleteMany || (async () => ({ deletedCount: 0 }));
  console.info = stubs.consoleInfo || (() => {});

  try {
    await run();
  } finally {
    Transaction.find = originals.transactionFind;
    Transaction.updateMany = originals.transactionUpdateMany;
    Transaction.deleteMany = originals.transactionDeleteMany;
    Stock.deleteMany = originals.stockDeleteMany;
    console.info = originals.consoleInfo;
  }
}

test("deleting manual position removes source transactions and holding", async () => {
  const userId = "64b000000000000000000001";
  const deletedIds = [];
  let loggedPayload = null;

  await withModelStubs(
    {
      find: createFindStub({
        positionTransactions: [
          {
            _id: "manual-buy-1",
            symbol: "INFY",
            type: "BUY",
            source: "manual",
            broker: "manual",
            quantity: 10,
            price: 100,
            netAmount: 1000,
            transactionDate: new Date("2026-01-01"),
            externalTransactionId: "manual:1"
          }
        ],
        remainingTransactions: []
      }),
      deleteMany: async (query) => {
        deletedIds.push(...query._id.$in);
        return { deletedCount: query._id.$in.length };
      },
      consoleInfo: (message, payload) => {
        loggedPayload = { message, payload };
      }
    },
    async () => {
      const result = await transactionService.deletePosition(userId, "infy");

      assert.deepEqual(deletedIds, ["manual-buy-1"]);
      assert.equal(result.manualDeleted, 1);
      assert.equal(result.importedDeactivated, 0);
      assert.equal(result.deletedTransactionCount, 1);
      assert.equal(result.recomputedHoldingsCount, 0);
      assert.equal(loggedPayload.message, "[portfolio] position deleted");
      assert.equal(loggedPayload.payload.deletedTransactionCount, 1);
      assert.equal(loggedPayload.payload.recomputedHoldingsCount, 0);
    }
  );
});

test("deleting imported position marks transactions ignored and hides holding after recompute", async () => {
  const userId = "64b000000000000000000002";
  let updateQuery = null;
  let updateBody = null;

  await withModelStubs(
    {
      find: createFindStub({
        positionTransactions: [
          {
            _id: "import-buy-1",
            symbol: "TCS",
            type: "BUY",
            source: "broker",
            broker: "zerodha",
            quantity: 5,
            price: 3000,
            netAmount: 15000,
            transactionDate: new Date("2026-01-01"),
            externalTransactionId: "z1"
          }
        ],
        remainingTransactions: []
      }),
      updateMany: async (query, body) => {
        updateQuery = query;
        updateBody = body;
        return { modifiedCount: query._id.$in.length };
      }
    },
    async () => {
      const result = await transactionService.deletePosition(userId, "TCS", {
        force: true,
        confirmation: "DELETE"
      });

      assert.deepEqual(updateQuery._id.$in, ["import-buy-1"]);
      assert.equal(updateBody.$set.active, false);
      assert.equal(updateBody.$set.ignored, true);
      assert.equal(updateBody.$set.ignoredReason, "position_deleted");
      assert.ok(updateBody.$set.ignoredAt instanceof Date);
      assert.equal(result.manualDeleted, 0);
      assert.equal(result.importedDeactivated, 1);
      assert.equal(result.recomputedHoldingsCount, 0);
    }
  );
});

test("recomputation does not recreate deleted positions from remaining transactions", async () => {
  const userId = "64b000000000000000000003";

  await withModelStubs(
    {
      find: createFindStub({
        positionTransactions: [
          {
            _id: "manual-buy-2",
            symbol: "RELIANCE",
            type: "BUY",
            source: "manual",
            broker: "manual",
            quantity: 2,
            price: 2500,
            netAmount: 5000,
            transactionDate: new Date("2026-01-01"),
            externalTransactionId: "manual:2"
          }
        ],
        remainingTransactions: [
          {
            _id: "manual-buy-3",
            symbol: "HDFCBANK",
            type: "BUY",
            source: "manual",
            broker: "manual",
            quantity: 3,
            price: 1800,
            netAmount: 5400,
            transactionDate: new Date("2026-01-02"),
            externalTransactionId: "manual:3"
          }
        ]
      })
    },
    async () => {
      const result = await transactionService.deletePosition(userId, "RELIANCE");

      assert.equal(result.recomputedHoldingsCount, 1);
      assert.equal(result.symbol, "RELIANCE");
    }
  );
});
