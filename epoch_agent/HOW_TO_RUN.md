# Pool Ranger Epoch Agent — What It Is And How to Run
This document is for humans and ai agents that need to make good decisions regarding how to delegate Pool Ranger's ADA to various stake pools. 

## Terms
Epoch Agent - This is the collection of documents containing general instructions, computer scripts, and data files in this directory (ranger/epoch_agent) which together are used to accomplish the task of intelligent stake pool delegation for the benefit of Pool Ranger cooperative members, stake pool operators, and Cardano protocol health.  

Agent - This is the ai or the human that is does the work of running the reports and creating the required unsigned transactions.

Administrator - Reviews the reports and unsigned transactions and signs the transactions and posts these at his or her discretion.


## How The Epoch Agent Is Supposed to work

This is a work in progress. The following numbered items represent the plan.  
Most of these requirements are already implemented by the scripts here in the ranger/epoch_agent directory.  
The current implementation is only a start and may vary from the plan below.  
As work proceeds, both the plan and the implementation will change as knowledge and experience are gained.  
The goal is to find the optimal plan and the make the implementation match the plan.  
Work will proceed step by step with small changes and evaluation until the goal is achived.  


1. The Agent, using the Epoch Agent, creates a candidate list that contains every Cardano stake pool that has been running for at least 30 epochs.  
Pool Ranger intentionally considers newer pools (those in the 30–73 epoch range) as candidates.  
Supporting newer, smaller pools promotes Cardano decentralization — one of Pool Ranger's core goals alongside maximizing member ROA.  
2. The Agent, using the Epoch Agent, pulls ticker, bech32 pool IDs, current parameters and delegation levels for every pool in the candidate list via Koios.
3. The Agent, using the Epoch Agent, works through the reward math on each pool to determine whether or not there is a red zone on either the SPOs or the delegators earning curve. A red zone on either curve would be those points where the slope of the curve is negative. More ADA delegation in a red zone reduces earnings until the red zone is passed. If there is a red zone then we need to know where the red zone is in relation to the current level of delegation. The intention is to determine if delegating more ADA to a pool will increase or decrease SPO earnings and increase or decrease Return ON ADA (ROA) for the delegators. If the current level of delegation already passes the red zone on a curve then the red zone is a non-issue and the pool is considered safe for delegation. If there is a red zone and the current level of delegation is on the left side of the red zone, then increased delegation will reduce earnings with more delegation until the red zone is passed. Delegating to these pools requires that we delegate enough ADA to bring overall delegation out of the red zone and at least back up to the level of earnings the SPO and the current pool delegators now enjoy. If increasing delegation would reduce earnings for either the SPO or for the current delegators then the pool will be dropped from the list of potential candidates for delegation but will be added to a list of pools for which we will ask its delegators to delegate with us under the condition that the slope of the curve for the SPOs and for the delegators is negative going all the way out to pool saturation. In other words, assuming that the Fixed Fee, the Margin, and the Pledge will remain unchanged and the slope of the curves are negative going all the way out to pool saturation, then we know that any amount of increased delegation will harm both the SPO and the delegator. Furthermore, we know that convincing current delegators to stake will us will actually increase the earnings for both the SPO and for the delegators. So there are two lists we are creating so far - a list of stake pools that we will consider for delegation and a list of stake pools from which we will try to convince delegators to stake with Pool Ranger. If there are any stake pools in the list which is being considered for delegation that do not have a performance factor of 99% for the last 20 epochs then the pool will be droped from the list.
4. Next the agent, using the Epoch Agent, should sort both lists. The list of pools selected for delegation (the list of pools for which both SPOs and delegators will benefit from increased delegation) must be sorted from highest to lowest according to which pools will produce the highest ROA for delegators. The list of pools selected for solicitation of delegators must be sorted from lowest to highest according which delegators are receiving the lowest ROA. The intention is to reach out first to those delgators who will benefit the most by staking with Pool Ranger.
5. Next the agent, using the Epoch Agent, determines the amount of ADA to be delegated to the stake pools such that maximum ROA is accomplished for Pool Ranger delegators and a report is provided to the administrator for approval. The Agent, using the Epoch Agent, produces a ranked recommendation list. The administrator reviews the list and approves execution. Then the Agent, using the Epoch Agent creates the unsigned transactions. It would be best if as many delegations as possible were bundled into as few transactions as possible.
6. Next the agent, using the Epoch Agent, examines the stake pool delegation for those stake pools which are listed to solicit delegation. The staking address of the delegators is identifed and used to open a channel of communication and a solicitation is made by the Agent, using the Epoch Agent to stake with the Pool Ranger cooperative.


Run this process once per Cardano epoch (every ~5 days).  
Currently, the Agent never signes transactions — it only advises.  
The human administrator reviews the report, decides whether to sign and post transactions, to move delegation.  
In the future an ai agent will not only run the report but may also sign and post transactions.  



## How The Epoch Agent Works Currently

---

### Prerequisites

- Node.js 18 or later (uses built-in `fetch`)
- `dotenv` package installed (`npm install` from `ranger/`)
- Internet access to reach `api.koios.rest` (Koios mainnet, no API key required)

---

### Step 1 — Populate `candidate_pools.json`

`candidate_pools.json` is the list of pools that `run.mjs` will evaluate each epoch.
There are two ways to populate it — auto-discovery and hand-picking — and they can be combined.

#### Option A — Auto-discovery (recommended for full mainnet scans)

Run `discover_pools.mjs` from the `ranger/` directory:

```bash
node epoch_agent/discover_pools.mjs           # replace candidate_pools.json with all qualifying pools
node epoch_agent/discover_pools.mjs --merge   # add new discoveries without removing existing pools
node epoch_agent/discover_pools.mjs --dry-run # preview what would be written (nothing is changed)
```

The script queries Koios for every registered pool on mainnet, applies pre-filters, and writes
the survivors to `candidate_pools.json`. Pre-filter thresholds (with defaults):

| Filter | Default | What it removes |
|--------|---------|----------------|
| Pool status | registered only | Retired and retiring pools |
| Min active stake | 1 M ADA | Tiny pools where fixed fee dominates rewards |
| Max active stake | 100% of S_sat | Oversaturated pools that reduce delegator ROA |
| Max margin | 5% | High-fee pools that rarely compete on ROA |
| Min age | 30 epochs | Brand-new pools with too little history to measure |

To override any threshold, add a `discoveryConfig` block to `ranger_state.json`:

```json
"discoveryConfig": {
  "minActiveStakeAda":     1000000,
  "maxMarginFraction":     0.05,
  "minEpochsOld":          30,
  "maxSaturationFraction": 1.0
}
```

A Koios API key is strongly recommended for auto-discovery runs because the script fetches
info for all ~6,000 mainnet pools in batches. Without a key the public tier (~10 req/s) will
work but the run will take several minutes. See the *Optional: Koios API key* section below.

After `discover_pools.mjs` finishes, proceed to Step 2 and then run `run.mjs` as normal.

#### Option B — Hand-picking (for evaluating a specific set of pools)

Edit `ranger/epoch_agent/candidate_pools.json` directly and add or remove entries:

```json
{
  "_comment": "Hand-picked pools to evaluate.",
  "_lastUpdated": "2026-04-27",
  "pools": [
    { "id": "pool1gtphgrdj8sluxm9e7ca2spcwcq2p0dxj9zf5v0yv3gsagzq704n", "ticker": "ADAFR" },
    { "id": "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy", "ticker": "NUTS"  }
  ]
}
```

The `_comment`, `_lastUpdated`, and `_howToFind` fields are optional metadata — `run.mjs`
only reads the `pools` array. Each entry needs `id` (bech32, starts with `pool1...`) and
`ticker` (any label you choose).

Where to find pool IDs:
- [pool.pm](https://pool.pm) — search by ticker, click a pool, copy the Pool ID
- [adapools.org](https://adapools.org) — same
- Koios API: `GET https://api.koios.rest/api/v1/pool_list?ticker=eq.YOURTICKER`

#### Combining both approaches

Run `discover_pools.mjs --merge` after hand-editing to add newly discovered pools without
removing any pools you placed in the file manually.

---

### Step 2 — Update `ranger_state.json`

Open `ranger/epoch_agent/ranger_state.json` and set `totalMemberStakeAda` to the combined
ADA balance of all cooperative members. This is the total stake available for delegation.

```json
{
  "totalMemberStakeAda": 50000000
}
```

Use whole ADA (not lovelace). Example: 50 M ADA = `50000000`.

If you recently submitted delegation changes that haven't yet settled on-chain, add them to
`inFlightChanges` so the agent doesn't double-count them:

```json
"inFlightChanges": [
  {
    "poolId": "pool1abc...",
    "changeType": "ADD",
    "stakeAda": 5000000,
    "submittedAtEpoch": 626,
    "activeFromEpoch": 628,
    "rewardsFromEpoch": 629,
    "note": "Approved 2026-04-20, tx abc123..."
  }
]
```

The agent auto-migrates settled entries (where `activeFromEpoch ≤ currentEpoch`) into
`currentDelegations` on each run. Settled entries are also appended to `completedChanges`
for a permanent audit trail — do not edit that field manually.

The `poolLuckHistory` field is maintained automatically by the agent — do not edit it manually.
After each run it appends one observation `{ epoch, luckZ, luckPremium, nEpochs }` per evaluated
pool. The last 20 observations per pool are kept; older ones are pruned. After 6+ runs, the
accumulated z-score history becomes a meaningful signal for detecting systematic performance
advantages (see *Luck premium and luck z-score* in the Interpretation guide below).

---

### Step 3 — Run the agent

From the `ranger/` directory:

```bash
node epoch_agent/run.mjs
```

To preview without updating `ranger_state.json`:

```bash
node epoch_agent/run.mjs --dry-run
```

The report is printed to the terminal and also saved to:
```
ranger/epoch_agent/reports/epoch_NNNN.txt
```

What the agent does on each run, in order:
1. Reads `candidate_pools.json` (pool IDs to evaluate)
2. Reads `ranger_state.json` (current delegations, in-flight changes, total stake)
3. Fetches the current epoch number and network active stake from Koios
4. Settles any in-flight delegation changes that are now active on-chain
5. Computes the live epoch rate `r` (average over the 5 most recent settled epochs)
6. Fetches pool parameters for all candidates (one batched POST to Koios)
7. Fetches up to 73 epochs of block and stake history per pool (parallel requests)
8. Fetches network-wide epoch info for all epochs found in the pool histories
9. Classifies each pool (ALL_GREEN / ALL_RED / HAS_RED_ZONE) and produces a recommendation
10. Runs a **global allocation** over ALL safe pools — both currently-delegated (HOLD) pools and new (DELEGATE) candidates compete equally for the full member stake budget. Computes diffs versus current delegations to produce HOLD / ADD\_MORE / ADD\_NEW / REDUCE / WITHDRAW recommendations with churn costs and break-even estimates for any proposed moves.
11. Formats and prints the report; saves it to `reports/epoch_NNNN.txt`
12. Writes updated `ranger_state.json` (unless `--dry-run`)

---

### Step 4 — Read the report

The report has these sections, in order:

| Section | What it means |
|---|---|
| **EXISTING DELEGATIONS** | Pools where Pool Ranger is currently delegating. Shows HOLD (no change), ADD MORE (increasing), REDUCE (decreasing — includes churn cost), or WITHDRAW (removing — includes churn cost) based on the global optimizer's comparison of all safe pools each epoch. |
| **REBALANCING MOVES** | Appears only when the optimizer proposes moving stake away from one or more currently-delegated pools. Lists each move with: the freed amount, churn cost in ADA (rewards missed during the 2-epoch delay), and break-even estimate (epochs until the ROA gain recovers the cost). Includes a ⚠ warning that members who joined within the last 2 epochs face a 4-epoch delay instead of 2. The administrator decides whether to approve each move. |
| **NEW CANDIDATES** | Pools from the candidate list not yet delegated to. Shows ADD recommendations, or explains why a qualifying pool is at saturation or the budget was exhausted this epoch. |
| **POOLS AVOIDED** | Pools not currently delegated to where adding delegation would harm the SPO (ALL_RED) or where Pool Ranger cannot supply enough stake to clear the red zone (HAS_RED_ZONE — cannot clear). |
| **POOLS DROPPED** | Pools that passed safety classification (ALL_GREEN) but failed the 20-epoch 100% performance requirement. |
| **SOLICITATION CANDIDATES** | Pools where adding delegation would harm the SPO — delegators here would benefit from joining Pool Ranger. (Phase 2 — reporting only, no outreach yet.) |
| **SUMMARY** | Count of forced withdrawals, rebalancing moves with total churn cost, new delegations, and any undeployed stake. Weighted ROA before and after. |
| **LUCK Z-SCORE TREND** | Appears in every report. Lists pools with 2+ recorded luck z-score observations and displays each epoch's z value in sequence. Flags any pool consistently above +1.5σ or below −1.5σ with a `***` warning. Use this section to detect systematic performance advantages accumulating over time that projected ROA cannot see. |
| **NEXT STEPS** | Numbered actions to execute, separated by type: forced withdrawals, approved rebalancing moves, and new/increased delegations. |

---

### Step 5 — Execute approved changes

If the report recommends changes you approve:

1. Submit each ADD or WITHDRAW transaction using your preferred Cardano wallet or CLI tool.
   (`_delegate.mjs` is planned but not yet implemented — transaction submission is manual for now.)
2. Record the submitted changes in `ranger_state.json → inFlightChanges` (see Step 2 format).

Cardano delegation timing:
- Change submitted in epoch **N**
- Snapshot taken at start of epoch **N+2** (delegation becomes active)
- First rewards paid at end of epoch **N+3**

---

### Interpretation guide

#### Pool classifications

| Classification | Meaning |
|---|---|
| `ALL_GREEN` | Safe to add stake at any delegation level. |
| `HAS_RED_ZONE — cursor PAST trough` | Red zone exists but current delegation is already past it — safe to add. |
| `HAS_RED_ZONE — cursor BEFORE trough — can clear` | Red zone exists and cursor is in it, but Pool Ranger has enough stake to push the pool past the trough in one move. Net effect is positive for the SPO. |
| `HAS_RED_ZONE — cursor BEFORE trough — cannot clear` | In the red zone and Pool Ranger cannot clear it. Do not delegate — it would harm the SPO. |
| `ALL_RED` | m=0% with a pledge bonus larger than the fixed fee. Every delegator reduces SPO income. Never delegate here. |

#### Performance filter

Only pools with **100% block production performance over the last 20 epochs** are eligible
for a DELEGATE recommendation. Performance is computed as:

```
perf = actual blocks produced / expected blocks (based on stake fraction)
```

Epochs where the pool had less than 0.5 expected blocks are excluded (too small to measure).
Performance is capped at 1.0 — lucky over-production does not inflate the score.
The agent fetches up to 73 epochs of pool history to supply the network epoch data needed
for these calculations, but only the most recent 20 epochs count toward the performance score.

#### ROA calculation — 73 epochs is an annualization constant, not a lookback window

The ROA formula is:

```
ROA/yr = (1 − m) · (gross_eff − F) / S  ×  73  × 100%
```

The **73** here means "73 epochs × 5 days = 1 year." It converts the per-epoch return into
an annual percentage. It is **not** a historical average over 73 past epochs.

The ROA estimate is made "recent" by the performance factor `p`, which is computed from the
20-epoch window above. The formula then asks: *if current pool parameters and this measured
performance hold for the next year, what would the annual return be?*

This means **newer pools (30–73 epochs old) are fully supported.** Because ROA is formula-based
— using live margin, fee, pledge, and stake — a pool that has run for only 30 epochs can have its
ROA estimated just as accurately as one that has run for 500 epochs. No historical reward data
is needed beyond what is required to compute the 20-epoch performance factor.

#### Saturation

The saturation point is:
```
S_sat = total_network_active_stake / 500
```
That 500 is Cardano's `k` (nOpt) parameter — the protocol targets 500 pools, so each pool's
saturation point is 1/500th of all staked ADA. As of epoch 627 (April 2026), total network
active stake is approximately **21.8 billion ADA**, making S_sat roughly **43.6 million ADA**.
This value shifts every epoch as stake enters or leaves delegation — the agent always fetches
the live figure from Koios and computes S_sat dynamically; no hardcoded value is used.

Saturation affects a pool at two separate stages, and it is important not to confuse them.

**Stage 1 — Discovery filter (`discover_pools.mjs`)**

When you run `discover_pools.mjs`, it drops any pool whose `activeStakeAda` is at or above
`maxSaturationFraction × S_sat` (default 1.0, i.e. 100% of S_sat). These pools never appear in
`candidate_pools.json`. A pool *in* `candidate_pools.json` passed this check — it is a candidate,
not a rejected pool.

**Stage 2 — Allocation headroom check (`allocate.mjs`)**

During each epoch run, even a pool classified as DELEGATE can receive no allocation if it is very
close to saturation. The allocator computes:
```
roomToSat = S_sat − pool.activeStakeAda
```
If `roomToSat` is less than the 10,000 ADA minimum meaningful delegation, the pool is skipped
entirely — even though it is not technically over-saturated. A pool could be at 99.98% of S_sat
and still appear in the candidate list while receiving no stake for this reason. Such pools receive
a **QUALIFIES — at or above saturation — no stake can be added** note in the report.

**Why a pool might look "not that close" but still receive no allocation**

Pools can also appear in the AVOID section or receive no stake for reasons unrelated to saturation:

- **Performance failure** — the pool must have exactly 100% block production performance over the
  last 20 qualifying epochs. Any deviation results in an AVOID recommendation.
- **Red-zone logic** — a pool with low margin and high pledge relative to its fixed cost may have a
  red zone where adding delegation reduces SPO income. If Pool Ranger cannot supply enough stake to
  push the pool past the trough in one move, the pool is AVOID.
- **20% concentration cap** — no more than 20% of the total budget goes to any single pool, so a
  pool may receive nothing simply because the greedy ranker funded better-ROA pools first.

#### Allocation limits and the global optimizer

The allocator (`globalAllocateWithR` in `allocate.mjs`) treats every safe pool — whether
currently delegated to (HOLD) or new (DELEGATE) — as an equal candidate each epoch. The full
member stake budget (total member ADA minus any in-flight transaction commitments) is
redistributed from scratch on every run. Two hard limits apply:

- **20% concentration cap** — no more than 20% of the total member stake is allocated to any
  single pool.
- **10,000 ADA minimum** — proposed changes smaller than 10,000 ADA are treated as noise and
  collapsed to HOLD.

All safe pools are ranked by delegator ROA at their current stake level (highest first) and the
budget is filled greedily. The resulting proposed allocation is compared to the current
allocation. Any pool whose proposed amount differs meaningfully from its current amount receives
a REDUCE or WITHDRAW recommendation (for decreases) or ADD MORE (for increases).

**Churn cost and break-even.** Moving delegation costs two missed reward epochs on the moved
amount (the new pool's delegation does not become active until epoch N+2 after submission).
For every proposed reduction or withdrawal, the report shows:

```
churn cost (ADA) = 2 × moved_ADA × (pool_ROA / 73 / 100)
break-even       = 2 × old_pool_ROA / (avg_new_destination_ROA − old_pool_ROA)  [epochs]
```

Example: moving 1 M ADA from a 4.0 %/yr pool to one averaging 4.5 %/yr costs ~1,096 ADA
and breaks even in ~16 epochs (~80 days).

**New-member delay note.** For a member who just joined (within the last 2 epochs), a
simultaneous Pool Ranger delegation move compounds to a 4-epoch delay (not 2) before their
first rewards. The report flags this with a ⚠ warning; per-member tracking of join dates is
not yet implemented.

#### Epoch rate `r`

`r` is computed fresh each run by averaging `total_rewards / active_stake` over the 5 most
recent settled epochs. As of 2026, `r ≈ 0.000310` (the reserve has been depleting since
mainnet launch). The chart's hardcoded `r = 0.000548` is outdated — the agent always
uses the live value.

#### The projected ROA ceiling

Looking across pools, projected ROA rarely exceeds about 2.2 %/yr regardless of how well a pool
performs. This is a hard limit set by the protocol's monetary expansion rate, not a bug.

The epoch rate `r` shown in the report header equals `total network rewards / total active stake`
per epoch. At `r = 0.000310`:

```
0.000310 × 73 epochs/yr = 2.263 %/yr  ← gross ceiling, zero-fee pool at full saturation
```

After the minimum fixed fee (170 ADA) and any margin, delegators in the best-case pools receive
approximately **2.1–2.2 %/yr** at most. Pools showing 1.6–1.7% projected ROA are lower either
because they are undersaturated (the fixed fee consumes a larger share of a small pool's rewards)
or because their margin is higher.

A fully saturated pool at ~43.6 M ADA with a 170 ADA fixed fee and 1% margin illustrates this:
the 170 ADA fee represents only ~1% of that pool's gross epoch rewards, so nearly all of the
2.26% gross reaches delegators after the margin cut. A pool with only 7 M ADA active stake pays
the same 170 ADA fixed fee but that fee now represents ~7–8% of gross rewards — a much larger
drag, producing a projected ROA closer to 1.6%.

As the Cardano reserve depletes over time, `r` slowly falls and the ceiling moves down with it.
The report always uses the live `r` averaged over the 5 most recent settled epochs.

#### Luck premium and luck z-score

Two related metrics appear for each pool in the ROA block:

**Luck premium** (`+0.31 %/yr`) is the raw number: the difference between the pool's historical
ROA over the last 20 epochs and the ROA that would have been expected at exactly perf = 1.0 during
those same epochs. A pool with +0.31 %/yr luck premium earned that much more than expected.

The problem with using luck premium to compare pools or track trends is that it is contaminated
by pool size. A small pool like BNTY1 (7.42 M ADA) produces only ~1–2 blocks per epoch on
average. One extra block in a given epoch is a 50–100% overperformance for that epoch — which
shows up as a large luck premium even if nothing systematic is happening. A large pool producing
15 blocks per epoch has much smoother variance, so its luck premium will naturally be smaller no
matter how well it performs. You cannot meaningfully compare luck premiums across pools of
different sizes.

**Luck z-score** (`+2.13 σ`) solves this by dividing the luck premium by its theoretical
standard error, derived from the Poisson model of block assignment. The result answers: *"given
how many blocks this pool typically produces, is this level of luck statistically surprising?"*
A z-score of +1.06 means the same thing whether the pool has 7 M or 70 M ADA — it ran 1.06
standard deviations above its expected performance.

Think of it like this: flipping a coin 4 times and getting 3 heads feels lucky but is not
surprising (z ≈ 1.0). Flipping 1,000 times and getting 600 heads suggests something systematic
about the coin (z ≈ 6.3). The z-score puts both situations on the same scale.

**Why the luck premium is almost always positive in this report.** All pools shown in the
delegation candidates section passed a 100% performance filter over 20 epochs. This is a
survivorship filter: pools that happened to run "hot" (got slightly more blocks than expected)
are statistically more likely to have also had a perfect performance record, because more assigned
blocks means more chances to demonstrate uptime. Any pool that ran cold over the same window is
more likely to have a missed slot in its record, failing the filter before reaching the report.
So the candidate list is pre-selected for pools on the lucky side of the distribution.

#### What the luck z-score reveals — and what it cannot

Projected ROA only models fees and saturation math. It assumes perf = 1.0 and is completely
blind to how reliably a pool wins block production in practice. Real-world factors do affect
which pools produce more blocks than expected:

- **Network position.** When two pools are assigned adjacent slots and the first pool's block has
  not propagated to the second before the second produces its own block, the two chains briefly
  fork and the network keeps whichever block propagated further first. A pool with fast,
  well-connected relay nodes near major Cardano relay clusters wins more of these "slot battles."
  Geographic location and relay network quality are invisible to the ROA formula but visible in
  the block count.
- **Hardware and software quality.** Pools that produce blocks quickly within their assigned slot
  window give those blocks more propagation time, reducing the chance of losing a fork fight.
- **Operator reliability.** Pools that apply node software updates promptly, maintain hot-standby
  infrastructure, and never miss an assigned slot demonstrate disciplined operation — which
  compounds into a slightly higher average block count over many epochs.

These advantages are small per epoch but real. Over many reports, they appear as a **persistently
positive luck z-score**. A single high reading can be pure chance; the same pool showing above
+1.5σ in every report across 6–10 consecutive epochs is far more likely to reflect a genuine
real-world edge.

What the z-score cannot do: it cannot predict future luck, only describe past luck. A pool at
z = +2.0 today may revert toward zero next epoch as the lucky epochs age out of the 20-epoch
window. The trend over many reports is the signal; a single reading is noise.

#### How to read the LUCK Z-SCORE TREND section

The LUCK Z-SCORE TREND section near the end of each report shows all pools with 2 or more
recorded observations. The full history is stored in `ranger_state.json → poolLuckHistory` and
the report section summarises it.

| Pattern | What it likely means | Suggested action |
|---------|---------------------|-----------------|
| z bouncing between −1.5 and +1.5 across reports | Normal random variance | No action — expected behaviour |
| z consistently above +1.5 for 4+ reports | Likely real systematic advantage | Favour this pool when projected ROA is competitive |
| z consistently below −1.5 for 4+ reports | Possible systematic disadvantage (slot battles lost, slower node) | Monitor; consider removing if the trend persists beyond 6 reports |
| z high in one report, then drops toward zero | Lucky streak reverting — was random | Ignore; this is statistically expected |
| z trending steadily downward over time | Old lucky epochs ageing out of the 20-epoch window | Do not chase; the historical premium is fading |

**Practical decision rule.** Only treat a pool's z-score as a meaningful signal once it has
**6 or more observations** and the **average across all of them exceeds +1.0**. Before that
sample size, even a run of +2.0 readings can be explained by chance.

The `***` warning that appears in the report when a pool is consistently above +1.5σ or below
−1.5σ is a prompt to look more carefully — not an automatic recommendation to add or remove stake.
Pair it with the projected ROA: a pool with consistent z > +1.5 *and* a high projected ROA is a
genuinely attractive candidate. A pool with z > +1.5 but a low projected ROA (due to high fees or
undersaturation) is benefiting from luck without translating it into better member returns.

---

### Optional: Koios API key

For higher rate limits, set `KOIOS_API_KEY` in `ranger/.env`:

```
KOIOS_API_KEY=your_key_here
```

Both `run.mjs` and `discover_pools.mjs` read this key automatically via `dotenv`.

- **`run.mjs`** — the public tier (~10 req/s) is sufficient for up to ~50 candidate pools.
- **`discover_pools.mjs`** — fetches info for all ~6,000 mainnet pools; an API key is
  strongly recommended to avoid rate-limit delays during the batch fetch.

---

### Files in this directory

| File | Purpose |
|---|---|
| `run.mjs` | Main entry point — evaluates `candidate_pools.json` and produces the report |
| `discover_pools.mjs` | Auto-discovers eligible mainnet pools and writes `candidate_pools.json`; supports `--merge` and `--dry-run` flags |
| `math.mjs` | Pure reward math (identical to `SPO_REWARD_ANALYSIS_CHART.html`) |
| `koios.mjs` | Koios mainnet API wrapper |
| `classify.mjs` | Pool classification engine (ALL_GREEN / ALL_RED / HAS_RED_ZONE) |
| `allocate.mjs` | Global stake allocator — `globalAllocateWithR()` re-evaluates all safe pools (HOLD + DELEGATE) each epoch against the full member stake budget, producing HOLD / ADD\_NEW / ADD\_MORE / REDUCE / WITHDRAW recommendations with churn costs and break-even estimates |
| `report.mjs` | Report formatter |
| `candidate_pools.json` | **Edit this** — list of pool IDs to evaluate (or generate with `discover_pools.mjs`) |
| `ranger_state.json` | **Edit this** — Pool Ranger's stake, delegation state, and optional `discoveryConfig` |
| `reports/` | One `.txt` report file per epoch run |

**Not yet implemented:** `_delegate.mjs` (transaction submission helper) is referenced in
the NEXT STEPS section of each report but has not been written yet. Until it exists, execute
delegation transactions manually and record the changes in `ranger_state.json → inFlightChanges`.

---

## Gaps Between the Goal State and the Current Implementation

The six numbered steps in "How The Epoch Agent Is Supposed to work" describe the intended end
state. The following table maps each goal step to what is actually built today.

| Goal step | What the goal says | What is currently implemented | Gap |
|---|---|---|---|
| **1 — Candidate list** | Auto-discover every pool on mainnet that has been running for at least 30 epochs. | `discover_pools.mjs` (added 2026-04-27) queries all registered mainnet pools from Koios, applies pre-filters (age, stake, saturation, margin), and writes the survivors to `candidate_pools.json`. Supports `--merge` to preserve hand-picked pools. Filter thresholds are configurable via `discoveryConfig` in `ranger_state.json`. | Partially closed — discovery is a separate manual step rather than being integrated into `run.mjs`. The `discoveryConfig` filter for `minEpochsOld` implements the 30-epoch age requirement. |
| **2 — Pull pool data** | Fetch ticker, bech32 ID, parameters, and delegation levels for every candidate. | ✓ Implemented — one batched Koios POST fetches all pool parameters; 73 epochs of history fetched per pool in parallel. | None. |
| **3 — Reward math and two lists** | Classify pools by red-zone math; produce a delegation list and a solicitation list; drop pools below 99% performance over 20 epochs. | ✓ Classification, cursor logic, and both lists are implemented. Performance threshold is **100%** (stricter than the plan's 99%). The check that the SPO and delegator earnings are *restored to their pre-addition level* after clearing the trough is not done — only that the post-add delegation is past the trough. | Partial — performance threshold differs; trough-clearing earnings restoration not verified. |
| **4 — Sort both lists** | Delegation list: highest to lowest ROA. Solicitation list: lowest to highest ROA (most harmed first). | ✓ Both sorts are implemented exactly as planned. | None. |
| **5 — Amounts, report, unsigned transactions, bundling** | Compute optimal ADA amounts, produce a ranked report for the administrator, then create unsigned transactions bundled as few as possible. | ✓ Amounts computed; ✓ report produced and saved. Unsigned transactions **not created** — `_delegate.mjs` does not exist. No bundling. | Partial — advisory report works; transaction creation and bundling are not implemented. |
| **6 — Solicitation outreach** | Identify staking addresses of delegators at solicitation pools; open a communication channel; make a solicitation to join Pool Ranger. | The report identifies solicitation candidates and sorts them. No staking addresses are looked up. No outreach of any kind occurs. | Full gap — Phase 2 is entirely unimplemented beyond the report section. |

### Additional gaps not explicitly described in the goal

- **Minimum pool age check: CLOSED (2026-04-27).** `discover_pools.mjs` filters out any pool whose `active_epoch_no` is within 30 epochs of the current epoch. Pools that pre-date this check by entering `candidate_pools.json` manually are still not age-checked by `run.mjs` itself — `run.mjs` trusts the list it is given.
- **HOLD pools re-evaluated against new candidates: CLOSED (2026-04-26).** The global allocator (`globalAllocateWithR` in `allocate.mjs`) now treats HOLD and DELEGATE pools identically each epoch. Stake flows toward better ROA opportunities automatically; every proposed reduction or withdrawal includes a churn cost and break-even estimate in the REBALANCING MOVES section. Remaining gap: no configurable minimum ROA-difference threshold before a move is recommended — even a 0.01 %/yr difference can generate a REDUCE recommendation.
- **Trough-clearing allocation is not minimum-precise.** For HAS_RED_ZONE pools that can be cleared, the plan implies delegating the minimum amount needed to push past the trough and restore earnings. The current allocator fills up to 20% of available stake or room-to-saturation — whichever is smaller — without targeting the trough minimum specifically.
- **No epoch cadence enforcement.** The plan says to run once per Cardano epoch (~5 days). Nothing in the code or the environment enforces or schedules this.

---

## Recommendations for Improving the Goals

The following suggestions are offered based on a close reading of both the goal description and
the current code. They are not criticisms — they are offered to help the goals become more precise
and more achievable as the project matures.

### 1 — Reconsider the performance threshold: 99% vs. 100%

The goal says 99%, the code uses 100%. The 100% threshold is arguably more correct for the
following reason: delegator ROA math already incorporates the `perf` factor — a pool producing
95% of expected blocks earns proportionally less. The classification and ROA calculations are
accurate at any `perf` value. The performance *gate* (99% or 100%) is a separate binary pass/fail
filter on top of that math. A 99% gate allows pools that have missed ~1% of expected blocks over 20
epochs, which is hard to distinguish from normal slot-lottery variance for small pools. A 100%
gate catches any deviation but may over-penalize pools for statistical noise.

**Recommendation:** Keep 100% as the threshold but add an explicit note in the goal that epochs
with fewer than 0.5 expected blocks are excluded. Consider increasing the performance window to
30 epochs (matching the minimum pool age) for a more statistically reliable measurement. Make
the goal and the code agree on the same number.

### 2 — Narrow the scope of auto-discovery before fetching history — IMPLEMENTED (2026-04-27)

**Implemented:** `discover_pools.mjs` applies a pre-filter stage before any expensive per-pool
history fetches occur. It queries all registered mainnet pools via Koios `/pool_list` and
`/pool_info` (in batches of 50), then discards pools that fail any of these cheap checks:
pool retired/retiring, active stake below minimum, active stake at or above saturation, margin
above maximum, pool age below minimum. Only the survivors are written to `candidate_pools.json`,
keeping `run.mjs`'s expensive 73-epoch history fetches focused on a much smaller working set.

All thresholds are configurable in `ranger_state.json` under `discoveryConfig`. Defaults:
1 M ADA min stake, 5% max margin, 30 epochs min age, 100% of S_sat max saturation.

**Remaining gap:** Discovery is still a separate manual step — the administrator must run
`discover_pools.mjs` before `run.mjs`, rather than discovery happening automatically inside
each epoch run.

### 3 — Specify the trough-clearing delegation amount more precisely

The goal says: "delegate enough ADA to bring overall delegation out of the red zone and at least
back up to the level of earnings the SPO and the current pool delegators now enjoy." The current
allocator does not do this — it allocates up to 20% of available stake regardless of how much is
actually needed to clear the trough.

**Recommendation:** Add a step to the goal and the allocator: for each HAS_RED_ZONE pool that can
be cleared, compute the *minimum* ADA needed to push past the trough (this is `troughExtAda`
minus `externalExcludingRanger`). Allocate that minimum first, plus a small buffer (e.g., 5%),
then deploy remaining stake to other pools. Only fall back to the 20% cap if the trough-clearing
minimum exceeds it.

### 4 — Re-evaluation of HOLD pools — IMPLEMENTED (2026-04-26)

The old system never moved stake away from a HOLD pool unless it became unsafe. The global
allocator introduced in this session closes that gap.

**Implemented:** `globalAllocateWithR()` in `allocate.mjs` treats HOLD and DELEGATE pools as
equal candidates every epoch. The full member stake budget is distributed from scratch each run.
Any pool whose proposed allocation differs meaningfully from its current allocation receives a
REDUCE or WITHDRAW recommendation in the REBALANCING MOVES section, along with the churn cost
and break-even estimate. The administrator retains final approval.

**Remaining gap:** There is no configurable minimum ROA-difference threshold. The optimizer will
recommend a move even when the ROA gain is tiny (e.g., 0.01 %/yr), which could produce
unnecessary churn. Adding a threshold (e.g., only recommend a move when `newROA − oldROA > 0.25 %/yr`
or `breakEvenEpochs < 20`) would filter out marginal moves. This threshold should be configurable
in `ranger_state.json`.

### 5 — Clarify what "bundle transactions" means for Pool Ranger's staking model

The goal says delegations should be bundled into as few transactions as possible. This is
worth clarifying because of how Pool Ranger works: each *member* has their own staking key
delegated separately by the administrator. A single Cardano transaction can carry multiple
delegation certificates — one per staking key — so many members' keys can be redirected in one
transaction.

**Recommendation:** Update the goal to explicitly state that bundling means: group as many
member staking key delegation certificates as possible into each transaction, up to the
protocol's per-transaction certificate limit. The target is one transaction per destination pool
change, not one transaction per member.

### 6 — Define "open a channel of communication" for solicitation concretely

Goal step 6 says the agent will identify delegator staking addresses and "open a channel of
communication." Staking addresses are public on-chain, but there is no on-chain mechanism to
send a message to a staking address directly. Contacting delegators requires a concrete approach.

**Two realistic options — the goal should choose one:**

- **On-chain metadata message:** Send a small ADA transaction (e.g., 2 ADA minimum UTXO) to
  each target delegator's stake reward address with a transaction metadata field describing Pool
  Ranger and how to join. This is entirely on-chain, costs a small amount per delegator, and
  is fully automatable. The 2 ADA is recoverable by the recipient.
- **Off-chain registry:** Require prospective members to register contact information (email,
  social handle) in a publicly readable location (e.g., a signed on-chain metadata transaction
  from their staking key). The agent reads this registry and sends outreach off-chain.

The on-chain metadata approach is the most practical to implement and requires no off-chain
infrastructure. It is recommended as the Phase 2 target.

### 7 — Add member stake key tracking as a future goal

`ranger_state.json` currently stores `totalMemberStakeAda` as a single manually-maintained
number. In practice, Pool Ranger has multiple members each with a distinct staking key. As
membership grows, manually tracking the total becomes error-prone.

**Recommendation:** Add a future goal: store each member's staking key (or stake address) in
`ranger_state.json`. At the start of each run, query Koios for each member's current stake
amount and sum them automatically. This replaces the manual `totalMemberStakeAda` field and
ensures the total is always accurate regardless of member deposits or withdrawals.
