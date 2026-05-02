# CLAUDE.md — Pool Ranger (ranger)

These files are auto-loaded by Claude Code at the start of every session for this directory.

**Always read `ranger/REQUIREMENTS.md` at the start of each session** to understand the currently defined goals of the Pool Ranger project.

**Always read `ranger/epoch_agent/HOW_TO_RUN.md` at the start of each session** to understand how the Epoch Reporting System currently runs.

**Always read `ranger/claude_queries/pledge_effects.md` at the start of each session** to understand proposed changes to the goals of the Pool Ranger project and the Epoch Reporting System.

---

## Project Summary

Pool Ranger is a Cardano staking cooperative. Members share their **staking key** (never their
spending/private key) with a cooperative administrator. The administrator delegates the
combined stake to carefully chosen pools. Members can revoke at any time. 99% of rewards flow back
to members, with the administrator earning 1%.

---

## Admin Wallet

The admin wallet is a **Ledger hardware wallet** (created 2026-04-17 on Preview testnet).
- Address: `0_admin_0.addr` — read this file to get the admin address.
- There is **no `0_admin_0.sk`** — the private key never leaves the device.
- Any script that needs to act as admin must use a Ledger signing flow (CIP-30 in-browser
  or HID in CLI), not a software key. Scripts that only read admin balance use the address directly.


---

## Key Rules
- Only create/edit/delete files inside `ranger/`.
- All scripts are `.mjs` (ES modules, `"type": "module"` in `package.json`).
- No staking key is ever exposed in scripts — always derive from the wallet object.
- User's environment: Windows 10 + WSL2 (Ubuntu). Explain steps as if explaining to a child.

---