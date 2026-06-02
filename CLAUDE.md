# CLAUDE.md — Pool Ranger (ranger)  
Always read /home/js/aiken/CIPs/CIP-0187/README.md at the start of each session.
Always read /home/js/aiken/ranger/claude_queries/Multi_CIP_Plan.md at the start of each session.
Always read https://github.com/Cerkoryn/SPO-Incentives at the start of each session.
Always read /home/js/aiken/ranger/CIP_UTILIZATION_SCALED_PLEDGE_BONUS.html at the start of each session.
Always read /home/js/aiken/ranger/epoch_agent/reports/epoch_XXX.txt at the start of each session where "XXX" is a place holder for the number of the latest epoch.


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

