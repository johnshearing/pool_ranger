# Multi-CIP Plan: Closing the Parameter Spaces Where Multipools Operate

**Planning document for a forthcoming write-up and simulator.**
**Author:** John Shearing (johnshearing@gmail.com)
**Created:** 2026-05-31

## Status Tracking

| Item | Status |
| --- | --- |
| Plan document (this file) | A work in progress |
| Draft write-up `Multi-CIPs_Needed_To_Close_The_Parameter_Spaces_Where_MultiPools_Operate.md` | Not started. |
| Build combined simulator `/home/js/aiken/ranger/Multi_CIP_Simulator.html` | The main 3D simulator which allows the user to explore the protocol paramter space against combinations of various CIPs is complete. The simulator is not yet connected to current stake pool data. |
| Publish new simulator to GitHub Pages: https://johnshearing.github.io/pool_ranger/Multi_CIP_Simulator.html | Done. |


---

## 1. Purpose of this Plan

This file is the working brief for a project with two deliverables:

1. **A written argument** at
   `/home/js/aiken/ranger/claude_queries/Multi-CIPs_Needed_To_Close_The_Parameter_Spaces_Where_MultiPools_Operate.md`
   showing that **no single CIP closes the entire parameter space in which multipools
   can profitably operate**, and that a combination of three families of CIPs is required.
2. **A new browser-based simulator** (a fresh `.html` file, separate from the existing
   CIP-187 simulator) that lets a reviewer move sliders for the levers from each of
   those CIP families and watch the combined effect on the whole pool population.

This document is intentionally self-contained. A future Claude session opening it
cold should be able to start work immediately without re-deriving the context.

---

## 2. The Core Thesis

Multipool operators (MPOs) survive by parking themselves in regions of the
parameter space where the Cardano reward formula does not penalize them. There
are three such regions, and each currently-active CIP family targets only one
of them. Activating any one CIP in isolation simply pushes MPOs into one of the
spaces the other CIPs would have closed.

| Parameter space where MPOs live | Why it's currently profitable | Which CIP family closes it |
| --- | --- | --- |
| **Zero pledge, zero margin, 340 ADA fixed fee** — the typical exchange / fee-farm pool. Operator income is the fixed fee × N pools × 73 epochs/year. | The fixed fee is paid out of rewards regardless of pledge. With huge delegated stake the fee is reliably extracted. | **CIPs 23, 74, 75** — reduce or eliminate `minPoolCost`. |
| **High delegation, low pledge** — heavily-leveraged pools that attract delegators but commit little operator capital. | Today the pledge influence parameter `a₀` punishes splitting only weakly, and a single low-pledge pool with huge delegation faces no cap. | **CIP-50** — introduces a leverage cap `σ' = min(σ, L·p)`. Pools beyond `L·pledge` stop earning extra rewards. |
| **High pledge, low delegation** — pools where the operator declares large pledge but attracts no delegators (and currently still collects the full pledge bonus). | The current pledge bonus `A = r·a₀·P/(1+a₀)` depends on `P` but not on `S`. An empty pledged pool earns the same per-pledge bonus as a saturated one. | **CIP-187** — multiplies the pledge bonus by utilization `u = min(S, S_sat)/S_sat`. An empty pledged pool earns nothing from pledge. |

Once any one CIP family is activated, MPOs move to the spaces the others would close:

- Eliminate the fixed fee → MPOs must rely on margin or pledge bonus. They can still run zero-pledge huge-delegation pools (closed only by CIP-50) or huge-pledge empty pools (closed only by CIP-187).
- Activate CIP-50 only → MPOs can still run huge-pledge empty pools and still extract the fixed fee from many pools.
- Activate CIP-187 only → MPOs can still run zero-pledge huge-delegation fee farms.

**The argument the write-up must make is that only the combination closes the whole space.**

---

## 3. The "Sticky Stake" Subargument

A secondary point — but an important one for the rhetoric of the write-up — is that
delegators are largely passive. Once stake is delegated, most delegators do not
revisit the choice. This has two consequences:

1. CIPs that work by changing **delegator ROA** (and thus require delegators to
   notice and move stake) are weakened by sticky stake.
2. CIPs that work by changing **SPO per-epoch income** are strong even with
   passive delegators, because SPOs are economically motivated to watch their
   own income closely.

This argues that the *most reliable* anti-MPO mechanisms are those that hit
the SPO P&L directly each epoch:

- Lower / eliminated fixed fee — cuts MPO income directly, no delegator action needed.
- CIP-187 utilization scaling — an empty pledged pool earns less pledge bonus *automatically*. The SPO must hunt for delegation; the delegator does not need to do anything.
- CIP-50 leverage cap — once a pool exceeds the cap, the *operator's* block-reward share stops growing. The SPO sees this in their epoch report.

This is a useful framing because most public CIP debate implicitly assumes that
fixing delegator incentives is enough. It probably isn't.

The author of this document and CIP-187 proposes the [Pool Ranger project](https://github.com/johnshearing/pool_ranger) to help with the issue of sticky stake (unresponsive delegators) but CIPs that increase the protocol health without the need for delegator response is ideal. I also suspect that a large segment of dReps are multipool operators and that a large segment of Cardano governance is are also multipool operators. So I feel that CIPs which seek to disincentivize multipool operation are not likely to be adopted in the current environment. Pool Ranger and Pool Ranger spinoffs create a new coalition voters (organized delegators). This coalition is what will push the these CIPs through the governance process. 


---

## 4. The CIPs Referenced

### CIP-50 — Pledge Leverage Cap
- **Repo:** https://github.com/cardano-foundation/CIPs/tree/master/CIP-0050
- **Mechanism:** Introduces a new protocol parameter `L`. A pool's rewardable
  stake is `σ' = min(σ, L · p)` where `p` is pledge and `σ` is total stake. Above
  `L · p`, additional delegation does not produce additional rewards.
- **Closes:** low-pledge / high-delegation parameter space.
- **Existing simulator:**   
  - Hosted at: https://spo-incentives.vercel.app/  
  - Source code at: https://github.com/Cerkoryn/SPO-Incentives    
  - **Strength:** Shows all pools at once as dots; ROA is encoded as dot size.  
  - **Weakness:** ROA is the only output metric; the operator's per-epoch income, pledge bonus, and margin income are not surfaced.

### CIP-187 — Utilization-Scaled Pledge Bonus
- **Repo (this project):** `/home/js/aiken/CIPs/CIP-0187/README.md`
- **PR:** https://github.com/cardano-foundation/CIPs/pull/1193
- **Mechanism:** Multiplies the existing pledge bonus by pool utilization
  `u = min(S, S_sat) / S_sat`. No new parameter; `a₀` unchanged.
  `A_new = A_current · u`.
- **Closes:** high-pledge / low-delegation parameter space.
- **Existing simulator:** 
  - Hosted at: https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html
  - Local source Code at: `/home/js/aiken/ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html`
  - Published source code at https://johnshearing.github.io/pool_ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html
  **Strength:** shows operator income breakdown per epoch — total SPO earnings,
  pledge-bonus contribution, margin contribution, fee contribution, delegator ROA.
  **Weakness:** examines one pool at a time, not the full pool population.
- Supporting "All Pools" provides the summary information missing from the simulation
  - Hosted at: https://johnshearing.github.io/pool_ranger/epoch_agent/epoch_report_viewer.html
  - Source code at: https://github.com/johnshearing/pool_ranger/blob/main/epoch_agent/epoch_report_viewer.html

### CIP-23 — Fair Min Fees
- **Repo:** https://github.com/cardano-foundation/CIPs/tree/master/CIP-0023
- **Mechanism:** Sharply reduces the fixed fee floor (example values: 50 ADA fixed,
  1.5% minimum margin). Replaces a flat fee with a margin floor that scales with
  pool size.

### CIP-74 — Set minPoolCost to 0
- **Repo:** https://github.com/cardano-foundation/CIPs/tree/master/CIP-0074
- **Mechanism:** Sets `minPoolCost = 0`. Most direct fee-elimination proposal.

### CIP-75 — Fair Stake Pool Rewards
- **Repo:** https://github.com/cardano-foundation/CIPs/tree/master/CIP-0075
- **Mechanism:** Staged reduction of `minPoolCost`: 340 → 100 → 0, then full removal,
  alongside a revised rewards model.

**All three of CIPs 23, 74, and 75 attack the same thing: the fixed-fee
revenue stream that makes pool replication profitable for MPOs.** The write-up
should treat them as a family.

---

## 5. The Proposed New Simulator

### Design Decisions (resolved 2026-06-01)

The design below was settled in a planning conversation and supersedes the earlier
sketch.

| # | Decision | Choice |
| --- | --- | --- |
| 1 | **Z axis** | **Delegation** (`D` = active stake − pledge), *not* total stake. Pledge (X) and delegation (Z) are then independent axes, so the whole cube is meaningful and the three MPO archetypes fall into three distinct corners (§5.1). |
| 2 | **Modes** | **Two modes sharing one metric function**: Population (real pools) and Field/MRI (synthetic parameter grid). |
| 3 | **Field/MRI rendering** | **All three** Plotly volume techniques: isosurface, volume (semi-transparent fog), and a slice-sweep plane. |
| 4 | **Multipool animation** | Dots stay **fixed** at the operator's aggregate position; **axes stay fixed**; per-pool values shown in a readout. Color encodes the **combined** take across all N pools. |
| 5 | **Sonification** | **Future enhancement** (§5.7); not in the first build. |
| 6 | **Data format** | **Prose report format** identical to `epoch_633.txt`, parsed by the parser lifted from `epoch_report_viewer.html`. |
| 7 | **Charting library** | **Plotly.js via CDN**, mirroring how the CIP-187 simulator loads Chart.js. |

### 5.1 The Five (+4) Encoding Channels

| Channel | Encodes | Notes |
| --- | --- | --- |
| **X axis** | Pledge `P` | spatial |
| **Y axis** | Margin `m` | spatial |
| **Z axis** | Delegation `D` (= total stake − pledge) | spatial; total stake `S = P + D` still used by the math and shown in tooltips |
| **Color** | Selectable output metric | with a colorbar/legend so a value can be *read*, not just compared |
| **Time** | Multipool count `N` = 1…10 (animated) | §5.5 |
| **Dot size** | *available* as an optional 6th scalar channel | reserved; use sparingly |
| **Opacity** | *available* as an optional 7th scalar channel | reserved; use sparingly |
| **Symbols** | *available* as an optional 8th scalar channel | reserved; use sparingly |
| **Symbol orientation** | *available* as an optional 9th scalar channel | reserved; use sparingly |

The three MPO archetypes from §2 then land in distinct regions of the cube:

| Region | Pledge (X) | Delegation (Z) | Closed by |
| --- | --- | --- | --- |
| Fee-farm / exchange pool | low | low (income via the `minPoolCost` slider) | CIPs 23/74/75 |
| Leveraged: low pledge, huge delegation | low | high | CIP-50 |
| Empty pledged pool | high | low | CIP-187 |

### 5.2 Selectable Output Metric (color)

A selector chooses what color encodes:
- Delegator ROA
- SPO total earnings / epoch
- SPO pledge-bonus share / epoch
- SPO margin share / epoch
- SPO fixed-fee share / epoch
- (Field-mode default) **MPO combined take / epoch** — the field whose high-value
  region we are trying to shrink.

### 5.3 Two Modes (shared metric function)

Both modes evaluate the **same** closed-form metric function
`f(P, m, D | L, minPoolCost, b, a₀, r, S_sat)`. The only difference is *where* it is
evaluated.

**Population mode** — one dot per real pool at its actual `(P, m, D)`.
- Answers "where do pools live today?"
- **Click** a dot → list of tickers + pool IDs at that location.
- **Double-click** a dot → CIP-187-style per-pool detail panel, pre-loaded with that
  real pool's parameters.

**Field / MRI mode (primary view for the argument)** — the metric sampled on a
regular grid filling the `(P, m, D)` cube, rendered as a 3-D scalar field. Answers
"what is the *shape* of the profitable region, and how does each CIP slider reshape
it?" — which *is* the thesis made visual.
- **Isosurface** — surface of constant metric value (e.g. "MPO earns > 200
  ADA/epoch"); raising `L`, lowering `minPoolCost`, or raising `b` visibly shrinks
  and deforms the enclosed "habitable region." (This is the money shot for the
  write-up.)
- **Volume** — semi-transparent colored fog, opacity mapped to the metric (the
  "3-D colored structures floating in the cube").
- **Slice-sweep** — a flat plane moved through the cube (the literal MRI analogy);
  the metric on the plane read as a heatmap, swept with a slider.
- **Double-click** a grid point → CIP-187 detail panel pre-loaded with the
  *parameters at that point* (parametric drill-down; no ticker).
- Field mode needs **no pool data** — the grid is synthetic.

Performance: a 30×30×30 grid (≈27 k cells) recomputes in milliseconds; Plotly does
isosurface extraction (marching cubes) client-side. Recompute on slider **release**
(debounced), not on every drag pixel. Grid resolution is a quality/speed dial.

### 5.4 Picking / Selection Toolkit

Raw 3-D mouse-clicking is unreliable (occlusion, depth ambiguity). Rotation (orbit),
zoom, and pan come free with Plotly 3-D; the following make *selection* robust:
- **Search box** — type a ticker or pool ID; the dot highlights and the camera flies
  to it. Most reliable selector ("pick by name, not by aim").
- **Linked 2-D projection panels** — small flat scatters (P×m, P×D, m×D) beside the
  cube; clicking a flat panel is unambiguous and highlights the matching 3-D dot.
- **Filter / range brushing** — hide pools outside a range to thin the cloud.
- **Click-to-cycle list** — if a click ray hits overlapping dots, pop a small list to
  choose from (also serves the "click → list of pools" requirement).
- **Hover tooltips** — identify a dot without clicking.
- **Nearest-dot snapping** — select the closest dot in screen space.

### 5.5 Multipool Animation

A button animates `N` = 1…10 over a 10-second cycle (1 second per `N`). At step `N`
the operator is modeled as splitting into `N` identical pools, each with pledge
`P/N`, delegation `D/N`, same margin `m`.
- Dots **do not move** — each stays at the operator's aggregate `(P, m, D)`.
- Axes **do not rescale** — a readout shows the current per-pool values
  ("N = 7 → each pool holds 0.71 M pledge, 3.2 M delegation").
- **Color = the operator's combined take across all N pools** = `N ×` (per-pool
  earnings at `P/N, m, D/N`). With CIPs active you watch the combined take collapse
  as `N` rises.
- A manual stepper/slider lets a reviewer freeze at any `N` for side-by-side
  comparison (animation persuades; the stepper supports analysis).

### 5.6 Parameter Sliders

- `L` — CIP-50 leverage cap (`σ' = min(σ, L·p)`).
- `minPoolCost` — CIPs 23/74/75 (340 → 0 ADA/epoch).
- `b` — CIP-187 blend coefficient (0…1; `A_blend = A_current·(1 − b + b·u)`).

Sliders recolor the cloud / reshape the field; they do not move real-pool dots.

### 5.7 Future Enhancement — Sonification

Deferred, not in the first build. Web Audio API: during the multipool animation,
play a tone whose pitch tracks the **aggregate** MPO take so the "squeeze" is
*audible* as the CIP sliders bite. Sound suits trends-over-time and accessibility;
it is poor as a per-dot channel (thousands of simultaneous tones = noise), so it is
mapped to the animation, not the dots.

### 5.8 Charting Library

**Plotly.js**, loaded from CDN exactly as the CIP-187 simulator loads Chart.js
(`<script src="https://cdn.jsdelivr.net/npm/…">`). Plotly provides 3-D scatter with
orbit/zoom/hover/click, color scales, legends, and the `Isosurface` / `Volume` trace
types needed for Field/MRI mode — all client-side, hostable on GitHub Pages with no
backend.

### Data Source

The new simulator reuses the **prose report format** already produced by the
`epoch_agent` pipeline (`report.mjs`) and already parsed by
`epoch_agent/epoch_report_viewer.html`. The parser (`parseReport()` in that file) is
lifted wholesale rather than rewritten.

- Population-mode file:
  `/home/js/aiken/ranger/epoch_agent/reports/multi_cip_sim_data.txt`
- It must contain the **full active-pool population** (unfiltered) — *not* the
  "ELIGIBLE POOLS" subset that `epoch_XXX.txt` reports contain. The eligible filter
  (no current Pool Ranger delegation + 100 % performance) would exclude exactly the
  fee-farm and empty-pledge archetypes the thesis needs on screen.
- The format already carries everything population mode needs: the `[TICKER]` prefix
  (present whenever a ticker exists — 591 of 660 pools in `epoch_633.txt` have one;
  the rest simply have no registered ticker), `P=` pledge, `F=` fee, `m=` margin,
  `Full ID:`, and `Active stake:` (delegation is derived as `active stake − pledge`).
  The header line carries `r` and `S_sat`.
- Field/MRI mode needs **no data file** — its grid is synthetic.
- Reference report in the same format:
  `/home/js/aiken/ranger/epoch_agent/reports/epoch_633.txt` (locally) and
  `https://github.com/johnshearing/pool_ranger/blob/main/epoch_agent/reports/epoch_XXX.txt`
  (online), where `XXX` is the current epoch number.

### Suggested Filename

`Multi_CIP_Simulator.html` — alongside the existing CIP-187 simulator at
`/home/js/aiken/ranger/`. Keep both simulators side by side; do not modify the
existing one. Publish to GitHub Pages alongside the existing one.

---

## 6. Outline for the Write-up

Working filename:
`/home/js/aiken/ranger/claude_queries/Multi-CIPs_Needed_To_Close_The_Parameter_Spaces_Where_MultiPools_Operate.md`

Proposed section structure:

1. **The observation.** Most multipools live in one of three parameter spaces.
2. **Why one CIP is not enough.** Each CIP closes one space and pushes MPOs into the others.
3. **The three parameter spaces and their CIPs.**
   - 3a. Zero-pledge fee-farm pools — closed by CIPs 23/74/75.
   - 3b. Low-pledge high-delegation pools — closed by CIP-50.
   - 3c. High-pledge low-delegation pools — closed by CIP-187.
4. **The sticky-stake argument.** Delegators are passive; SPO-side mechanisms work even when delegators don't move.
   - Pool Ranger will also help with sticky stake.
   - Pool Ranger also creates a new voting coalition (organized delegators) that will help to pass these CIPs.
5. **What each CIP misses on its own.** A table showing where each CIP fails and which other CIP picks up the slack.
6. **Combined effect.** What happens when all three families are active.
7. **The simulator.** Link to the new combined simulator. Walk through three or four
   guided scenarios that show MPOs being squeezed out of each space in turn.
8. **References.** Links to all CIPs and to both simulators.

---

## 7. Open Questions Before Drafting

Before writing the final document, the following need to be answered:

1. **Does the user want one combined simulator or several?** The proposed design
   is a single page with three sliders and a metric selector. Confirm before
   starting implementation.  
   Answer: The user wants one combined simulator.
2. **Should the new simulator publish to GitHub Pages alongside the existing one?**
   The existing one lives at `johnshearing.github.io/pool_ranger/…`. The new one
   should presumably live at a parallel URL.
   Answer: Yes, the new simulator should be published along side other existing one.

---

## 8. Files to Add to `CLAUDE.md` for the Next Session

When starting the next chat session, the project `CLAUDE.md`
(`/home/js/aiken/ranger/CLAUDE.md`) should pull in these files at session start
so the picture is complete:

```
Always read /home/js/aiken/ranger/claude_queries/Multi_CIP_Plan.md at the start of each session.  
Always read /home/js/aiken/ranger/Multi_CIP_Simulator.html at the start of each session.    
```

---



---

## 9. One-Sentence Summary

> The argument is that closing the multipool problem requires *three* CIP families
> working together — fixed-fee reduction (CIPs 23/74/75), pledge-leverage cap
> (CIP-50), and utilization-scaled pledge bonus (CIP-187) — because each one
> alone leaves a parameter space open into which MPOs will migrate; and because
> delegators are sticky, the most effective levers are the ones that change
> SPO per-epoch income directly.
