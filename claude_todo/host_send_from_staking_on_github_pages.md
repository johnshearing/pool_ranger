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

---

## Safeguard added 2026-05-24 — wrong-account / wrong-address detection

### Question

If a member pastes the wrong value into the "Pool Ranger staking address"
box on `send_from_staking.html`, can the change be sent to an address the
member doesn't control? In particular: when a Ledger is paired with Eternl,
the member can create more than one account, each with its own payment key
and therefore its own Pool Ranger hybrid staking address. If they have the
wrong account selected (or paste the wrong member's address), what happens?

### Pre-existing safeguards (in `web/send_from_staking.js`)

1. **Bech32 checksum** — `deserializeAddress(addr)` throws on any
   one-letter typo because bech32 has a built-in error-detecting checksum.
2. **UTxO match filter** — `allUtxos.filter(u => u.output.address === stakingAddr)`.
   `wallet.getUtxos()` is scoped by CIP-30 to the currently selected
   account, so if Eternl has no UTxOs at the typed address the filter is
   empty and the tx aborts.
3. **Ledger screen** — the device displays every output address before
   signing, including the change output back to the staking address.

### The residual case (case 3)

Bech32 + UTxO filter together still leave one window open: a member with
**multiple Pool Ranger registrations in the same Eternl wallet** (e.g.,
two Ledger accounts that have each been registered) could paste the
wrong one of their own hybrid addresses. UTxOs exist at that address
under the wrong account, the filter is non-empty, the tx builds, and
the change goes to the wrong staking address. Funds are technically
recoverable (the member still controls the payment key on the other
account) but the member would experience the loss as catastrophic
until someone walked them back through it.

### Solution implemented

Added `assertWalletControlsPaymentKey(wallet, stakingAddr)` in
`web/send_from_staking.js`, called immediately after
`BrowserWallet.enable('eternl')` and before `wallet.getUtxos()`.

The check:

1. Extracts `pubKeyHash` from the typed staking address with
   `deserializeAddress`. For a type-2 hybrid address this is the
   member's payment-key hash.
2. Calls `wallet.getUsedAddresses()` + `wallet.getUnusedAddresses()`
   (CIP-30 scopes both to the active account) and extracts the
   `pubKeyHash` from each — the set of payment-key hashes the currently
   selected Eternl account controls.
3. If the typed address's payment-key hash is not in that set, throws
   before any tx is built:

   > The payment key in this Pool Ranger staking address is not
   > controlled by the currently selected Eternl account. Open Eternl
   > and switch to the account you used when you registered with Pool
   > Ranger, then try again.

### What this catches

- **Wrong Eternl account selected** for a member who has multiple
  accounts and is registered under one of them — the most likely
  multi-account scenario.
- **Pasted a different member's hybrid address** — payment-key hash
  belongs to someone else's wallet.
- **Bech32-valid but wrong payment key** (an edge case typing/paste
  error that survives the checksum) — payment-key hash won't match.

### What it does not catch

- **Multiple Pool Ranger registrations from different derivation indices
  inside the same Eternl account.** All those addresses share the same
  account, so any of their payment-key hashes will be in the wallet's
  known-PKH set, and the check passes. This is rare in practice
  (members typically register one address) and even when it happens the
  funds remain recoverable. The Ledger screen is the remaining defense.

### Files changed

- `web/send_from_staking.js` — added `assertWalletControlsPaymentKey`
  and called it in the click handler before UTxO fetch.
- `web/dist/send_from_staking.html` + the hashed bundle in
  `web/dist/assets/` — rebuilt via `npm run build` so the live page
  picks up the new check.

---

## Safeguard added 2026-05-24 (follow-up) — URL prefill + locked staking field

### Why this was necessary

`assertWalletControlsPaymentKey` (above) closes the multi-account
variant of case 3 but not the **multi-derivation-index variant**: if a
member has registered more than one Pool Ranger hybrid address from the
same Eternl account, all those payment-key hashes are in the wallet's
known-PKH set, so any of them passes the check. The page has no way
from inside itself to know *which* of the legitimate hybrid addresses
the member meant to spend from this session — that information lives
only in the member's head (or in the admin's report).

The fix is to remove the paste step entirely: deliver the canonical
staking address to the page through the URL, so the member never has
to type or paste it. This also closes the broader category of
clipboard-swap malware, typos that somehow survive bech32, and
phishing-pasted wrong addresses — none of which the in-page check can
catch on its own.

### What was implemented

**Page side — `web/send_from_staking.html` + `web/send_from_staking.js`:**

- HTML: added `<div id="prefill-note" class="hint"></div>` immediately
  below the staking-address textarea.
- JS: on module load (before any click handler runs), read
  `new URLSearchParams(window.location.search).get('addr')`. If a value
  is present:
  - set `stakingInput.value = addrFromUrl`
  - set `stakingInput.readOnly = true`
  - grey the background so the lock is visible
  - populate `prefillNote` with "Address loaded from your admin's link
    and locked." in green.
- Rebuilt `web/dist/send_from_staking.html` + bundled JS via
  `npm run build` so the served page picks up the change.

If the page is opened with no `?addr=` (e.g. someone navigates to it
directly), the field stays writable and the existing paste workflow
continues to work as a fallback.

**Admin side — `_view_members.mjs`:**

- Added near the other config constants:
  ```js
  // TODO: switch to the GitHub Pages URL once the page is published there
  const SEND_FROM_STAKING_BASE = 'http://localhost:3000/send_from_staking.html';
  ```
- Added two lines in `reportMember()` right under the staking-address
  balance:
  ```
  Spend tool (send THIS link to <member.name>):
    ${SEND_FROM_STAKING_BASE}?addr=${member.poolRangerStakingAddress}
  ```
- The admin emails (or otherwise sends out-of-band) this single
  canonical URL to each member. Members are trained to click only that
  link — never to paste anything by hand.

### Why it ports cleanly to GitHub Pages

`URLSearchParams` and `window.location.search` are plain browser APIs
that don't care where the page came from. GitHub Pages is a static
host and passes query strings through to the JS untouched. The hashed
JS asset name changes on every `npm run build`, which guarantees fresh
fetches across deploys regardless of GitHub's HTML caching. The only
deployment-time change required is flipping `SEND_FROM_STAKING_BASE`
in `_view_members.mjs` from the localhost URL to the GitHub Pages URL
— a single-line edit.

### Roster privacy (sanity-checked while making this change)

The admin's `_view_members.mjs` output is the document that
concentrates member info (the per-member URL embeds the staking
address; the rest of the per-member block prints balances and
registration metadata). Two guards already in place:

- `ranger/.gitignore` excludes `_1_members.json`, `_1_members_BU.json`,
  `_1_members_PRE_BATCH.json`, `_1_delegation_config.json`. The only
  roster-shaped file committed is `_1_members_sample.json`
  (template/example data).
- Cardano staking addresses + member PKHs are public on-chain anyway
  (anyone can look them up on Cardanoscan), so the *addresses* are not
  secret. The sensitive concentrate is the **combined balance and
  delegation roster** in the admin's local script output — which the
  admin should always slice per-member before sending, not forward
  wholesale.

### Files changed

- `web/send_from_staking.html` — added the `#prefill-note` div.
- `web/send_from_staking.js` — added the URL-prefill block immediately
  after the DOM-reference declarations.
- `web/dist/send_from_staking.html` + new hashed bundle in
  `web/dist/assets/` — rebuilt via `npm run build`.
- `_view_members.mjs` — added `SEND_FROM_STAKING_BASE` constant and
  the per-member Spend tool URL lines.
- `REQUIREMENTS.md` — updated three places to match the new workflow:
  the `_view_members.mjs` description (mentions the Spend tool URL),
  the `web/send_from_staking.js` description (URL prefill + lock +
  `assertWalletControlsPaymentKey`), and the member ongoing-participation
  step (members open the admin's link, not the bare HTML).

---

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
