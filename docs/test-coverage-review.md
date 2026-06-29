# Test Coverage Review

Current baseline:

- `npm test` passes with `20/20` tests.
- Existing coverage is strongest around:
  - `scoring.service`
  - `explanation.service`
  - happy-path `scenario.service`
  - happy-path `sell-analysis.service`
  - ranking behavior in `decision-engine.service`

This note only recommends additions that would increase confidence without duplicating what already exists.

## Already Covered Well

### `DecisionEngineService`

Current tests already cover:

- top performer ranking
- worst performer ranking
- overexposure ranking inclusion
- explanation presence
- confidence label population

### `ScenarioService`

Current tests already cover:

- 3 scenario outputs
- expected nominal values
- inflation-adjusted range presence and ordering

### `SellAnalysisService`

Current tests already cover:

- short-term profitable position -> `booking_profit`
- long-term profitable but below target -> `hold_for_long_term`

## Recommended Additions

## `DecisionEngineService`

### 1. Empty portfolio payload

Why it matters:

- This is the cleanest edge case for dashboard bootstrapping and new users.
- It verifies the service returns stable empty arrays instead of crashing on ranking logic.

Suggested assertions:

- `positions` is `[]`
- `rankings.topPerformers` is `[]`
- `rankings.worstPerformers` is `[]`
- `rankings.overexposure` is `[]`
- `portfolioSummary.explanation` is still a string or `null`, but never throws

Suggested test name:

```js
test("decision engine handles an empty portfolio without ranking errors", () => {})
```

### 2. Deterministic tie-breaking on equal `finalScore`

Why it matters:

- Ranking order is otherwise hard to reason about in interviews and UI snapshots.
- The implementation uses symbol-based tie-breaking, but that behavior is not currently locked in by tests.

Suggested assertions:

- two or more positions with identical `finalScore` are ordered alphabetically by `symbol`
- tie behavior applies to both `topPerformers` and `worstPerformers`

Suggested test name:

```js
test("decision engine breaks ranking ties alphabetically by symbol", () => {})
```

### 3. Overexposure fallback when scoring metadata is incomplete

Why it matters:

- `buildDecisionPayload` has fallback logic that recomputes overexposure from `allocationPct`
- this is exactly the sort of defensive behavior that can regress silently

Suggested assertions:

- if `portfolioSignals.overexposureSeverity` is missing but `allocationPct >= 40`, the position still appears in `rankings.overexposure`
- penalty is derived from allocation rather than crashing or returning `undefined`

Suggested test name:

```js
test("decision engine derives overexposure from allocation when scoring metadata is missing", () => {})
```

## `ScenarioService`

### 1. Boundary case: `years = 0`

Why it matters:

- This is the clearest duration boundary.
- Even if route validation blocks it, the service can still be called directly by tests or future internal code.

Suggested assertions:

- all nominal future values equal the principal
- all inflation-adjusted values also equal the principal when `includeInflation=true`
- min and max ranges collapse to the same value

Suggested test name:

```js
test("scenario service returns principal unchanged when years is 0", () => {})
```

### 2. Boundary case: `inflationRate = 0`

Why it matters:

- It verifies the inflation branch without changing the value.
- Good guard against accidental divide/multiply mistakes.

Suggested assertions:

- `inflationAdjustedFutureValue === nominalFutureValue` for every scenario
- inflation-adjusted min/max match nominal min/max

Suggested test name:

```js
test("scenario service keeps real and nominal values equal when inflation rate is 0", () => {})
```

### 3. Extreme values stay finite and ordered

Why it matters:

- Large principals and long horizons are realistic stress cases for scenario math.
- This is a better confidence test than repeating another happy-path example.

Suggested assertions:

- outputs remain finite numbers
- `conservative < moderate < aggressive`
- range min/max are still coherent

Suggested test name:

```js
test("scenario service keeps projections finite and ordered for large inputs", () => {})
```

### 4. Invalid-input handling belongs at the route/validator level

Why it matters:

- `ScenarioService` itself does not throw domain errors for invalid numbers.
- meaningful error-handling coverage should be added where validation actually happens

Recommended integration cases for `/api/portfolio/scenarios`:

- `principal: 0` -> `400 VALIDATION_ERROR`
- `years: 0` -> `400 VALIDATION_ERROR`
- `inflationRate: -1` -> `400 VALIDATION_ERROR`

## `SellAnalysisService`

### 1. Boundary case: exactly `365` holding days

Why it matters:

- This locks down the long-term threshold edge.

Suggested assertions:

- `holdingDurationDays = 365` -> `classification.holdingType === "long_term"`

Suggested test name:

```js
test("sell analysis treats exactly 365 days as long-term", () => {})
```

### 2. Boundary case: exact profit thresholds

Why it matters:

- The current implementation uses inclusive thresholds.
- This is a high-signal boundary and more valuable than another generic profitable example.

Suggested assertions:

- short-term `profitLossPct = 12` -> `booking_profit`
- long-term `profitLossPct = 20` -> `booking_profit`

Suggested test name:

```js
test("sell analysis books profit at exact short-term and long-term thresholds", () => {})
```

### 3. Flat position at `0%` return

Why it matters:

- It exercises the third branch in the profit/loss signal logic: `position_flat`.
- That branch is not covered today.

Suggested assertions:

- `profitLoss === 0`
- `profitLossPct === 0`
- reason codes include `monitor_position` for short-term or `long_term_window_active` for long-term
- `signals.profitable === false`
- `signals.lossMaking === false`

Suggested test name:

```js
test("sell analysis marks a flat position correctly", () => {})
```

### 4. Loss-making path with meaningful downside

Why it matters:

- Current tests only cover profitable scenarios.
- A direct negative-return unit test would make the loss path explicit.

Suggested assertions:

- `profitLoss < 0`
- `signals.lossMaking === true`
- suggestion remains non-profit-booking
- reason codes include `position_in_drawdown`

Suggested test name:

```js
test("sell analysis preserves drawdown signals for loss-making positions", () => {})
```

### 5. Invalid-input handling belongs at the route/validator level

Why it matters:

- `SellAnalysisService` is calculation-focused and assumes validated inputs.
- route-level tests are the meaningful place to assert API behavior

Recommended integration cases for `/api/portfolio/sell-analysis`:

- `buyPrice: 0` -> `400 VALIDATION_ERROR`
- `quantity: 0` -> `400 VALIDATION_ERROR`
- `currentPrice: 0` -> `400 VALIDATION_ERROR`
- `holdingDurationDays: -1` -> `400 VALIDATION_ERROR`

## Not Worth Adding

These would mostly duplicate current coverage:

- another decision-engine happy-path ranking test with different symbols only
- another scenario test that simply restates the existing `100000 / 2 years / inflation on` case
- another profitable sell-analysis example that does not hit a boundary

## Recommended Order

If only a few tests are added, the highest-value sequence is:

1. `SellAnalysisService`: flat position and exact threshold boundaries
2. `DecisionEngineService`: empty portfolio and tie-breaking
3. `ScenarioService`: `inflationRate = 0` and large-input stability
4. validator/integration tests for invalid inputs on scenario and sell-analysis endpoints
