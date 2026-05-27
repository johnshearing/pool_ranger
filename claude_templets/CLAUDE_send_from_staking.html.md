# CLAUDE.md — Pool Ranger (ranger)  
**At the start of each session, always read `/home/js/aiken/ranger/web/HOW_TO_SIGN.md` starting from the section "Member Page — send_from_staking.html"**.
**Always read `/home/js/aiken/ranger/claude_todo/host_send_from_staking_on_github_pages.md` at the start of each session**.

---

## Project Summary

Pool Ranger is a Cardano staking management platform built on Plutus V3 smart contracts.   
Members share their **staking key** (never their
spending/private key) with a cooperative administrator. The administrator delegates the
combined stake to carefully chosen pools. Members can revoke at any time. 99% of rewards flow back
to members, with the administrator earning 1%.


---

## Key Rules
- Only create/edit/delete files inside `ranger/`.
- All scripts are `.mjs` (ES modules, `"type": "module"` in `package.json`).
- No staking key is ever exposed in scripts — always derive from the wallet object.
- User's environment: Windows 10 + WSL2 (Ubuntu). Explain steps as if explaining to a child.

---

