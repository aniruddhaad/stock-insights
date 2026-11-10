const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function loadApp() {
  const context = {
    Intl,
    window: {
      location: { pathname: "/dashboard", href: "" },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      Headers: class Headers {
        set() {}
      }
    },
    document: {
      querySelector: () => null,
      getElementById: () => null
    }
  };
  context.window.window = context.window;
  context.window.document = context.document;

  const appScript = fs.readFileSync(path.join(__dirname, "../public/assets/app.js"), "utf8");
  vm.runInNewContext(appScript, context);
  return context.window.StockInsightsApp;
}

test("UI formatter renders unknown holding period transparently", () => {
  const app = loadApp();

  assert.equal(
    app.formatHoldingPeriod({
      holdingDays: null,
      holdingType: "unknown",
      holdingAgeSource: "unknown"
    }),
    "Holding period unavailable"
  );
  assert.equal(app.formatHoldingType("unknown"), "Unknown");
  assert.equal(app.getHoldingTypeBadgeClass("unknown"), "text-bg-secondary");
  assert.equal(app.buildHoldingEstimateNote({ holdingAgeSource: "unknown" }), "Acquisition date was unavailable from broker data.");
});
