## Question:

Cardano's reward formula was designed around a "rational delegator" assumption — that delegators would track pool parameters every epoch and move their stake to whichever pools currently offer the best return. This is the behavior the Nash equilibrium of the protocol depends on, and it is exactly the behavior Pool Ranger performs on behalf of its members.

But the formula provides no direct reward for *being* such a delegator. Worse: when a coordinator like Pool Ranger concentrates stake into a high-pledge pool to gain bargaining leverage with its SPO, the act of concentration dilutes the pledge bonus and *lowers* per-member ROA. Pool Ranger pays an internal cost to acquire leverage that the protocol does not reciprocate.

The most direct fix is to lower `a₀` (the pledge influence factor) from 0.3 toward 0. That would push every pool into the `A < F` regime where the fixed fee `F` is amortized across more stake, and pooled delegation mathematically raises ROA. But lowering `a₀` is blocked: `a₀` is doing important Sybil-resistance work and cannot be removed without replacing the mechanism it carries.

Can we leave `a₀` alone and instead introduce a *new* protocol parameter that creates the "delegation increases ROA" property — a parameter that rewards cooperative delegator concentration the way `a₀` rewards SPO pledge concentration?

## Glossary

This document is intended to stand alone. The tables below define every symbol and term used in the rest of the document. Readers familiar with Cardano staking can skim; readers new to it can return here whenever a term is unclear.

### Variables

| Symbol | Meaning | Current value (mainnet, 2026) |
|---|---|---|
| `r` | Per-epoch reward rate — fraction of total ADA supply distributed as rewards each epoch. Drifts down slowly as the protocol reserve depletes. | ≈ 0.000400 |
| `a₀` | Pledge influence factor — protocol parameter controlling how much extra reward a pool earns based on its pledge. Settable by on-chain governance. | 0.3 |
| `c₀` | **Proposed new parameter** — cooperator bonus factor. Mirrors `a₀` but applies to the largest single delegator's stake rather than the SPO's pledge. Does not exist in the protocol today. | proposed ≈ 0.1 |
| `k` | Target number of stake pools the protocol is designed to converge on. Sets the saturation cap. | 500 |
| `F` | Fixed fee in ADA per epoch — flat overhead an SPO takes off the top of gross rewards before splitting the rest. Protocol enforces a minimum. | 170–340 (SPO-set, ≥ protocol minimum) |
| `m` | Margin — percentage of post-fee rewards the SPO takes before the remainder is split among delegators by stake fraction. | SPO-set, 0–100% |
| `P` | Pledge — ADA the SPO commits from their own funds to their own pool. Earns the pledge bonus `A`. | SPO-set |
| `D_max` | Largest single delegator's stake in a pool, identified by stake credential. Used by the proposed `c₀` mechanism. | derived from pool composition |
| `S` | Total stake delegated to a pool, including the SPO's pledge plus all external delegation. | varies per pool |
| `S_sat` | Saturation point — total stake above which a pool's gross rewards stop growing. Approximately `(active network stake) / k`. | ≈ 65–75 M ADA |
| `p` | Performance factor — actual blocks the pool minted divided by the blocks its stake fraction would predict, capped at 1.0. | 0 to 1 |
| `A` (or `A_pledge`) | Pledge bonus per epoch — fixed ADA/epoch advantage a pledged pool earns over an otherwise-identical zero-pledge pool. Equals `r · a₀ · P / (1+a₀)` in the current formula. | derived |
| `A_cooperator` | **Proposed** cooperator bonus per epoch — parallel quantity for the largest delegator. Equals `r · c₀ · D_max / (1+a₀+c₀)` under the proposal. | derived |

### Terms

| Term | Definition |
|---|---|
| Epoch | A 5-day Cardano time period. Rewards are calculated and paid once per epoch. |
| ROA | Return on ADA — annualized percentage yield a delegator earns from staking. Computed by multiplying per-epoch yield by 73 (Cardano has 73 five-day epochs per year). |
| SPO | Stake Pool Operator — the entity running a Cardano stake pool. Sets `m`, declares `P`, and is paid `F` plus margin plus their pro-rata share. |
| Delegator | An ADA holder who delegates their staking rights to a pool to earn rewards. Retains spending control of their ADA at all times. |
| Cooperator | A coordinator that pools the staking rights of many individual delegators and directs them as a single block — Pool Ranger is the canonical example for this document. |
| Stake credential | The on-chain identity that determines which pool a UTxO's stake is delegated to. Distinct from the spending credential that controls who can spend the ADA. A single stake credential representing a cooperator is what defines `D_max`. |
| Pledge | The portion of a pool's total stake committed by the SPO themselves. Signals operator commitment and earns a reward bonus via `a₀`. |
| Margin | The SPO's percentage cut of post-fee rewards before the remainder is split among delegators. |
| Fixed fee | A flat ADA-per-epoch overhead the SPO takes off the top of gross rewards, before margin. |
| Gross rewards | The total reward pot a pool earns in an epoch, before any deductions (F, margin, pledge share). |
| Saturation | The level at which adding more stake to a pool stops increasing its gross rewards. Beyond saturation, additional delegation dilutes per-ADA returns for everyone in the pool. |
| Sybil attack | An attack in which one entity creates many fake identities — here, many small stake pools — to gain disproportionate influence while appearing as many independent participants. |
| Pledge bonus | The extra reward a pool earns through `a₀ · P`. Redistributed from the network's reward pot, not new emission. |
| Cooperator bonus | **Proposed** extra reward a pool would earn through `c₀ · D_max`, mirroring the pledge bonus on the delegator side. |
| Dilution | The effect where adding more stake to a pool reduces each existing stakeholder's per-ADA share of a fixed bonus (pledge bonus, fixed fee amortization, or — under the proposal — the cooperator bonus). |
| Leverage | A cooperator's ability to influence an SPO's behavior through the credible threat of withdrawing or relocating large delegation. Currently informal; under the proposal, becomes mathematically visible. |
| Nash equilibrium | A stable configuration in which no individual player can benefit from unilaterally changing strategy. Cardano's reward formula is designed to push the network toward an equilibrium of approximately `k` well-performing pools, assuming delegators behave rationally. |
| CIP | Cardano Improvement Proposal — the formal mechanism for proposing protocol changes. CIPs are debated, refined, voted on through on-chain governance, and activated through hard-fork combinator events. |
| Active stake | Total ADA actively delegated across the network in a given epoch. Used to compute `S_sat`. |
| Pool Ranger | The cooperative-delegation platform this document is written for. Pool Ranger members share their stake credential (never their spending key) with a coordinator that tracks pool parameters every epoch and rotates delegation toward whichever pools currently offer the best return. 99% of staking rewards flow to members, 1% to the coordinator. Pool Ranger is the canonical "cooperator" referenced throughout this document. |

## Answer:

Yes. The proposal here is a new protocol parameter — call it `c₀` (cooperator bonus factor) — that mirrors `a₀` on the delegator side of the reward formula. This document states the problem rigorously, explains why `a₀` must be preserved, defines `c₀`, walks through the consequences for each stakeholder, and compares it to existing CIPs.

### 1. The problem in precise terms

The standard Cardano delegator ROA formula (variables defined in the Glossary above; original derivation in `SPO_REWARD_ANALYSIS_CHART_COMPANION.md`) is:

```
ROA = (1 − m) · [ r/(1+a₀) + (A − F)/S ] · 73 · 100%
where  A = r · a₀ · P / (1+a₀)
```

The sign of `(A − F)` decides whether per-delegator ROA *rises* or *falls* as total pool stake `S` grows:

| Regime | `dROA/dS` | Pool type | Implication for a coordinator |
|---|---|---|---|
| `A > F` | negative | high-pledge pool (the kind Pool Ranger must pick to maximize ROA) | adding stake dilutes existing members |
| `A < F` | positive | low-pledge pool | adding stake helps existing members |
| `A = F` | zero | edge case | ROA flat |

Pool Ranger therefore faces a structural conflict:

- To **maximize ROA** for members, it must delegate to high-pledge, low-margin pools — the `A > F` regime.
- In that regime, **its own concentrated delegation dilutes the pledge bonus**, lowering ROA for the very members it serves.
- Spreading thinly across many such pools would solve the dilution but eliminate **bargaining leverage** — no single SPO faces a meaningful withdrawal threat from a small slice of Pool Ranger.

Quantitative anchor: take a 50 M-pledge pool with `F = 340`, `r = 0.000400`, `m = 1%`. Before Pool Ranger arrives, `S ≈ 50 M` and `(A − F)/S ≈ 8.55 × 10⁻⁵`. When Pool Ranger adds 25 M to reach saturation, `S ≈ 75 M` and `(A − F)/S ≈ 5.70 × 10⁻⁵`. Roughly a **0.21% absolute ROA loss** for members in the cluster. The loss scales with cluster size, is paid by members, and the protocol gives nothing in return.

The deeper issue: **the reward formula is neutral to cooperative delegation by design.** It rewards SPO pledge concentration (via `a₀`) but not delegator coordination. There is no protocol mechanism that says "thank you" when a coordinator like Pool Ranger does the work the equilibrium depends on — tracking pools, rotating delegation toward best return, and acting as the rational delegator the protocol assumes exists.

### 2. Why `a₀` must be preserved

`a₀` is Cardano's primary defense against **Sybil-style stake splitting** — the scenario in which a single ADA whale creates many small pools to gain disproportionate block production while appearing as many independent operators. The mechanism works through delegator preference, not direct restriction:

- A whale with X ADA who splits into N pools earns `r · a₀ · (X/N) / (1+a₀)` of pledge bonus per pool — small per pool, total unchanged across all N pools.
- Rational delegators read the small `A` on each fake pool, see the unattractive ROA the small pledge bonus produces, and avoid those pools in favor of pools with concentrated pledge.
- Without delegators, the whale's N-pool split nets less revenue than concentrating in one pool (each split pool's fixed fee is unearned, margin revenue collapses, saturation budgets go unused). The strategy fails in expectation.

The delegator-preference channel *is* the Sybil deterrent. Lowering `a₀` would solve Pool Ranger's leverage problem but reopen this channel — splitting becomes pure upside: N times the fixed-fee revenue, N times the saturation budget, no delegator-preference cost because all pools now offer essentially the same per-ADA return.

Every CIP that proposes touching `a₀` (notably the CIP-50 leverage-cap family) pairs the change with an anti-Sybil patch precisely because `a₀` cannot be removed without replacing the mechanism it carries.

**Constraint for any acceptable solution: leave the Sybil deterrent intact.**

(For a fuller game-theoretic treatment of `a₀`, including why the current value of 0.3 is widely considered too weak in practice and how multi-pool operators exploit it, see `claude_queries/pledge_effects.md`. That document is supporting material, not a prerequisite for the rest of this one.)

### 3. The proposal: `c₀`, a cooperator bonus factor

`c₀` is a new protocol parameter, structurally identical to `a₀` but applied to the **largest single delegator's stake** `D_max` rather than the SPO's pledge `P`:

```
gross_eff = p · r · (S + a₀·P + c₀·D_max) / (1 + a₀ + c₀)
```

`D_max` is the stake of the single largest delegator in the pool, identified by stake credential. A pool with one large coordinated delegator has high `D_max`; a pool with a thousand small unrelated delegators has low `D_max` even at the same total `S`.

The cooperator bonus is the symmetric mirror of the pledge bonus:

```
A_pledge      = r · a₀ · P     / (1 + a₀ + c₀)        [existing — pledge bonus, with adjusted denominator]
A_cooperator  = r · c₀ · D_max / (1 + a₀ + c₀)        [new — cooperator bonus]
```

The denominator becomes `(1 + a₀ + c₀)` so total network rewards remain conserved — the cooperator bonus redistributes existing reward share, it does not create new emission.

A reasonable starting value: `c₀ ≈ 0.1`. Lower than `a₀ = 0.3` because cooperator coordination is structurally easier than SPO pledging and the bonus should be more modest to avoid over-rewarding it. The exact value is a governance choice.

**Saturation cap on `D_max`.** To preserve the existing protocol property that no individual input can exploit saturation, `D_max` is treated as capped at `S_sat` in the formula — the same way the pledge contribution `P` is effectively capped at saturation in the current Cardano reward calculation. Concretely, the formula uses `min(D_max, S_sat)` wherever `D_max` appears. Without this cap, a single cooperator with stake exceeding saturation could continue to grow `A_cooperator` past the point where the SPO's pledge can do the same, breaking the structural symmetry between the pledge bonus and the cooperator bonus. With the cap, both sides face an identical ceiling and the cooperator bonus stops contributing extra reward at the same scale where pledge does.

### 4. Why this fixes the dilution problem

The full delegator ROA formula becomes:

```
ROA = (1 − m) · [ r/(1+a₀+c₀) + (A_pledge + A_cooperator − F)/S ] · 73 · 100%
```

When Pool Ranger enters a pool and becomes the largest delegator:

- `D_max` jumps from a small value to Pool Ranger's stake
- `A_cooperator` grows substantially, partially or fully offsetting the `S` dilution
- For a sufficiently large Pool Ranger contribution, the net effect on `(A_pledge + A_cooperator − F)/S` can be positive even in a high-pledge pool

Numerical example: same 50 M-pledge pool, `m = 1%`, `F = 340`, `r = 0.000400`, with `c₀ = 0.1`.

**Before Pool Ranger** — no cooperator present, `D_max ≈ 0`, `S ≈ 50 M` (essentially pledge only, or pledge plus scattered small delegators whose largest individual stake is negligible):

```
A_pledge      = 0.000400 · 0.3  · 50M / 1.4 ≈ 4286
A_cooperator  ≈ 0
(A − F)/S     = (4286 − 340) / 50M         ≈ 7.89 × 10⁻⁵
```

**After Pool Ranger** delegates 25 M and becomes largest delegator — `S = 75 M`, `D_max = 25 M`:

```
A_pledge      = 0.000400 · 0.3  · 50M / 1.4 ≈ 4286    (unchanged — pledge didn't change)
A_cooperator  = 0.000400 · 0.1  · 25M / 1.4 ≈ 714
(A − F)/S     = (4286 + 714 − 340) / 75M   ≈ 6.21 × 10⁻⁵
```

Without `c₀`, the same Pool Ranger entry drops the term to `5.70 × 10⁻⁵`. With `c₀ = 0.1`, the term lands at `6.21 × 10⁻⁵`. The cooperator bonus partially cancels dilution: ROA falls from `7.89` to `6.21` instead of from `8.55` to `5.70`. The pool becomes a meaningfully better home for Pool Ranger's 25 M, and the SPO benefits from increased gross rewards flowing through margin.

At `c₀ = 0.2` or higher, the bonus can fully cancel or even reverse the dilution. Governance picks the value that matches the desired balance.

**A note on the "before" state.** The reader may notice that under the proposed formula the `(A − F)/S` term *before* Pool Ranger arrives is `7.89 × 10⁻⁵`, whereas under the current protocol it would be `8.55 × 10⁻⁵`. The difference comes from the `(1 + a₀ + c₀)` denominator: introducing `c₀` shrinks every pool's per-ADA reward share slightly, because total network emission is conserved. Pools without a cooperator pay a small base-rate reduction in exchange for the protocol funding the cooperator bonus elsewhere. This is the same redistribution principle that makes `a₀` work today (pledged pools earn at the expense of unpledged ones); `c₀` extends it to the delegator side. The cost is small at `c₀ = 0.1` and is explicitly addressed in the Risks table below.

### 5. Who benefits, and how

#### SPOs

- **A new revenue stream from attracting cooperative delegators.** Gross rewards rise when a single coordinator commits stake. The bonus enters gross before margin is taken, so the SPO's margin slice grows in absolute terms — courting a cooperator is directly profitable, not just defensive.
- **Negotiation replaces extraction.** Currently SPOs hold pricing power: they set margin and pledge, delegators take what's offered. `c₀` gives SPOs a positive reason to accommodate a coordinator's terms (lower margin, behavior commitments) rather than treating delegation as a one-way capture.
- **Higher floor for small operators.** Small honest operators without whale-tier personal pledge gain a route to competitive ROA: attract a cooperator. Pool operation no longer demands a large personal stake to be viable.

#### Delegators (Pool Ranger members and others)

- **Pooled delegation partially or fully cancels its own dilution (depending on `c₀`).** The cooperator bonus offsets the pledge-bonus dilution that adding stake to a high-pledge pool would otherwise cause. At `c₀ = 0.1` the worked example above cuts the 0.21% dilution roughly in half (down to about 0.10%); at `c₀ ≈ 0.2` or higher the cancellation can be complete or net-positive. Governance picks the exact value. Either way, members stop paying the full cost of Pool Ranger's bargaining position out of pocket.
- **The ROA cost of choosing values-aligned pools shrinks substantially.** With dilution largely offset, Pool Ranger can weight pool selection toward community values — governance participation, software contributions, single-pool operators, public goods funding — without sacrificing most of the yield premium. ROA still varies across pools by margin, performance factor, and base parameters, so it does not become irrelevant; but the structural ROA penalty for values-driven selection drops sharply.
- **Non-coordinated delegators benefit too.** Any delegator in a pool that hosts a cooperator earns a slice of `A_cooperator` pro-rata, because the bonus enters gross rewards before margin and pledge-share deductions and the remainder splits across all delegators by stake fraction. A small independent delegator who happens to share a pool with Pool Ranger gets a free ROA lift.

#### Pool Ranger specifically

- **Bargaining power becomes structural, not aspirational.** Pool Ranger's presence produces a measurable, on-chain ROA gift to the host pool. The threat of withdrawal is backed by visible mathematics — the pool's gross drops the day Pool Ranger leaves, in a way every delegator can see.
- **Concentration and ROA stop conflicting.** Pool Ranger can saturate a pool (maximum leverage) without the dilution penalty. The strategic choice between "concentrate for leverage" and "spread for ROA" collapses into one optimal play: concentrate.
- **Growth is self-reinforcing through the bootstrap range, with diminishing marginal returns at scale.** Larger Pool Ranger → larger `D_max` per pool it enters → larger cooperator bonus → higher member ROA → easier recruitment. The effect is strongest while `D_max/S` is small and growing (the bootstrap phase, where each new member visibly lifts ROA); as `D_max/S` approaches 1 and the saturation cap on `D_max` takes effect, the marginal ROA gain from each additional unit of cooperator stake flattens. The protocol rewards coordination through the range where it most needs to overcome the cold-start problem, without creating unbounded incentives for ever-larger cooperatives.

#### Decentralization

- **Tilts power from SPOs toward delegators.** Today SPOs unilaterally set margin, pledge, and operational behavior; delegators choose only which pool to accept. `c₀` makes SPOs *court* delegator coordinators, restoring two-sided negotiation between the parties whose interests should balance.
- **Reduces sticky-stake drag.** The reward for being an *active* coordinator increases. Sticky stake remains free to stay where it is, but the opportunity cost of not joining a cooperative grows. The protocol-intended equilibrium of "rational delegators rotating toward best pools" becomes more achievable in practice, not just in theory.
- **Does not centralize on SPOs.** Unlike lowering `k` or weakening saturation caps, `c₀` does not encourage fewer or larger pools. It encourages *more competitive* pools, since any small honest operator can attract a cooperator and instantly become viable. The 3,000-pool population can stay broad while still converging on the protocol-intended quality bar.

#### Protocol health

- **Closes a mechanism-design gap.** The current formula rewards SPO concentration (good for security) and is neutral to delegator concentration (bad for the rational-delegator assumption the equilibrium depends on). `c₀` fills the latter without touching the former.
- **Treasury-neutral by construction.** Unlike a treasury-funded subsidy, `c₀` redistributes existing reward share rather than creating new outflows. The `(1 + a₀ + c₀)` normalization keeps total network rewards conserved. The cost shows up as a small base-rate reduction in pools without a cooperator — analogous to how `a₀` today shifts reward share from unpledged toward pledged pools. No new emission, no treasury outflow.
- **Appears compatible with existing CIPs.** A leverage cap (CIP-50 family) polices SPO leverage; `c₀` rewards delegator coordination. The two operate on different sides of the reward formula and appear non-conflicting in principle, though formal analysis would be needed to confirm independence under joint adoption. If both were adopted, they would together form a balanced two-sided incentive system in which neither party can extract value from coordination without producing it.
- **Makes delegator concentration observable on-chain.** Under the proposal, each pool's `D_max` becomes a published per-epoch quantity, visible to governance bodies, delegators, and analytics tools. `c₀` itself does reward moderate concentration — so the on-chain visibility is not an "alarm system" per se. What it provides is a feedback loop: governance can monitor the resulting concentration patterns (how large the largest cooperators become, in how many pools, with what stability) and adjust `c₀` or its saturation cap in response. The incentive and its consequences become continuously legible to the same body that sets the parameter.

### 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cooperator coordinators (Pool Ranger and successors) become a centralization vector themselves | Cap `c₀ · D_max` at some fraction of `S_sat`. Beyond the cap, additional `D_max` contributes nothing further. Caps the incentive's effect on any single coordinator while preserving it for the bootstrap range. |
| Whales pose as cooperatives to claim the bonus | Require the large delegator's stake credential to be registered as a cooperative with a published membership ledger (on-chain or referenced). Pool Ranger already exhibits this property naturally; pure-whale single-account delegation could be excluded by definition or by requiring N≥k distinct members. |
| Reduces the diversification value of having many small delegators per pool | Accepted trade-off — the current "many small delegators" pattern is largely an artifact of sticky stake, not active protection. The saturation cap continues to limit any single pool's network share. |
| Political resistance from established high-pledge SPOs who currently capture maximum value from `a₀` | Real, but `c₀` does not threaten their pledge bonus — `A_pledge` is preserved (with a slightly smaller denominator). It threatens only their informational and pricing-power advantage over delegators. The shift is toward negotiation, not extraction. |
| Implementation complexity (on-chain `D_max` per pool per epoch) | Comparable to existing per-pool stake snapshotting. `D_max` is just `max()` over the existing stake distribution snapshot, computable in the same pass that builds the snapshot. |
| Pools without a cooperator see a small base-rate reduction (because the `(1 + a₀ + c₀)` denominator slightly shrinks every pool's per-ADA reward share) | This is the redistribution principle the proposal relies on — the cooperator bonus is funded by trimming base rewards in pools that have no cooperator, just as `a₀` is funded today by trimming rewards in unpledged pools. At `c₀ = 0.1` the base-rate reduction is around 7% of the original `r/(1+a₀)` term, which translates to roughly 0.15–0.20% absolute ROA for delegators in cooperator-free pools. Such pools have a clear incentive to attract a cooperator and recover the loss; the net effect is to redirect a small amount of reward share from sticky-stake pools toward pools with active coordination — which is the policy goal. The exact magnitude scales with `c₀` and is a governance dial. |

### 7. Comparison to existing CIP energy

| Proposal | What it does | Does it solve the cooperative-delegation gap? |
|---|---|---|
| Lower `a₀` directly | Weakens pledge bonus universally | Yes, but reopens the Sybil channel |
| CIP-50 leverage cap | Limits delegation/pledge ratio per pool | No — addresses SPO leverage, not delegator coordination |
| Treasury "trough" subsidy | Pays delegators to fill underused pools | Partial; treasury-funded, hard to scale, complex to define |
| **`c₀` cooperator bonus** | **Rewards delegator concentration symmetrically with pledge concentration** | **Yes — directly, treasury-neutral, Sybil-preserving** |

`c₀` is not a competitor to leverage caps; the two appear compatible (subject to the formal-analysis caveat noted in §5). A leverage cap polices the SPO side; `c₀` rewards the delegator side. Together they would form a balanced two-sided incentive landscape where neither party can extract value from coordination without producing it.

### 8. Summary

Cardano's reward formula assumes "rational delegators" but rewards only "rational SPOs". The asymmetry creates the structural conflict Pool Ranger faces: it must perform the rational-delegator function the protocol depends on, while paying an internal dilution cost when it does so at scale, and gaining no protocol-level acknowledgment of the role.

Lowering `a₀` would close the gap but reopen the Sybil-attack channel `a₀` is currently guarding. `c₀` resolves the impasse by mirroring `a₀` on the delegator side — a small protocol-level bonus for the largest single delegator in each pool, redistributed from the existing reward pot, leaving the Sybil deterrent untouched.

Adopting `c₀` would:

- Partially or fully eliminate Pool Ranger's internal dilution cost (depending on the chosen `c₀`)
- Convert bargaining leverage from "credible threat" to "measurable reward"
- Substantially reduce the ROA penalty for values-driven pool selection
- Open small honest pools to competitive viability via cooperator partnership
- Reinforce decentralization by tilting power toward delegator coordinators
- Preserve every existing protocol guarantee — Sybil resistance, treasury balance, saturation caps — while redistributing a small slice of base rewards from cooperator-free pools toward pools with active coordination, in keeping with the protocol's own redistributive design

It is the cleanest mechanism-design answer to the cooperative-delegation gap the current formula leaves open, and the natural complement to leverage-cap CIPs already under discussion.
