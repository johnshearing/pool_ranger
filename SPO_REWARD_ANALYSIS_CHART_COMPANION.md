# SPO Reward Analysis — Interactive Chart Guide

**Purpose:** Learn how delegation affects SPO income and delegator ROA by exploring the interactive chart directly.  
Every concept in this document can be verified live by adjusting the sliders in  
<a href="https://johnshearing.github.io/pool_ranger/SPO_REWARD_ANALYSIS_CHART.html">SPO_REWARD_ANALYSIS_CHART.html</a>  
Right click on the link above to open the chart in a new tab and keep it alongside this document.  

This document that you are reading now is the hands-on companion to the chart.  

The full mathematical derivations live in [SPO_REWARD_ANALYSIS.md](https://github.com/johnshearing/pool_ranger/blob/main/SPO_REWARD_ANALYSIS.md)  

 
---

## Step 0 — Tour of the Interface

When you open the chart you will see six areas, top to bottom:

| Area | What it is |
|------|-----------|
| **Pool Lookup** panel | Text box + Load Pool button — type a mainnet ticker to auto-fill all sliders |
| **Pool Parameters** panel | Four sliders: Margin, Pledge, Fixed Fee, Epoch Rate |
| **Performance Analysis** panel | Two sliders: Epoch Window and Performance Factor — auto-set from Koios on Load Pool |
| **Metric cards** row | Four live readouts that update with every slider move |
| **Chart Cursor** panel | One slider that moves a red vertical line across the chart |
| **Chart** panel | Green/red curve = SPO income (left axis). Blue curve = Delegator ROA (right axis). Orange dashed line = saturation. |

### The Pool Lookup panel

Type any mainnet stake pool ticker (e.g. `IOHK`, `GENS`, `COSD`) and press **Enter** or
click **Load Pool**. The chart fetches live data from the Cardano blockchain via the
[Koios](https://koios.rest) public API and sets the sliders automatically:

| Slider set | Source |
|---|---|
| **Margin (m)** | Pool's on-chain registration certificate |
| **Fixed Fee (F)** | Pool's on-chain registration certificate |
| **Pledge (P)** | Pool's declared pledge (on-chain) |
| **Cursor (external delegation)** | live\_stake − pledge for the current epoch |
| **Performance Factor (p)** | actual blocks minted / expected blocks, averaged over the chosen epoch window |

**What is not set automatically:** The **Epoch Rate (r)** slider is a network-wide
parameter — not specific to any pool — so it is left at whatever value you have it set to.
The default (0.000548) is a reasonable approximation for 2025/2026; see Step 11 for how to
think about it.

**Caveats:**
- Tickers are mainnet only. Preview/preprod testnet pools will not be found.
- If a pool's pledge or current delegation exceeds 70 M ADA (the slider maximum), the value
  is clamped and a warning appears in the status line.
- The declared pledge (used for the reward formula) may differ from the live pledge (actual
  ADA held by the operator). The chart uses declared pledge, which matches how the Cardano
  protocol calculates rewards.
- After loading, you can still move any slider freely to explore "what if" scenarios.

### The Performance Analysis panel

This panel has two sliders and a status line that appears after you load a pool.

**Epoch Window slider (1–73 epochs, default 20):** Controls how many of the most recent
epochs to include when computing the pool's average performance. 73 epochs equals roughly
one year of Cardano history (5 days per epoch). The full 73-epoch history is fetched from
Koios in a single call when you load a pool; dragging the window slider recalculates
the average instantly from that cached data — no additional network requests.

**Performance Factor slider (0–100%, default 100%):** The fraction of theoretical rewards
that the pool actually earned, based on how many blocks it minted relative to its expected
share. This value is auto-set from the epoch history when a pool is loaded. You can drag it
manually afterward for what-if analysis — for example, to see what a pool's curves would
look like if it only performed at 80%.

**Status line:** After loading a pool it shows the auto-computed value, the total actual and
expected block counts, and how many epochs had enough data to be included in the calculation.
Epochs where the pool had fewer than 0.5 expected blocks are excluded because at that scale
a single block difference is entirely within the range of normal statistical luck, not a
reliable signal of performance.

**Color coding on the Performance Factor card:**
- **Green** — performance ≥ 95%: the pool is minting blocks reliably
- **Orange** — performance 80–94%: noticeable shortfall; investigate further
- **Red** — performance < 80%: significant systematic underperformance

### The four metric cards

| Card | What it shows |
|------|--------------|
| **Pledge Bonus (A·p)** (blue) | Performance-adjusted ADA the SPO earns per epoch from pledge alone |
| **SPO Income (at cursor)** (green) | ADA/epoch the SPO earns at the red cursor position |
| **Delegator ROA (at cursor)** (blue) | Annual % return for delegators at the red cursor position |
| **Performance Factor** (green/orange/red) | Current p value applied to all reward calculations |

When Performance Factor is 100%, the Pledge Bonus (A·p) card shows the same value as the
theoretical A. All card values reflect the performance factor currently set by the slider.

### The two chart curves

- The **SPO income curve** traces SPO income as external delegation grows from 0 to 70 M ADA.
  The left y-axis belongs to it. The line is **green** where additional delegation increases SPO
  income and **red** where additional delegation decreases it. If any red portion is visible,
  a range of delegation levels exists where the SPO is economically harmed by each new delegator.
- The **blue curve** traces delegator annual ROA over the same range.
  The right y-axis belongs to it.
- The **red dashed cursor** marks the delegation level you choose with the bottom slider.
  Each curve shows a marker at the cursor position indicating the direction of the slope there:
  a **green circle** means slope ≥ 0 (delegation helps at this level) and a **red ✕** means
  slope < 0 (delegation hurts at this level). On the SPO income curve the marker changes as
  you move the cursor across the trough. On the ROA curve the marker stays consistent for the
  whole pool — green circle when A·p ≤ F (ROA rises with delegation) and red ✕ when A·p > F
  (ROA falls with delegation regardless of delegation level).

### Parameter Reference

| Symbol | Meaning | Current value |
|--------|---------|---------------|
| `r` | Per-epoch reward rate | ≈ 0.000548 (≈ 4 % / 73 epochs/yr) |
| `a₀` | Pledge influence factor | 0.3 (protocol parameter) |
| `k` | Target number of pools | 500 (protocol parameter) |
| `F` | Fixed fee (ADA / epoch) | 170 to 340 ADA (SPO-set, min enforced) |
| `m` | Margin (0% to 100%) | SPO-set |
| `P` | Pledge (ADA) | SPO-set |
| `p` | Performance factor (0–1) | auto-computed from pool history |
| `S` | Total pool stake = P + external delegation | varies |
| `S_sat` | Saturation point ≈ active_stake / k | ≈ 65–75 M ADA (2026) |
| `A_eff` | Effective pledge bonus per epoch = p·r·a₀·P/(1+a₀) | derived |

> **Note:** `r` drifts downward over time as the reserve depletes. Recompute periodically
> from recent epoch data or use the current Cardano staking calculator rate.

---

> **Note for Steps 1–9:** All experiments in Steps 1–9 assume **Performance Factor = 100%**.
> If you have already loaded a pool, drag the Performance Factor slider back to 100% before
> working through these steps so the theoretical values shown in the text match what you see
> on screen. Step 10 explores real-world performance below 100%.

---

## Step 1 — The Pledge Bonus

**What to do:**  
Set **Pledge = 0 M ADA**.  
Note the Pledge Bonus (A·p) card — it reads 0.  
Now slowly drag **Pledge** to the right toward 70 M ADA. Watch A·p climb.  

**What you are seeing:** 
The pledge bonus formula is:

```
A  =  r × a₀ × P / (1 + a₀)     (a₀ = 0.3, protocol constant)
```

At 100% performance, A·p = A. This is a fixed ADA amount the SPO earns every epoch
regardless of how many delegators join. It does not grow as delegation grows — it only grows
when the SPO increases their own pledge.

**Why it matters:** A is the engine of everything that follows. When A is large relative to
the fixed fee F, interesting (and counterintuitive) things happen to both curves.

---

## Step 2 — The Gross/Fixed-Fee Boundary

**What to do:** Set **Pledge = 1 M ADA**, **Fixed Fee = 340**, **Margin = 5 %**, **Epoch
Rate = 0.000548**, **Performance Factor = 100 %**.

Move the **Cursor** slider all the way left (External Delegation = 0). The SPO Income card
will show a small number — around 423 ADA. This is `gross(S=P)` when the pool has only the
SPO's own pledge staked.

Now read **Pledge Bonus (A·p)** — it shows roughly 127 ADA. Since A (127) < F (340), the SPO
income curve is entirely green. There is no red zone at any delegation level.

Increase **Fixed Fee** above 340 and watch how the all-green condition holds easily.
Increase **Pledge** past about 2.7 M ADA and watch A cross above F — the curve may now
develop a red zone depending on margin.

**The 2.7 M ADA boundary:** Below this pledge, A ≤ F always holds and the curve is always
entirely green at any margin. This threshold is:

```
P_safe  =  F × (1 + a₀) / (r × a₀)
         ≈  340 × 1.3 / (0.000548 × 0.3)
         ≈  2,690,000 ADA
```

---

## Step 3 — When Delegation Hurts the SPO (the red zone)

This is the first major counterintuitive result: **more delegation can make the SPO worse
off**, not better.

### Reproducing the effect

Set these sliders:
- **Pledge = 5 M ADA**
- **Fixed Fee = 340**
- **Epoch Rate = 0.000548**
- **Performance Factor = 100 %**
- **Margin = 0 %**

The SPO income curve immediately turns **entirely red** and slopes steadily downward from
left to right. Move the cursor from 0 to 70 M ADA and watch the SPO Income card fall from
about 2,740 ADA/epoch down toward 2,469 ADA/epoch. Every new delegator makes the SPO worse
off across the entire range.

### Raise the margin to see the U-shape and the trough

Change **Margin to 5 %**. A red zone still appears on the left side of the curve — it dips
to a minimum around 3 M external delegation, then the curve turns green and climbs. This is
the U-shape: early delegation hurts (red), but eventually the margin income from a large pool
outweighs the pledge dilution (green).

Move the cursor left to 0 M: SPO income ≈ 2,740. Move it right to 3 M (red zone, dot turns
red): SPO income dips to about 2,700. Move further right to 70 M (green zone, dot turns
green): SPO income climbs to about 3,810.

The point where the curve transitions from red to green is called the **trough**. It is the
delegation level at which SPO income reaches its minimum and begins recovering.

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

When `A > F`, the pledge-dilution term is negative. If the margin term is too small to
overcome it, the total derivative goes negative — the curve is red at that point.

---

## Step 4 — Finding the Safe Margin (m_min)

The minimum margin that eliminates the red zone entirely is:

```
m_min  =  (A_eff − F) / (p·r·P − F)     [only when A_eff > F; otherwise m_min = 0]
```

At 100% performance, A_eff = A and this simplifies to the classical formula (A − F) / (r·P − F).

The chart does not display m_min as a number, but it is visible directly on the curve:
the red zone disappears the moment margin reaches m_min.

### Watching the red zone disappear

With **Pledge = 5 M ADA**, **Fixed Fee = 340**, **Epoch Rate = 0.000548**,
**Performance Factor = 100 %**, m_min ≈ 12.22 %:

- With **Margin = 5 %**: red zone visible on the left side of the curve.
- Slowly drag **Margin** upward. Watch the red zone shrink leftward and the trough move
  toward the y-axis.
- The moment you cross **Margin = 12.5 %** (the nearest slider step above 12.22 %):
  the red zone vanishes entirely and the curve is all green from left to right.
- To compute m_min exactly, use the reference formula at the bottom of the chart page.

When `m ≥ m_min` the SPO income curve is monotonically non-decreasing — green all the way.
When `m < m_min` a red zone exists at low delegation levels.

### The 23.1 % universal ceiling

Set **Pledge = 70 M ADA** (maximum). Note m_min — it is around 22.6 %. No matter how high
the pledge, m_min never reaches 23.1 %. Setting **Margin ≥ 23 %** guarantees an all-green
curve for any pool that exists:

```
Ceiling  =  a₀ / (1 + a₀)  =  0.3 / 1.3  ≈  23.08 %
```

---

## Step 5 — m_min at Different Pledge Levels

Set **Fixed Fee = 340**, **Epoch Rate = 0.000548**, **Performance Factor = 100 %**,
**Margin = 0 %**, then adjust Pledge and observe the red zone. The table below shows the
corresponding m_min values (computed from the reference formula) and whether the red zone
covers the full curve or has a trough:

| Pledge | Pledge Bonus A | A > F? | m_min (card) |
|-------:|---------------:|:------:|-------------:|
| 1 M ADA | ≈ 127 | No | 0 % |
| 2.5 M ADA | ≈ 317 | No | 0 % |
| 3 M ADA | ≈ 380 | Yes | ≈ 3.0 % |
| 5 M ADA | ≈ 632 | Yes | ≈ 12.2 % |
| 10 M ADA | ≈ 1,265 | Yes | ≈ 18.0 % |
| 20 M ADA | ≈ 2,529 | Yes | ≈ 20.6 % |
| 50 M ADA | ≈ 6,323 | Yes | ≈ 22.1 % |

**Notice:** each time you raise Pledge the red zone grows deeper and the trough shifts
rightward. Set **Margin = 5 %** and sweep **Pledge** from 3 M to 50 M to watch the red dip
in the curve grow larger and move further to the right.

---

## Step 6 — When Delegation Reduces Delegator ROA (the blue curve)

This is the second major counterintuitive result: **delegator ROA can also fall as
delegation grows**, and this can happen even on a pool whose SPO income curve is entirely
green.

### Reproducing the effect

Set:
- **Pledge = 5 M ADA**
- **Fixed Fee = 340**
- **Margin = 12.5 %** (SPO income curve is all green)
- **Epoch Rate = 0.000548**
- **Performance Factor = 100 %**

The green SPO income curve rises left to right — no red zone. But now look at the **blue
delegator ROA curve** — it slopes gently *downward* from left to right.

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

| Red zone on curve? | Pledge vs threshold | Green/Red (SPO income) | Blue (Delegator ROA) |
|---|--------------------|--------------------|----------------------|
| No red zone | P ≤ 2.7 M (A ≤ F) | All green — rises | Rises |
| No red zone | P > 2.7 M, m ≥ m_min | All green — rises | **Falls** |
| Red zone exists | P > 2.7 M, m < m_min | Red dip then green rise | Falls |

To see each row live:

**Row 1:** Pledge = 1 M, Margin = 5 %. Both curves rise. No red.  
**Row 2:** Pledge = 5 M, Margin = 12.5 %. SPO income all green, ROA curve falls.  
**Row 3:** Pledge = 5 M, Margin = 5 %. Red zone on SPO income; ROA falls throughout.

---

## Step 7 — Understanding the Red Zone

The red portion of the SPO income curve answers one question at the **pool level** (not at
the cursor position):

> *At this delegation level, does adding one more delegator reduce the SPO's income?*

Every x-position on the curve where the line is red means that if the pool is currently at
that delegation level, adding more stake makes the SPO worse off. The trough — where red
transitions to green — is the delegation level at which SPO income hits its minimum and
begins to recover.

### What the colors mean

| Curve color at a given x-position | Meaning |
|---|---|
| **Green** | At this delegation level, more delegation increases SPO income. Delegating is cooperative. |
| **Red** | At this delegation level, more delegation decreases SPO income. The SPO is harmed by each arriving delegator. |

### The trough — where red becomes green

The trough x-position is calculable from pool parameters. For a pool with a margin between
0 % and m_min, the trough occurs at:

```
S_trough  =  √[ P·(1−m)·(A_eff−F) / (m·p·r/(1+a₀)) ]

External delegation at trough  =  S_trough − P
```

This is the point at which the margin term and the pledge-dilution term exactly cancel.
To the left of the trough the curve is red; to the right it is green.

### Why the red zone matters for Pool Ranger

A red zone on the curve is not automatically fatal to a delegation decision. What matters
is **where the cursor is relative to the trough**:

- If the pool's current delegation is already **past the trough** (cursor in the green zone),
  Pool Ranger adding more stake moves the SPO further right and upward — clearly beneficial.
- If the pool's current delegation is **before the trough** (cursor in the red zone),
  every delegator arriving — including Pool Ranger — reduces the SPO's income.
- If Pool Ranger controls enough stake to **push the pool past the trough in a single move**,
  the net effect is still positive: the SPO passes through the dip but ends up in better shape.
- If Pool Ranger can only push the pool deeper into the red zone without clearing the trough,
  it is better to withhold delegation entirely and let the pool's current parameters speak
  for themselves.

### Decision logic for Pool Ranger

1. If the SPO income curve is all green: delegation is cooperative at any level.
2. If a red zone exists: move the cursor to the pool's current delegation level.
3. If the cursor marker is a **green circle** (past the trough): safe to add delegation.
4. If the cursor marker is a **red ✕** (before the trough): check whether Pool Ranger's stake
   can push the pool past the trough in one move. If yes, the move is net-positive. If no,
   do not delegate.

---

## Step 8 — Effect of Fixed Fee on Safety

Higher fixed fees eliminate or shrink the red zone.

**Experiment:** Set **Pledge = 5 M ADA**, **Margin = 5 %**, **Performance Factor = 100 %**.

- **Fixed Fee = 170:** Red zone is large — trough is far to the right (m_min ≈ 13.5 %).
- **Fixed Fee = 340:** Red zone still present but slightly smaller (m_min ≈ 12.2 %).
- **Fixed Fee = 630:** Red zone disappears — the curve turns all green (m_min drops below 5 %).
- **Fixed Fee = 1000:** Even a very low margin produces an all-green curve.

The intuition: a high fixed fee means the SPO already takes a large first cut before the
pledge-dilution effect can dominate. The margin only needs to compensate for a smaller gap.

Note that in practice the SPO cannot set F above what delegators will tolerate — a 1000 ADA
fixed fee per epoch is unusually high. But when evaluating a real pool, a fixed fee above
the protocol minimum (340 ADA as of 2025) is actually a signal that the pool *needs a lower
margin* to eliminate the red zone, not a higher one.

---

## Step 9 — Using the Cursor for Point-in-Time Analysis

The cursor (red dashed line) is separate from the red-zone evaluation. It answers: "Given
that the pool is already at this specific delegation level, what are the exact values right now?"

**SPO Income (at cursor)** and **Delegator ROA (at cursor)** are snapshot values for a pool
that has already accumulated that much external delegation.

The cursor marker on the SPO income curve indicates the local slope: a green circle when
past the trough (slope ≥ 0) and a red ✕ when before it (slope < 0). The ROA curve marker
shows the same logic but for the whole pool at once — red ✕ if A·p > F (ROA always falls),
green circle if A·p ≤ F (ROA always rises).

### Example: evaluating a pool you are considering

Suppose a pool has P = 5 M ADA, F = 340, m = 15 %, and currently holds 12 M ADA of
external delegation.

1. Set **Pledge = 5**, **Fixed Fee = 340**, **Margin = 15**, **Epoch Rate = 0.000548**,
   **Performance Factor = 100 %**.
2. The SPO income curve is entirely green (15 % > m_min ≈ 12.2 %). No red zone.
3. Set **Cursor to 12 M ADA**.
4. Read **SPO Income ≈ 2,985 ADA/epoch** and **Delegator ROA ≈ 3.07 %/year**.
5. Note that the blue curve slopes downward — ROA was slightly higher when the pool was
   smaller, and will be slightly lower if more people join.

---

## Step 10 — Pool Performance History

This step covers the **Performance Analysis** panel — the only part of the chart that draws
on actual historical block production rather than theoretical formulas.

### What "performance" measures

The chart fetches up to 73 epochs of block history for any pool you load. For each epoch it
computes:

```
expected blocks  =  (pool active stake / network active stake) × total blocks that epoch
```

Then it averages the ratio `actual / expected` across the epoch window you select:

```
p  =  Σ(actual blocks)  /  Σ(expected blocks)    over the chosen window
```

A value of 1.0 (100%) means the pool produced exactly as many blocks as its stake fraction
would predict on average over that period. A value of 0.92 means the pool produced 92% of
its expected share — an 8% shortfall that is very unlikely to be explained by luck alone
over 20 or more epochs.

Epochs where the pool's expected block count is below 0.5 are excluded from the calculation.
At that scale (very small or very new pools), a single-block difference is entirely within
normal statistical variance and tells you nothing reliable about the operator's competence.

### What performance does and does not detect

The performance ratio captures any failure that results in a block not being minted when one
was expected: extended downtime, misconfigured relays, memory or garbage-collection pauses
long enough to miss a slot leader check, or losing a height battle because the node was
lagging behind the chain tip.

What it **cannot** detect is downtime that happens to fall entirely in epochs where the pool
had zero assigned slots. A pool that was offline for two days may have been lucky enough that
no slots were assigned during that window — and the ratio will look perfect. The performance
metric is a strong signal when it is bad and a weak signal when it is perfect.

### The Epoch Window slider

Dragging the Epoch Window slider from 1 to 73 controls how many recent epochs enter the
average. The full 73-epoch history is fetched once when you load a pool; the slider
recalculates from cached data with no additional network calls.

**Short windows (1–10 epochs, ≈ 5–50 days):** Highly sensitive to recent events. A pool
that just had a week of downtime will show a sharply low score. A pool that recently fixed
a long-standing problem will show a high score. High variance — a small pool can score 0%
or 200% in a single epoch purely by chance.

**Medium windows (10–30 epochs, ≈ 50–150 days):** The most useful range for most
evaluations. Enough history to smooth out single-epoch luck while still being recent enough
to reflect the current operator setup.

**Long windows (30–73 epochs, ≈ 5–12 months):** Reveals the long-run track record. A pool
that migrated servers six months ago and has been perfect since will look only moderately
good here — the bad months drag the average down. Useful for confirming sustained reliability.

### How performance changes the curves

Every reward formula in the chart is multiplied by p:

```
gross_eff  =  p × r × (S + a₀·P) / (1 + a₀)
```

At p = 0.90, the entire SPO income curve and the entire ROA curve compress downward by 10%.
The trough position also shifts, because the effective pledge bonus becomes A_eff = p × A.
If p is low enough that A_eff drops below F, the red zone disappears entirely — not because
the pool became safer, but because performance is so poor that the pledge bonus no longer
dominates the fixed fee. A vanishing red zone caused by low performance is a warning sign,
not a positive signal.

### Experiments

**Experiment 1 — Load a pool and compare windows:**
Load any pool ticker. Note the auto-computed performance at the default 20-epoch window.
Drag the Epoch Window slider to 5 (very recent) and then to 73 (full year). Notice whether
the short-window and long-window scores agree. A large gap between them means the pool's
performance changed significantly at some point in its history.

**Experiment 2 — What 90% performance looks like:**
Set any pool's sliders manually (e.g. Pledge = 5, Fee = 340, Margin = 5, Rate = 0.000548).
Drag Performance Factor from 100% down to 90%. Watch both curves compress — the SPO income
values drop by roughly 10% and the ROA values drop similarly. The trough position shifts
slightly leftward because A_eff is now smaller.

**Experiment 3 — Performance below the red-zone threshold:**
With Pledge = 5, Fee = 340, Margin = 5, Rate = 0.000548 and Performance Factor = 100%,
a red zone is visible (m_min ≈ 12.2%). Now drag Performance Factor down slowly. Watch the
red zone shrink and eventually disappear as A_eff drops below F. At that point the pool is
producing so few rewards that the pledge-bonus mechanism no longer creates the incentive
conflict — but delegator ROA has also collapsed. This is not a pool worth joining.

---

## Step 11 — Epoch Rate and Saturation

### Epoch Rate (r)

The rate slider represents the fraction of total ADA supply distributed as rewards per
epoch. It declines slowly over years as the reserve depletes.

**Experiment:** Keep all other sliders at default and drag **Epoch Rate** from 0.0008
(higher, earlier in Cardano's life) down to 0.0003 (lower, far future). Watch:
- Both curves compress downward (lower absolute rewards).
- The m_min threshold changes (lower r means a smaller pledge bonus A, which can push some
  pools from A > F to A ≤ F, eliminating their red zone automatically).
- The red zone, if any, shifts in size as A changes.

### Saturation (orange dashed line)

The saturation point is where adding more delegation stops increasing the pool's gross
rewards. The chart marks it at approximately S_sat − P (the external delegation level at
which total stake = S_sat ≈ 75 M ADA). Delegation beyond that line earns no additional
rewards and reduces per-ADA returns for everyone.

Set **Pledge = 70 M ADA** and watch the saturation line move off the left edge of the
chart — the pool is already near-saturated by pledge alone.

---

## Step 12 — Quick Evaluation Checklist (Chart-Assisted)

For any candidate pool, type its ticker into the **Pool Lookup** panel and click
**Load Pool** — this sets the Margin, Fixed Fee, Pledge, Cursor, and Performance Factor
sliders automatically from live on-chain data. Then set the **Epoch Rate** slider to the
current network value (default 0.000548 is fine for 2025/2026). If the pool is not on
mainnet or you prefer to enter values manually, look up P, F, m on pool.pm or adapools.org
and set the sliders by hand.

Then work through this checklist:

**Performance:**
- [ ] Read the **Performance Factor** metric card. Is it green (≥ 95 %), orange (80–94 %),
  or red (< 80 %)?
- [ ] Drag the **Epoch Window** slider to 5 (very recent) and then to 73 (full year). Do
  the two scores agree? A large gap means something changed — investigate when and why.
- [ ] If performance is orange or red: the reward curves already reflect this shortfall. The
  pool's actual SPO income and delegator ROA are lower than a 100%-performing pool with the
  same parameters. Consider this a hard negative signal unless you have a clear explanation.

**SPO welfare:**
- [ ] Check the SPO income curve. Is any portion **red**?
  - If **no red**: delegation is cooperative at any level. Proceed to ROA analysis.
  - If **red zone exists**: continue below.
- [ ] Move the **Cursor** to the pool's current external delegation level.
- [ ] Is the SPO income cursor marker a **green circle** (past the trough) or **red ✕** (before)?
  - **Green circle:** more delegation helps the SPO. Safe to add.
  - **Red ✕:** delegation is currently harming the SPO. Check whether Pool Ranger's stake
    can push the pool past the trough in one move. If yes, the net effect is still positive.
    If no, do not delegate.

**Delegator ROA:**
- [ ] Check the ROA curve cursor marker: **green circle** means ROA rises as the pool grows
  (A·p ≤ F); **red ✕** means ROA falls as the pool grows (A·p > F) — informational, not a veto.
- [ ] Read **Delegator ROA (at cursor)** — this is your expected annual yield at current pool
  size, already adjusted for the pool's historical performance.
- [ ] Check whether the blue ROA curve slopes up or down from the cursor — if down, ROA will
  erode slightly as more people join.

---

## Step 13 — Why This Matters for Pool Ranger Members

Pool Ranger delegates member stake to carefully chosen pools. Three things must be evaluated:

1. **SPO welfare (SPO income curve):** The cooperative must not harm the SPO economically by
   arriving. A pool in the red zone at its current delegation level has an SPO whose income is
   falling with each new delegator — an adversarial relationship that may incentivize lower
   performance or pool closure, directly hurting member rewards.

2. **Delegator ROA awareness (blue curve):** Members should understand that even on a pool
   with an all-green income curve, joining a high-pledge pool dilutes the pledge bonus
   slightly. This is not a reason to avoid the pool — it is a normal property of how Cardano
   rewards work. But it means that pools closer to the A·p ≤ F boundary tend to offer more
   stable per-ADA ROA as membership grows.

3. **Historical performance:** A pool that earns only 85% of its expected rewards is passing
   only 85% of the theoretical ROA to its delegators. The chart already reflects this in every
   curve once a pool is loaded. Pool Ranger treats persistent underperformance — not explained
   by a documented, resolved incident — as a disqualifying factor.

The interactive chart makes all three dynamics visible in real time, for any real pool
whose parameters you can look up.

---

## Step 14 — Caveats

| Item | What to watch for in the chart |
|------|-------------------------------|
| **r varies over time** | Re-enter the current epoch rate (from Cardano staking calculators) periodically. Even a small change in r can eliminate or create a red zone. |
| **a₀ = 0.3 is governable** | If Cardano governance changes a₀, the 2.7 M threshold and 23.1 % ceiling both shift. Recheck any saved pool evaluations. |
| **Saturation cap** | The chart does not cap rewards at saturation — drag the cursor past the orange line to see idealized values, but know that real rewards are capped there. |
| **Performance detects blocks, not intent** | The ratio measures produced vs. expected blocks. It cannot distinguish bad luck (rare for large pools over many epochs) from downtime, misconfiguration, or latency. A single bad epoch in a 20-epoch window hurts the score more than it should — use a longer window when evaluating a pool with one obvious incident. |
| **Missed slots leave no on-chain trace** | If a pool was scheduled for a slot but failed to mint and no other pool filled it either, the blockchain records nothing. The performance ratio captures this as a lower actual-block count, but cannot tell you *why* the block was missed. |
| **Lucky streaks capped at 100 %** | The chart caps p at 1.0. A pool that minted more blocks than expected in a short window is simply lucky; the cap prevents this from inflating the performance card above 100 %. |
| **Cross-term omitted** | The full Cardano formula has a small correction term near saturation for high-pledge pools. The chart slightly underestimates m_min at high pledge + near-saturation. |

---

## Reference Formulas

```
gross_eff(S, P, p) = p × r × (S + a₀·P) / (1 + a₀)      p = performance factor (0–1)

SPO income  = F + m·(gross_eff − F) + (P/S)·(1−m)·(gross_eff − F)   [gross_eff > F]

Delegator ROA = (1−m)·(gross_eff − F) / S × 73 × 100%

A_eff  =  p·r·a₀·P / (1+a₀)

m_min  =  (A_eff − F) / (p·r·P − F)    when A_eff > F, else 0
Ceiling  =  a₀/(1+a₀) ≈ 23.1 %

P_safe  =  F·(1+a₀) / (r·a₀) ≈ 2.7 M ADA   (pools below this are always safe at p = 1)

S_trough  =  √[ P·(1−m)·(A_eff−F) / (m·p·r/(1+a₀)) ]   (trough where red zone ends)

p  =  Σ(actual blocks) / Σ(expected blocks)   over chosen epoch window
      expected per epoch  =  (pool active stake / network active stake) × total epoch blocks
```


## Parameter Reference

| Symbol | Meaning | Current value |
|--------|---------|---------------|
| `r` | Per-epoch reward rate | ≈ 0.000548 (≈ 4 % / 73 epochs/yr) |
| `a₀` | Pledge influence factor | 0.3 (protocol parameter) |
| `k` | Target number of pools | 500 (protocol parameter) |
| `F` | Fixed fee (ADA / epoch) | 170 to 340 ADA (SPO-set, min enforced) |
| `m` | Margin (0% to 100%) | SPO-set |
| `P` | Pledge (ADA) | SPO-set |
| `p` | Performance factor (0–1) | auto-computed from Koios pool_history |
| `S` | Total pool stake = P + external delegation | varies |
| `S_sat` | Saturation point ≈ active_stake / k | ≈ 65–75 M ADA (2026) |
| `A_eff` | Effective pledge bonus = p·r·a₀·P/(1+a₀) | derived |
| `S_trough` | Total stake at trough (where red zone ends) | derived |
