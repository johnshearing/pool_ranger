# Pool Ranger — Project Requirements

**Project name:** Pool Ranger (short form: `ranger`, used in all filenames)
**Working directory:** `/home/js/aiken/ranger/` — all files created, edited, and deleted here only.
**Model:** Use `ranger/` as the working directory; use `vesting/` as the workflow/code model.
**Stack:** `.mjs` scripts to start; TypeScript UI later; eventually Claude Code automation.
**Environment:** Windows 10 + WSL2 (Ubuntu).
**Network:** Cardano Preview Testnet.

---

## What Pool Ranger Is

A Cardano staking cooperative. Members join by moving their ADA to a cooperative base address
where:
- The **payment credential** is the member's own spending key — they always control their funds.
- The **stake credential** is a cooperative Plutus script, parameterized with both the admin's
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

### `withdraw` handler — reward distribution rules

- **Either admin or member may initiate.** The rule is the same regardless of who signs.
- **Admin receives ≤ 1%** of the withdrawal amount.
- **Member receives ≥ 99% minus the transaction fee.** The fee is read from `tx.fee` and
  deducted from the member's floor, so neither party needs extra ADA on hand — the rewards
  are self-funding (the initiator provides a small "fee carrier" UTxO that is returned as
  change; the actual fee comes from the reward balance).
- The 1-epoch timing window mechanic has been removed. Admin always earns 1%; there is no
  escape hatch for the member to withdraw 100%.
- Phase 2 may add an optional `validity_range` check to prevent same-epoch withdrawals
  (hardening only — not required for the fee rule).

### Security properties

- No spending (private) key is ever revealed or required by the contract.
- Members can revoke membership (deregister) at any time — admin or member signature suffices.
- Funds remain under sole member control at all times.
- Transaction fees are paid by whoever initiates the action (admin or member).

---

## Off-chain Scripts (Phase 1 — .mjs scripts)

All scripts go in `ranger/`. Use `vesting/` as the code and workflow model.

### Shared Config (`common/common.mjs`) — Implemented

- `blockchainProvider` — Blockfrost, Preview testnet
- `getTxBuilder()` — fresh `MeshTxBuilder` factory
- `loadSoftwareWallet(skPath)` — loads a wallet from a `.sk` root key file
- `loadAddressOnly(addrPath)` — reads an address file (for Ledger; no signing)
- `getCoopStakeScript(adminPkh, memberPkh)` — central factory that applies parameters to
  the compiled script and returns `{ scriptCbor, scriptHash, stakeAddress, memberCoopBaseAddress }`

### Signing modes

All scripts that require a signature support two modes, following the same pattern:

**Hardware wallet (default — current active workflow):** reads the signer's address from an
`.addr` file, fetches UTxOs via Blockfrost, builds the transaction, and prints the unsigned tx
hex. The unsigned hex is signed using the custom web tool at `web/dist/sign_tx.html` (open
in Chrome with the Eternl extension installed). The resulting signed tx hex is submitted using
`_submit_tx.mjs`:

```
node _submit_tx.mjs <signed-tx-hex>
```

Both admin and member wallets use Ledger hardware wallets. Neither has a `.sk` file.

**Software wallet (future testing only):** each script contains a commented `SOFTWARE WALLET`
block. When uncommented, the wallet loads from a `.sk` root key file and auto-signs and submits
in one step. These blocks exist for automated testing scenarios only and are not used in the
current workflow.

This applies equally to admin scripts and member scripts.

### Script checklist

**Node.js scripts:**
- [x] `_generate_credentials.mjs` — creates software wallets; scaffolds Ledger support
- [x] `_transfer_funds.mjs` — sends ADA between wallets for testing
- [x] `_view_wallet_balances.mjs` — inspect ADA and reward balances
- [x] `_register_stake.mjs` — member registers their coop stake credential on-chain (pays 2 ADA deposit); hardware and software wallet signing
- [x] `_delegate.mjs` — admin delegates each member's stake to a chosen pool (per-member granular control); hardware and software wallet signing
- [x] `_submit_tx.mjs` — submits a signed tx hex to the network via Blockfrost; used after Ledger signing
- [ ] `_push_rewards.mjs` — admin withdraws rewards and routes 99% to member, keeps 1% fee
- [ ] `_member_withdraw.mjs` — member withdraws 100% after the 1-epoch admin window expires
- [ ] `_revoke_membership.mjs` — member (or admin) deregisters the coop stake credential; returns 2 ADA deposit
- [ ] `_view_members.mjs` — list all registered coop stake addresses, delegation status, and pending rewards
- [ ] `_view_pool_info.mjs` — view chosen pool(s), saturation level, recent epoch rewards

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

### Admin wallet

The admin wallet is a **Ledger hardware wallet** (created 2026-04-17 on Preview testnet).
- Address is in `0_admin_0.addr`. There is **no `0_admin_0.sk`**.
- Hardware wallet signing mode (default) is the active workflow. The software wallet block in
  each script is commented out and used only for automated testing.

### Member wallets

Member wallets are also **Ledger hardware wallets**. Each member has a `0_member_N.addr` file
and **no `0_member_N.sk`**.
- Scripts read the member address from the `.addr` file, build an unsigned tx, and print the
  unsigned hex for the member to sign on their Ledger device.
- After signing, the member (or admin on their behalf) submits with `_submit_tx.mjs`.

---

## Member Workflow (End-to-End)

This is the step-by-step process a cooperative member follows, from joining to withdrawing rewards.

### One-time setup
1. Get a Ledger hardware wallet. Install the **Cardano app** on it.
2. Install the **Eternl browser extension** in Chrome or Edge. Connect your Ledger to Eternl.
3. In Eternl: switch the network to **Preview testnet** (Settings → General → Network).
4. Send your wallet address (from your `0_member_N.addr` file) to the admin so they know your
   public key hash and can parameterize your cooperative stake script.

### Joining the cooperative
5. Run `_register_stake.mjs` to build the stake registration transaction:
   ```
   MEMBER_ADDR_PATH=./0_member_N.addr node _register_stake.mjs
   ```
   This prints your unique **coop base address** and an **unsigned tx hex**.
6. Open `web/dist/sign_tx.html` in Chrome. Paste the unsigned tx hex. Click
   "Sign with Eternl (Ledger)". Approve on your Ledger device. Copy the signed tx hex.
7. Submit:
   ```
   node _submit_tx.mjs <signed-tx-hex>
   ```
8. Move your ADA to your **coop base address** (printed in step 5). This is the address where
   your ADA lives inside the cooperative. Your spending key still controls the funds — the
   cooperative cannot take them.

### Ongoing participation
- The admin will delegate your stake to a pool each epoch and push reward distributions.
- You receive 99% of your staking rewards automatically. No action required on your part.
- You can check balances and rewards at any time with `_view_wallet_balances.mjs`.

### Withdrawing rewards yourself (after 1-epoch admin window)
9. If the admin has not pushed rewards within 1 epoch, run `_member_withdraw.mjs` to claim
   100% of your rewards yourself. *(Script not yet built.)*

### Leaving the cooperative
10. Run `_revoke_membership.mjs` to deregister your coop stake credential and recover your
    2 ADA deposit. *(Script not yet built.)* Move your ADA back to a plain address.

---

## Administrator Workflow (End-to-End)

This is the step-by-step process the cooperative administrator follows.

### One-time setup
1. Admin wallet is a **Ledger hardware wallet**. Address is in `0_admin_0.addr`. No `.sk` file.
2. Admin installs **Eternl** in Chrome with the Ledger connected, Preview testnet selected.
3. Fund the admin wallet with enough preview ADA to pay delegation transaction fees.

### Onboarding a new member
4. Receive the member's `.addr` file (or the address string from their file).
5. The member runs `_register_stake.mjs` themselves (they pay the 2 ADA deposit and sign).
6. Once confirmed, the member moves their ADA to their printed **coop base address**.

### Delegating stake to a pool
7. Prepare (or update) `delegation_config.json` — a JSON file listing `{ memberPkh, poolId }`
   assignments. *(File format defined in `_delegate.mjs` header comments.)*
8. Run `_delegate.mjs` to build a delegation transaction for each member:
   ```
   node _delegate.mjs
   ```
   This prints unsigned tx hex for each delegation.
9. For each unsigned tx, open `web/dist/sign_tx.html`, sign with the admin Ledger, submit with
   `_submit_tx.mjs`. *(One delegation tx per member.)*

### Distributing rewards (each epoch)
10. At each epoch boundary, run `_push_rewards.mjs` *(not yet built)* to:
    - Withdraw all accumulated rewards from each member's coop stake address.
    - Route 99% back to the member's coop base address.
    - Keep 1% as the admin fee.
    - Sign each withdrawal tx with the admin Ledger via the web signing tool.
11. This must be done within **1 epoch** of the rewards becoming available. After that window,
    the member can claim 100% themselves using `_member_withdraw.mjs`.

### Monitoring
12. Use `_view_members.mjs` *(not yet built)* to see all registered members and their reward balances.
13. Use `_view_pool_info.mjs` *(not yet built)* to track pool saturation and choose pools wisely.

---

## Web UI Requirements (Phase 2)

### Member WebUI

- Connect wallet (CIP-30: Eternl, Nami, Lace, Flint, Yoroi)
- Join cooperative: generate coop base address, move ADA to it
- View staking rewards
- Revoke membership
- Withdraw rewards (100% after 1-epoch window)

### Admin WebUI (Phase 2b)

- View all registered members and their coop stake addresses
- Assign members to pools (granular — each member to a specific pool)
- Push reward withdrawals (collect 1% fee)
- Monitor pool saturation levels

---

## Automation Phase (Phase 3 — Claude Code Agent)

Claude Code will autonomously handle:
- Seeking best pools (performance, community contribution, single-pool status)
- Gathering member consensus on pool choices
- Last-minute delegation before epoch boundary
- Withdrawing and distributing rewards

All code should be built with this in mind:
- Structured data formats (JSON) for pool stats, member lists, delegation decisions
- Clear, scriptable interfaces for each operation
- Logging and audit trails for every action

---

## Development Environment Setup (fresh machine)

Assumed starting point: Windows 10 + WSL2 (Ubuntu).

1. Install Node.js (LTS) in WSL
2. `npm install` in `ranger/` — installs `@meshsdk/core`, `@meshsdk/core-csl`, `dotenv`
3. `npm install` in `ranger/web/` — installs MeshJS + Vite + browser polyfills
4. `npm run build` in `ranger/web/` — produces `ranger/web/dist/sign_tx.html`
5. Install Aiken CLI v1.1.21
6. Create `.env` with `BLOCKFROST_API=previewXXXXX`
7. Admin address is already in `0_admin_0.addr`. Run `_generate_credentials.mjs` only
   to create additional software wallets for testing.
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
| Wallet files | `0_admin_0.addr`, `0_member_N.addr` — Ledger hardware wallets, no .sk files |
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
| 6 | Reward fee enforcement: admin always gets 1%, fee comes from rewards (`tx.fee` deducted from member floor); no timing window | Decided |
| 7 | Last-minute delegation timing mechanism | To design |
| 8 | Tax reporting format for administrator's 1% | To design |
