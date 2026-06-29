const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");

const app = require("../src/app");
const { connectDatabase } = require("../src/config/database");
const User = require("../src/models/user.model");
const Transaction = require("../src/models/transaction.model");
const Stock = require("../src/models/stock.model");
const BrokerConnection = require("../src/models/broker-connection.model");
const { buildSyntheticHoldingTransactions } = require("../src/services/portfolio-ingestion/ingestion.service");

const workbookPath =
  process.env.SAMCO_STAR_TEST_WORKBOOK || path.join(os.homedir(), "Downloads", "trade_book.xlsx");

async function startTestServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

async function stopTestServer(server) {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function apiRequest(baseUrl, pathname, { token, body }) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  return { response, payload };
}

async function signup(baseUrl, identity) {
  const { response, payload } = await apiRequest(baseUrl, "/api/auth/signup", {
    body: {
      name: identity.name,
      email: identity.email,
      password: identity.password
    }
  });

  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.equal(payload.success, true);
  assert.ok(payload.data.token);
  assert.ok(payload.data.user._id);

  return payload.data;
}

function importPayload(workbookContent, mode) {
  return {
    provider: "samco",
    fileContent: workbookContent,
    fileEncoding: "base64",
    fileExtension: "xlsx",
    fileName: path.basename(workbookPath),
    fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    allowPartial: true,
    mode
  };
}

test("Samco Star workbook imports end to end without affecting other users", { timeout: 60000 }, async () => {
  assert.equal(fs.existsSync(workbookPath), true, `Samco workbook not found: ${workbookPath}`);

  const runId = crypto.randomUUID();
  const identities = [
    {
      name: "Samco Import Test",
      email: `samco-import-${runId}@example.test`,
      password: `Test-${runId}`
    },
    {
      name: "Samco Isolation Guard",
      email: `samco-guard-${runId}@example.test`,
      password: `Guard-${runId}`
    }
  ];
  const createdUserIds = [];
  const openedDatabaseConnection = mongoose.connection.readyState === 0;
  let server;

  try {
    if (openedDatabaseConnection) {
      await connectDatabase();
    }

    server = await startTestServer();
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const primary = await signup(baseUrl, identities[0]);
    const guard = await signup(baseUrl, identities[1]);
    createdUserIds.push(primary.user._id, guard.user._id);

    const primaryBootstrap = buildSyntheticHoldingTransactions({
      broker: "samco",
      userId: primary.user._id,
      importTimestamp: new Date("2026-06-01T00:00:00.000Z"),
      holdings: [
        { symbol: "BOOTONE", quantity: 2, averagePrice: 100 },
        { symbol: "BOOTTWO", quantity: 3, averagePrice: 200 }
      ]
    });
    const [guardBootstrap] = buildSyntheticHoldingTransactions({
      broker: "samco",
      userId: guard.user._id,
      importTimestamp: new Date("2026-06-01T00:00:00.000Z"),
      holdings: [{ symbol: "GUARD", quantity: 1, averagePrice: 300 }]
    });
    await Transaction.insertMany([...primaryBootstrap, guardBootstrap]);
    await Transaction.create({
      user: primary.user._id,
      symbol: "CONTROL",
      type: "BUY",
      quantity: 1,
      price: 500,
      transactionDate: new Date("2026-01-01T00:00:00.000Z"),
      acquisitionDate: new Date("2026-01-01T00:00:00.000Z"),
      broker: "samco",
      brokerage: 0,
      taxes: 0,
      fees: 0,
      netAmount: 500,
      externalTransactionId: `SAMCO-REAL-CONTROL-${runId}`,
      source: "broker",
      synthetic: false,
      bootstrapImport: false
    });

    const workbookContent = fs.readFileSync(workbookPath).toString("base64");
    const previewResult = await apiRequest(baseUrl, "/api/import/portfolio", {
      token: primary.token,
      body: importPayload(workbookContent, "preview")
    });
    const preview = previewResult.payload.data;

    assert.equal(previewResult.response.status, 200, JSON.stringify(previewResult.payload));
    assert.equal(previewResult.payload.success, true);
    assert.equal(preview.provider, "samco");
    assert.equal(preview.totalRows, 124);
    assert.equal(preview.validRows, 124);
    assert.equal(preview.invalidRows, 0);
    assert.equal(preview.duplicates, 0);
    assert.equal(preview.rows.every((row) => row.valid && !row.duplicate), true);
    assert.equal(
      await Transaction.countDocuments({
        user: primary.user._id,
        source: "BROKER_HOLDING_BOOTSTRAP",
        synthetic: true,
        bootstrapImport: true
      }),
      2,
      "Preview must not remove bootstrap transactions"
    );

    const commitResult = await apiRequest(baseUrl, "/api/import/portfolio", {
      token: primary.token,
      body: importPayload(workbookContent, "commit")
    });
    const commit = commitResult.payload.data;

    assert.equal(commitResult.response.status, 201, JSON.stringify(commitResult.payload));
    assert.equal(commitResult.payload.success, true);
    assert.equal(commit.imported, 124);
    assert.equal(commit.skippedDuplicates, 0);
    assert.equal(commit.removedBootstrapTransactions, 2);
    assert.equal(
      await Transaction.countDocuments({
        user: primary.user._id,
        source: "BROKER_HOLDING_BOOTSTRAP",
        synthetic: true,
        bootstrapImport: true
      }),
      0
    );
    assert.equal(
      await Transaction.countDocuments({ user: primary.user._id, broker: "samco", source: "csv" }),
      124
    );
    assert.equal(
      await Transaction.countDocuments({
        user: primary.user._id,
        externalTransactionId: `SAMCO-REAL-CONTROL-${runId}`,
        source: "broker"
      }),
      1,
      "A real Samco broker transaction must survive bootstrap cleanup"
    );
    assert.equal(
      await Transaction.countDocuments({
        user: guard.user._id,
        source: "BROKER_HOLDING_BOOTSTRAP",
        synthetic: true,
        bootstrapImport: true
      }),
      1,
      "Another user's bootstrap transaction must remain untouched"
    );

    const duplicatePreviewResult = await apiRequest(baseUrl, "/api/import/portfolio", {
      token: primary.token,
      body: importPayload(workbookContent, "preview")
    });
    const duplicatePreview = duplicatePreviewResult.payload.data;

    assert.equal(duplicatePreviewResult.response.status, 200, JSON.stringify(duplicatePreviewResult.payload));
    assert.equal(duplicatePreview.totalRows, 124);
    assert.equal(duplicatePreview.validRows, 124);
    assert.equal(duplicatePreview.duplicates, 124);
    assert.equal(duplicatePreview.rows.every((row) => row.duplicate), true);

    const duplicateCommitResult = await apiRequest(baseUrl, "/api/import/portfolio", {
      token: primary.token,
      body: importPayload(workbookContent, "commit")
    });
    const duplicateCommit = duplicateCommitResult.payload.data;

    assert.equal(duplicateCommitResult.response.status, 201, JSON.stringify(duplicateCommitResult.payload));
    assert.equal(duplicateCommit.imported, 0);
    assert.equal(duplicateCommit.skippedDuplicates, 124);
    assert.equal(duplicateCommit.removedBootstrapTransactions, 0);
    assert.equal(
      await Transaction.countDocuments({ user: primary.user._id, broker: "samco", source: "csv" }),
      124
    );
  } finally {
    try {
      const users =
        mongoose.connection.readyState === 1
          ? await User.find({ email: { $in: identities.map((identity) => identity.email) } }).select("_id").lean()
          : [];
      const cleanupUserIds = [...new Set([...createdUserIds, ...users.map((user) => String(user._id))])];

      if (cleanupUserIds.length > 0 && mongoose.connection.readyState === 1) {
        await Promise.all([
          Transaction.deleteMany({ user: { $in: cleanupUserIds } }),
          Stock.deleteMany({ user: { $in: cleanupUserIds } }),
          BrokerConnection.deleteMany({ user: { $in: cleanupUserIds } })
        ]);
        await User.deleteMany({ _id: { $in: cleanupUserIds } });
      }
    } finally {
      try {
        await stopTestServer(server);
      } finally {
        if (openedDatabaseConnection && mongoose.connection.readyState !== 0) {
          await mongoose.disconnect();
        }
      }
    }
  }
});
