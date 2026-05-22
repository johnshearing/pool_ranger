# CLAUDE.md — Pool Ranger (ranger)         
**Always read `web/HOW_TO_SIGN.md` at the start of each session** to get background information about the CIP-30 / DApp Connector which must be constructed for spending funds located at Pool Ranger staking addresses. 


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

