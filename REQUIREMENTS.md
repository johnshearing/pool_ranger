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
Members join by moving their ADA to a Pool Ranger staking address
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
from the `registeredReceiveAddress` field of each member's record in `_1_members.json`.

### Signing modes

All scripts that require a signature support two modes, following the same pattern:

**Hardware wallet (default — current active workflow):** reads the signer's address from the
matching entry in `_1_members.json` (look up by `--name`; the bech32 `registeredReceiveAddress` is on the record),
fetches UTxOs via Blockfrost, builds the transaction, and prints the unsigned tx hex. The
unsigned hex is signed using the custom web tool at `web/dist/sign_tx.html` (open in Chrome
with the Eternl extension installed). After the Ledger signs, the page prints a complete
copy-pasteable submit command with both the unsigned tx hex and the witness hex pre-filled:

```
node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
```

`_submit_tx.mjs` merges the witness into the unsigned tx server-side and broadcasts via
Blockfrost.

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
- [x] `_register_stake.mjs` — member registers their coop stake credential on-chain (pays 2 ADA deposit); hardware and software wallet signing. Before building the tx the script refuses any `--addr` whose wallet stake credential already appears on an existing member's `registeredReceiveAddress` — that's a sibling registration from the same Eternl account (Eternl uses one stake key per account, one payment key per receive address) and would later confuse `web/send_from_staking.html`'s Sweep mode into draining one Pool Ranger staking address into another.
- [x] `_delegate.mjs` — admin delegates **one** member's stake to a chosen pool (per-member granular control via `--name` / `--pool` CLI flags); refuses on no-op (already delegated to that pool) and on drift (local history disagrees with on-chain state); hardware and software wallet signing
- [x] `_batch_delegate.mjs` — admin delegates **many** members in a single transaction (up to `BATCH_SIZE = 12` per run); pays one Cardano tx fee and asks for one Ledger signature for the whole batch. Reads `_1_delegation_config.json`, auto-snapshots `_1_members.json` to `_1_members_PRE_BATCH.json` for one-command rollback, and refuses the whole batch if any entry is in drift. Single-batch v1; multi-batch in one run deferred until the cooperative exceeds 12 active delegations (see source header for why)
- [x] `_submit_tx.mjs` — takes `<unsigned-tx-hex> <witness-hex>`, merges the Ledger witness into the unsigned tx, and submits to the network via Blockfrost; used after Ledger signing in `web/dist/sign_tx.html`
- [x] `_spend_from_staking.mjs` — terminal counterpart to the browser-only `web/send_from_staking.html`. Builds a tx that sends `--amount` tADA from a member's Pool Ranger staking address (`member.poolRangerStakingAddress`) to a `--to` recipient and returns **all change to the SAME staking address** so unspent ADA stays delegated through the cooperative. Fetches UTxOs via Blockfrost, prints the unsigned tx hex for signing in `web/dist/sign_tx.html`, then submission via `_submit_tx.mjs` — the standard Pool Ranger build-then-sign-then-submit flow. The tx does not invoke the coop Plutus script (only the payment-key side is checked — no Plutus cost models, no ex-units), and the script does not mutate `_1_members.json` since sends have no audit-trail field. Before building the tx the script runs a stack of foolproofing guards: bech32-parses both `--to` and `member.poolRangerStakingAddress` (catches checksum/typo errors that a prefix check would miss); asserts the staking address starts with `addr_test1y`/`addr1y` and carries a **script** stake credential (`deserializeAddress(addr).stakeScriptCredentialHash`) so a stale or hand-edited row pointing at a plain payment address cannot silently un-delegate every change UTxO; cross-checks that the payment-key hash embedded in `poolRangerStakingAddress` equals `member.memberPkh` on the same row (catches a row whose two fields drifted apart or got swapped with another member's); re-derives the parameterized stake script locally via `getCoopStakeScript(admin.memberPkh, member.memberPkh)` and asserts that the row's `scriptHash`, `poolRangerStakingAddress`, and `poolRangerRewardAddress` exactly equal the script-math outputs — proving the row was built from this `(adminPkh, memberPkh)` pair and catching both fully coordinated row swaps and stale rows registered under a previous admin; fetches `member.registration.txHash` from Blockfrost (`/txs/{hash}/stakes`) and confirms `member.poolRangerRewardAddress` was actually registered by that tx — pinning the row's stake side to immutable on-chain history so partial JSON tampering (stake fields edited, txHash left alone) is caught before any spend tx is built; refuses `--to === sourceAddress` (would just pay a fee to send ADA to itself); refuses `--amount < 1 tADA` up front with a clear message (Cardano min-UTxO floor for plain ADA outputs) instead of letting the operator decode a generic build-time error; and prints a balance summary — total UTxO balance at the source, amount being sent, approximate change returned — so the operator can sanity-check the numbers before signing.
- [ ] `_withdraw_rewards.mjs` — either admin or member can initiate.  
  - The contract enforces the 99/1 split on-chain regardless of signer  
  - (admin ≤ 1%, member ≥ 99% − tx.fee, fee paid from the rewards themselves)  
- [ ] `_revoke_membership.mjs` — member (or admin) deregisters the coop stake credential; returns 2 ADA deposit
- [x] `_view_delegations.mjs` — admin view: for each member, fetch the on-chain delegation and compare it to `_1_members.json`;  
  - flags mismatches (tx built but never submitted, still pending, etc.).  
  - Shows contract ADA balance and if active.
- [x] `_view_wallet_balances.mjs` —  Shows wallet ADA balances.  
  - This the amount not sent to the contract address.
- [x] `_view_members.mjs` — combined per-member report. For each row in `_1_members.json` (or just the one matched by an optional `--name` flag), prints three side-by-side balances — **registered receive address** (`member.registeredReceiveAddress`), **other wallet receive addresses** (sibling addresses sharing the wallet's reward-address handle, enumerated via Blockfrost `/accounts/{WalletRewardAddress}/addresses` so funds Eternl has scattered across derived addresses are visible), and **Pool Ranger staking address** (`member.poolRangerStakingAddress`) — followed by the on-chain delegation drift check and pending staking rewards (withdrawable now + lifetime earned). It also prints a per-member **Spend tool** URL — `${SEND_FROM_STAKING_BASE}?addr=<member.poolRangerStakingAddress>` — that the admin emails to each member; opening that link loads `send_from_staking.html` with the member's staking address prefilled and locked, so the member never has to paste or type it. The leading comment block of the script is the canonical reference for the address model; it explicitly distinguishes the two reward-address labels the script displays — `WalletRewardAddress` (handle for the wallet's own stake key) and `PoolRangerRewardAddress` (handle for the parameterized Pool Ranger script credential; stored on disk as `member.poolRangerRewardAddress`). Strict superset of `_view_delegations.mjs` and `_view_wallet_balances.mjs`; those two are deliberately retained as focused single-purpose tools that are faster and clearer when only one piece of the picture is needed.
- [x] `_measure_batch_size.mjs` — diagnostic / developer tool. Builds a multi-delegation tx in memory (no submission) using the current `_1_delegation_config.json`, then reports the per-script CBOR size, the per-tx baseline overhead, and a recommended `BATCH_SIZE` that leaves ~25% headroom against the 16 KB tx cap. Re-run after any change to `validators/coop_stake.ak` to validate that the `BATCH_SIZE` constant in `_batch_delegate.mjs` is still appropriate. Read-only — safe to run any time.
- [] `_select_delegations.mjs` *(not yet built)* Looks at epoch_agent/ranger_state.json, the most recent epoch report found in epoch_agent/reports, _1_members.json, the output of _view_members.mjs and then creates _1_delegation_config.json which is read by _batch_delegate.mjs which moves all the delegation and records history of those move back to ranger_state.json and _1_members.json.

**Web signing tool and web spending tool (`web/`) — Phase 1 bridge for Ledger signing:**
- [x] `web/package.json` — browser build dependencies (MeshJS + Vite + Node.js polyfills)
- [x] `web/vite.config.js` — Vite bundler config; aliases `crypto`/`stream`/`buffer`/`events` to browser polyfills so MeshJS builds for the browser
- [x] `web/sign_tx.html` — source HTML for the **admin** signing page
- [x] `web/sign_tx.js` — source JS; uses `BrowserWallet.enable('eternl')` and `wallet.signTx(tx, true)` (partialSign) to sign via CIP-30 and returns a copy-pasteable `node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>` command for the admin to run in a WSL2 terminal
- [x] `web/send_from_staking.html` — source HTML for the **member** staking-address tool. Title: "Pool Ranger — Staking Address Tool". A radio toggle at the top of the page selects between two modes; the recipient + amount fields are shown or hidden according to the selected mode.
- [x] `web/send_from_staking.js` — source JS for the member staking-address tool.  
  **Why this page exists:** a member's ADA lives at their Pool Ranger staking address (payment key = member, stake credential = the parameterized script). They can spend it from any normal Cardano wallet, but a normal wallet's change handler will send the change back to a plain (un-staked) address, silently un-staking whatever ADA was not spent. This page solves that: **all change returns to the SAME staking address so unspent ADA stays delegated through the cooperative.** It is also fully **permissionless** — no admin server, no API key, no terminal step — so members are not dependent on the admin being online to spend their own money.
  **Two modes (radio toggle at the top of the page):**
  - **Spend FROM staking address** (default) — the original behavior. Member types a recipient and an amount; the tx spends UTxOs at the Pool Ranger staking address, sends the chosen amount to the recipient, and returns all change to the SAME staking address so the unspent ADA stays delegated.
  - **Sweep INTO staking address** — consolidates every UTxO the active Eternl account holds at addresses OUTSIDE the Pool Ranger staking address into one output AT the staking address, increasing the member's delegated stake in a single tx. No recipient field, no amount field — one button. Existing staking-address UTxOs are not touched. Refuses to proceed if any source UTxO sits at another address with a **script** stake credential — that's a sibling Pool Ranger registration in the same Eternl account, and sweeping out of it would silently drain a second staking address (paired with the registration-time guard in `_register_stake.mjs`). Also refuses if any source UTxO carries native tokens or NFTs (token sweep would need per-asset bundling and min-UTxO recalculation; deliberately left out of v1).
  **How it works:** the member opens a per-member link the admin sent them (printed by `_view_members.mjs`) — e.g. `…/send_from_staking.html?addr=addr_test1y…`. The page reads `?addr=` on load, **prefills the staking-address textarea and locks it read-only** so it cannot be edited or pasted over. The member selects the mode (Spend is the default; Sweep hides the recipient and amount fields entirely) and clicks one button. Before any tx is built the page runs a layered set of guards: `validateStakingAddress()` bech32-parses the staking address, asserts the `addr_test1y` / `addr1y` Type-2 prefix, **and** confirms the parsed `stakeScriptCredentialHash` is truthy — proving the address really does carry a script stake credential and isn't some lookalike that snuck past the prefix check; then `assertWalletControlsPaymentKey()` extracts the payment-key hash from the staking address and checks it against the payment-key hashes of every used/unused address in the currently selected Eternl account (`wallet.getUsedAddresses()` + `wallet.getUnusedAddresses()`), rejecting the request if the address is not controlled by the active account (catches "wrong Eternl account selected" and "pasted someone else's hybrid address" — applies to both modes). In Spend mode there are three more guards: the recipient is bech32-parsed via `validateBech32Address()`; the recipient must not equal the source staking address (refuses a no-op self-send); and the amount must be at least 1 tADA up front (Cardano min-UTxO floor for ADA-only outputs) with a clearer message than the generic build-time error. A balance summary — total UTxO balance at the source, amount being sent, approximate change returned — is shown to the member as the page builds the tx, giving a known-good set of numbers to compare against the Ledger screen. Then it reads UTxOs via CIP-30 `wallet.getUtxos()` (Eternl already tracks the hybrid address because the member owns its payment key); builds the tx with MeshSDK's `MeshTxBuilder` using its built-in protocol parameters; signs via Eternl/Ledger (`partialSign=true`); submits via `wallet.submitTx()` and displays the tx hash with a Cardanoscan link.
  **Sweep-mode tx construction:** every non-staking-address UTxO is added with explicit `.txIn()` (not `.selectUtxosFrom()`) so coin selection cannot leave any behind — this is what makes a sweep actually drain the wallet rather than "pick enough to cover X". The single output to the staking address is sized at `(total non-staking lovelace − 2 tADA fee/min-UTxO buffer)`; `.changeAddress` is also the staking address so any residual (~1.5–1.83 tADA after the real fee) lands at the staking address too. Net result: every non-staking lovelace minus the actual fee ends up at the staking address. A pre-Ledger status line tells the member exactly how much tADA from how many UTxOs is about to move, giving a known-good number to compare against the Ledger screen.
- [x] `web/dist/sign_tx.html` and `web/dist/send_from_staking.html` — **built outputs** — both produced together by a single `npm run build` inside `web/`. These are the files opened in the browser. `HOW_TO_SIGN.md` in the same folder is the canonical operator guide for both pages.

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

- [x] `_1_members.json` — **the working member directory and single source of truth for every wallet address Pool Ranger knows about.** Every script that touches a member (register, delegate, withdraw, revoke, view) reads or writes this file. It holds one entry per member: `name`, `registeredReceiveAddress` (the bech32 Ledger receive address — admin and members alike), `memberPkh`, `poolRangerRewardAddress`, `poolRangerStakingAddress`, `scriptHash`, `registration`, and a `delegations` history (newest entry = current intended delegation). On testnet today this file is committed. On mainnet it is expected to grow to thousands of entries of real cooperative membership data, and will not be committed to the public repo.
- [x] `_1_members_sample.json` — **a tiny shape-only sample committed to the public GitHub repo.** Its only purpose is to show readers of the repo what `_1_members.json` looks like (the field names and the nested `delegations` array) without exposing real cooperative membership data. The two files are intentionally *not* expected to match — `_1_members.json` will eventually contain thousands of real entries, while `_1_members_sample.json` stays small. Scripts must never compare the two or treat divergence as an error.
- [x] `_1_delegation_config.json` — **the admin's batched delegation plan.** A flat JSON array of `{ name, memberPkh, poolId }` entries, consumed by `_batch_delegate.mjs`. Lookup is by `memberPkh`; the `name` field is human-readable only (audit aid so the admin can read the file without cross-referencing 56-character pkh strings). Members not listed here are not touched on a batch run. On testnet this file is committed alongside `_1_members.json`; on mainnet it will hold real cooperative assignments and will not be committed.
- [x] `_1_delegation_config_sample.json` — **a tiny shape-only sample committed to the public GitHub repo.** Mirrors the role of `_1_members_sample.json`: shows readers what `_1_delegation_config.json` looks like (the flat `[{ name, memberPkh, poolId }, …]` array consumed by `_batch_delegate.mjs`) without exposing real cooperative delegation assignments. The two files are intentionally not expected to match; scripts must never compare them or treat divergence as an error.
- [x] `_1_members_PRE_BATCH.json` — **auto-snapshot of `_1_members.json` written by `_batch_delegate.mjs`** immediately before it overwrites the live file. Provides a one-command rollback (`cp _1_members_PRE_BATCH.json _1_members.json`) if the admin decides not to submit the tx, or if anything else goes wrong post-build. Overwritten on every batch run that produces pending delegations; not written when the script exits early (drift, no-op, or over-cap), so a useful prior snapshot is not clobbered by a no-op run. Not committed.
- [x] `epoch_agent/ranger_state.json` — **Pool Ranger's persistent epoch-by-epoch delegation memory.** Read by `_select_delegations.mjs` to know what is currently delegated and which submitted-but-not-settled changes are in flight, and written by `epoch_agent/run.mjs` after every epoch run. Eight top-level fields (full reference in `epoch_agent/HOW_TO_RUN.md`):
  - `_schemaVersion`, `lastUpdatedEpoch` — agent-managed bookkeeping; do not edit.
  - `totalMemberStakeAda` — admin-set total ADA available for delegation (whole ADA, not lovelace).
  - `currentDelegations` — **the authoritative "where Pool Ranger's stake currently sits" map.** Keyed by `poolId`; each value `{ ticker, stakeAda, delegatedAtEpoch, activeFromEpoch }`. Auto-populated when an `inFlightChanges` entry settles. `_select_delegations.mjs` reads this to compute the diff between "where we are" and "where the latest report says we should be."
  - `inFlightChanges` — array of `{ poolId, ticker, changeType ("ADD"|"WITHDRAW"), stakeAda, submittedAtEpoch, activeFromEpoch, rewardsFromEpoch, note }`. Anything still pending here must be **excluded from the available budget** by `_select_delegations.mjs` so the agent does not double-commit ADA that has already been promised.
  - `completedChanges` — permanent audit trail of settled changes; `_select_delegations.mjs` may read for history but never writes here.
  - `discoveryConfig` — pool-discovery filter thresholds (used by `discover_pools.mjs`, not by the delegation selector).
  - `poolLuckHistory` — per-pool luck observations across epochs; one entry per pool with an `observations[]` array of `{ epoch, luckZ, luckPremium, nEpochs, luckZ_windows }`. `_select_delegations.mjs` may use the cross-run trend as a tie-breaker between pools whose projected ROA is nearly identical.
  - `poolParamHistory` — per-pool last-known fee/margin/pledge plus full change log. Useful for surfacing recent SPO parameter changes when ranking pools.

  On testnet this file is committed (current values are real). On mainnet it will not be committed.
- [x] `epoch_agent/reports/epoch_<NNN>.txt` — **the ranked, human-readable epoch report.** One file per epoch; `_select_delegations.mjs` always consumes the file with the largest `NNN` (the "most-recent epoch" — for example, at the time of writing it is `epoch_631.txt`, but `NNN` advances every epoch). The report is produced by `epoch_agent/run.mjs` and is plain text (not JSON); it can either be parsed directly or, equivalently, re-derived by re-running `run.mjs --dry-run` for the same epoch. The sections `_select_delegations.mjs` cares about:
  - **Header** — `r = ...`, `S_sat ≈ ... ADA`, `Pool Ranger stake: ... ADA`, `Global budget (total stake minus in-flight): ... ADA`. The global-budget number is the cap on what `_select_delegations.mjs` is allowed to assign across all members this epoch.
  - **ELIGIBLE POOLS** — block per pool with `Full ID:`, `Classification:`, `Performance:`, `Active stake:`, `Projected ROA:`, `Historical ROA (20 ep):`, `Luck premium`, `Luck z-score`, `Pool age:`, `Current:`, `Proposed:`, and `Recommendation:` (`ADD X.XX M ADA` or `QUALIFIES — budget exhausted this epoch`). `ADD` lines are the canonical "delegate this much ADA to this pool" instruction set for the current epoch.
  - **EXISTING DELEGATIONS** and **REBALANCING MOVES** — appear when Pool Ranger already has stake on-chain. List HOLD / ADD MORE / REDUCE / WITHDRAW with per-move opportunity cost and break-even.
  - **NEXT STEPS (for administrator)** — flat, machine-friendly list of `<poolID> — add X.XX M ADA` lines. The simplest entry point for the selector: read these lines, fan them out across members, write `_1_delegation_config.json`.
  - **SUMMARY** — counts and weighted ROA before / after; `_select_delegations.mjs` may include this in a confirmation banner before writing the config.

  `_select_delegations.mjs`'s job is to map each `<poolID> — add X.XX M ADA` instruction across the set of registered members in `_1_members.json` (each member contributes whatever their `poolRangerStakingAddress` currently holds — that live balance is what `_view_members.mjs` already prints), so the resulting `_1_delegation_config.json` honours the per-pool target ADA totals as closely as integer member balances allow. Reports are committed on testnet for reproducibility and not committed on mainnet.
- [x] `.env` — `BLOCKFROST_API=previewXXXXX`. Not committed.

There are no `.addr` files in `ranger/`. Earlier in development each Ledger wallet had its
own `0_<name>.addr` file on disk; those files have been removed. Every script now reads
addresses from `_1_members.json` by name. A wallet only exists from Pool Ranger's point of
view once it has a row in `_1_members.json`.

### Admin wallet

The admin wallet is a **Ledger hardware wallet** (created 2026-04-17 on Preview testnet).
- Address lives in the `admin_0` row of `_1_members.json` (the `registeredReceiveAddress` field). There is
  **no `0_admin_0.sk` and no `0_admin_0.addr`** file on disk.
- Hardware wallet signing mode (default) is the active workflow. 
- The software wallet block in each script is commented out and used only for automated testing.

### Member wallets

Member wallets are also **Ledger hardware wallets**. Each member's address is stored in
the `registeredReceiveAddress` field of their `_1_members.json` row. There are **no `0_member_N.sk` or
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
   "Sign with Eternl (Ledger)". Approve on your Ledger device. The page prints a complete
   `node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>` command. Click "Copy Command".
7. Submit — paste the copied command into a WSL2 terminal from `ranger/`:
   ```
   node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
   ```
8. Move your ADA to your **Pool Ranger staking address** (printed in step 5). This is the address where
   your ADA lives while staking with Pool Ranger. Your spending key still controls the funds —  
   Pool Ranger cannot take them.

### Ongoing participation
- The admin will delegate your stake to a pool each epoch and push reward distributions after each epoch.
- You receive 99% of your staking rewards automatically. No action required on your part.
- You can check balances and rewards at any time with `_view_wallet_balances.mjs`.
- **To spend ADA from your Pool Ranger staking address without un-staking your change**, open the **Spend tool link** your admin sent you. That link points at `web/dist/send_from_staking.html` with your staking address baked into the URL as `?addr=…`; the page reads it on load and locks the staking-address field so it cannot be edited or pasted over. At the top of the page is a radio toggle with two modes — leave it on the default **Spend FROM staking address** to send ADA out: enter the recipient address and amount, click the button, approve on your Ledger. The page sends the requested ADA to the recipient and returns all change to the SAME staking address so the unspent ADA stays delegated.
- **To consolidate ADA from your other Eternl addresses into your Pool Ranger staking address** (increases your delegated stake in one transaction), open the same Spend tool link and switch the toggle to **Sweep INTO staking address**. The recipient and amount fields disappear — there is nothing to type. Click the button and approve on the Ledger. The page gathers every UTxO Eternl owns at addresses outside your staking address, builds one transaction that moves all of them into the staking address (minus the network fee), and shows you the tx hash. Existing balance at your staking address is not touched. If any of your other-address UTxOs hold native tokens or NFTs, the sweep refuses up-front and tells you to move the tokens to a separate address first.
- Both modes are permissionless — no admin involvement, no terminal, no API key.

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
8a. Sign the printed unsigned tx hex in `web/dist/sign_tx.html`; copy the
    `node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>` command the page prints and run it
    in a WSL2 terminal from `ranger/`.

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
9b. Sign the unsigned tx in `web/dist/sign_tx.html` (one signature for the whole batch);
    copy the `node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>` command the page prints
    and run it in a WSL2 terminal from `ranger/`. Verify with `_view_delegations.mjs` after
    a minute.

If you decide not to submit the tx, restore the pre-batch state with
`cp _1_members_PRE_BATCH.json _1_members.json` — otherwise drift detection will block the
next batch run.

If you change the validator (`validators/coop_stake.ak`), re-run `_measure_batch_size.mjs`
to confirm the `BATCH_SIZE = 12` constant still leaves enough headroom against the 16 KB
tx cap.

### Distributing rewards (each epoch)
10. At each epoch boundary, run `_withdraw_rewards.mjs` *(not yet built)* — once per member — to:
    - Withdraw the member's accumulated rewards from their coop reward address.
    - Route ≥ 99% (minus tx.fee) back to the member's coop base address.
    - Keep ≤ 1% as the admin fee.
    - Sign the withdrawal tx with the admin Ledger via the web signing tool.

    The same script is what a member runs to withdraw their own rewards — the contract enforces the 99/1 split on-chain regardless of who signs, so there is no separate admin-vs-member version and no time-locked admin window.

### Monitoring
12. Use `_view_members.mjs` to see all registered members and their reward balances. The per-member block of the report includes a **Spend tool** URL — `${SEND_FROM_STAKING_BASE}?addr=<member.poolRangerStakingAddress>` — that the admin emails (or otherwise sends out-of-band) to each member. The link is the member's one canonical entry point to `web/dist/send_from_staking.html`: it prefills and locks the staking-address field so the member never has to paste or type it, removing the wrong-account / wrong-address class of mistakes.
13. Use the `Epoch Reporting System` *(covered in the next section)* to track pool saturation and choose pools wisely.

### Moving Delegation Each Epoch
14. Run `_select_delegations.mjs` *(not yet built)*. It reads:
    - `epoch_agent/ranger_state.json` — current delegations + in-flight changes (so we don't double-commit budget),
    - the most-recent `epoch_agent/reports/epoch_<NNN>.txt` — the per-epoch ranked pool list and per-pool ADA targets,
    - `_1_members.json` — the member directory,
    - the live balances surfaced by `_view_members.mjs` (member ADA actually parked at each `poolRangerStakingAddress`),

    and writes `_1_delegation_config.json`. The field shapes of the two epoch-agent files are documented in the **Data Files** section above.
15. Run `_batch_delegate.mjs` to move all the delegation in one transaction and record history back to `_1_members.json`. `epoch_agent/ranger_state.json` is updated separately on the next run of `epoch_agent/run.mjs`, which settles `inFlightChanges` into `currentDelegations`.

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

- View all registered members and their coop reward addresses
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
4. `npm run build` in `ranger/web/` — produces `ranger/web/dist/sign_tx.html` (admin signing page) and `ranger/web/dist/send_from_staking.html` (member spend-from-staking page) together
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
| 3 | Oversaturation prevention: parameterized script per member → each member has a unique reward address → admin can delegate each independently | Decided |
| 4 | Member identity: proven by `member_pkh` baked into their script instance; admin identity proven by `admin_pkh` | Decided |
| 5 | Member registry: implicit — the set of registered coop stake credentials on-chain is the registry; no separate registry UTxO needed | Decided |
| 6 | Reward fee enforcement: admin always gets 1%, fee comes from rewards (`tx.fee` deducted from member floor) | Decided |
| 7 | Last-minute delegation timing mechanism | To design |
| 8 | Tax reporting format for administrator's 1% | To design |
