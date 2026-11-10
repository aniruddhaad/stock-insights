# Test Coverage Review

**Last reviewed:** 10 November 2026

## Current baseline

- Test runner: Node.js built-in `node:test` (not Jest).
- Unit test command: `npm test` (`node --test --test-isolation=none tests/*.test.js`).
- Local inventory: 17 `*.test.js` files plus the separate Samco Excel integration script.
- Latest full unit run: **118 tests passed, 0 failed**.
- Separate Samco Excel integration run: **1 test passed, 0 failed**.
- Syntax sweep: 98 JavaScript files checked with `node --check`; 0 syntax failures.
- Git hygiene finding: before this audit, only 8 tests were tracked while the ignore rule excluded most of `tests/*`. The ignore rule has now been removed. The additional local tests must be included in the release diff and verified from a clean clone.

## Test areas present

- Company classification and sector normalization.
- Decision payload consistency and single authoritative explanation/action.
- Decision engine ranking.
- Fundamental analysis and data persistence/normalization.
- Fundamental score adapter and adjustment caps.
- Market-data source fallback behavior.
- Portfolio decision logic.
- Portfolio ingestion, broker adapters, normalization, deduplication, FIFO reconstruction and bootstrap transactions.
- Screener XLSX parsing and import.
- Scenario projections.
- Scoring weights, normalization and overexposure adjustments.
- Sell analysis.
- Transaction service.
- UI formatting.
- Separate Samco STAR Excel integration script.

## Gaps to close

1. **Clean-clone reproducibility:** commit all intended test files and run `npm ci` plus `npm test` from a fresh clone.
2. **HTTP/API integration:** add tests for auth, ownership isolation, validation, error envelopes, broker endpoints, imports and transactions.
3. **OpenAPI parity:** current OpenAPI file documents only a subset of implemented routes. Add broker, import, transaction and debug routes, and validate response schemas against actual controllers.
4. **Security tests:** verify missing/weak production JWT secret is rejected, CORS origin allowlist, auth rate limiting, credential redaction, and authorization on debug/sync endpoints.
5. **External integration contracts:** exercise Samco and Zerodha against safe fixtures or provider sandbox contracts, including pagination, partial failure and reconciliation.
6. **Market data:** test stale quote handling, timestamp/source propagation and ensure mock prices cannot be mistaken for live prices.
7. **Fundamentals:** test data freshness, sector-specific ratios, missing/inconsistent source data and add an end-to-end test once analysis/adapter are wired into the actual decision flow.
8. **AI News:** test service timeout, mock-vs-live provenance, malformed provider responses and neutral fallback behavior.
9. **Browser smoke tests:** login/signup, session expiry, dashboard, imports, broker status and insights rendering.

## Highest-value next tests

1. Clean-clone test run in CI.
2. API ownership and auth integration tests.
3. Broker credential redaction/encryption and route access tests.
4. Market-data stale/mock provenance tests.
5. Fundamental adapter end-to-end score contribution tests.
6. OpenAPI contract validation.

Do not describe the suite as complete merely because unit tests pass; the areas above remain material release gaps.
