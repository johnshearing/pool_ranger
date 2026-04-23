# Pool Ranger Epoch-by-Epoch Delegation Agent

## Overview

Every epoch, Pool Ranger runs an automated agent that:

1. Pulls current parameters and delegation levels for every pool in the candidate list via Blockfrost.
2. Runs the reward math on each pool to determine whether the pool is in a red zone, and if so, where the trough is.
3. Decides whether to add delegation, remove delegation, or hold for each pool.
4. Ranks safe pools by delegator ROA at the proposed new delegation level.
5. Outputs a delegation adjustment plan for the administrator to execute.

The agent never replaces human judgment — it produces a ranked recommendation list. The
administrator reviews it and approves execution.

---

## Data Pulled Each Epoch (Blockfrost)

For each candidate pool:

| Field | Blockfrost endpoint |
|---|---|
| Pledge `P` | `/pools/{pool_id}` → `declared_pledge` |
| Fixed fee `F` | `/pools/{pool_id}` → `fixed_cost` |
| Margin `m` | `/pools/{pool_id}` → `margin_cost` |
| Active stake `S_total` | `/pools/{pool_id}` → `active_stake` |
| Pool Ranger's own delegation to this pool | tracked internally |

External delegation is computed as `S_total − P`.

The current epoch rate `r` is fetched from `/epochs/latest/parameters` → `nopt` and
`/epochs/latest` → `active_stake` to derive the current per-epoch rate, or it can be
set manually in the agent's config and updated quarterly.

---

## Core Math (Same as the Chart)

```
A          =  r × a₀ × P / (1 + a₀)               pledge bonus
m_min      =  (A − F) / (r × P − F)               min safe margin (when A > F)
S_trough   =  √[ P·(1−m)·(A−F) / (m·r/(1+a₀)) ]  total stake at trough
ext_trough =  S_trough − P                         external delegation at trough

Red zone exists when:  A > F  AND  m < m_min
Trough index:          ext_trough  (only meaningful when red zone exists and m > 0)
```

Constants: `a₀ = 0.3`, `EPOCHS_PER_YR = 73`

```
delegROA(S)  =  (1−m) × (gross(S,P) − F) / S × 73 × 100%
gross(S,P)   =  r × (S + a₀·P) / (1 + a₀)
```

---

## Decision Logic Per Pool

### Step 1 — Classify the pool

```
A = pledgeBonus(P, r)

if A ≤ F:
    classification = ALL_GREEN        # no red zone at any delegation level
elif m ≥ mMin(P, F, r):
    classification = ALL_GREEN        # margin is high enough — no red zone
elif m == 0:
    classification = ALL_RED          # entire curve is red
else:
    classification = HAS_RED_ZONE
    ext_trough = S_trough - P         # trough is at this external delegation level
```

### Step 2 — Evaluate current cursor position

```
current_ext = S_total - P             # current external delegation (not counting Pool Ranger)
pool_ranger_stake = (known internally)
proposed_ext = current_ext + pool_ranger_stake_change
```

### Step 3 — Delegation decision

**Case: ALL_GREEN**
- Adding delegation: always cooperative. Proceed to ROA ranking.
- Removing delegation: evaluate ROA impact. Only remove if a better pool is available.

**Case: ALL_RED (m = 0)**
- Do not delegate. The SPO earns less with every delegator across the full range.
- If Pool Ranger is currently delegating to this pool, withdraw completely.
  The SPO's income will improve when Pool Ranger leaves.

**Case: HAS_RED_ZONE**

Sub-case A — cursor is already past the trough (`current_ext > ext_trough`):
- The pool is in the green zone. Adding delegation moves the SPO further right and up.
- Treat as ALL_GREEN for delegation purposes.
- Note: removing delegation would push the pool back toward or into the red zone — avoid.

Sub-case B — cursor is before the trough (`current_ext ≤ ext_trough`):
- Adding delegation moves deeper into the red zone unless we can clear the trough.
- Check: does `current_ext + pool_ranger_available_stake > ext_trough`?
  - **Yes:** A single delegation move clears the trough. Net effect is positive for the SPO.
    The SPO passes through the dip but lands in better shape. Acceptable.
  - **No:** Pool Ranger's stake is insufficient to clear the trough. Adding it deepens the
    harm. **Do not delegate.** Consider withdrawing any existing delegation to improve
    the SPO's income.

### Step 4 — ROA ranking (among safe pools)

After filtering to pools where delegation is cooperative (ALL_GREEN or trough-clearing),
rank by:

```
ROA at proposed delegation level  =  delegROA(P + proposed_ext, P, F, m, r)
```

Allocate Pool Ranger's total available stake to the top-ranked pools, respecting:
- Saturation cap: `proposed_ext ≤ S_sat − P`
- Minimum meaningful delegation (avoid spreading stake so thin it costs more in fees than
  it earns in ROA improvement)

---

## Output Format

The agent produces a per-epoch report:

```
Pool Ranger Delegation Report — Epoch NNNN
==========================================

PROPOSED CHANGES
----------------
Pool ABC123  (P=5M, F=340, m=15%)
  Current ext delegation:  12.0 M ADA
  Pool Ranger stake:        2.0 M ADA  →  no change
  Classification:           ALL_GREEN (m > m_min)
  ROA at 14.0 M:            3.04 %/yr
  Recommendation:           HOLD

Pool DEF456  (P=3.4M, F=170, m=0.9%)
  Current ext delegation:  70.0 M ADA
  Pool Ranger stake:        1.5 M ADA  →  no change
  Classification:           HAS_RED_ZONE (trough at 11.8M ext)
  Cursor position:          PAST TROUGH — green zone
  ROA at 71.5 M:            2.87 %/yr
  Recommendation:           HOLD (near saturation — monitor)

Pool GHI789  (P=5M, F=340, m=0%)
  Current ext delegation:   4.0 M ADA
  Pool Ranger stake:        0.5 M ADA  →  WITHDRAW
  Classification:           ALL_RED (m = 0)
  Note:                     SPO income falls with every delegator.
                            Withdrawing 0.5M ADA increases SPO income.
  Recommendation:           WITHDRAW ALL

NEW CANDIDATE POOLS
-------------------
Pool JKL012  (P=2M, F=340, m=3%)
  Current ext delegation:   8.0 M ADA
  Pool Ranger available:    1.0 M ADA to add
  Classification:           ALL_GREEN (P < 2.7M threshold)
  ROA at 9.0 M:             3.21 %/yr
  Recommendation:           ADD 1.0 M ADA  ← highest ROA among safe candidates

SUMMARY
-------
Withdrawals:  Pool GHI789 — 0.5 M ADA freed
Additions:    Pool JKL012 — 1.0 M ADA (net 0.5 M from other sources)
Net ROA improvement:  +0.12 %/yr weighted average across cooperative stake
```

---

## Epoch Timing and Snapshot Delay

Cardano reward snapshots are taken at the start of each epoch. A delegation change
submitted in epoch N takes effect at the snapshot for epoch N+2 and appears in rewards
at epoch N+3. The agent must account for this lag:

- Changes submitted this epoch affect rewards three epochs from now.
- Do not double-count a pending delegation change that has not yet settled.
- Track in-flight delegations internally and subtract them from available-to-deploy stake.

---

## Caveats and Constraints

| Item | How the agent handles it |
|---|---|
| `r` varies | Re-fetch or manually update `r` each quarter. A stale `r` can misclassify a pool. |
| `a₀` is governable | If governance changes `a₀`, recompute all classifications before the next epoch run. |
| Block production variance | The agent optimizes expected ROA, not realized ROA. Short-epoch variance is normal. |
| Pool parameter changes | SPOs can change `m` and `F` at any time. Always re-fetch before each epoch run. |
| Saturation | Never propose delegation that would push a pool above `S_sat`. Cap proposals at `S_sat − S_total`. |
| Pool Ranger stake concentration | Avoid putting more than ~20% of cooperative stake in any single pool to limit correlated risk. |

---

## Integration with Pool Ranger Scripts

The agent calls existing Pool Ranger infrastructure:

- `_view_wallet_balances.mjs` — to know available stake
- Blockfrost API — to fetch pool parameters and current delegation for all candidate pools
- `_delegate.mjs` — to execute approved delegation changes
- The same math functions from the interactive chart (`gross`, `spoIncome`, `delegROA`,
  `pledgeBonus`, `mMin`, `troughExtDelegIndex`) ported to Node.js

The chart and the agent share identical math. Running the chart manually on any pool
produces the same classification and ROA numbers that the agent would compute automatically.
