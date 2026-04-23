# Why Is This Pool Marked AVOID on the Delegation Safety Banner?

**Question asked:** One pool I looked at has the following settings and is marked by the
interactive chart to be avoided on the delegation safety banner. Fee = 170 ADA,
Pledge = 3.4 M ADA, Margin = 0.9%. Please explain why the pool should be avoided —
in other words, what is the danger and why?

---

## Step-by-Step Calculation

**Pool parameters:** F = 170 ADA, P = 3,400,000 ADA, m = 0.9%, r = 0.000548, a₀ = 0.3

### Step 1 — Compute the Pledge Bonus A

```
A = r × a₀ × P / (1 + a₀)
  = 0.000548 × 0.3 × 3,400,000 / 1.3
  ≈ 430 ADA / epoch
```

### Step 2 — Compare A to F

A = 430 ADA > F = 170 ADA → the dangerous case applies.

Because the pledge bonus exceeds the fixed fee, the pledge-dilution effect is active.
Every new delegator dilutes the SPO's share of that large fixed pledge bonus.

### Step 3 — Compute the Minimum Safe Margin

```
m_min = (A − F) / (r × P − F)
      = (430 − 170) / (0.000548 × 3,400,000 − 170)
      = 260 / (1,863 − 170)
      = 260 / 1,693
      ≈ 15.4%
```

The pool's margin is **0.9%**. The required safe margin is **≈ 15.4%**.
The pool is missing the threshold by a factor of 17×.

---

## What the Danger Actually Is

The SPO earns from two sources that move in opposite directions as delegation grows:

1. **Margin income** — grows as more delegation arrives (0.9% of a larger pool)
2. **Pledge fraction income** — the SPO holds `P/S` of the pool as the pledge holder.
   As delegation grows, `S` grows but `P` stays fixed, so `P/S` *shrinks*. The SPO owns
   a smaller and smaller slice of the pool's gross rewards.

When the margin is only 0.9%, the margin income barely grows. But the pledge bonus
(430 ADA/epoch) is large and fixed — that whole bonus gets split among more and more
stakers, and the SPO's own share of it collapses as `P/S` falls. The 0.9% margin is
nowhere near enough to compensate for this loss.

---

## Concrete Numbers

| Situation | SPO Income / epoch |
|---|---|
| No external delegation (S = P = 3.4 M) | **1,863 ADA** |
| 1 M ADA external delegation (S = 4.4 M) | **1,808 ADA** ▼ |
| 10 M ADA external delegation (S = 13.4 M) | **1,708 ADA** ▼ |
| Near-saturation 70 M external (S = 73.4 M) | **1,882 ADA** ▼ (barely above start) |

The SPO earns **less than their solo-pledge income for essentially the entire delegation
range** from 0 to near-saturation. The income curve doesn't recover to its starting
value until the pool is almost completely full.

The bottom of the U-shaped income curve occurs at approximately S ≈ 15.2 M total stake
(about 11.8 M external delegation), where SPO income reaches its minimum of roughly
1,640 ADA — about 12% below where they started with no delegators at all.

---

## The Cooperative Danger

If Pool Ranger delegates to this pool, the SPO is economically harmed by the arrival.
A rational SPO facing declining income has incentive to:

- Reduce performance (produce fewer blocks intentionally or through neglect)
- Raise fees or margin in a future update
- Close the pool and move on

Any of those outcomes directly reduces member rewards. The relationship is adversarial
rather than cooperative.

---

## What Would Make This Pool Safe?

To flip the banner from ❌ AVOID to ✅ SAFE, the SPO would need to raise their margin
from 0.9% to at least **15.4%**. At that margin, the margin income from new delegation
exactly compensates for the shrinking pledge fraction at every delegation level from
zero to saturation.

Alternatively, if the SPO raised their fixed fee above about 430 ADA/epoch, the pledge
bonus A would no longer exceed F, and the pool would become automatically safe at any
margin.

---

## Reference Formulas

```
A       = r × a₀ × P / (1 + a₀)          pledge bonus per epoch
m_min   = (A − F) / (r × P − F)           minimum safe margin (when A > F)
Ceiling = a₀ / (1 + a₀) ≈ 23.1%          no pool ever needs more than this
```
