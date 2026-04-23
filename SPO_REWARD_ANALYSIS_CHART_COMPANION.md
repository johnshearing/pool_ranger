# SPO Reward Analysis — Interactive Chart Guide

**Purpose:** Learn how delegation affects SPO income and delegator ROA by exploring the interactive chart directly.  
Every concept in this document can be verified live by adjusting the sliders in  
<a href="https://johnshearing.github.io/pool_ranger/SPO_REWARD_ANALYSIS_CHART.html">SPO_REWARD_ANALYSIS_CHART.html</a>  
Right click on the link above to open the chart in a new tab and keep it alongside this document.  

This document that you are reading now is the hands-on companion to the chart.  

The full mathematical derivations live in <a href="https://johnshearing.github.io/pool_ranger/SPO_REWARD_ANALYSIS.md">SPO_REWARD_ANALYSIS.md</a>.  
 

---

## Step 0 — Tour of the Interface

When you open the chart you will see four areas, top to bottom:

| Area | What it is |
|------|-----------|
| **Pool Parameters** panel | Four sliders: Margin, Pledge, Fixed Fee, Epoch Rate |
| **Metric cards** row | Five live readouts that update with every slider move |
| **Chart Cursor** panel | One slider that moves a red vertical line across the chart |
| **Chart** panel | Green curve = SPO income (left axis). Blue curve = Delegator ROA (right axis). Orange dashed line = saturation. |

### The five metric cards

| Card | What it shows |
|------|--------------|
| **Pledge Bonus A** (blue) | The fixed ADA the SPO earns per epoch from their own pledge alone |
| **Min Safe Margin m_min** (orange) | The minimum margin the pool must charge for delegation to always help the SPO |
| **Delegation Safety** | ✅ SAFE or ❌ AVOID — whether the current margin clears m_min |
| **SPO Income (at cursor)** (green) | ADA/epoch the SPO earns at the red cursor position |
| **Delegator ROA (at cursor)** (blue) | Annual % return for delegators at the red cursor position |

### The two chart curves

- The **green curve** traces SPO income as external delegation grows from 0 to 70 M ADA.
  The left y-axis belongs to it.
- The **blue curve** traces delegator annual ROA over the same range.
  The right y-axis belongs to it.
- The **red dashed cursor** marks the delegation level you choose with the bottom slider.
  Green and blue dots on the curves show the exact values at that position.

### Parameter Reference

| Symbol | Meaning | Current value |
|--------|---------|---------------|
| `r` | Per-epoch reward rate | ≈ 0.000548 (≈ 4 % / 73 epochs/yr) |
| `a₀` | Pledge influence factor | 0.3 (protocol parameter) |
| `k` | Target number of pools | 500 (protocol parameter) |
| `F` | Fixed fee (ADA / epoch) | 170 to 340 ADA (SPO-set, min enforced) |
| `m` | Margin (0% to 100%) | SPO-set |
| `P` | Pledge (ADA) | SPO-set |
| `S` | Total pool stake = P + external delegation | varies |
| `S_sat` | Saturation point ≈ active_stake / k | ≈ 65–75 M ADA (2026) |
| `A` | Pledge bonus per epoch (defined below) | derived |

> **Note:** `r` drifts downward over time as the reserve depletes. Recompute periodically
> from recent epoch data or use the current Cardano staking calculator rate.

---

## Step 1 — The Pledge Bonus

**What to do:**  
Set **Pledge = 0 M ADA**.  
Note the Pledge Bonus A card — it reads 0.  
Now slowly drag **Pledge** to the right toward 70 M ADA. Watch A climb.  

**What you are seeing:** 
The pledge bonus formula is:

```
A  =  r × a₀ × P / (1 + a₀)     (a₀ = 0.3, protocol constant)
```

A is a fixed ADA amount the SPO earns every epoch regardless of how many delegators join.
It does not grow as delegation grows — it only grows when the SPO increases their own pledge.

**Why it matters:** A is the engine of everything that follows. When A is large relative to
the fixed fee F, interesting (and counterintuitive) things happen to both curves.

---

## Step 2 — The Gross/Fixed-Fee Boundary

**What to do:** Set **Pledge = 1 M ADA**, **Fixed Fee = 340**, **Margin = 5 %**, **Epoch
Rate = 0.000548**.

Move the **Cursor** slider all the way left (External Delegation = 0). The SPO Income card
will show a small number — around 423 ADA. This is `gross(S=P)` when the pool has only the
SPO's own pledge staked.

Now read **Pledge Bonus A** — it shows roughly 127 ADA. Since A (127) < F (340), the pool
crosses the important threshold: **A ≤ F**. The banner reads ✅ SAFE.

Increase **Fixed Fee** above 340 and watch how quickly A < F holds. Increase **Pledge**
past about 2.7 M ADA and watch A cross above F.

**The 2.7 M ADA boundary:** Below this pledge, A ≤ F always holds and the banner is always
✅ SAFE at any margin. This threshold is:

```
P_safe  =  F × (1 + a₀) / (r × a₀)
         ≈  340 × 1.3 / (0.000548 × 0.3)
         ≈  2,690,000 ADA
```

---

## Step 3 — When Delegation Hurts the SPO (the U-shaped income curve)

This is the first major counterintuitive result: **more delegation can make the SPO worse
off**, not better.

### Reproducing the effect

Set these sliders:
- **Pledge = 5 M ADA**
- **Fixed Fee = 340**
- **Epoch Rate = 0.000548**
- **Margin = 0 %**

The banner immediately shows **❌ AVOID**. Now look at the green SPO-income curve — it
slopes steadily *downward* from left to right. Move the cursor from 0 to 70 M ADA and
watch the SPO Income card fall from about 2,740 ADA/epoch down toward 2,469 ADA/epoch.
Every new delegator makes the SPO worse off.

### Raise the margin to see the U-shape

Change **Margin to 5 %**. The banner still shows ❌ AVOID. But now the green curve has a
different shape — it dips to a minimum around 3 M external delegation, then climbs. This
is the U-shape: early delegation hurts, but eventually the margin income from a large pool
outweighs the pledge dilution.

Move the cursor left to 0 M: SPO income ≈ 2,740. Move it right to 3 M: SPO income dips
to about 2,700. Move further right to 70 M: SPO income climbs to about 3,810.

### Why this happens

The SPO earns from two sources: the margin cut of delegator rewards, and the pro-rata share
of the staker pool as the pledge holder. As delegation grows, the pledge fraction `P/S`
shrinks. When the margin is too low, that shrinking pledge fraction costs the SPO more than
the growing margin revenue brings in.

Taking the derivative of SPO income with respect to total stake S:

```
d(SPO)/dS  =  m × r/(1+a₀)          [margin term — always positive]
            + P × (1−m) × (F − A)/S² [pledge-dilution term — sign depends on A vs F]
```

When `A > F`, the pledge-dilution term is negative. If the margin is too small to overcome
it, the total derivative goes negative — more delegation, less SPO income.

---

## Step 4 — Finding the Safe Margin (m_min)

The minimum margin that keeps SPO income non-decreasing for all delegation levels is:

```
m_min  =  (A − F) / (r × P − F)     [only when A > F; otherwise m_min = 0]
```

The chart computes this live and shows it in the **Min Safe Margin** card.

### Watching the banner flip

With **Pledge = 5 M ADA**, **Fixed Fee = 340**, **Epoch Rate = 0.000548**:

- The **m_min card** will show approximately **12.22 %**.
- With **Margin = 5 %**: banner = ❌ AVOID, green curve has a dip.
- Slowly drag **Margin** upward. Watch the green curve flatten and the dip disappear.
- The moment you cross **Margin = 12.5 %** (the nearest slider step above 12.22 %):
  banner flips to **✅ SAFE**, and the green curve rises monotonically from left to right.

The banner checks exactly `m ≥ m_min`. It evaluates the entire curve from zero external
delegation to saturation — not just at the cursor position.

### The 23.1 % universal ceiling

Set **Pledge = 70 M ADA** (maximum). Note m_min — it is around 22.6 %. No matter how high
the pledge, m_min never reaches 23.1 %. Setting **Margin ≥ 23 %** guarantees ✅ SAFE for
any pool that exists:

```
Ceiling  =  a₀ / (1 + a₀)  =  0.3 / 1.3  ≈  23.08 %
```

---

## Step 5 — m_min at Different Pledge Levels

Use the chart as a lookup table. Set **Fixed Fee = 340**, **Epoch Rate = 0.000548**,
**Margin = 0 %**, then adjust Pledge and read m_min from the orange card:

| Pledge | Pledge Bonus A | A > F? | m_min (card) |
|-------:|---------------:|:------:|-------------:|
| 1 M ADA | ≈ 127 | No | 0 % |
| 2.5 M ADA | ≈ 317 | No | 0 % |
| 3 M ADA | ≈ 380 | Yes | ≈ 3.0 % |
| 5 M ADA | ≈ 632 | Yes | ≈ 12.2 % |
| 10 M ADA | ≈ 1,265 | Yes | ≈ 18.0 % |
| 20 M ADA | ≈ 2,529 | Yes | ≈ 20.6 % |
| 50 M ADA | ≈ 6,323 | Yes | ≈ 22.1 % |

**Notice:** each time you raise Pledge the green curve becomes more dramatically U-shaped
at low margins. Set **Margin = 5 %** and sweep **Pledge** from 3 M to 50 M to watch the
dip in the green curve grow deeper and the minimum shift rightward.

---

## Step 6 — When Delegation Reduces Delegator ROA (the blue curve)

This is the second major counterintuitive result: **delegator ROA can also fall as
delegation grows**, and this can happen even on a pool that shows ✅ SAFE.

### Reproducing the effect

Set:
- **Pledge = 5 M ADA**
- **Fixed Fee = 340**
- **Margin = 12.5 %** (banner = ✅ SAFE)
- **Epoch Rate = 0.000548**

The green SPO-income curve rises left to right — the pool is safe for the SPO. But now
look at the **blue delegator ROA curve** — it slopes gently *downward* from left to right.

Move the cursor from 0 to 70 M external delegation and watch the Delegator ROA card fall
from about 3.3 % at low delegation to about 2.9 % near saturation.

### Why ROA falls when A > F

Expanding the ROA formula:

```
ROA  =  (1 − m) × [ r/(1+a₀)  +  (A − F)/S ] × 73 × 100%
```

When `A > F`, the term `(A − F)/S` is positive but shrinks as S grows. Early delegators
benefit from a concentrated pledge bonus; as more delegators arrive they each claim a
smaller slice of that fixed bonus. The derivative is always negative:

```
dROA/dS  =  (1 − m) × [ −(A − F) / S² ] < 0   when A > F
```

Unlike SPO income, the ROA curve has **no U-shape** — it is strictly monotone. When A > F
it falls the whole way. When A ≤ F it rises the whole way.

### The corollary — low-pledge pools reward later delegators more

Set **Pledge = 1 M ADA** (below the 2.7 M threshold, so A < F). Now the blue ROA curve
slopes **upward** — each new delegator marginally improves per-ADA ROA for everyone because
the fixed fee overhead is spread across more stakers.

Being the first and only delegator in a small, low-pledge pool is actually the worst ROA
position for a delegator.

### The full picture across all cases

| Banner | Pledge vs threshold | Green (SPO income) | Blue (Delegator ROA) |
|--------|--------------------|--------------------|----------------------|
| ✅ SAFE | P ≤ 2.7 M (A ≤ F) | Rises | Rises |
| ✅ SAFE | P > 2.7 M, m ≥ m_min | Rises | **Falls** |
| ❌ AVOID | P > 2.7 M, m < m_min | Dips then rises | Falls |

To see each row live:

**Row 1:** Pledge = 1 M, Margin = 5 %. Both curves rise.
**Row 2:** Pledge = 5 M, Margin = 12.5 %. Green rises, blue falls.
**Row 3:** Pledge = 5 M, Margin = 5 %. Green dips; blue falls throughout.

---

## Step 7 — The Delegation Safety Banner in Full

The ✅ SAFE / ❌ AVOID banner answers one question:

> *Does this pool's margin guarantee that the SPO's income never decreases as delegation
> grows — from zero external delegation all the way to saturation?*

It evaluates the **entire green curve**, not just the cursor point. A pool that looks fine
at a large delegation level can still have damaged the SPO earlier in its life if the curve
dipped at low delegation. The banner catches that.

### Decision logic replicated in the chart

1. Read **Pledge Bonus A** from the blue metric card.
2. Compare to your **Fixed Fee** slider value.
3. If A ≤ F: banner = ✅ SAFE regardless of Margin. Done.
4. If A > F: read **m_min** from the orange card. Set Margin ≥ m_min → ✅ SAFE.
5. Conservative rule: set **Margin ≥ 23 %** — covers every possible pledge level.

### What the chart looks like at each state

**✅ SAFE:** Green curve starts at the left, levels off briefly or rises immediately, and
continues up to the saturation line. No dip anywhere.

**❌ AVOID:** Green curve starts at the left and immediately drops — you can see a valley
before it recovers. The cursor dots let you measure exactly how deep the income loss is at
any delegation level.

---

## Step 8 — Effect of Fixed Fee on Safety

Higher fixed fees make pools easier to delegate to safely.

**Experiment:** Set **Pledge = 5 M ADA**, **Margin = 5 %**.

- **Fixed Fee = 170:** m_min card shows ≈ 13.5 %. Banner = ❌ AVOID.
- **Fixed Fee = 340:** m_min card shows ≈ 12.2 %. Banner = ❌ AVOID (but closer).
- **Fixed Fee = 630:** m_min card drops below 5 %. Banner flips to ✅ SAFE.
- **Fixed Fee = 1000:** m_min drops further. Even a very low margin is safe.

The intuition: a high fixed fee means the SPO already takes a large first cut before the
pledge-dilution effect can dominate. The margin only needs to compensate for a smaller gap.

Note that in practice the SPO cannot set F above what delegators will tolerate — a 1000 ADA
fixed fee per epoch is unusually high. But when evaluating a real pool, a fixed fee above
the protocol minimum (340 ADA as of 2025) is actually a signal that the pool *needs less
margin* to be safe, not more.

---

## Step 9 — Using the Cursor for Point-in-Time Analysis

The cursor (red dashed line) is separate from the safety evaluation. It answers: "Given that
the pool is already at this specific delegation level, what are the exact values right now?"

**SPO Income (at cursor)** and **Delegator ROA (at cursor)** are snapshot values for a pool
that has already accumulated that much external delegation.

### Example: evaluating a pool you are considering

Suppose a pool has P = 5 M ADA, F = 340, m = 15 %, and currently holds 12 M ADA of
external delegation.

1. Set **Pledge = 5**, **Fixed Fee = 340**, **Margin = 15**, **Epoch Rate = 0.000548**.
2. Banner = ✅ SAFE (15 % > m_min ≈ 12.2 %). Good.
3. Set **Cursor to 12 M ADA**.
4. Read **SPO Income ≈ 2,985 ADA/epoch** and **Delegator ROA ≈ 3.07 %/year**.
5. Note that the blue curve slopes downward — ROA was slightly higher when the pool was
   smaller, and will be slightly lower if more people join.

---

## Step 10 — Epoch Rate and Saturation

### Epoch Rate (r)

The rate slider represents the fraction of total ADA supply distributed as rewards per
epoch. It declines slowly over years as the reserve depletes.

**Experiment:** Keep all other sliders at default and drag **Epoch Rate** from 0.0008
(higher, earlier in Cardano's life) down to 0.0003 (lower, far future). Watch:
- Both curves compress downward (lower absolute rewards).
- The m_min card changes (lower r means a smaller pledge bonus A, which can push some
  pools from A > F to A ≤ F, flipping their banner to ✅ SAFE automatically).
- The saturation line shifts (lower r slightly affects the saturation point calculation).

### Saturation (orange dashed line)

The saturation point is where adding more delegation stops increasing the pool's gross
rewards. The chart marks it at approximately S_sat − P (the external delegation level at
which total stake = S_sat ≈ 75 M ADA). Delegation beyond that line earns no additional
rewards and reduces per-ADA returns for everyone.

Set **Pledge = 70 M ADA** and watch the saturation line move off the left edge of the
chart — the pool is already near-saturated by pledge alone.

---

## Step 11 — Quick Evaluation Checklist (Chart-Assisted)

For any candidate pool, look up P, F, m on pool.pm or adapools.org, then:

- [ ] Set **Pledge**, **Fixed Fee**, **Margin**, and **Epoch Rate** sliders to match the pool.
- [ ] Read the **Delegation Safety** banner. If ✅ SAFE, proceed.
- [ ] If ❌ AVOID, read **m_min**. The pool's margin is below this — delegation may harm the SPO.
- [ ] Move the **Cursor** to the pool's current external delegation level (from Blockfrost/pool.pm).
- [ ] Read **Delegator ROA (at cursor)** — this is your expected annual yield at current pool size.
- [ ] Check whether the blue ROA curve slopes up or down from the cursor — if down, ROA will
  erode slightly as more people join.

---

## Step 12 — Why This Matters for Pool Ranger Members

Pool Ranger delegates member stake to carefully chosen pools. Two things must both be true:

1. **SPO safety (green curve):** The cooperative must not harm the SPO economically by
   arriving. A pool whose income falls with delegation has an incentive to reduce performance
   or exit — directly hurting member rewards.

2. **Delegator ROA awareness (blue curve):** Members should understand that even on a safe
   pool, joining a high-pledge pool dilutes the pledge bonus slightly. This is not a reason
   to avoid the pool — it is a normal property of how Cardano rewards work. But it means
   that pools closer to the A ≤ F boundary tend to offer more stable per-ADA ROA as
   membership grows.

The interactive chart makes both of these dynamics visible in real time, for any real pool
whose parameters you can look up.

---

## Step 13 — Caveats

| Item | What to watch for in the chart |
|------|-------------------------------|
| **r varies over time** | Re-enter the current epoch rate (from Cardano staking calculators) periodically. Even a small change in r can flip a pool's banner. |
| **a₀ = 0.3 is governable** | If Cardano governance changes a₀, the 2.7 M threshold and 23.1 % ceiling both shift. Recheck any saved pool evaluations. |
| **Saturation cap** | The chart does not cap rewards at saturation — drag the cursor past the orange line to see idealized values, but know that real rewards are capped there. |
| **100 % performance assumed** | A pool that misses blocks earns less; the direction of the curves is unchanged but absolute values will be lower. |
| **Cross-term omitted** | The full Cardano formula has a small correction term near saturation for high-pledge pools. The chart slightly underestimates m_min at high pledge + near-saturation. |

---

## Reference Formulas

```
gross(S, P)   = r × (S + a₀·P) / (1 + a₀)         a₀ = 0.3

SPO income    = F + m·(gross − F) + (P/S)·(1−m)·(gross − F)    [gross > F]

Delegator ROA = (1−m)·(gross − F) / S × 73 × 100%

A             = r·a₀·P / (1+a₀)

m_min         = (A − F) / (r·P − F)    when A > F, else 0
Ceiling       = a₀/(1+a₀) ≈ 23.1 %

P_safe        = F·(1+a₀) / (r·a₀) ≈ 2.7 M ADA   (pools below this are always safe)
```


## Parameter Reference Repeated For Convenience

| Symbol | Meaning | Current value |
|--------|---------|---------------|
| `r` | Per-epoch reward rate | ≈ 0.000548 (≈ 4 % / 73 epochs/yr) |
| `a₀` | Pledge influence factor | 0.3 (protocol parameter) |
| `k` | Target number of pools | 500 (protocol parameter) |
| `F` | Fixed fee (ADA / epoch) | 170 to 340 ADA (SPO-set, min enforced) |
| `m` | Margin (0% to 100%) | SPO-set |
| `P` | Pledge (ADA) | SPO-set |
| `S` | Total pool stake = P + external delegation | varies |
| `S_sat` | Saturation point ≈ active_stake / k | ≈ 65–75 M ADA (2026) |
| `A` | Pledge bonus per epoch (defined below) | derived |

