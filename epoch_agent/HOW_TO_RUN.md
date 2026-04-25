# Pool Ranger Epoch Agent — How to Run

Run this agent once per Cardano epoch (every ~5 days) to get a delegation recommendation
report. The agent never executes changes — it only advises. A human reviews the report and
decides whether to act.

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
