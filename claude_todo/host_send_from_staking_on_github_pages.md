# Hosting `send_from_staking.html` on GitHub Pages — Q&A (parked)

Captured 2026-05-22. Picks up from the work that added the permissionless
"send from staking address" tool for members
(`web/send_from_staking.html` + `web/send_from_staking.js`).
Not pursued further yet — saved here so we can resume later.

---

## Goal

> Run `send_from_staking.html` directly from GitHub Pages, the same way
> `SPO_REWARD_ANALYSIS_CHART.html` runs from
> <https://johnshearing.github.io/pool_ranger/SPO_REWARD_ANALYSIS_CHART.html>.
>
> Bonus question: is there any advantage to putting the JavaScript into the
> HTML file rather than having it in a second file?

The chart page is a single self-contained HTML file that imports Chart.js
from a CDN at runtime. We wanted to see if `send_from_staking.html` could
follow the same pattern: one file, no build step, no `dist/` to commit.

---

## Two options identified

1. **Commit the Vite `dist/` output.** Keep `web/send_from_staking.html` +
   `web/send_from_staking.js` as the source, run `npm run build` in `web/`,
   and commit the bundled output. GitHub Pages serves
   `web/dist/send_from_staking.html` at
   `https://johnshearing.github.io/pool_ranger/web/dist/send_from_staking.html`.
   JS stays in a separate (hashed) asset file — no choice.
2. **Single inline HTML with CDN ESM imports.** Rewrite the page to import
   from `https://esm.sh/@meshsdk/core` at runtime, inline the script in the
   HTML, drop the file at the repo root next to `SPO_REWARD_ANALYSIS_CHART.html`.
   No build step, no `dist/`, easy for members to save and audit.

Inlining (option 2) is genuinely nicer for permissionless member tools:
one file to share, one cache entry, no risk of HTML/JS version drift, and
matches the chart page's pattern (see
`feedback_permissionless_member_tools.md`). So we tried to make it work.

---

## What was tested

Created a throwaway page `web/test_esm_cdn.html` (since deleted) that tried
to import `BrowserWallet`, `KoiosProvider`, `MeshTxBuilder`, and
`deserializeAddress` from `@meshsdk/core` via esm.sh, then exercise each.

### Attempt 1 — plain `https://esm.sh/@meshsdk/core@1.9.0-beta.102`

Failed at module load:

```
SyntaxError: The requested module '/bignumber.js@^9.1.1?target=es2022'
does not provide an export named 'BigNumber'
```

Classic CommonJS-named-import problem. Somewhere inside MeshSDK there's
`import { BigNumber } from 'bignumber.js'`, but bignumber.js exports
`BigNumber` as the CJS default. esm.sh's default ESM wrapper doesn't
synthesize the named export.

### Attempt 2 — `https://esm.sh/@meshsdk/core@1.9.0-beta.102?bundle`

The `?bundle` flag is esm.sh's documented workaround for CJS-named-import
issues. Worked past the bignumber problem but failed differently:

```
TypeError: Failed to fetch dynamically imported module:
https://esm.sh/@meshsdk/core@1.9.0-beta.102?bundle
```

Investigation via `curl`: the bundle URL returns 200 OK and points to a
614 KB `core.bundle.mjs` that side-effect-imports ~200 transitive
sub-modules. One of those sub-modules fails to load in the browser, and
the browser surfaces the failure as the generic "Failed to fetch
dynamically imported module" error on the top-level URL. Identifying the
exact culprit would require DevTools Network-tab inspection on each load.

---

## What was learned

MeshSDK is the wrong shape for esm.sh:

- Deep dependency graph (hundreds of transitive packages).
- Multiple CommonJS deps that need named-import shims (`bignumber.js` was
  just the first one we tripped on).
- Node built-ins under the hood (Buffer, crypto, fs, process) — exactly
  why `web/vite.config.js` uses `vite-plugin-node-polyfills`.

Even if we patched today's failing transitive dep, every MeshSDK release
is one upstream change away from breaking the CDN load. The Vite config
exists for a reason.

---

## Decision

**Drop option 2. Go with option 1 — commit the Vite `dist/` output.**

The "one self-contained source file" tradeoff is real but smaller than
the "depends on esm.sh's ESM shims for 200+ transitive packages" risk.

---

## Status

Page works end-to-end on localhost as of 2026-05-23 — Eternl + Ledger
signed and submitted a real Preview tx from a Pool Ranger staking
address. Still parked: GitHub Pages hosting (the option-1 deployment
work below).

## Update: architecture inside the page changed (2026-05-23)

The page no longer uses Koios at all. The architecture is now
Eternl-only via CIP-30 (`wallet.getUtxos()` + MeshTxBuilder with
built-in protocol params + `wallet.signTx` + `wallet.submitTx`). See
memory `project_eternl_cip30_hybrid_address.md` for why and for the
findings about Preview Koios being CORS-broken and corsproxy.io
blocking POST. This is independent of hosting — hosting work below is
unchanged — but it simplifies what a member needs to audit: just the
HTML and the bundled MeshSDK call, no external chain-data provider.

## Suggested next steps when resuming

- Tweak `web/vite.config.js` so the built page works under the
  `/pool_ranger/web/dist/` path on GitHub Pages — likely set `base` to
  `./` (relative) or to the full Pages prefix so the hashed asset URLs
  in the built HTML resolve correctly.
- `cd web && npm run build` and confirm `web/dist/send_from_staking.html`
  references its bundled JS with a relative path.
- Commit `web/dist/send_from_staking.html` and the hashed asset under
  `web/dist/assets/`. (`web/dist/sign_tx.html` is already committed via
  the same path — copy that pattern.)
- Verify on the live URL after pushing:
  `https://johnshearing.github.io/pool_ranger/web/dist/send_from_staking.html`.
- Update `web/HOW_TO_SIGN.md` and any member-facing instructions with the
  GitHub Pages URL.
- Re-test end to end with Eternl + Ledger on the live URL (the localhost
  run on 2026-05-23 already validated the in-page flow).

---

## Security review — risks of GitHub-Pages hosting (2026-05-23)

Discussion captured before going live. Threat model is shaped by how the
page actually works: it never sees a private key, only proposes a tx that
Eternl forwards to the Ledger, and the Ledger displays every output
address, change address, amount, and fee on its own screen before
signing. **The Ledger screen is the last line of defense — almost every
meaningful attack collapses to "did the member read the Ledger screen?"**

### What the page can and cannot do

Can: read UTxOs Eternl already tracks, propose a tx (recipient, amount,
change address), ask Eternl→Ledger to sign, submit the signed tx.

Cannot: see or extract any private key. Cannot force the Ledger to sign
anything the user does not approve on the device.

### Risks of hosting on GitHub

**A. Repo / GitHub-account takeover.** Push access to
`johnshearing/pool_ranger` lets an attacker replace
`web/dist/send_from_staking.html` + the bundled JS with a version that
quietly:
- substitutes the recipient address typed by the member with the
  attacker's,
- changes the change address from the staking address to an
  attacker-controlled one (drains *all* remaining ADA in one tx, not
  just the typed amount),
- adds an extra small output to an attacker address that a member
  glancing at one output may miss.

A determined attacker copies the page pixel-for-pixel — only the bytes
inside `signTx` change.

Mitigations: 2FA + hardware security key on the GitHub account, branch
protection on `main`, required PR reviews, minimise collaborators with
push to `main`, signed commits/tags.

**B. Build-time supply chain.** MeshSDK has hundreds of transitive npm
packages. A compromise in any of them between `npm install` and
`npm run build` is baked into `dist/`. Once committed, every member
runs it.

Mitigations: pin `package-lock.json`, prefer `npm ci` over
`npm install`, audit dep upgrades manually, consider a clean VM for
builds.

**C. No HTTP headers on GitHub Pages.** Cannot set CSP, SRI,
X-Frame-Options, etc. Consequences:
- no Content-Security-Policy to block exfiltration if a script ever does
  get injected,
- the HTML cannot pin the hash of the JS bundle it loads
  (no `integrity="sha256-…"` on the same-origin asset),
- the page can be iframed by attacker sites (clickjacking surface is
  limited because Eternl popups are extension-rendered, but still a
  concern).

Mitigation: add a `<meta http-equiv="Content-Security-Policy" …>` tag
in the HTML (weaker than a header, but real). Add `integrity` attrs to
script tags if anything is ever loaded from a non-same-origin source.

**D. Phishing / lookalike URL.** `johnshearing.github.io/pool_ranger/...`
is easy to spoof: `johnsheraring.github.io`, `pool-ranger.com`, a
Discord DM with a "new updated page" link. **Most likely real-world
attack** and has nothing to do with the code.

Mitigations: the admin report (`_view_members.mjs`) prints the **one
canonical URL** every time and tells members never to use any other.
Consider also publishing the SHA-256 of `dist/send_from_staking.html`
and the bundled JS in the same report so security-conscious members
can verify. Consider a custom domain that you actually own.

**E. Cache poisoning / stale versions.** Browsers cache hashed asset
filenames forever; the HTML is the only re-fetched file. A member on an
old version after a patch will not notice. Not a fund-loss vector for
this page today, but worth knowing.

### Risks unrelated to GitHub

**F. Compromised Eternl extension.** Third-party code. A trojaned build
could lie about UTxOs or rewrite tx CBOR on its way to the Ledger. The
Ledger still shows the final tx, so this is caught only by Ledger
verification.

**G. Ledger "blind signing" / outdated Cardano app.** Older or
mis-configured Cardano apps can sign without displaying full output
details. Members must keep the Cardano app current and never enable any
"expert / blind sign" mode.

**H. Clipboard-swapping malware on the member's PC.** Member copies
`addr1…legit`, pastes, but `addr1…attacker` lands in the textbox. The
page then builds a perfectly legitimate-looking tx for that attacker
address. **Only the Ledger screen catches this.**

**I. Member verification fatigue.** Members who click through Ledger
prompts without reading them are unprotected against A, B, F, G, H.
This is the single biggest practical risk.

**J. Wrong network / wrong account in Eternl.** No fund loss (txs simply
fail) but confusion. The Ledger shows the network.

### Can all of this be fully mitigated?

No. But the attack surface can shrink a lot.

| Threat | Best you can do |
|---|---|
| GitHub account takeover (A) | 2FA + hardware key, branch protection, signed tags |
| Supply chain (B) | Pin lockfile, audit upgrades, reproducible-ish build |
| No CSP (C) | `<meta>` CSP, same-origin only, audit before each push |
| Phishing (D) | Single canonical URL in every admin report + a published file hash |
| Eternl / Ledger compromise (F, G) | Tell members to keep both updated; nothing else |
| Clipboard / page substitution (H, A) | **Train members to read every line on the Ledger screen.** Catches almost everything. |

The unfixable residual: a member who doesn't read the Ledger screen is
unprotected against any code-substitution attack. The defense-in-depth
recommendation is to make the Ledger-verification step **unmissable**
in both the docs and the page itself.

### Concrete additions to make before going live

- A bold notice on the page: *"Before approving on the Ledger, verify
  the recipient address and change address on the Ledger screen match
  what you typed. Do not approve if they don't."*
- Echo the typed recipient and change address back to the member in
  plain text right above the Sign button so they have a known-good
  value to compare against the device.
- Publish `sha256` of `dist/send_from_staking.html` and the bundled JS
  in the admin's `_view_members.mjs` report. Members who care can
  verify.
- Enable branch protection + required PR review on `main` so a single
  compromised credential cannot push a malicious build unilaterally.
- Consider hosting the member tool in a **separate repo** from
  admin-only tools, to shrink the blast radius of a compromise.
- Pin MeshSDK and re-audit on each upgrade. Do not auto-bump.
- Document an incident-response plan: how to notify members
  out-of-band if the dist is ever tampered with, and how to rotate
  to a new URL.

### Other questions worth asking

- Is `johnshearing.github.io/pool_ranger/...` the right long-term URL,
  or should this live on a domain you own? (Domain ownership =
  recoverable from GitHub-side issues, but adds DNS/TLS surface.)
- Who else has push access to the repo? Anyone who does is part of the
  trust base.
- What's the plan if Eternl ever stops supporting Ledger or changes its
  CIP-30 surface? Members are tied to that path.
- Do you want an in-page "preview the tx before Eternl opens" step that
  parses the built CBOR and shows outputs/fee to the member in HTML
  *before* the Ledger prompt? Belt-and-braces with the Ledger screen.
- Mainnet rollout: same page, hard-coded `NETWORK = 'mainnet'` — one
  URL per network (safer, no toggle mistakes), or a selector?
- For very large balances, is signing one tx at a time acceptable, or
  do you want a multi-recipient version (more output verification on
  the Ledger, but fewer txs)?
