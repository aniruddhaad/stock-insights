const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDecisionPayload } = require("../src/services/decision-engine.service");

test("decision engine ranks top performers, worst performers, and overexposed positions", () => {
  const payload = buildDecisionPayload({
    summary: {
      totalInvestment: 100000,
      totalCurrentValue: 112000,
      totalProfitLoss: 12000,
      totalProfitLossPct: 12,
      holdingsCount: 6,
      allocation: []
    },
    portfolioScenarioProjection: {
      range: {
        nominalMin: 120000,
        nominalMax: 148000
      }
    },
    options: {
      years: 3,
      includeInflation: false,
      inflationRatePct: null
    },
    positions: [
      {
        stockId: "1",
        symbol: "TCS",
        metrics: {
          allocationPct: 61,
          profitLossPct: 18,
          currentValue: 65000
        },
        sellAnalysis: {
          suggestion: {
            code: "booking_profit"
          }
        },
        sentiment: {
          sentiment: {
            label: "positive"
          }
        },
        scoring: {
          finalScore: 6.48,
          portfolioSignals: {
            signalCodes: ["high_overexposure", "profit_booking_candidate"]
          }
        }
      },
      {
        stockId: "2",
        symbol: "INFY",
        metrics: {
          allocationPct: 60,
          profitLossPct: 25,
          currentValue: 47000
        },
        sellAnalysis: {
          suggestion: {
            code: "hold_for_long_term"
          }
        },
        sentiment: {
          sentiment: {
            label: "neutral"
          }
        },
        scoring: {
          finalScore: 3.22,
          portfolioSignals: {
            signalCodes: ["moderate_overexposure"]
          }
        }
      },
      {
        stockId: "3",
        symbol: "HDFCBANK",
        metrics: {
          allocationPct: 20,
          profitLossPct: -2,
          currentValue: 38000
        },
        sellAnalysis: {
          suggestion: {
            code: "hold_for_long_term"
          }
        },
        sentiment: {
          sentiment: {
            label: "positive"
          }
        },
        scoring: {
          finalScore: 8.91,
          portfolioSignals: {
            signalCodes: []
          }
        }
      },
      {
        stockId: "4",
        symbol: "RELIANCE",
        metrics: {
          allocationPct: 16,
          profitLossPct: 12,
          currentValue: 29000
        },
        sellAnalysis: {
          suggestion: {
            code: "trim_on_strength"
          }
        },
        sentiment: {
          sentiment: {
            label: "neutral"
          }
        },
        scoring: {
          finalScore: 4.76,
          portfolioSignals: {
            signalCodes: ["watch_momentum"]
          }
        }
      },
      {
        stockId: "5",
        symbol: "ITC",
        metrics: {
          allocationPct: 14,
          profitLossPct: 8,
          currentValue: 24000
        },
        sellAnalysis: {
          suggestion: {
            code: "review_position"
          }
        },
        sentiment: {
          sentiment: {
            label: "negative"
          }
        },
        scoring: {
          finalScore: 1.94,
          portfolioSignals: {
            signalCodes: ["weak_sentiment"]
          }
        }
      },
      {
        stockId: "6",
        symbol: "SBIN",
        metrics: {
          allocationPct: 10,
          profitLossPct: -5,
          currentValue: 21000
        },
        sellAnalysis: {
          suggestion: {
            code: "hold_for_long_term"
          }
        },
        sentiment: {
          sentiment: {
            label: "positive"
          }
        },
        scoring: {
          finalScore: 7.35,
          portfolioSignals: {
            signalCodes: ["recovery_candidate"]
          }
        }
      }
    ]
  });

  assert.deepEqual(
    payload.rankings.topPerformers.map((position) => position.symbol),
    ["HDFCBANK", "SBIN", "TCS"]
  );
  assert.deepEqual(
    payload.rankings.worstPerformers.map((position) => position.symbol),
    ["ITC", "INFY", "RELIANCE"]
  );
  assert.deepEqual(
    payload.rankings.topPerformers.map((position) => position.finalScore),
    [8.91, 7.35, 6.48]
  );
  assert.deepEqual(
    payload.rankings.worstPerformers.map((position) => position.finalScore),
    [1.94, 3.22, 4.76]
  );
  assert.equal(
    payload.rankings.topPerformers.some((topPerformer) =>
      payload.rankings.worstPerformers.some(
        (worstPerformer) => worstPerformer.stockId === topPerformer.stockId
      )
    ),
    false
  );
  assert.equal(payload.rankings.overexposure.length, 2);
  assert.deepEqual(
    payload.rankings.overexposure.map((position) => ({
      symbol: position.symbol,
      severity: position.severity,
      overexposureSeverity: position.overexposureSeverity,
      overexposurePenalty: position.overexposurePenalty,
      signalCodes: position.signalCodes
    })),
    [
      {
        symbol: "TCS",
        severity: "high_overexposure",
        overexposureSeverity: "high_overexposure",
        overexposurePenalty: -2.2,
        signalCodes: ["high_overexposure", "profit_booking_candidate"]
      },
      {
        symbol: "INFY",
        severity: "moderate_overexposure",
        overexposureSeverity: "moderate_overexposure",
        overexposurePenalty: -2,
        signalCodes: ["moderate_overexposure"]
      }
    ]
  );
  assert.equal(typeof payload.portfolioSummary.explanation, "string");
  assert.equal(payload.positions[0].confidenceLabel, payload.positions[0].decision.confidence.label);
  assert.ok(Array.isArray(payload.positions[0].explanations));
  assert.deepEqual(payload.positions[0].explanations, [payload.positions[0].decision.explanation]);
});
