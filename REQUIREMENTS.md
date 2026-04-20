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

- **Admin signs:** Admin keeps 1% of the withdrawal; member must receive ≥ 99%.
- **Only member signs:** Member receives 100% (no admin fee).
- The 1-epoch timing window (admin fee window opens at epoch end, closes after 1 epoch) is
  enforced socially in Phase 1. Phase 2 will add a `validity_range` check against the epoch
  boundary to enforce the window on-chain.

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
hex. The unsigned hex is then signed externally on the Ledger device (via `cardano-hw-cli` or a
web tool such as eternl.io). The resulting signed tx hex is submitted using `_submit_tx.mjs`:

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

- [x] `_generate_credentials.mjs` — creates software wallets; scaffolds Ledger support
- [x] `_transfer_funds.mjs` — sends ADA between wallets for testing
- [x] `_view_wallet_balances.mjs` — inspect ADA and reward balances
- [x] `_register_stake.mjs` — member registers their coop stake credential on-chain (pays 2 ADA deposit); hardware and software wallet signing
- [x] `_delegate.mjs` — admin delegates each member's stake to a chosen pool (per-member granular control); hardware and software wallet signing
- [x] `_submit_tx.mjs` — submits a signed tx hex to the network via Blockfrost; used after Ledger signing to replace `cardano-cli transaction submit`
- [ ] `_push_rewards.mjs` — admin withdraws rewards and routes 99% to member, keeps 1%
- [ ] `_member_withdraw.mjs` — member withdraws 100% after the 1-epoch admin window expires; will support hardware and software wallet signing
- [ ] `_revoke_membership.mjs` — member (or admin) deregisters the coop stake credential; will support hardware and software wallet signing
- [ ] `_view_members.mjs` — list registered coop stake addresses and their delegation status
- [ ] `_view_pool_info.mjs` — view chosen pool(s), saturation level, recent rewards

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
3. Install Aiken CLI v1.1.21
4. Create `.env` with `BLOCKFROST_API=previewXXXXX`
5. Admin address is already in `0_admin_0.addr`. Run `_generate_credentials.mjs` only
   to create additional software wallets for testing.
6. Run `aiken build` after any change to `.ak` files to regenerate `plutus.json`.

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
| 6 | Reward fee enforcement: Phase 1 social; Phase 2 adds on-chain `validity_range` check against epoch boundary | In progress |
| 7 | Last-minute delegation timing mechanism | To design |
| 8 | Tax reporting format for administrator's 1% | To design |
