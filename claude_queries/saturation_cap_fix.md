## Question

I am looking at the interactive chart. I notice that there is no change in either curve as they pass through the vertical saturation line. I am surprised because I have been told that there is a real disadvantage when delegating to over-saturated pools. Is the chart incorrect or is my understanding of saturation incorrect?

## Answer

Your understanding of saturation is correct — and the chart had a bug.

### What Cardano Protocol Actually Does at Saturation

When a pool's total stake (pledge + external delegation) exceeds the saturation threshold S_sat ≈ 75 M ADA, the Cardano protocol **caps the pool's gross reward at the saturation level**. Adding more delegation beyond that point earns no additional gross reward for the pool. Because the reward pot stops growing while it is split among an ever-larger group of delegators, each delegator's per-ADA return (ROA) falls. This is the real, mathematical disadvantage of over-saturation.

### What the Chart Was Doing Wrong

The chart correctly drew a dashed orange vertical line at the saturation point, but the reward math behind both curves **never consulted that line**.

The reward calculation lived in a single JavaScript function:

```javascript
// Before fix — no saturation cap
function gross(S, P, r) {
  return r * (S + A0 * P) / (1 + A0);
}
```

`S_SAT` was defined as a constant (`const S_SAT = 75e6`) but was only referenced by the code that drew the visual line. It was never used in any arithmetic. As a result:

- The SPO income curve kept rising linearly past the orange line.
- The delegator ROA curve continued its gradual decline past the orange line, with no visible change in slope.
- Neither curve showed the behavioral break that Cardano protocol actually imposes.

The companion document even acknowledged this as a known limitation at the time.

### The Fix

One line was added to `gross()` to cap `S` at `S_SAT` before computing rewards:

```javascript
// After fix — saturation cap applied
function gross(S, P, r) {
  const S_capped = Math.min(S, S_SAT);
  return r * (S_capped + A0 * P) / (1 + A0);
}
```

No other functions needed changing. The downstream functions `spoIncome()` and `delegROA()` already structured their math correctly:

- `spoIncome()` calls `gross()` and passes the result through the fixed-fee and margin logic. Once `gross()` is capped, `spoIncome()` naturally plateaus.
- `delegROA()` calls `gross()` for its numerator but divides by the actual total stake `S` (not `S_capped`) for its denominator. So after saturation the numerator goes flat while the denominator keeps growing — ROA falls more steeply, exactly as protocol dictates.

### What the Chart Now Shows

| Region | SPO Income Curve | Delegator ROA Curve |
|--------|-----------------|---------------------|
| Below saturation line | Rises with delegation | Declines gradually (pledge dilution) |
| At saturation line | **Flattens — becomes horizontal** | **Falls more steeply** |
| Beyond saturation line | Stays flat | Continues falling |

The orange saturation line now marks the exact point where both curves visibly change behavior, matching real Cardano staking economics.

### Files Changed

| File | Change |
|------|--------|
| `SPO_REWARD_ANALYSIS_CHART.html` | Added `Math.min(S, S_SAT)` cap inside `gross()` (line 336) |
| `SPO_REWARD_ANALYSIS_CHART_COMPANION.md` | Updated the saturation cap row in the Limitations table (line 680) to reflect correct behavior |
