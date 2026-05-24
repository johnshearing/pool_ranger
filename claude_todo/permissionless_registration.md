# Permissionless member registration — Q&A (parked)

Captured 2026-05-22. Picks up from the work that added a permissionless
"send from staking address" tool for members
(`_spend_from_staking.mjs` + `web/send_from_staking.html`).
Not pursued yet — saved here so we can resume later.

---

## Question

> Will it be possible to use a permissionless approach for registering
> new members?

Permissionless = static page hosted on GitHub Pages, Koios (no API key), in-browser
build / sign / submit via Eternl + Ledger. No admin-run servers, no API keys in
the browser, no admin-controlled proxies.

---

## Answer (summary)

**Yes — it fits the same permissionless mold.** The on-chain side is
straightforward. The only awkward piece is the admin's local bookkeeping
(`_1_members.json`), which can be solved with a tiny new ingest script.

### What changes from the spend tool

The registration tx itself is just as easy to build in the browser:

- **Tx contents:** `registerStakeCertificate(stakeAddress)`, change back to the
  member's own wallet, pay the 2 tADA deposit (refunded on deregister).
- **Script execution:** none. Like the spend tx, registration does not invoke
  the Plutus script — it just locks the deposit against the script-controlled
  stake credential. So Koios + `partialSign=true` via Eternl works the same way.
- **No "address Eternl doesn't recognize" risk.** Unlike the spend tool, inputs
  here are the member's own normal wallet UTxOs (`addr_test1q…`), which Eternl
  already enumerates. So this is *safer* to ship as a browser page than the
  spend tool was.

### The new wrinkle: deriving the coop stake address

`_register_stake.mjs` calls `getCoopStakeScript(adminPkh, memberPkh)`, which
needs two pieces of admin-controlled data:

1. **The admin's payment-key hash** — public; bake it into the page at build time.
2. **The compiled Plutus blueprint** (`plutus.json`'s `withdraw` validator CBOR)
   — also public; bake it into the page bundle.

Both are baked in by the admin when running `npm run build`. Members get
whatever version is live on GitHub Pages — same trust model as any
open-source dApp frontend.

### The actual hard part: admin's local member directory

Today, `_register_stake.mjs` does double duty: it builds the tx **and**
appends the new row to `_1_members.json` so `_view_members.mjs`,
`_delegate.mjs`, etc. can find the member. If members register
permissionlessly, the admin's local file no longer gets updated automatically.

Three options for closing that gap, in order of preference:

1. **Member sends admin tx hash + chosen name out of band** (email, message).
   Admin runs a tiny new script — `_ingest_member.mjs --txhash <hash> --name <label>`
   — that fetches the registration tx from Blockfrost, extracts the member's
   bech32 address, derives the rest with `getCoopStakeScript`, and appends to
   `_1_members.json`. The critical on-chain step is permissionless; the
   admin's bookkeeping happens later and the member does not need the admin
   to be online to participate. **Recommended.**
2. **Tx metadata label.** The registration page attaches a Cardano transaction
   metadata label (e.g. `674` with `{name, label: "pool-ranger-register"}`)
   and the admin periodically scans Blockfrost/Koios for that label. No
   member-admin messaging needed, but a leaky metadata label is spammable.
3. **On-chain enumeration.** Admin scans every stake-registration on the
   network and tests whether the stake address matches a coop script for any
   known pkh. Infeasible — script hashes are parameterized by `memberPkh`, so
   the admin would need to know the member's pkh already.

### Open policy question (worth deciding before building)

Do you **want** registration to be one-click permissionless, or is there
value in a small admin gate (e.g. members DM you first to be invited)? Either
way the tech is the same; it's a policy choice.

---

## Status

User chose not to pursue this further at the moment. Saved here for resumption.

## Suggested next steps when resuming

- Decide the policy question (open permissionless vs. invite-only).
- Sketch a detailed plan modelled on the
  `_spend_from_staking.mjs` + `web/send_from_staking.html` PR:
  - New `web/register.html` + `register.js` (paste member name + use Eternl's
    own address; build registration tx via Koios; sign; submit).
  - New `_ingest_member.mjs` (admin-side) for option 1 above.
  - Bake admin pkh + plutus blueprint into the web bundle at build time
    (Vite `define` or a generated `bundled_blueprint.js`).
- Cross-reference the permissionless principle memory
  (`feedback_permissionless_member_tools.md`).
