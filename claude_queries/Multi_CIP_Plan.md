# Multi-CIP Plan: Closing the Parameter Spaces Where Multipools Operate

**Planning document for a forthcoming write-up and simulator.**
**Author:** John Shearing (johnshearing@gmail.com)
**Created:** 2026-05-31
**Status:** Planning — not yet started on the deliverables.

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

The author of CIP-187 proposes the [Pool Ranger project](https://github.com/johnshearing/pool_ranger) to help with the issue of sticky stake (unresponsive delegators) but CIPs that increase the protocol health without the need for delegator response is ideal. 


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

### Design Goals

The new simulator must combine the strengths of both existing simulators:

| Strength to inherit | From |
| --- | --- |
| **Population view** — all pools shown at once as dots on a scatter plot | Cerkoryn's CIP-50 simulator |
| **3D scatter plot** — and extra axis for margin is shown | Cerkoryn's CIP-50 simulator | New idea |
| **Selectable output metric** —  color (not dot size) encodes ROA *or* SPO per-epoch earnings *or* pledge-bonus contribution *or* total operator income | New idea |
| **Pool list** — click on any dot opens a list of all pools that are using those parameters | New idea |
| **Drill-down** — double clicking on any dot opens the existing CIP-187-style per-pool detail view preloaded with the parameters indicated by dot location | New idea |
| **Three-axis parameter sliders** — `L` from CIP-50, `minPoolCost` (340 → 0) from CIPs 23/74/75, and the CIP-187 blend coefficient `b` | New idea |
| **MultiPool Display** — over the course of a 10 second interval, the color of the dot will change to indicate the selectable output metric as multipools from 1 (single pool) to 10 (pledge and delegation spread out over 10 multipools). So the first second shows the color for a single pool. The second second shows the color for two multipools, and so on until ten seconds are reached and the cycle repeats. A new button will activate this display. | New idea |

### Suggested Layout

```
+----------------------------------------------------+
| Sliders:                                           |
|   L (CIP-50 leverage cap)   [.........]            |
|   minPoolCost (ADA/epoch)   [.........]            |
|   CIP-187 blend b (0..1)    [.........]            |
|                                                    |
| Metric shown by dot size/color:                    |
|   ( ) Delegator ROA                                |
|   ( ) SPO total earnings / epoch                   |
|   ( ) SPO pledge-bonus share / epoch               |
|   ( ) SPO margin share / epoch                     |
|   ( ) SPO fixed-fee share / epoch                  |
+----------------------------------------------------+
| Scatter plot:                                      |
    x = pledge, y = margin,                          |
|   z = total stake, t = multipool Display           |
| dot represents a combination of parameters         |
    Click any dot for a list of tickers with pool IDs| 
    Double click on any dot for detail.              |
+----------------------------------------------------+
| Detail panel (appears on double click):                   |
|   Pool ticker, pledge, stake, margin, fee          |
|   Before/after table of all reward components      |
|   (same UI as CIP-187 simulator)                   |
+----------------------------------------------------+
``` 

### Data Source

The existing CIP-187 simulator already accepts pool ticker or pool ID input,
which implies the user has a pool dataset accessible. The new simulator should
reuse the same dataset.  
- This dataset is found locally at: `/home/js/aiken/ranger/epoch_agent/reports/epoch_XXX.txt`
- "XXX" in the report name is a place holder for the number of the current epoch.
- For example: '/home/js/aiken/ranger/epoch_agent/reports/epoch_633.txt'
- This dataset is found online at: https://github.com/johnshearing/pool_ranger/blob/main/epoch_agent/reports/epoch_XXX.txt



### Suggested Filename

`Multi_CIP_Combined_Simulator.html` — alongside the existing CIP-187 simulator at
`/home/js/aiken/ranger/`. Keep both simulators side by side; do not modify
the existing one.

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
Always read /home/js/aiken/CIPs/CIP-0187/README.md at the start of each session.
Always read /home/js/aiken/ranger/claude_queries/combine_cip_ideas.md at the start of each session.
Always read /home/js/aiken/ranger/claude_queries/Multi_CIP_Plan.md at the start of each session.
```

In addition, the next session should — when actually starting work on the
deliverables — read:

- `/home/js/aiken/ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html` (the existing
  CIP-187 simulator — to understand the UI patterns and the pool data format to reuse).
- The CIP-50 simulator source at `https://github.com/Cerkoryn/SPO-Incentives`
  (for reference on the population/scatter view — fetch with WebFetch if needed).
- Any pool dataset file referenced by the existing simulator : /home/js/aiken/ranger/epoch_agent/reports/epoch_XXX.txt

These three only need to be loaded when work begins on the simulator itself,
not at every session start.

---

## 9. Status Tracking

| Item | Status |
| --- | --- |
| Plan document (this file) | Created 2026-05-31. |
| Draft write-up `Multi-CIPs_Needed_To_Close_The_Parameter_Spaces_Where_MultiPools_Operate.md` | Not started. |
| Build combined simulator `Multi_CIP_Combined_Simulator.html` | Not started. |
| Publish new simulator to GitHub Pages | Not done. |

---

## 10. One-Sentence Summary

> The argument is that closing the multipool problem requires *three* CIP families
> working together — fixed-fee reduction (CIPs 23/74/75), pledge-leverage cap
> (CIP-50), and utilization-scaled pledge bonus (CIP-187) — because each one
> alone leaves a parameter space open into which MPOs will migrate; and because
> delegators are sticky, the most effective levers are the ones that change
> SPO per-epoch income directly.
