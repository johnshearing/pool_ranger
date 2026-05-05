# CLAUDE.md — Pool Ranger (ranger)

These files are auto-loaded by Claude Code at the start of every session for this directory.
**Always read `SPO_REWARD_ANALYSIS_CHART_COMPANION.md` at the start of each session** to get background information about `SPO_REWARD_ANALYSIS_CHART.html`.
**Always read `SPO_REWARD_ANALYSIS_CHART.html` at the start of each session** to get see the file that contains the bug that needs to be fixed.


---

## Project Summary

Pool Ranger is a Cardano staking cooperative. Members share their **staking key** (never their
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

