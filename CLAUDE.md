# CLAUDE.md — Pool Ranger (ranger)

This file is auto-loaded by Claude Code at the start of every session for this directory.
**Always read `REQUIREMENTS.md` at the start of each session** for the full project spec.

---

## Project Summary

Pool Ranger is a Cardano staking cooperative. Members share their **staking key** (never their
spending/private key) with a cooperative administrator. The administrator delegates the
combined stake to carefully chosen pools. Members can revoke at any time. Rewards flow back
to members, with the administrator earning 1% when they push withdrawals within a 1-epoch
window; after that window, members withdraw 100% themselves.

Working directory: **`ranger/`** only. Model workflow from: **`vesting/`**.

---

## Admin Wallet

The admin wallet is a **Ledger hardware wallet** (created 2026-04-17 on Preview testnet).
- Address: `0_admin.addr` — read this file to get the admin address.
- There is **no `0_admin.sk`** — the private key never leaves the device.
- Any script that needs to act as admin must use a Ledger signing flow (CIP-30 in-browser
  or HID in CLI), not a software key. Scripts that only read admin balance use the address directly.

---

## Phase 1 Goal (current)

Build `.mjs` scripts (ES modules, same pattern as `vesting/`) for:
1. Admin credential generation (software + hardware wallet scaffold)
2. Viewing balances
3. Registering the cooperative stake address
4. Delegating to a pool
5. Pushing rewards (admin, 1% fee)
6. Member withdrawal (100%, after epoch window)
7. Revoking membership

---

## Key Rules
- Only create/edit/delete files inside `ranger/`.
- Use `vesting/` as the code and workflow model (especially `common/common.mjs` pattern).
- All scripts are `.mjs` (ES modules, `"type": "module"` in `package.json`).
- No staking key is ever exposed in scripts — always derive from the wallet object.
- Blockfrost Preview testnet. API key in `ranger/.env` as `BLOCKFROST_API=previewXXX`.
- User's environment: Windows 10 + WSL2 (Ubuntu). Explain steps as if explaining to a child.

---

## Reference

See `REQUIREMENTS.md` in this directory for full requirements, phased plan, open design
questions, and naming conventions.
