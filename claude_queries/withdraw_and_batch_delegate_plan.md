# Plan: Reward Withdrawal and Batched Delegation Scripts

**Status:** Planning only — no code to be written yet.
**Date:** 2026-05-19
**Why two scripts in one plan:** they share three concerns — fee economics, the contract's enforcement model, and the existing Ledger-signing workflow — so it's easier to think them through together.

---

## Table of contents

1. [Background and motivation](#background-and-motivation)
2. [Part 1 — `_withdraw_rewards.mjs`](#part-1--_withdraw_rewardsmjs)
3. [Part 2 — Batched delegation (`_delegate.mjs` rewrite)](#part-2--batched-delegation-_delegatemjs-rewrite)
4. [Part 3 — Future contract change: on-chain cost tracking](#part-3--future-contract-change-on-chain-cost-tracking)
5. [Open questions for later](#open-questions-for-later)

---

## Background and motivation

Two related issues surfaced while reviewing the current `REQUIREMENTS.md` against the on-chain contract:

### Issue A: Two reward-withdrawal scripts collapse into one

The original plan called for `_push_rewards.mjs` (admin-initiated) plus a separate `_member_withdraw.mjs` (member-initiated, with a 1-epoch admin grace window). That design predates the current contract.

The current `withdraw` handler in `ranger/validators/coop_stake.ak` enforces the 99/1 split **regardless of who signs**:

```
(signed_by_admin || signed_by_member)
  && admin_received  <= withdrawal_amount * 1 / 100
  && member_received >= withdrawal_amount * 99 / 100 - tx.fee
```

There is no time-locked admin window in the contract because there does not need to be. The contract no longer trusts the admin to "do the right thing" — the math is enforced on every withdrawal. So a single `_withdraw_rewards.mjs` script suffices.

`REQUIREMENTS.md` has been updated to reflect this. This plan describes the unified script.

### Issue B: 1 ADA per delegation tx may exceed the 1% admin fee

Cardano charges roughly 1 ADA in transaction fees for a single delegation transaction that uses a Plutus V3 stake script witness. At ~3% annual ROA, a member's rewards per epoch are only ~0.041% of their stake. For the admin's 1% share of those rewards to recoup a single 1-ADA delegation tx, the member needs to hold roughly:

| Delegation cadence              | Member stake needed |
|---------------------------------|---------------------|
| Every epoch                     | ~244,000 ADA        |
| Every 5 epochs                  | ~49,000 ADA         |
| Every 18 epochs (~quarterly)    | ~13,500 ADA         |

Below those thresholds the admin loses money on that member. For Pool Ranger to be self-sustaining, the cost per delegation must come down.

The highest-leverage fix is to put many members' delegations into a single transaction. Each parameterized stake script (one per member) is roughly 400 bytes once compiled; the 16 KB Cardano tx-size cap leaves room for somewhere on the order of 25–35 delegations per tx. That shifts the break-even thresholds by ~25× and makes the 1% fee sustainable for almost any member.

The contract does **not** need to change to allow this — multiple `DelegateCredential` certs in one tx is a standard Cardano feature. Only the off-chain tooling changes, and even then by **addition**: a new `_batch_delegate.mjs` script is added alongside the existing `_delegate.mjs`, which keeps working as-is for single-member delegations.

A future contract change is also planned to track delegation costs on-chain explicitly, but that work is deferred until the cooperative is large enough that batched-fee economics no longer suffice. See [Part 3](#part-3--future-contract-change-on-chain-cost-tracking).

---

## Part 1 — `_withdraw_rewards.mjs`

### Purpose

Build a single transaction that withdraws all accumulated staking rewards from one member's coop stake account, splits the funds 99/1, and prints an unsigned tx hex for Ledger signing via `web/dist/sign_tx.html`.

### CLI

```
node _withdraw_rewards.mjs --name member_N --initiator admin
node _withdraw_rewards.mjs --name member_N --initiator member
```

- `--name member_N` — the row in `_1_members.json` whose rewards are being withdrawn.
- `--initiator admin|member` — explicit; the script refuses to default. Whichever party is named:
  - is the `extra_signatories` entry on the tx,
  - provides the fee-carrier UTxO (from their own wallet),
  - has their Ledger sign the unsigned tx in the browser tool.

The contract accepts either, with identical math.

### Inputs read from disk

- `_1_members.json` — to look up:
  - `admin_0.address` (always needed — admin receives the 1%)
  - `member_N.address` (the coop base address — member receives the 99%)
  - `member_N.memberPkh` and `admin_0.memberPkh` (parameters for the stake script)
  - `member_N.stakeAddress` (the reward account being drained)
  - `member_N.scriptHash` (sanity check against derived script)
- `.env` — Blockfrost API key.

### Live data fetched from Blockfrost

- **Reward balance** at `member_N.stakeAddress`. If `0`, exit cleanly with a message — no transaction needed.
- **UTxOs at the initiator's address** — to find a small "fee-carrier" UTxO that pays for the tx fee inside the balanced transaction. The actual fee value is reimbursed *from the rewards*, which is why the script will work even on a freshly funded admin wallet with only one or two UTxOs.

### Algorithm (step by step)

1. Parse `--name` and `--initiator`.
2. Read `_1_members.json` and resolve the admin row, the named member row, and validate that both have `memberPkh` and `address` fields.
3. Derive the parameterized stake script with `getCoopStakeScript(adminPkh, memberPkh)` from `common/common.mjs`. Confirm the resulting `scriptHash` matches the one stored on the member row.
4. Query Blockfrost for the reward balance at the member's stake address. If zero, exit.
5. Compute the on-chain math (in lovelace, all integer):
   - `withdrawal_amount = full reward balance`
   - `admin_amount      = floor(withdrawal_amount / 100)`   (matches the contract's `withdrawal_amount * 1 / 100`)
   - `member_amount     = withdrawal_amount - admin_amount - tx_fee`
   - Note: `tx_fee` is not known until the tx is balanced. MeshTxBuilder estimates the fee and feeds it back in. We will set the member output as the "change" output so the builder routes leftover lovelace there automatically once the fee is finalized.
6. Build the transaction:
   - **Withdrawal** from `member_N.stakeAddress` for the full `withdrawal_amount`, with the parameterized `coop_stake` script attached as the withdraw-purpose script. Redeemer can be any `Data` value (the contract ignores it).
   - **Input**: one small fee-carrier UTxO from the initiator's wallet. Returned as change to the initiator's own address minus whatever fee MeshJS calculates.
   - **Output 1**: exactly `admin_amount` lovelace → admin's base address (always — even when the initiator *is* the admin, this is a distinct output so the contract's `lovelace_received_by(admin_pkh)` check passes cleanly).
   - **Output 2**: `member_amount` lovelace → member's coop base address. This is the "change" output for the rewards portion.
   - **`requiredSignerHash`**: the initiator's payment-key hash, so the resulting `extra_signatories` field passes the contract's `signed_by_admin || signed_by_member` check.
7. Call `txBuilder.complete()`, then `.txHex`. Print the unsigned hex with a one-line summary of the split:
   ```
   Withdrawal: 12.345678 ADA
     Admin:    0.123456 ADA  (1.00%)
     Member:  12.034567 ADA  (>= 99% minus tx fee)
     Tx fee:   0.187655 ADA  (paid from rewards)
   Unsigned tx hex:
   84a4...
   ```

### Transaction structure (what the chain sees)

```
inputs:
  - fee_carrier_utxo (initiator's wallet)
withdrawals:
  - (member_N.stakeAddress, full_reward_balance)
outputs:
  - admin_amount       → admin.address
  - member_amount      → member_N.address          (coop base address)
  - change_from_carrier → initiator's address      (carrier minus fee)
required_signers:
  - initiator_pkh
witnesses:
  - withdraw-purpose script: parameterized coop_stake
  - key witness: initiator's Ledger signature (added later in the browser)
```

### Edge cases

- **Zero reward balance.** Exit before building a tx.
- **Reward balance so small that `floor(r/100) == 0`.** The admin would receive nothing for this withdrawal. Print a warning and proceed — the contract still accepts it because `admin_received (0) <= withdrawal_amount * 1 / 100 (0)` is true. Whether to skip or proceed is a policy choice; default to printing a warning and proceeding.
- **Reward balance below the tx fee.** `member_amount` goes negative. Detect before building and exit with a clear "rewards too small to cover tx fee yet" message.
- **Initiator wallet has no UTxOs.** Detect and exit with a message telling the user to fund their wallet with ~2 ADA as a fee carrier (the actual fee is reimbursed from rewards, but Cardano still requires a non-zero ADA input to balance).
- **Initiator wallet has only one UTxO and it is locked into being the fee carrier.** Acceptable — MeshJS will balance it.
- **`memberPkh` from `_1_members.json` does not match the derived script.** Sanity-check failure; exit before submitting.

### What this script does NOT do

- It does not update `_1_members.json`. Reward withdrawals are not membership state; the chain is the source of truth.
- It does not submit. Submission stays in `_submit_tx.mjs`.
- It does not sweep all members at once. One member per invocation, intentionally — the admin runs it N times in a loop at epoch boundary. (Future enhancement: a `_withdraw_rewards_all.mjs` admin sweep, but only after we know the per-member version is reliable.)

### Testing notes

We currently cannot end-to-end test this script: none of the test accounts have accumulated any staking rewards on Preview testnet yet. So the script will be written and dry-runnable (building unsigned hex from a fake reward balance via a mock or by waiting for real rewards), but real signing-and-submit will be deferred until rewards actually accrue.

Until then, the best validation is to:
- Unit-test the math (`admin_amount + member_amount + tx_fee == withdrawal_amount`).
- Confirm the unsigned hex decodes to a tx whose `withdrawals`, `outputs`, and `required_signers` match expectations using `cbor.me` or a similar inspector.
- Run `aiken check` against any new test cases added to `coop_stake.ak` that mirror the planned tx shape.

---

## Part 2 — Batched delegation (new `_batch_delegate.mjs` script)

### Goal

Add a **new** script that delegates many members in a single transaction. This is the change we need *now*, because every new test member we onboard costs ~1 ADA in delegation fees under the current per-member flow. Batching brings the per-member cost down to a small fraction of an ADA.

### Relationship to the existing `_delegate.mjs`

The existing `_delegate.mjs` is **not** being replaced. It works as-is and remains the right tool for one-off, single-member delegations (onboarding a new member, fixing one member's delegation, etc.). It stays in place, unchanged.

The new script (`_batch_delegate.mjs`) lives alongside it and is the right tool for the recurring "delegate everyone according to the config" workflow. The two scripts share concepts and helpers — anything currently inline in `_delegate.mjs` that the batch script also needs (admin lookup, `getCoopStakeScript()` usage, the `delegations[]` history append, collateral selection, etc.) should be **lifted into a shared helper** in `common/common.mjs` (or a sibling module) so both scripts call the same code. `_delegate.mjs` itself is refactored only to the extent needed to consume the shared helper; its CLI, behavior, and output stay the same.

In short: borrow the ideas and the helpers from `_delegate.mjs`. Do not overwrite it.

### Why we can do this without changing the contract

Cardano allows any number of `DelegateCredential` certificates in a single transaction. Each cert independently passes through its corresponding stake script's `publish` handler. The current `publish` handler in `coop_stake.ak` only requires `signed_by_admin` for delegation, and that signature is satisfied once for the whole tx — not once per cert. So bundling N delegations under one admin signature is exactly what the contract was already built to allow. The existing single-member `_delegate.mjs` already exercises this same `publish` path; the new batch script just stacks more certs into one tx.

### Tx-size budget

Cardano's maximum transaction size is 16,384 bytes. The dominant cost in a multi-delegation tx is the per-member script witness. Each parameterized `coop_stake` script is on the order of 400 bytes compiled. Other tx components (inputs, outputs, certs, fee, etc.) take another ~500–1,000 bytes baseline.

Rough envelope:
- 16,384 baseline budget
- minus ~1,000 baseline overhead
- ~15,000 bytes for script witnesses
- ÷ ~400 bytes per script
- = **~37 delegations per tx, theoretical ceiling.**

We should not run right at the ceiling. Two safety factors push us down:
- Real script size varies slightly with parameter values (key hashes are fixed length but encoding overhead drifts).
- Cardano's protocol parameters can be tightened by governance vote, lowering the max tx size.

**Target: 20 delegations per tx.** Comfortable margin, and the per-member cost is already low enough (~1 ADA total tx fee ÷ 20 = 0.05 ADA per member) that pushing harder isn't worth the risk.

Before relying on this number, the implementation must **measure the actual compiled size** of one parameterized script on the current contract — the 400-byte figure is an estimate, not a measurement. The measurement can be done once and committed as a constant.

### CLI

```
node _batch_delegate.mjs
```

No flags. The script reads `delegation_config.json` (a new config file — see "Input" below; the existing `_delegate.mjs` does not use this file and continues to take `--name` and `--pool` flags as it does today), groups assignments into size-bounded batches, builds one unsigned tx per batch, and prints them.

If `delegation_config.json` has, say, 47 members assigned to pools, the script prints three unsigned tx hexes:

```
=== Batch 1 of 3 (20 delegations) ===
84a4...

=== Batch 2 of 3 (20 delegations) ===
84a4...

=== Batch 3 of 3 (7 delegations) ===
84a4...
```

The admin signs each in turn via `web/dist/sign_tx.html` and submits via `_submit_tx.mjs`.

### Input — `delegation_config.json`

A new config file for the batch script. The existing `_delegate.mjs` does **not** read this file — it continues to take `--name` and `--pool` flags. The batch script reads a flat array:

```json
[
  { "memberPkh": "abc123...", "poolId": "pool1..." },
  { "memberPkh": "def456...", "poolId": "pool1..." }
]
```

Members not in `delegation_config.json` are not delegated this run. Members whose current on-chain delegation already matches `delegation_config.json` should be **skipped** — there is no reason to pay a fee to re-delegate to the same pool. The skip check requires a per-member lookup of the current delegation via Blockfrost. The existing `_view_delegations.mjs` already does this, and `_delegate.mjs` already has a similar "refuse no-op redelegation" check against the `delegations[]` history; the relevant logic can be lifted into a shared helper that both `_delegate.mjs` and `_batch_delegate.mjs` call.

### Algorithm (step by step)

1. Read `_1_members.json` and `delegation_config.json`.
2. For each entry in `delegation_config.json`:
   - Look up the member row by `memberPkh`.
   - Query Blockfrost for current on-chain delegation at `member.stakeAddress`.
   - If current delegation == `poolId`, skip with a "no change needed" message.
   - Otherwise, add `{member, poolId}` to the **pending list**.
3. Chunk the pending list into batches of `BATCH_SIZE` (20).
4. For each batch:
   - Build one tx with:
     - **Certs**: one `DelegateCredential { delegate: DelegateBlockProduction { poolId } }` per member in this batch.
     - **Witnesses**: one parameterized `coop_stake` script per member, attached as a publish-purpose witness for that cert.
     - **Input**: one or more UTxOs from the admin's wallet to cover the tx fee.
     - **Required signers**: `admin_pkh` (one entry covers all certs, because the contract checks `signed_by_admin` against `tx.extra_signatories` regardless of how many certs reference the admin).
   - Call `complete()` and print the unsigned hex.
5. After all batches are emitted, update the in-memory representation of `_1_members.json` to record the *intended* delegation: append a new entry to each affected member's `delegations[]` history with status `pending` (or similar — match the field the current script uses). Write the file. The on-chain state will be reconciled by `_view_delegations.mjs` after the admin signs and submits.

### What `_batch_delegate.mjs` reuses from `_delegate.mjs`

These pieces are conceptually identical in both scripts and should be shared via helpers rather than copy-pasted:

- Admin lookup from `_1_members.json` (the `ADMIN_NAME = 'admin_0'` row).
- `getCoopStakeScript(adminPkh, memberPkh)` from `common/common.mjs` for per-member parameter application.
- Collateral UTxO selection from the admin wallet (pure-ADA UTxO).
- The `delegations[]` history append shape: `{ poolId, requestedAt, txHash }` per member.
- Ledger-signing flow via `web/dist/sign_tx.html` — unchanged; the unsigned hex is just larger.
- Submission via `_submit_tx.mjs` — unchanged.

### What is new in `_batch_delegate.mjs`

- Reads `delegation_config.json` instead of `--name`/`--pool` CLI flags.
- Builds one tx per batch (many certs + many script witnesses per tx) instead of one tx per member.
- A skip-if-unchanged check (against on-chain delegation via Blockfrost) that avoids redundant delegations.
- A `BATCH_SIZE` constant (start at 20, document the reasoning in a comment that names the 16 KB cap and the measured script size).
- Emits N unsigned tx hexes labeled "Batch i of N" instead of one.

### Coexistence with `_delegate.mjs`

The single-member `_delegate.mjs` stays. It is the right tool when the admin wants to delegate exactly one member without preparing a config file (onboarding, ad-hoc fixes, one-off pool moves). `_batch_delegate.mjs` is the right tool for the recurring "delegate everyone in the config" workflow. Both scripts share helpers, update `_1_members.json` the same way, and produce hex that the same `web/dist/sign_tx.html` and `_submit_tx.mjs` consume.

### Testing approach

Because we add test members one at a time as the project grows, we can validate batching incrementally:

1. **Batch of 1.** Onboard one test member, populate `delegation_config.json` with that one entry, run `_batch_delegate.mjs`. The unsigned hex should look like a normal single-delegation tx (same shape `_delegate.mjs` would produce for the same member). Sign, submit, confirm via `_view_delegations.mjs`.
2. **Batch of 2.** Onboard a second test member, add their entry to `delegation_config.json`, run `_batch_delegate.mjs`. Confirm one tx contains both certs and both witnesses. Sign, submit, confirm.
3. **Batch of 5, 10, 20.** Continue scaling. At each step, note the actual tx size from MeshJS and compare against the 16 KB cap to validate the script-size estimate.
4. **Batch overflow.** Once 21+ members are eligible, confirm the script splits into 20-then-N. Sign and submit each batch; confirm via `_view_delegations.mjs` that all batches landed.
5. **Skip-if-unchanged.** With no config changes, re-running the script should produce zero batches and exit cleanly.
6. **`_delegate.mjs` still works.** After the shared-helper refactor, run `_delegate.mjs --name member_X --pool pool1...` and confirm its behavior is identical to before — same unsigned hex shape, same `delegations[]` append, same console output. This is the regression check on the single-member script.

No staking rewards are required for any of this testing — the batched-delegate flow is independent of the reward-withdrawal flow.

---

## Part 3 — Future contract change: on-chain cost tracking

### Why this is deferred

Batching delegations (Part 2) lowers the per-member delegation cost by roughly 20×. At that level the existing 1% admin fee is sustainable for any member holding more than a few hundred ADA. So the on-chain-cost-tracking idea is not urgent.

It becomes worth revisiting if any of these happen:
- Real-world members regularly hold less ADA than the batched break-even threshold (somewhere around 1,000 ADA per member at current Cardano fees and ~3% ROA, assuming one delegation change every 5 epochs).
- Cardano protocol fees rise (e.g., minimum fee per byte or per script-execution-unit goes up) and erode the headroom batching gave us.
- Pool churn turns out to be higher than expected and delegation switching cost dominates the 1% on a regular basis.

If none of those happen, we leave the contract alone.

### Sketched approach (for the future)

A second validator dedicated to a **per-member fee reserve UTxO**:

- New spend validator `coop_fee_reserve(admin_pkh, member_pkh)` — also parameterized per member, same key hashes as the stake script.
- At member registration time, the member funds the reserve with a small amount (e.g., 5–10 ADA).
- The admin can spend from this UTxO **only** in a tx that:
  - contains a `DelegateCredential` cert for *this member's* stake credential,
  - withdraws at most `tx.fee` worth of lovelace from the reserve (i.e., the reserve covers the actual fee, no more),
  - reproduces the reserve UTxO with the remaining balance at the same address.
- The member can spend from the reserve at any time using their spending key (the payment credential is theirs). On deregistration, the remaining reserve refunds to the member.

This puts the trust model exactly where it should be: the admin can only draw delegation fees, and only for delegation actions, and only up to the actual on-chain `tx.fee`. The member retains full control of the unspent reserve.

Open design points to revisit when this is built:
- Does the fee reserve sit at the member's coop base address, or at a separate validator address? Probably separate, so the spending credential is the new fee-reserve validator and the contract can enforce the "must spend on delegation" rule.
- How does top-up work? Member sends more ADA to the reserve address; no script execution required for top-ups.
- Does the `coop_stake.withdraw` handler need to change to also recognize fee-reserve replenishment from reward withdrawals? Maybe — that would auto-refill the reserve out of the rewards before the 99/1 split. Worth modeling.
- What happens if the reserve runs empty? Either the admin temporarily pays from their own wallet (logged off-chain), or delegation is skipped until the member tops up. Policy decision.

None of this needs to be designed in detail now. The note exists so that future readers know the option was considered and deliberately deferred.

---

## Open questions for later

These are questions that don't block writing either script today, but that should be answered before either goes to production.

1. **Exact compiled size of one parameterized `coop_stake` script.** Affects the `BATCH_SIZE` constant. One quick measurement during implementation.
2. **Does MeshTxBuilder need any special handling to attach N different scripts to N different certs in one tx?** Likely yes — the API is set up for spending scripts most prominently. Worth a short investigation before committing to the new batch script. (The existing `_delegate.mjs` attaches one script to one cert, so the per-cert mechanics are already proven; the question is just whether stacking N of them in the builder requires anything beyond looping.)
3. **Sweep mode for `_withdraw_rewards.mjs`?** Once the per-member version is proven, a `_withdraw_rewards_all.mjs` that iterates all members with non-zero rewards may be worth building. Probably not until the cooperative has more than a handful of members.
4. **Tax reporting for the admin's 1%.** Already listed as a "to design" decision in `REQUIREMENTS.md`. The withdraw script's output log is the natural place to record the data — keep that in mind when designing the per-tx summary printout.
