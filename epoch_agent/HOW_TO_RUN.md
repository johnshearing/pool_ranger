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

The rest of this document explains how the Epoch Agent actually works currently.

---

## Prerequisites

- Node.js 18 or later (uses built-in `fetch`)
- `dotenv` package installed (`npm install` from `ranger/`)
- Internet access to reach `api.koios.rest` (Koios mainnet, no API key required)

---

## Step 1 — Populate `candidate_pools.json`

Open `ranger/epoch_agent/candidate_pools.json` and add the bech32 pool IDs you want to
evaluate. The bech32 format starts with `pool1...`.

```json
{
  "_comment": "Mainnet bech32 pool IDs (pool1...) to evaluate each epoch. Add pools here.",
  "_lastUpdated": "2026-04-24",
  "_howToFind": "Look up pool IDs on pool.pm, adapools.org, or Cardano Explorer.",
  "poolIds": [
    "pool1gtphgrdj8sluxm9e7ca2spcwcq2p0dxj9zf5v0yv3gsagzq704n",
    "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy"
  ]
}
```

The `_comment`, `_lastUpdated`, and `_howToFind` fields are optional metadata — the agent only reads `poolIds`.

Where to find pool IDs:
- [pool.pm](https://pool.pm) — search by ticker, click a pool, copy the Pool ID
- [adapools.org](https://adapools.org) — same
- Koios API: `GET https://api.koios.rest/api/v1/pool_list?ticker=eq.YOURTICKER`

---

## Step 2 — Update `ranger_state.json`

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

---

## Step 3 — Run the agent

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
10. Allocates available stake to DELEGATE-recommended pools using a greedy ROA-ranked strategy
11. Formats and prints the report; saves it to `reports/epoch_NNNN.txt`
12. Writes updated `ranger_state.json` (unless `--dry-run`)

---

## Step 4 — Read the report

The report has these sections, in order:

| Section | What it means |
|---|---|
| **EXISTING DELEGATIONS** | Pools where Pool Ranger is currently delegating. Shows HOLD or WITHDRAW recommendations. |
| **NEW CANDIDATES** | Pools from the candidate list not yet delegated to. Shows ADD recommendations, or explains why a qualifying pool is at saturation. |
| **POOLS AVOIDED** | Pools not currently delegated to where adding delegation would harm the SPO (ALL_RED) or where Pool Ranger cannot supply enough stake to clear the red zone (HAS_RED_ZONE — cannot clear). |
| **POOLS DROPPED** | Pools that passed safety classification (ALL_GREEN) but failed the 20-epoch 100% performance requirement. |
| **SOLICITATION CANDIDATES** | Pools where adding delegation would harm the SPO — delegators here would benefit from joining Pool Ranger. (Phase 2 — reporting only, no outreach yet.) |
| **SUMMARY** | Count of adds, withdrawals, and any undeployed stake. Weighted ROA before and after. |
| **NEXT STEPS** | Transactions to execute, with pool IDs and amounts. |

---

## Step 5 — Execute approved changes

If the report recommends changes you approve:

1. Submit each ADD or WITHDRAW transaction using your preferred Cardano wallet or CLI tool.
   (`_delegate.mjs` is planned but not yet implemented — transaction submission is manual for now.)
2. Record the submitted changes in `ranger_state.json → inFlightChanges` (see Step 2 format).

Cardano delegation timing:
- Change submitted in epoch **N**
- Snapshot taken at start of epoch **N+2** (delegation becomes active)
- First rewards paid at end of epoch **N+3**

---

## Interpretation guide

### Pool classifications

| Classification | Meaning |
|---|---|
| `ALL_GREEN` | Safe to add stake at any delegation level. |
| `HAS_RED_ZONE — cursor PAST trough` | Red zone exists but current delegation is already past it — safe to add. |
| `HAS_RED_ZONE — cursor BEFORE trough — can clear` | Red zone exists and cursor is in it, but Pool Ranger has enough stake to push the pool past the trough in one move. Net effect is positive for the SPO. |
| `HAS_RED_ZONE — cursor BEFORE trough — cannot clear` | In the red zone and Pool Ranger cannot clear it. Do not delegate — it would harm the SPO. |
| `ALL_RED` | m=0% with a pledge bonus larger than the fixed fee. Every delegator reduces SPO income. Never delegate here. |

### Performance filter

Only pools with **100% block production performance over the last 20 epochs** are eligible
for a DELEGATE recommendation. Performance is computed as:

```
perf = actual blocks produced / expected blocks (based on stake fraction)
```

Epochs where the pool had less than 0.5 expected blocks are excluded (too small to measure).
Performance is capped at 1.0 — lucky over-production does not inflate the score.
The agent fetches up to 73 epochs of pool history to supply the network epoch data needed
for these calculations, but only the most recent 20 epochs count toward the performance score.

### ROA calculation — 73 epochs is an annualization constant, not a lookback window

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

### Saturation

The current saturation point `S_sat` is computed each run from live network data:
```
S_sat = total_network_active_stake / 500
```
Pools at or above `S_sat` receive a **QUALIFIES — but at or above saturation** note.
No stake is added — it would over-saturate the pool and reduce delegator ROA.

### Allocation limits

When distributing available stake across DELEGATE-recommended pools the allocator enforces
two hard limits:

- **20% concentration cap** — no more than 20% of the total available ADA is added to any
  single pool.
- **10,000 ADA minimum** — delegations smaller than 10,000 ADA are skipped (too small to
  matter on-chain).

Pools are ranked by their current delegator ROA (highest first) and filled greedily until
the available stake is exhausted or all DELEGATE pools are at saturation.

### Epoch rate `r`

`r` is computed fresh each run by averaging `total_rewards / active_stake` over the 5 most
recent settled epochs. As of 2026, `r ≈ 0.000310` (the reserve has been depleting since
mainnet launch). The chart's hardcoded `r = 0.000548` is outdated — the agent always
uses the live value.

---

## Optional: Koios API key

For higher rate limits (useful with large candidate lists), set `KOIOS_API_KEY` in
`ranger/.env`:

```
KOIOS_API_KEY=your_key_here
```

Without a key the public tier (~10 req/s) is sufficient for up to ~50 candidate pools.

---

## Files in this directory

| File | Purpose |
|---|---|
| `run.mjs` | Main entry point — run this |
| `math.mjs` | Pure reward math (identical to `SPO_REWARD_ANALYSIS_CHART.html`) |
| `koios.mjs` | Koios mainnet API wrapper |
| `classify.mjs` | Pool classification engine (ALL_GREEN / ALL_RED / HAS_RED_ZONE) |
| `allocate.mjs` | Greedy stake allocator (maximizes weighted ROA) |
| `report.mjs` | Report formatter |
| `candidate_pools.json` | **Edit this** — list of pool IDs to evaluate |
| `ranger_state.json` | **Edit this** — Pool Ranger's stake and delegation state |
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
| **1 — Candidate list** | Auto-discover every pool on mainnet that has been running for at least 30 epochs. | User manually maintains `candidate_pools.json`. No network scan occurs. | Full gap — no auto-discovery. |
| **2 — Pull pool data** | Fetch ticker, bech32 ID, parameters, and delegation levels for every candidate. | ✓ Implemented — one batched Koios POST fetches all pool parameters; 73 epochs of history fetched per pool in parallel. | None. |
| **3 — Reward math and two lists** | Classify pools by red-zone math; produce a delegation list and a solicitation list; drop pools below 99% performance over 20 epochs. | ✓ Classification, cursor logic, and both lists are implemented. Performance threshold is **100%** (stricter than the plan's 99%). The check that the SPO and delegator earnings are *restored to their pre-addition level* after clearing the trough is not done — only that the post-add delegation is past the trough. | Partial — performance threshold differs; trough-clearing earnings restoration not verified. |
| **4 — Sort both lists** | Delegation list: highest to lowest ROA. Solicitation list: lowest to highest ROA (most harmed first). | ✓ Both sorts are implemented exactly as planned. | None. |
| **5 — Amounts, report, unsigned transactions, bundling** | Compute optimal ADA amounts, produce a ranked report for the administrator, then create unsigned transactions bundled as few as possible. | ✓ Amounts computed; ✓ report produced and saved. Unsigned transactions **not created** — `_delegate.mjs` does not exist. No bundling. | Partial — advisory report works; transaction creation and bundling are not implemented. |
| **6 — Solicitation outreach** | Identify staking addresses of delegators at solicitation pools; open a communication channel; make a solicitation to join Pool Ranger. | The report identifies solicitation candidates and sorts them. No staking addresses are looked up. No outreach of any kind occurs. | Full gap — Phase 2 is entirely unimplemented beyond the report section. |

### Additional gaps not explicitly described in the goal

- **No minimum pool age check.** The goal says candidates must have been running at least 30 epochs. The code fetches up to 73 epochs of history but never checks how many epochs a pool has actually existed. A newly launched pool with few history entries passes through unchecked.
- **HOLD pools are never re-evaluated against new candidates.** Once a pool is in `currentDelegations` and remains safe, it gets a permanent HOLD. If a new DELEGATE-recommended pool offers meaningfully higher ROA, the system does not suggest moving stake.
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

### 2 — Narrow the scope of auto-discovery before fetching history

The plan says "every pool running for at least 30 epochs." On mainnet today there are roughly
3,000 active pools. Fetching 73 epochs of block history for each would require thousands of
Koios requests — slow, rate-limit-intensive, and most of the results will be filtered out anyway.

**Recommendation:** Add a pre-filter step between discovery and history-fetching. Before pulling
history, discard any pool whose current active stake is below a configurable minimum (for example,
1 M ADA) or that is already at or above saturation. This will reduce the working set from thousands
to hundreds before the expensive per-pool history calls begin. The pre-filter parameters (min
active stake, max active stake relative to S_sat) should be configurable in `ranger_state.json`
or a separate config file.

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

### 4 — Add a goal for periodic re-evaluation of HOLD pools

The current system never moves stake away from a HOLD pool unless it becomes ALL_RED or an
unclearable HAS_RED_ZONE. Over time, a pool's ROA may drift significantly below newer candidates
as its parameters change or the network evolves.

**Recommendation:** Add a goal step between steps 4 and 5: for each pool in `currentDelegations`
with a HOLD classification, compare its current ROA to the top DELEGATE candidate. If the
difference exceeds a configurable threshold (e.g., 0.25 %/yr), recommend withdrawing and
redeploying. Account for the churn cost: withdrawal costs two epochs of missed rewards on the
moved stake, which should be factored into the break-even calculation.

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
