# Pre-GitHub Release Audit — Stock Insights

**Date:** 10 November 2026
**Repository:** `aniruddhaad/stock-insights`
**Branch:** `main`
**Latest verified remote commit before this audit update:** `5c9d509`
**Scope:** repository inventory, architecture/code review, test execution, documentation, Git hygiene and staged publication.

## Executive result

The architecture, roadmap, README and expanded unit-test baseline are now published to GitHub. The repository is **not yet production-ready**: security hardening, clean-clone/CI reproducibility, API contract parity, market-data provenance and external integration validation remain open.

## Published commits

| Commit | Contents |
|---|---|
| `c6bfeb8` | Current architecture and engineering roadmap |
| `b5383a8` | README aligned with actual implementation and linked to architecture/roadmap |
| `7aa7965` | Expanded test suite, corrected test ignore rules and refreshed coverage review |

All three commits were pushed to `origin/main` and the remote was verified synchronized after each push.

## Verified implementation

- Runtime: Express 5 / Node.js / Mongoose / MongoDB with static HTML, CSS, vanilla JavaScript and Bootstrap.
- API route groups: auth, debug, stocks, portfolio, import, broker and transactions, plus health.
- Decision, scoring, fundamental analysis, market data, sell/scenario, portfolio and broker-ingestion services exist.
- Provider code exists for Samco, Zerodha, generic CSV, Samco CSV and Zerodha CSV.
- AI News is a separate Express service. Current sentiment logic is keyword matching and default content is mock news.
- Fundamental analysis explicitly returns not-implemented assessments for financial companies.
- Call-site inspection confirms the fundamental analysis service and score adapter are not invoked by the live portfolio decision path; current scoring's `fundamentalScore` uses holding duration.
- Full unit suite: **118 passed, 0 failed**.
- Samco Excel integration test: **1 passed, 0 failed**.
- Syntax sweep: **98 JavaScript files** checked with `node --check`; 0 syntax failures in the latest run.
- Fresh GitHub clone: `npm ci` succeeded and `npm test` passed **118/118** without a local `.env`.
- The separate Samco integration script failed in the clean clone before test setup because `MONGO_URI` was not configured; it passed in the original local environment.
- `npm audit` reported **10 vulnerabilities** in the installed dependency tree: 2 critical, 6 high and 2 moderate. No dependency changes or automatic fixes were applied.
- OpenAPI YAML syntax parsed successfully; route/schema parity remains incomplete.
- OpenAPI currently lists 9 paths while the route inventory includes additional import, broker, transaction and debug endpoints.

## Published documentation and test baseline

- `README.md` now describes the actual browser frontend, test runner, news-sentiment limitations, market-data fallback and known security gaps.
- `docs/architecture.md` documents current component topology, request/data flows, service boundaries and known operational/security gaps.
- `docs/roadmap.md` records evidence-based Done/Partial/Not started states and prioritized release gates.
- `docs/test-coverage-review.md` documents the verified 118-test baseline and remaining test gaps.
- The blanket `tests/*` ignore rule was removed, and 10 additional test files are now tracked. The published suite contains 17 `*.test.js` files plus the separate Samco Excel integration script.

## Findings

### Critical / high priority

1. **Clean-clone and CI reproducibility:** fresh-clone `npm ci` + `npm test` is verified (118/118). The separate Samco integration script needs `MONGO_URI` and the workbook; a clean-clone run without `MONGO_URI` fails before test setup. A CI workflow is not yet established.
2. **Unsafe JWT fallback:** `src/config/env.js` falls back to a hard-coded JWT secret. Production must fail closed when a strong secret is absent.
3. **Broker credentials are not encrypted at rest:** `BrokerConnection.credentials` is persisted as a Mixed field. JSON serialization omits it, but that is not encryption.
4. **CORS is unrestricted:** `src/app.js` calls `cors()` without an origin allowlist.
5. **Token storage is localStorage:** this increases exposure if browser XSS occurs; assess HttpOnly secure cookies and CSRF protection.
6. **Debug endpoints and broker-sync logging need production hardening:** confirm authorization, redaction and operational auditability.
7. **Dependency vulnerabilities:** `npm audit` reports 10 findings (2 critical, 6 high, 2 moderate), all with a fix available according to npm. These have not been remediated.
8. **Rate limiting and security regression tests** are not yet established as release gates.

### Documentation and API contract

- Previous README advertised React 19; current UI is static HTML/vanilla JS/Bootstrap. README corrected and published.
- Previous README advertised Jest; package scripts use Node's built-in `node:test`. README corrected and published.
- Current OpenAPI file documents only a subset of implemented routes. Broker, transaction, import and debug routes need contract definitions and validation.
- The test coverage review has been refreshed and published.
- Architecture and roadmap documents are published and linked from README.

### Product/model limitations

- Financial-company fundamental analysis is explicitly not implemented.
- Fundamental analysis/import and score-adapter modules exist, but call-site inspection confirms they are not wired into the live decision path. Current `fundamentalScore` is derived from holding duration.
- AI News currently performs keyword sentiment classification using mock headlines by default; it is not a production AI or verified news pipeline.
- Market data has live/stored/mock fallback behavior; stale/mock data must be clearly identified and excluded from authoritative investment conclusions.
- Broker integrations require real provider contract/reconciliation tests before production-readiness claims.

## Release checks

- [x] Review and publish the additional intended test files; exclude the empty placeholder.
- [x] Run the full local unit suite: 118 passed.
- [x] Run the separate Samco Excel integration test with the original local database configuration (1/1 passed).
- [ ] Configure a safe `MONGO_URI` and workbook path for the Samco integration test in a clean clone.
- [x] Validate OpenAPI YAML syntax.
- [x] Publish architecture, roadmap, README and test-coverage documentation.
- [x] Run `npm ci` and `npm test` from a clean clone of the pushed GitHub branch (118/118 passed).
- [ ] Add CI workflow and ensure it runs the same checks.
- [ ] Review and remediate the 10 dependency vulnerabilities reported by `npm audit` (2 critical, 6 high, 2 moderate).
- [ ] Compare every implemented API route with the OpenAPI specification and validate response schemas.
- [ ] Resolve security release gates: JWT secret validation, credential encryption, CORS allowlist, rate limits, debug access and logging.
- [ ] Review `.env.example` and confirm no real credentials or personal data are tracked.
- [ ] Complete final diff and secret scan before any production release.

## Current decision

**Documentation and test-baseline publication: complete. Production-readiness audit: open.**

GitHub currently contains the architecture, roadmap, updated README and expanded test suite. The latest verified remote commit is `7aa7965`. The only remaining uncommitted change intended for the next documentation publication is this updated audit file; security remediation has not been started, in accordance with the user's instruction to defer it.
