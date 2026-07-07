# Scoring calibration TODO

Score calibration was intentionally left unchanged during the recommendation-source consolidation.

Repeated values such as `9.35` are possible because the current inputs have low cardinality:

- the technical score comes from five profit/loss bands;
- the fundamental score comes from four holding-duration bands;
- sentiment is normally one of `-2`, `0`, or `2`;
- portfolio signals use a small set of gain, drawdown, and concentration states;
- weighted contributions are rounded before the final sum is clamped to `0–10`.

Different companies can therefore produce identical component tuples and identical final scores. A future calibration task should introduce genuinely continuous company and market inputs, then review rounding and clamping. This refactor does not change those bands or weights.
