# Pool Ranger — Project Requirements

**Project name:** Pool Ranger (short form: `ranger`, used in all filenames)
**Working directory:** `/home/js/aiken/ranger/` — all files created, edited, and deleted here only.
**Model:** Use `ranger/` as the working directory; use `vesting/` as the workflow/code model.
**Stack:** `.mjs` scripts to start; TypeScript UI later; eventually Claude Code automation.
**Environment:** Windows 10 + WSL2 (Ubuntu).
**Network:** Cardano Preview Testnet.

---

## What Pool Ranger Is

Pool Ranger is a Cardano staking management platform built on Plutus V3 smart contracts.  
Members join by moving their ADA to a Pool Ranger base address
where:
- The **payment credential** is the member's own spending key 
  - Members always have full control their own funds.
  - Pool Ranger never has access to member funds.
  - Members can withdraw or spend their funds at any time.  
- The **stake credential** is a Pool Ranger Plutus script, parameterized with both the admin's
  and the member's key hash.

Because the stake credential is a script, the administrator controls delegation. Because the
payment credential stays the member's own key, the member can always spend their ADA — the
contract cannot lock funds.

Each member gets a **unique** parameterized script instance (derived from their own key hash).
This means the admin can delegate each member's stake to a different pool independently,
preventing any single pool from being over-saturated.

---

## Smart Contract (`validators/coop_stake.ak`) — Implemented

The contract is a parameterized Aiken validator:

```
validator coop_stake(admin_pkh: VerificationKeyHash, member_pkh: VerificationKeyHash)
```

### `publish` handler — stake certificate rules

| Certificate | Who may sign |
|---|---|
| `RegisterCredential` | Admin or member |
| `DelegateCredential { DelegateBlockProduction }` | Admin only |
| `UnregisterCredential` | Admin or member |
| `RegisterAndDelegateCredential` | Admin only |
| Everything else | Denied |

### Staking Reward `withdraw` handler — staking reward distribution rules

- **Either admin or member may initiate.** The rule is the same regardless of who signs.
- **Admin receives ≤ 1%** of the staking reward withdrawal amount.
- **Member receives ≥ 99% of staking rewards minus the transaction fee.**  
  - The fee is read from `tx.fee` and deducted from the member's floor.
   So neither party needs extra ADA on hand — the rewards are self-funding.   
   The initiator provides a small "fee carrier" UTxO that is returned as change.  
   The actual fee comes from the reward balance.  

### Security properties

- No spending (private) key is ever revealed or required by the contract.
- Members can revoke membership (deregister) at any time — admin or member signature suffices.
- Funds remain under sole member control at all times.
- Transaction fees for `publish` actions (register / delegate / unregister) are paid from the initiator's own wallet. 
- For `withdraw`, the fee is taken from the member's staking-reward balance instead.

---

## Off-chain Scripts (Phase 1 — .mjs scripts)

All scripts go in `ranger/`.  
Use `vesting/` as the code and workflow model.  

### Shared Config (`common/common.mjs`) — Implemented

- `blockchainProvider` — Blockfrost, Preview testnet
- `getTxBuilder()` — fresh `MeshTxBuilder` factory
- `loadSoftwareWallet(skPath)` — loads a wallet from a `.sk` root key file
- `getCoopStakeScript(adminPkh, memberPkh)` — central factory that applies parameters to
  the compiled script  
  - Returns `{ scriptCbor, scriptHash, stakeAddress, memberCoopBaseAddress }`

Hardware-wallet (Ledger) addresses are not loaded from disk — every script reads them
from the `address` field of each member's record in `_1_members.json`.

### Signing modes

All scripts that require a signature support two modes, following the same pattern:

**Hardware wallet (default — current active workflow):** reads the signer's address from the
matching entry in `_1_members.json` (look up by `--name`; the bech32 `address` is on the record),
fetches UTxOs via Blockfrost, builds the transaction, and prints the unsigned tx hex. The
unsigned hex is signed using the custom web tool at `web/dist/sign_tx.html` (open in Chrome
with the Eternl extension installed). The resulting signed tx hex is submitted using
`_submit_tx.mjs`:

```
node _submit_tx.mjs <signed-tx-hex>
```

Both admin and member wallets use Ledger hardware wallets. Neither has a `.sk` or `.addr`
file on disk — the only persistent record of either party's address is the matching entry in
`_1_members.json`. The very first time a new member is onboarded the admin must obtain that
member's bech32 receive address out-of-band (email, signal, in person) and pass it directly
on the command line to `_register_stake.mjs --addr <addr>`; from that point forward the
record in `_1_members.json` is the source of truth.

**Software wallet (future testing only):** each script contains a commented `SOFTWARE WALLET`
block. When uncommented, the wallet loads from a `.sk` root key file and auto-signs and submits
in one step. These blocks exist for automated testing scenarios only and are not used in the
current workflow.

This applies equally to admin scripts and member scripts.

### Script checklist

**Node.js scripts:**
- [x] `_generate_credentials.mjs` — creates software wallets; scaffolds Ledger support
- [x] `_transfer_funds.mjs` — sends ADA between wallets for testing
- [x] `_register_stake.mjs` — member registers their coop stake credential on-chain (pays 2 ADA deposit); hardware and software wallet signing
- [x] `_delegate.mjs` — admin delegates **one** member's stake to a chosen pool (per-member granular control via `--name` / `--pool` CLI flags); refuses on no-op (already delegated to that pool) and on drift (local history disagrees with on-chain state); hardware and software wallet signing
- [x] `_batch_delegate.mjs` — admin delegates **many** members in a single transaction (up to `BATCH_SIZE = 12` per run); pays one Cardano tx fee and asks for one Ledger signature for the whole batch. Reads `_1_delegation_config.json`, auto-snapshots `_1_members.json` to `_1_members_PRE_BATCH.json` for one-command rollback, and refuses the whole batch if any entry is in drift. Single-batch v1; multi-batch in one run deferred until the cooperative exceeds 12 active delegations (see source header for why)
- [x] `_submit_tx.mjs` — submits a signed tx hex to the network via Blockfrost; used after Ledger signing
- [ ] `_withdraw_rewards.mjs` — either admin or member can initiate.  
  - The contract enforces the 99/1 split on-chain regardless of signer  
  - (admin ≤ 1%, member ≥ 99% − tx.fee, fee paid from the rewards themselves)  
- [ ] `_revoke_membership.mjs` — member (or admin) deregisters the coop stake credential; returns 2 ADA deposit
- [x] `_view_delegations.mjs` — admin view: for each member, fetch the on-chain delegation and compare it to `_1_members.json`;  
  - flags mismatches (tx built but never submitted, still pending, etc.).  
  - Shows contract ADA balance and if active.
- [x] `_view_wallet_balances.mjs` —  Shows wallet ADA balances.  
  - This the amount not sent to the contract address.
- [x] `_view_members.mjs` — combined per-member report. For each row in `_1_members.json` (or just the one matched by an optional `--name` flag), prints three side-by-side balances — **registered receive address**, **other wallet addresses** (enumerated via Blockfrost `/accounts/{walletStakeAddress}/addresses` so funds Eternl has scattered across sibling derived addresses are visible), and **Pool Ranger base address** — followed by the on-chain delegation drift check and pending staking rewards (withdrawable now + lifetime earned). The leading comment block of the script is the canonical reference for the three address kinds it surfaces (stake address, registered receive base address, Pool Ranger base address). Strict superset of `_view_delegations.mjs` and `_view_wallet_balances.mjs`; those two are deliberately retained as focused single-purpose tools that are faster and clearer when only one piece of the picture is needed.
- [ ] `_view_pool_info.mjs` — view chosen pool(s), saturation level, recent epoch rewards
- [x] `_measure_batch_size.mjs` — diagnostic / developer tool. Builds a multi-delegation tx in memory (no submission) using the current `_1_delegation_config.json`, then reports the per-script CBOR size, the per-tx baseline overhead, and a recommended `BATCH_SIZE` that leaves ~25% headroom against the 16 KB tx cap. Re-run after any change to `validators/coop_stake.ak` to validate that the `BATCH_SIZE` constant in `_batch_delegate.mjs` is still appropriate. Read-only — safe to run any time.

**Web signing tool (`web/`) — Phase 1 bridge for Ledger signing:**
- [x] `web/package.json` — browser build dependencies (MeshJS + Vite + Node.js polyfills)
- [x] `web/vite.config.js` — Vite bundler config; aliases `crypto`/`stream`/`buffer`/`events` to browser polyfills so MeshJS builds for the browser
- [x] `web/sign_tx.html` — source HTML for the signing page
- [x] `web/sign_tx.js` — source JS; uses `BrowserWallet.enable('eternl')` and `wallet.signTx()` to sign via CIP-30 and return the complete signed tx hex
- [x] `web/dist/sign_tx.html` — **built output** — this is the file opened in the browser (run `npm run build` inside `web/` to regenerate)

**Future web pages (Phase 2 WebUI — not yet built):**
- [ ] `web/register.html` — member self-service: register stake, view coop base address
- [ ] `web/withdraw.html` — member withdraws 100% rewards after epoch window
- [ ] `web/revoke.html` — member revokes membership and recovers 2 ADA deposit
- [ ] `web/admin_delegate.html` — admin assigns each member to a pool
- [ ] `web/admin_push_rewards.html` — admin pushes reward distribution (collects 1% fee)
- [ ] `web/admin_dashboard.html` — admin view of all members, pools, saturation, rewards

### Data files

Pool Ranger keeps its off-chain state in JSON files alongside the scripts.
These files are read by the scripts at runtime and updated as new members
register, delegate, withdraw, or leave.

- [x] `_1_members.json` — **the working member directory and single source of truth for every wallet address Pool Ranger knows about.** Every script that touches a member (register, delegate, withdraw, revoke, view) reads or writes this file. It holds one entry per member: `name`, `address` (the bech32 Ledger receive address — admin and members alike), `memberPkh`, `stakeAddress`, `contractAddress`, `scriptHash`, `registration`, and a `delegations` history (newest entry = current intended delegation). On testnet today this file is committed. On mainnet it is expected to grow to thousands of entries of real cooperative membership data, and will not be committed to the public repo.
- [x] `_1_members_sample.json` — **a tiny shape-only sample committed to the public GitHub repo.** Its only purpose is to show readers of the repo what `_1_members.json` looks like (the field names and the nested `delegations` array) without exposing real cooperative membership data. The two files are intentionally *not* expected to match — `_1_members.json` will eventually contain thousands of real entries, while `_1_members_sample.json` stays small. Scripts must never compare the two or treat divergence as an error.
- [x] `_1_delegation_config.json` — **the admin's batched delegation plan.** A flat JSON array of `{ name, memberPkh, poolId }` entries, consumed by `_batch_delegate.mjs`. Lookup is by `memberPkh`; the `name` field is human-readable only (audit aid so the admin can read the file without cross-referencing 56-character pkh strings). Members not listed here are not touched on a batch run. On testnet this file is committed alongside `_1_members.json`; on mainnet it will hold real cooperative assignments and will not be committed.
- [x] `_1_members_PRE_BATCH.json` — **auto-snapshot of `_1_members.json` written by `_batch_delegate.mjs`** immediately before it overwrites the live file. Provides a one-command rollback (`cp _1_members_PRE_BATCH.json _1_members.json`) if the admin decides not to submit the tx, or if anything else goes wrong post-build. Overwritten on every batch run that produces pending delegations; not written when the script exits early (drift, no-op, or over-cap), so a useful prior snapshot is not clobbered by a no-op run. Not committed.
- [x] `.env` — `BLOCKFROST_API=previewXXXXX`. Not committed.

There are no `.addr` files in `ranger/`. Earlier in development each Ledger wallet had its
own `0_<name>.addr` file on disk; those files have been removed. Every script now reads
addresses from `_1_members.json` by name. A wallet only exists from Pool Ranger's point of
view once it has a row in `_1_members.json`.

### Admin wallet

The admin wallet is a **Ledger hardware wallet** (created 2026-04-17 on Preview testnet).
- Address lives in the `admin_0` row of `_1_members.json` (the `address` field). There is
  **no `0_admin_0.sk` and no `0_admin_0.addr`** file on disk.
- Hardware wallet signing mode (default) is the active workflow. 
- The software wallet block in each script is commented out and used only for automated testing.

### Member wallets

Member wallets are also **Ledger hardware wallets**. Each member's address is stored in
the `address` field of their `_1_members.json` row. There are **no `0_member_N.sk` or
`0_member_N.addr`** files on disk.
- Scripts look up the member's address by `--name` from `_1_members.json`, build an unsigned
  tx, and print the unsigned hex for the member to sign on their Ledger device.
- After signing, the member (or admin on their behalf) submits with `_submit_tx.mjs`.

---

## Member Workflow (End-to-End)

This is the step-by-step process a Pool Ranger member follows, from joining to withdrawing rewards.

### One-time setup
1. Get a Ledger hardware wallet. Install the **Cardano app** on it.
2. Install the **Eternl browser extension** in Chrome or Edge. Connect your Ledger to Eternl.
3. In Eternl: switch the network to **Preview testnet** (Settings → General → Network).
4. Send your Ledger receive address (the bech32 string from Eternl) to the admin so they
   know your public key hash and can parameterize your Pool Ranger stake script.

### Joining the Pool Ranger
5. The admin runs `_register_stake.mjs` on your behalf to build the stake registration
   transaction, passing your bech32 address directly:
   ```
   node _register_stake.mjs --name member_N --addr addr_test1q...
   ```
   This appends your row to `_1_members.json` and prints your unique **coop base address**
   plus an **unsigned tx hex** for you to sign.
6. Open `web/dist/sign_tx.html` in Chrome. Paste the unsigned tx hex. Click
   "Sign with Eternl (Ledger)". Approve on your Ledger device. Copy the signed tx hex.
7. Submit:
   ```
   node _submit_tx.mjs <signed-tx-hex>
   ```
8. Move your ADA to your **Pool Ranger base address** (printed in step 5). This is the address where
   your ADA lives while staking with Pool Ranger. Your spending key still controls the funds —  
   Pool Ranger cannot take them.

### Ongoing participation
- The admin will delegate your stake to a pool each epoch and push reward distributions after each epoch.
- You receive 99% of your staking rewards automatically. No action required on your part.
- You can check balances and rewards at any time with `_view_wallet_balances.mjs`.

### Withdrawing rewards
9. Either you or the admin can run `_withdraw_rewards.mjs` to trigger a reward distribution at any time.  
The contract enforces the split on-chain: 99% (minus the small transaction fee) goes to you, 1% goes to the administrator. The transaction fee is paid from the rewards themselves, so neither party needs spare ADA on hand.  
*(Script not yet built.)*

### Leaving Pool Ranger
10. Run `_revoke_membership.mjs` to deregister your coop stake credential and recover your
    2 ADA deposit.  
   Move your ADA back to a plain address.  
   *(Script not yet built.)* 

---

## Administrator Workflow (End-to-End)

This is the step-by-step process the Pool Ranger administrator follows.

### One-time setup
1. Admin wallet is a **Ledger hardware wallet**. Address lives in the `admin_0` row of
   `_1_members.json`. No `.sk` or `.addr` file on disk.
2. Admin installs **Eternl** in Chrome with the Ledger connected, Preview testnet selected.
3. Fund the admin wallet with enough preview ADA to pay delegation transaction fees.

### Onboarding a new member
4. Receive the new member's bech32 receive address from them (email, signal, in person).
5. Run `_register_stake.mjs --name member_N --addr <bech32-address>` to add the member's
   row to `_1_members.json` and build the registration tx; the member then signs it on
   their Ledger and pays the 2 ADA deposit.
6. Once confirmed, the member moves their ADA to their printed **coop base address**.

### Delegating stake to a pool

Two scripts handle delegation. Both build unsigned txs for Ledger signing and share the
same on-chain `publish` handler — the contract treats N delegation certs in one tx the same
as N separate transactions.

**One member at a time — `_delegate.mjs`:**

7a. Run `node _delegate.mjs --name member_N --pool pool1...`. Best for onboarding a new
    member, ad-hoc fixes, or one-off pool moves. The script refuses if the requested pool
    already matches both the member's local history and the on-chain delegation (no-op), or
    if those two disagree (drift — reconcile manually before retrying).
8a. Sign the printed unsigned tx hex in `web/dist/sign_tx.html`, then submit with
    `node _submit_tx.mjs <signed-tx-hex>`.

**Many members at once — `_batch_delegate.mjs`:**

7b. Prepare or update `_1_delegation_config.json` — a flat JSON array of
    `{ name, memberPkh, poolId }` entries. The format is documented in the
    `_batch_delegate.mjs` header comments.
8b. Run `node _batch_delegate.mjs`. The script reads `_1_delegation_config.json`, classifies
    each entry against history + chain (skip / drift / build), builds **one** transaction
    with one cert + one parameterized script witness per pending member, snapshots
    `_1_members.json` to `_1_members_PRE_BATCH.json` for rollback, and prints the unsigned
    tx hex. Up to `BATCH_SIZE = 12` delegations fit in one tx; over that the script refuses
    until the config is trimmed.
9b. Sign the unsigned tx in `web/dist/sign_tx.html` (one signature for the whole batch),
    then submit with `_submit_tx.mjs`. Verify with `_view_delegations.mjs` after a minute.

If you decide not to submit the tx, restore the pre-batch state with
`cp _1_members_PRE_BATCH.json _1_members.json` — otherwise drift detection will block the
next batch run.

If you change the validator (`validators/coop_stake.ak`), re-run `_measure_batch_size.mjs`
to confirm the `BATCH_SIZE = 12` constant still leaves enough headroom against the 16 KB
tx cap.

### Distributing rewards (each epoch)
10. At each epoch boundary, run `_withdraw_rewards.mjs` *(not yet built)* — once per member — to:
    - Withdraw the member's accumulated rewards from their coop stake address.
    - Route ≥ 99% (minus tx.fee) back to the member's coop base address.
    - Keep ≤ 1% as the admin fee.
    - Sign the withdrawal tx with the admin Ledger via the web signing tool.

    The same script is what a member runs to withdraw their own rewards — the contract enforces the 99/1 split on-chain regardless of who signs, so there is no separate admin-vs-member version and no time-locked admin window.

### Monitoring
12. Use `_view_members.mjs` *(not yet built)* to see all registered members and their reward balances.
13. Use `_view_pool_info.mjs` *(not yet built)* to track pool saturation and choose pools wisely.

---

## Pool Analytics & Epoch Reporting (Phase 1b — Implemented)

While building the smart contracts it became clear that the administrator needs robust tools
to pick the best pools each epoch. The need for these tools was discovered after the original
Phase 1 list was written, but they are an essential part of Pool Ranger and are now in active
use. They also lay the data + math foundation for the Phase 3 automation agent.

All of these tools pull live mainnet data from **Koios** (via `corsproxy.io`, no API key
required), so the admin can evaluate any real Cardano pool, not just preview-testnet pools.

### Epoch Reporting System (`epoch_agent/`)

A Node.js `.mjs` pipeline that runs once per epoch. It discovers candidate pools, evaluates
each one against Cardano's reward formula, allocates Pool Ranger's total stake across the best
fits, and emits a human-readable epoch report.

- [x] `epoch_agent/run.mjs` — top-level orchestrator; runs the full pipeline for one epoch
- [x] `epoch_agent/discover_pools.mjs` — discovers candidate pools from mainnet
- [x] `epoch_agent/koios.mjs` — Koios API wrapper (`pool_list`, `pool_info`, `pool_history`, `epoch_info`)
- [x] `epoch_agent/math.mjs` — Cardano reward math (gross rewards, SPO income, delegator ROA,
  pledge bonus `A_eff`, minimum-profitable margin `m_min`, trough analysis)
- [x] `epoch_agent/classify.mjs` — classifies each pool as `ALL_GREEN` / `HAS_RED_ZONE` /
  `ALL_RED` based on whether additional delegation helps or hurts the SPO
- [x] `epoch_agent/allocate.mjs` — allocates Pool Ranger's total stake across qualifying pools
- [x] `epoch_agent/report.mjs` — generates the per-epoch `epoch_NNN.txt` report
- [x] `epoch_agent/ranger_state.json` — persistent state across runs (history, prior decisions)
- [x] `epoch_agent/candidate_pools.json` — curated candidate pool list
- [x] `epoch_agent/reports/epoch_NNN.txt` — one report per epoch (e.g. `epoch_628.txt`,
  `epoch_629.txt`, `epoch_630.txt`)
- [x] `epoch_agent/HOW_TO_RUN.md` — operator runbook for the pipeline

Each report covers: eligible pools, high-pledge opportunities, pools avoided, pools dropped,
solicitation candidates, luck Z-score trends, existing delegations, rebalancing moves, and
per-pool parameter changes detected this epoch.

### Interactive Web Tools (single-file static HTML, no build step)

Hosted from `https://johnshearing.github.io/pool_ranger/`. Each page fetches live data from
Koios through `corsproxy.io` so anyone can load any mainnet pool by ticker or `pool1…` ID.

- [x] `SPO_REWARD_ANALYSIS_CHART.html` — interactive sliders + live Chart.js chart showing how
  an SPO's income and a delegator's ROA change with external delegation. Auto-fills margin,
  fixed fee, pledge, performance, and live `r` from Koios. Visually separates the **green zone**
  (delegation helps the SPO) from the **red zone** (delegation hurts the SPO). Includes a
  performance-history analyser over a configurable epoch window.
- [x] `POOL_SWITCH_CALCULATOR.html` — load a *current* and a *target* pool side-by-side, enter
  the ADA being moved, and see annual-reward difference plus a switch-or-stay verdict. Models
  the 2-epoch overlap so the user can see that switching has no earnings gap.
- [x] `epoch_agent/epoch_report_viewer.html` — drop-zone / auto-loading web viewer for the
  `epoch_NNN.txt` reports. Filter by section, recommendation, and classification; sortable on
  every column; groups by section; expandable detail row per pool with parameter-change deltas.
  Auto-loads the latest epoch report when served from GitHub Pages.

These three pages are the administrator's daily decision-support surface and will feed directly
into the Phase 3 automation agent (which consumes the same Koios data through the same math
module).

---

## Web UI Requirements (Phase 2)

### Member WebUI

- Connect wallet (CIP-30: Eternl, Nami, Lace, Flint, Yoroi)
- Join Pool Ranger: generate coop base address, move ADA to it
- View staking rewards
- Revoke membership
- Withdraw rewards. 99% goes to member and 1% goes to the administrator

### Admin WebUI (Phase 2b)

- View all registered members and their coop stake addresses
- Assign members to pools (granular — each member to a specific pool)
- Push reward withdrawals (collect 1% fee)
- Monitor pool saturation levels

---

## Automation Phase (Phase 3 — Claude Code Agent)

The pool-evaluation foundation for this phase is already in place: see
**Pool Analytics & Epoch Reporting (Phase 1b)** above. The `epoch_agent/` pipeline already does
the per-epoch pool evaluation, classification, and allocation; the remaining Phase 3 work is
wiring those decisions to the on-chain delegation and reward-distribution scripts.

Claude Code will autonomously handle:
- Evaluating pools each epoch by projected ROA, block production performance, fee and pledge structure, single-pool operator status, and community contribution *(implemented in `epoch_agent/`)*
- Moving delegation to higher-ROA pools whenever the optimizer finds a better allocation
- Last-minute delegation before epoch boundary
- Withdrawing and distributing rewards

All code should be built with this in mind:
- Structured data formats (JSON) for pool stats, member lists, delegation decisions
- Clear, scriptable interfaces for each operation
- Logging and audit trails for every action

---

## Decentralized Governance (Phase 4)

[Beemocracy](https://github.com/johnshearing/beemocracy/blob/main/Beemocracy2.0.md) - Decentralized Governance By Jury For Cardano Modeled After The Democracy Which Evolved In Honey Bee Society:
- This will be the governance model used to guide Pool Ranger's policy, values, and actions.  

[Midnight](https://midnight.network/) - A Zero Knowledge Proof Partner Chain for Cardano
- Midnight's selective disclosure privacy model is perfect for voting systems. 
- Beemocracy for Pool Ranger will be hosted on Midnight.

---

## Development Environment Setup (fresh machine)

Assumed starting point: Windows 10 + WSL2 (Ubuntu).

1. Install Node.js (LTS) in WSL
2. `npm install` in `ranger/` — installs `@meshsdk/core`, `@meshsdk/core-csl`, `dotenv`
3. `npm install` in `ranger/web/` — installs MeshJS + Vite + browser polyfills
4. `npm run build` in `ranger/web/` — produces `ranger/web/dist/sign_tx.html`
5. Install Aiken CLI v1.1.21
6. Create `.env` with `BLOCKFROST_API=previewXXXXX`
7. Admin address is already recorded in `_1_members.json` under the `admin_0` row. Run
   `_generate_credentials.mjs` only when you need to spin up an additional software wallet
   for testing — it prints the new address, which you then pass to `_register_stake.mjs
   --addr <addr>` to enrol it.
8. Run `aiken build` after any change to `.ak` files to regenerate `plutus.json`.
9. Install **Eternl** browser extension in Chrome or Edge. Connect Ledger. Set network to
   Preview testnet. Open `web/dist/sign_tx.html` via `\\wsl$\Ubuntu\home\js\aiken\ranger\web\dist\sign_tx.html`.

---

## Naming Conventions

| Thing | Convention |
|-------|-----------|
| Project | Pool Ranger |
| Directory / filenames | `ranger` |
| Script prefix | `_` (matches vesting pattern) |
| Word separator in filenames | `_` (underscores, not dashes) |
| Wallet records | All wallet addresses (admin and members) live in `_1_members.json` — no `.addr` or `.sk` files on disk |
| Config | `common/common.mjs` |
| Tests | inline in `.ak` files, run with `aiken check` |

---

## Key Design Decisions

| # | Decision | Status |
|---|----------|--------|
| 1 | Smart contract language: Aiken (Plutus V3) | Decided |
| 2 | Hardware wallet for admin AND members: Ledger, no .sk files | Decided |
| 3 | Oversaturation prevention: parameterized script per member → each member has a unique stake address → admin can delegate each independently | Decided |
| 4 | Member identity: proven by `member_pkh` baked into their script instance; admin identity proven by `admin_pkh` | Decided |
| 5 | Member registry: implicit — the set of registered coop stake credentials on-chain is the registry; no separate registry UTxO needed | Decided |
| 6 | Reward fee enforcement: admin always gets 1%, fee comes from rewards (`tx.fee` deducted from member floor) | Decided |
| 7 | Last-minute delegation timing mechanism | To design |
| 8 | Tax reporting format for administrator's 1% | To design |
