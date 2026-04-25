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
2. The Agent, using the Epoch Agent, pulls ticker, bech32 pool IDs, current parameters and delegation levels for every pool in the candidate list via Koios.
3. The Agent, using the Epoch Agent, works through the reward math on each pool to determine whether or not there is a red zone on either the SPOs or the delegators earning curve. A red zone on either curve would be those points where the slope of the curve is negative. More ADA delegation in a red zone reduces earnings until the red zone is passed. If there is a red zone then we need to know where the red zone is in relation to the current level of delegation. The intention is to determine if delegating more ADA to a pool will increase or decrease SPO earnings and increase or decrease Return ON ADA (ROA) for the delegators. If the current level of delegation already passes the red zone on a curve then the red zone is a non-issue and the pool is considered safe for delegation. If there is a red zone and the current level of delegation is on the left side of the red zone, then increased delegation will reduce earnings with more delegation until the red zone is passed. Delegating to these pools requires that we delegate enough ADA to bring overall delegation out of the red zone and at least back up to the level of earnings the SPO and the current pool delegators now enjoy. If increasing delegation would reduce earnings for either the SPO or for the current delegators then the pool will be dropped from the list of potential candidates for delegation but will be added to a list of pools for which we will ask its delegators to delegate with us under the condition that the slope of the curve for the SPOs and for the delegators is negative going all the way out to pool saturation. In other words, assuming that the Fixed Fee, the Margin, and the Pledge will remain unchanged and the slope of the curves are negative going all the way out to pool saturation, then we know that any amount of increased delegation will harm both the SPO and the delegator. Furthermore, we know that convincing current delegators to stake will us will actually increase the earnings for both the SPO and for the delegators. So there are two lists we are creating so far - a list of stake pools that we will consider for delegation and a list of stake pools from which we will try to convince delegators to stake with Pool Ranger. If there are any stake pools in the list which is being considered for delegation that do not have a performance factor of 99% for the last 20 epochs then the pool will be droped from the list.
4. Next the agent, using the Epoch Agent, should sort both lists. The list of pools selected for delegation (the list of pools for which both SPOs and delegators will benefit from increased delegation) must be sorted from highest to lowest according to which pools will produce the highest ROA for delegators. The list of pools selected for solicitation of delegators must be sorted from lowest to highest according which delegators are receiving the lowest ROA. The intention is to reach out first to those delgators who will benefit the most by staking with Pool Ranger.
5. Next the agent, using the Epoch Agent, determines the amount of ADA to be delegated to the stake pools such that maximum ROA is accomplished for Pool Ranger delegators and a report is provided to the administrator for approval. The Agent, using the Epoch Agent, produces a ranked recommendation list. The administrator reviews the list and approves execution. Then the Agent, using the Epoch Agent creates the unsigned transactions. It would be best if as many delegations as possible were bundled into as few transactions as possible.
6. Next the agent, using the Epoch Agent, examines the stake pool delegation for those stake pools which are listed to solicit delegation. The staking address of the delegators is identifed and used to open a channel of communication and a solicitation is made by the Agent, using the Epoch Agent to stake with the Pool Ranger cooperative.


Run this process once per Cardano epoch (every ~5 days).  
Currently, the Agent never signes transactions — it only advises.  
The human administrator reviews the report, decides whether to sign and post transactions, to move delegation.  
In the future an ai agent will not only run the report but may also sign and post transactions.  

The rest of this document explains how the Epoch Agent actually works in currently.

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
  "poolIds": [
    "pool1gtphgrdj8sluxm9e7ca2spcwcq2p0dxj9zf5v0yv3gsagzq704n",
    "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy"
  ]
}
```

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
`currentDelegations` on each run.

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

---

## Step 4 — Read the report

The report has these sections:

| Section | What it means |
|---|---|
| **EXISTING DELEGATIONS** | Pools where Pool Ranger is currently delegating. Shows HOLD or WITHDRAW recommendations. |
| **NEW CANDIDATES** | Pools from the candidate list not yet delegated to. Shows ADD recommendations, or explains why a qualifying pool is at saturation. |
| **POOLS DROPPED** | Pools that passed safety classification but failed the 20-epoch 100% performance requirement. |
| **SOLICITATION CANDIDATES** | Pools where adding delegation would harm the SPO — delegators here would benefit from joining Pool Ranger. (Phase 2 — reporting only, no outreach yet.) |
| **SUMMARY** | Count of adds, withdrawals, and any undeployed stake. Weighted ROA before and after. |
| **NEXT STEPS** | Exact transactions to execute, with pool IDs and amounts. |

---

## Step 5 — Execute approved changes

If the report recommends changes you approve:

1. Use `_delegate.mjs` to submit each ADD or WITHDRAW transaction.
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

### Saturation

The current saturation point `S_sat` is computed each run from live network data:
```
S_sat = total_network_active_stake / 500
```
Pools at or above `S_sat` receive a **QUALIFIES — but at or above saturation** note.
No stake is added — it would over-saturate the pool and reduce delegator ROA.

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
