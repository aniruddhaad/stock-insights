# Stock Insights — Product & Engineering Roadmap

**Last reviewed:** 10 November 2026  
**Source of truth:** implementation audit of the local `main` checkout. Status labels are evidence-based, not inferred from README claims.

## Status definitions

- **Done:** implementation exists and relevant automated tests pass.
- **Partial:** foundation or a subset exists; end-to-end behavior or production readiness is not established.
- **Not started:** no implementation was identified in this repository audit.
- **Blocked / release gate:** must be resolved before production credentials or a public production launch.

## P0 — Release gates (resolve before production use)

| Work item | Status | Acceptance criteria |
|---|---|---|
| Remove hard-coded JWT secret fallback | Blocked | Production startup fails if secret is missing/weak; local development uses explicit dev config |
| Encrypt broker credentials at rest | Blocked | Encryption with managed key/rotation; credentials never appear in logs/API/errors |
| Restrict CORS | Partial | Environment allowlist and tests for allowed/disallowed origins |
| Authentication abuse protection | Not verified | Rate limit login/signup and sensitive endpoints; test lockout/abuse behavior |
| Review token storage and XSS posture | Partial | CSP/output encoding review; decide secure HttpOnly cookie migration and CSRF controls |
| Protect debug and broker-sync operations | Partial | Admin/owner authorization, audit trail, safe logging |
| Reproducible tests from clean clone | Blocked | Remove blanket test ignore; commit intended tests; clean clone runs same test suite |

## P1 — Product correctness and trustworthy insights

| Work item | Status | Acceptance criteria |
|---|---|---|
| Non-financial fundamental analysis | Partial — standalone module only | Wire imported fundamentals into user-facing portfolio analysis; validate source freshness, missing values and sector context |
| Financial-company fundamental model | Not started | Separate bank/NBFC/insurance metrics (capital adequacy, asset quality, NIM, GNPA/NNPA, solvency, etc. as applicable); never reuse industrial ratios |
| Fundamental score integration | Not started — adapter is currently unused by runtime | Connect analysis and capped adjustment into scoring/decision flow with tests, provenance and user-visible explanation |
| Scoring model redesign and calibration | Deferred / material model gap | Replace P/L-derived pseudo-technical and holding-duration pseudo-fundamental bands with validated chart indicators and company financial metrics; evaluate sentiment provenance, backtest calibration, document weights and validation dataset |
| Decision consistency | Done at service level | Maintain one authoritative action/explanation; add route/UI contract tests |
| Market data freshness and fallback safety | Partial | Persist quote timestamp/source; stale quote policy; mock values clearly excluded from investment-grade output |
| News/sentiment provenance | Partial | Replace mock headlines with licensed/current sources; include publisher/time/link; classifier quality evaluation and neutral fallback |
| Samco historical sync | Partial | Sandbox/live contract tests, pagination/date-window reconciliation, retries, idempotency and reconciliation report |
| Zerodha integration | Partial foundation | Verify supported login/session flow, real API permissions, historical trades/holdings sync and contract tests |
| Import reconciliation | Partial | Preview/commit parity, fees/taxes, corporate actions, split/bonus handling, duplicate and correction workflows |

## P2 — Platform completeness

| Work item | Status | Acceptance criteria |
|---|---|---|
| OpenAPI parity | Partial | Document every implemented auth, stock, portfolio, transaction, import, broker, debug and health endpoint; validate spec in CI |
| API integration tests | Partial | Exercise authenticated HTTP routes, ownership boundaries, validation, error envelopes and database behavior |
| CI pipeline | Not identified | GitHub Actions installs dependencies, runs syntax checks and tests on clean checkout |
| Deployment configuration | Partial | Reproducible deployment, health/readiness checks, environment validation and documented rollback |
| Observability | Partial | Structured logs, correlation IDs, request/error metrics, dependency health and sensitive-field redaction |
| Database lifecycle | Partial | Index review, backup/restore procedure, schema evolution/versioning and retention policy |
| UI test coverage | Partial | Browser-level smoke tests for login, portfolio, imports, broker status and insights |

## P3 — Product expansion (after correctness and security)

- Dividend and corporate-action tracking.
- Benchmark comparison against appropriate Indian market indices.
- Portfolio-level risk analytics (volatility, drawdown, beta, sector and factor concentration).
- Goal-based planning and cash-flow aware projections.
- Rebalancing simulation with tax/transaction-cost assumptions.
- Watchlists and configurable alerts.
- Scheduled portfolio reports and notifications.
- More broker integrations after provider contracts and reconciliation are stable.

## Recommended execution sequence

1. Correct test tracking and verify clean-clone reproducibility.
2. Resolve security release gates: JWT configuration, broker credential encryption, CORS, rate limits, debug access and logging.
3. Verify fundamental adapter integration and add separate financial-sector assessment design.
4. Add market quote freshness/provenance and prevent mock data from influencing live investment decisions.
5. Replace mock news inputs with traceable sources and clearly label heuristic sentiment.
6. Complete broker sync contract/reconciliation tests for Samco and Zerodha.
7. Bring OpenAPI, README and CI into parity with actual routes.
8. Only then consider the repository production-ready; keep roadmap expansion separate from release readiness.

## Explicitly not part of the current implementation

The following should not be described as shipped until implemented and tested: React frontend, Jest test runner, automated order execution, real-time exchange-grade market feed, production LLM news analysis, full financial-sector fundamental analysis, portfolio benchmarking, dividends, goal planning, Kubernetes deployment.
