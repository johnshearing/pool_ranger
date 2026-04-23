# Why Do Real Pools Underperform the SPO Reward Model?

**Question asked:** I put the values of two pools into the interactive chart and noticed
that the pools underperform what the model predicts. I think this is prevalent but I can't
be sure without checking more pools. Is there any reason you can think of that makes real
pools underperform in comparison to the model?

---

## Answer

The model assumes ideal conditions. Real pools fall short for several reasons:

### 1. Block Production Variance (biggest factor for small/medium pools)

Blocks are assigned probabilistically via a lottery. If a pool is expected to produce
~1.5 blocks per epoch on average, it will produce 0 blocks in some epochs and 3 in others.
The model shows the long-run expectation; any snapshot period has high variance. Small pools
can go several epochs earning nothing.

### 2. The Epoch Rate r Is Declining

The `r ≈ 0.000548` is a current estimate, but it drifts downward every epoch as the ADA
reserve depletes. If the `r` value you used was calibrated on data from even 6 months ago,
the model overestimates absolute rewards.

### 3. Pool Performance — Missed Slots

Node downtime, relay issues, or slot battles (two pools assigned the same slot) mean the
pool doesn't produce every block it is assigned. The model assumes 100% performance.

### 4. Delegation Is Never Stable

The model uses a fixed `S`. Real pools have delegators entering and leaving. Rewards are
computed from a snapshot taken at the start of each epoch, so a delegator who left
mid-epoch still affects the snapshot, and a new delegator won't earn for 2 epochs after
joining.

### 5. The Model Ignores the Cross-Term Near Saturation

For pools that are large relative to `S_sat`, the full Cardano formula has a small
correction term that the model omits. This slightly overestimates rewards at high pledge
combined with high delegation.

### 6. Treasury and Fee Sampling Errors

`r` should already reflect the post-treasury distribution (20% of epoch rewards go to
treasury first), but if someone derived it from raw reserve data without accounting for
the treasury cut, the model starts too high.

---

## Summary

The most common real-world cause of consistent underperformance vs the chart is **block
variance** — especially for pools under about 5 M total stake, where the expected blocks
per epoch is less than 1. A pool with modest pledge and delegation might only expect to
produce a block every 2–3 epochs, making per-epoch ROA highly unpredictable even if the
long-run average matches the model.

To get a fair comparison, collect realized rewards over at least 10–20 epochs and compare
the average to the model's prediction, rather than comparing any single epoch.
