# Why Historical ROA Was ~23% Too Low — and the Fix

## The Symptom

Every staking website consistently reported higher ROA for the same pools over the same epoch
ranges than what `epoch_agent` was computing. The gap was not random — it was a systematic
~23% underestimate across all pools.

---

## Root Cause

### Background: the Cardano reward formula

The reward pot for a pool in any epoch is:

```
gross = R/TAS × (S + A₀ × P) / (1 + A₀)
```

where:
- `R`   = total epoch reward pot (from reserve release + fees, after treasury cut)
- `TAS` = total network active stake
- `S`   = pool active stake
- `P`   = pool pledge
- `A₀`  = pledge influence parameter (0.3, a protocol constant)

The code defines `r = R / TAS` and calls `gross(S, P, r)` in `math.mjs`.

### What Koios actually returns for `total_rewards`

The `epoch_info` endpoint on Koios returns a field called `total_rewards`. The code was
computing:

```javascript
r = info.totalRewardsAda / info.activeStakeAda   // WRONG
```

The assumption was that `totalRewardsAda` equals `R` — the full epoch reward pot.

**It does not.** Koios `total_rewards` is the **sum of rewards actually distributed** to all
staking credentials that epoch. Because of the pledge-influence mechanism, a significant
fraction of `R` is deliberately never distributed — it returns to the reserve each epoch
(this is the protocol's incentive for operators to pledge). The amount actually distributed is
approximately:

```
total_rewards_koios ≈ R × (1 + A₀ × avgPledgeFraction) / (1 + A₀)
                    ≈ R / (1 + A₀)     [when average pledge fraction is small]
                    ≈ R / 1.3
```

So `r_koios ≈ R / (1.3 × TAS)` — already reduced by the same `1/(1+A₀)` factor that
`gross()` also divides by. **The penalty was being applied twice**, making `gross` come out
at roughly `1/1.3² ≈ 59%` of the correct value and delegator ROA roughly 77% of actual.

### Verified with on-chain data (epoch 624)

| Quantity | Value |
|---|---|
| Network active stake | 21.75 B ADA |
| Koios `total_rewards` | 6.695 M ADA |
| `r` as computed by old code | 0.00030785 |
| Pool active stake | 45.18 M ADA |
| Pool blocks minted / expected | 45 / 44.13 (perf 1.020) |
| **Actual pool reward pot** | **13,975 ADA** |
| Formula output (old `r`) | 10,910 ADA → **1.72 %/yr ROA** |
| Formula output (corrected `r`) | 14,183 ADA → **2.24 %/yr ROA** |
| Koios own `epoch_ros` field | **2.23 %/yr** |

The corrected formula matches Koios's own reported ROA to within 0.009 percentage points.
The old formula was off by 23%.

---

## The Fix

Multiply `r` by `(1 + A₀)` wherever it is derived from Koios `total_rewards`, so that the
formula receives `R / TAS` (the full pot rate) rather than the distributed-rewards rate.

### 1. `koios.mjs` — `fetchRecentR` (projected ROA)

Added import:
```javascript
import { A0 } from './math.mjs';
```

Changed in `fetchRecentR`:
```javascript
// Before
const r = info.totalRewardsAda / info.activeStakeAda;

// After
const r = info.totalRewardsAda / info.activeStakeAda * (1 + A0);
```

### 2. `classify.mjs` — `computeHistoricalROA` (historical ROA)

Changed in `computeHistoricalROA`:
```javascript
// Before
const r_i = net.totalRewardsAda / net.activeStakeAda;

// After
const r_i = net.totalRewardsAda / net.activeStakeAda * (1 + A0);
```

---

## Why Stake Snapshot Lag Was Not the Cause

Another AI suggested that "active stake lagging by two snapshots" was the dominant reason
for the discrepancy. This is incorrect for this codebase:

- For **historical ROA**: `fetchPoolHistory` returns per-epoch `active_stake` for each past
  epoch. This historical value already IS the snapshot-based stake that Cardano actually used
  for rewards in that epoch — the lag is baked into the historical record.
- For **projected ROA**: `fetchPoolsInfo` returns `active_stake` (not `live_stake`), which
  is already the current epoch's snapshot. There is no uncorrected lag.

The stake snapshot issue would only matter if the code were using live (non-snapshot) stake
as a denominator, which it is not.

---

## Impact

All ROA figures computed by the epoch agent — projected ROA, historical ROA, weighted
portfolio ROA before/after — were systematically ~23% below the true values before this fix.
After the fix they align with on-chain data and with third-party staking explorers.
