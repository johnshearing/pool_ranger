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

### Dev-server gotcha — `serve dist` strips `.html` AND query strings

While testing the prefill end-to-end on localhost we hit a confusing
symptom: pasting `http://localhost:3000/send_from_staking.html?addr=…`
into the address bar produced a page where the staking-address field
was still editable, the green lock note never appeared, and the
address bar ended up at bare `http://localhost:3000/send_from_staking`
(no `.html`, no query string).

**Cause.** The local dev server is `npx serve dist` (running from
`/home/js/aiken/ranger/web/`), and `serve`'s default `cleanUrls: true`
behaviour 301-redirects `/send_from_staking.html` →
`/send_from_staking` **and drops the query string** in the redirect.
By the time the page loads, `window.location.search` is empty, the
URL-prefill block sees no `?addr=`, and the field stays writable.

**Fix on localhost.** Emit URLs in `_view_members.mjs` *without*
`.html`, so they hit `serve`'s canonical form directly and skip the
redirect. The constant in `_view_members.mjs` is now:

```js
const SEND_FROM_STAKING_BASE = 'http://localhost:3000/send_from_staking';
```

with a comment above it explaining the omission.

**Implication for GitHub Pages.** GitHub Pages does **not** do
clean-URL rewriting. The bare `/send_from_staking` would 404 there.
So when we deploy:

1. Flip `SEND_FROM_STAKING_BASE` to the full GitHub Pages URL
   **with** `.html` (e.g.
   `https://johnshearing.github.io/pool_ranger/web/dist/send_from_staking.html`).
2. Verify by clicking a printed Spend tool link from the live admin
   report; the page should load directly, no redirect involved, with
   `?addr=…` intact and the field locked.
3. The dev-server omission of `.html` is a localhost-only quirk —
   nothing to carry over.

There is a `TODO` comment above the constant in `_view_members.mjs`
that calls this out, so the flip is hard to miss at deploy time.

---

## Feature added 2026-05-24 — Sweep mode (consolidate non-staking UTxOs into the staking address)

### Why

The page's original job was one-directional: spend ADA *out* of the Pool
Ranger staking address while keeping the change delegated. The inverse
operation — moving ADA the member already has at *other* Eternl addresses
*into* the staking address so it joins the delegation — was technically
possible from Eternl directly, but required the member to send N
transactions (one per source UTxO they wanted to move) and to know the
staking address by hand. Adding a sweep button to the same page makes it
one click.

This is the *safe* direction relative to the existing Spend mode: funds
never leave the member's own wallet boundary — they consolidate from the
member's other addresses into the member's staking address. The Ledger
still verifies the destination, but the worst-case mistake is "I deposited
more into my coop stake than I meant to," not "I sent ADA to an attacker."

Naming: initially called "Deposit" in the spec, but the user pointed out
that "deposit" implies funds arriving from *outside* the wallet, which is
misleading — every lovelace involved is already inside the same Eternl
account, just sitting at different addresses. Renamed to "Sweep" to match
the actual semantics (consolidation within one wallet boundary). Saved
that as a usability lesson for future feature naming on this page.

### What was implemented

**HTML (`web/send_from_staking.html`):**

- Page title changed from "Pool Ranger — Send from Staking Address" to
  "Pool Ranger — Staking Address Tool" (covers both modes).
- Added a `#mode-toggle` block immediately under the H2 with two radio
  inputs (`spend` default, `sweep`) and a light-grey background to make
  it visually distinct.
- Wrapped the recipient field in `<div id="recipient-group">` and the
  amount field in `<div id="amount-group">` so both can be hidden in
  Sweep mode via `display: none`.
- Added `<p id="mode-description">` for the per-mode description sentence
  (swapped by JS on toggle).
- Dropped `placeholder="5"` from the amount input — the bare numeric
  placeholder rendered as if "5" was already entered, which confused the
  user during testing when validation said "Amount must be a positive
  number" on what looked like a filled field. The example is now in the
  hint text below the label instead: *"For example, type 5 to send 5 tADA.
  Decimals allowed (e.g. 5.25)."*

**JS (`web/send_from_staking.js`):**

- Added a `getMode()` reader, an `updateModeUI()` toggle handler, and
  `change` listeners on the radios. On toggle: show/hide the recipient
  and amount groups, swap the description text, swap the button label
  (`Sign and submit with Eternl (Ledger)` ⇄ `Sign and sweep with Eternl
  (Ledger)`).
- Refactored the click handler into a thin orchestrator. Shared work
  (`validateStakingAddress`, `assertWalletControlsPaymentKey`, the Eternl
  connection, the URL-prefill lock, the sign + submit) runs once for both
  modes. The mode-specific tx construction lives in `buildSpendTx` /
  `buildSweepTx` helpers that each return the unsigned tx hex.
- `buildSpendTx` preserves the original behavior exactly.

### Sweep-mode tx construction details

1. `wallet.getUtxos()` returns every UTxO in the active Eternl account.
2. Filter to those NOT at the staking address — call this `sweepUtxos`.
3. If any `sweepUtxos[i]` carries a non-lovelace asset, refuse with a
   friendly error and tell the member to consolidate tokens in Eternl
   first. (v1 limitation — bundling tokens into the staking-address
   output needs per-asset min-UTxO recalculation we have not written.)
4. Sum lovelace across all `sweepUtxos`. If total ≤ 2 tADA buffer,
   refuse — not enough to cover fee.
5. Add every UTxO to the tx with explicit `txBuilder.txIn(...)`.
   **Critical:** this is what differs from `.selectUtxosFrom()`, which
   would only pick enough UTxOs to cover the output. Explicit `.txIn()`
   forces every source UTxO to be consumed, which is the whole point of
   "sweep."
6. Single output to the staking address sized at
   `(total − SWEEP_FEE_BUFFER_LOVELACE)` where the buffer is 2 tADA.
7. `changeAddress` set to the staking address as well, so the residual
   (buffer minus real fee, typically ~1.5–1.83 tADA) lands at the staking
   address too. Net result: every non-staking lovelace minus the actual
   fee ends up at the staking address; nothing leaks back to the
   wallet's normal change address.
8. Status line set just before signing reads:
   *"Sweeping X.XXXXXX tADA from N UTxO(s) into your staking address.
   Verify the destination address on the Ledger screen — it must match
   the address shown above. Building transaction…"*
   That gives the member a known-good number to compare against the
   Ledger screen.

The 2 tADA buffer is intentionally generous. A many-input tx can run a
few hundred thousand lovelace in fees; 2 tADA covers worst case plus the
min-UTxO floor on the residual. Tune `SWEEP_FEE_BUFFER_LOVELACE` only if
protocol params or min-UTxO rules change materially.

### What it catches

- The pre-existing `assertWalletControlsPaymentKey()` check applies to
  Sweep mode too — wrong Eternl account selected, or somehow a different
  member's staking address loaded from the URL, both abort before any
  UTxO is read.
- The token-bearing-UTxO check fails *loudly* rather than silently
  dropping or wrongly bundling tokens — important so a "successful sweep"
  message never misleads a member whose NFTs were quietly left behind.

### What it does NOT catch

- Membership in the active Eternl account is the only filter for "is
  this UTxO mine?" — if a member has multiple accounts in the same
  Eternl instance, only the *active* one is swept. That is the intended
  scoping (CIP-30 standard), but worth knowing.
- A member who clicks Sweep without realizing what it does will move
  *all* their non-staking ADA into the staking address. The destination
  is safe (it is their own staking address) and recoverable via Spend
  mode, but undoing a sweep takes a second tx. The mode-description
  sentence and the pre-Ledger status line both spell out what is about
  to happen.
- Token-bearing wallets cannot use Sweep at all in v1. Documented in the
  error message; revisit if/when token bundling is implemented.

### Files changed

- `web/send_from_staking.html` — added mode toggle, wrapped fields in
  groups, dropped numeric placeholder, updated title.
- `web/send_from_staking.js` — added mode toggle handler, refactored
  click handler into orchestrator + `buildSpendTx` / `buildSweepTx`,
  added `SWEEP_FEE_BUFFER_LOVELACE` constant, expanded header comment.
- `web/dist/send_from_staking.html` + new hashed bundle in
  `web/dist/assets/` (`send_from_staking-C1eb9Yeu.js`) — rebuilt via
  `npm run build`. Old hashed bundle removed by the build.
- `REQUIREMENTS.md` — updated the script-checklist entry and the Member
  Workflow "Ongoing participation" section to describe both modes.
- `web/HOW_TO_SIGN.md` — restructured the Member Page section to cover
  both modes, added a verification-on-Ledger subsection.

### Suggested manual test plan

1. From `web/`, run `npx serve dist`.
2. Open the admin's per-member URL — verify the staking field is
   prefilled and locked, mode is Spend.
3. Toggle to Sweep — recipient and amount fields hide, description
   changes, button reads "Sign and sweep with Eternl (Ledger)."
4. Spend-mode regression: toggle back, send a small amount as before.
5. Sweep happy path: with at least one non-staking-address UTxO, click
   Sweep → Sign and sweep → verify status line reports total tADA +
   UTxO count → verify Ledger screen shows the staking address as
   destination → approve.
6. Sweep with nothing to sweep: friendly error before any Eternl popup.
7. Wrong-account regression: with a different Eternl account selected,
   either mode should still hit the "payment key not controlled" error
   before tx build.

---

## Safeguard added 2026-05-25 — sibling Pool Ranger registration detection

### The hole this closes

`assertWalletControlsPaymentKey` (added 2026-05-24) plus URL-prefill +
locked staking field together close the "wrong account / wrong address"
case, but they leave one variant open: a member who registers **more
than one Pool Ranger hybrid address from the same Eternl account** ends
up with two staking addresses whose payment keys are both controlled
by that account.

Why that matters at Sweep time: `wallet.getUtxos()` returns every UTxO
in the active Eternl account regardless of which address it sits at.
The sweep filter `allUtxos.filter(u => u.output.address !== stakingAddr)`
only excludes UTxOs at the *target* staking address — UTxOs at the
**other** Pool Ranger staking address survive the filter, get added as
inputs via explicit `.txIn()`, and consolidate into the target. Net
effect: the member runs Sweep on address A, the page silently moves
funds out of address B into A, and the member wonders where the funds
delegated under B went. The Ledger displays the destination correctly
(A) but does not display source addresses in a way that makes
"this UTxO was at B" salient.

Funds are not lost — they're at A, still under the member's payment
key, still delegated (via A's coop script instead of B's). But to the
member it looks indistinguishable from a bug, and the "fix" requires
explanation rather than recovery.

### What links sibling Pool Ranger addresses (the detectable invariant)

Not `memberPkh` — sibling receive addresses come from different
derivation indices → different payment keys → different PKHs. The
existing `dupPkh` check in `_register_stake.mjs` does not fire.

**Stake credential.** A base address is `payment_credential +
stake_credential`. Eternl (like most HD wallets) uses one **stake key
per account** but a new **payment key per receive address**. So two
receive addresses from the same Eternl account share their stake
credential. `deserializeAddress(addr).stakeCredentialHash` returns the
key-hash form of that stake credential, and
`deserializeAddress(addr).stakeScriptCredentialHash` returns the
script-hash form — both fields already used elsewhere in the codebase
(see `_view_members.mjs:304-307`).

### Defense in depth — two checks, complementary

**A. Registration-time guard (`_register_stake.mjs`).** Pre-commit, no
2 tADA wasted. Runs immediately after the existing `dupPkh` check and
before the admin lookup. Extracts `stakeCredentialHash` from `--addr`,
then derives the same field from every existing
`registeredReceiveAddress` and refuses on a match. Skips silently if
`--addr` is an enterprise address (no stake half — nothing to compare).

Edge cases handled:
- Empty roster (bootstrap path): `members.find` returns `undefined`,
  check passes, `admin_0` registers as before.
- Existing rosters: derivation is on the fly from
  `registeredReceiveAddress`, so no schema change to `_1_members.json`
  and no migration needed.
- Admin dogfooding from their own wallet: check fires against
  `admin_0` and surfaces the situation immediately — intended.
- Re-registration after deregister: trips the check. The existing
  workflow already handles this — header comment instructs the admin
  to remove the old entry from `_1_members.json` first when re-deriving.
- No `--force` flag yet. If a legitimate "I really want two sibling
  registrations" case ever appears, add it then; meanwhile the simpler
  refusal protects against the foot-gun without a tempting escape hatch.

**B. Sweep-time guard (`web/send_from_staking.js`).** Post-commit safety
net for siblings that pre-date the registration check, structurally
detectable without the admin's roster (which the browser doesn't have
and shouldn't have, for privacy). In `buildSweepTx`, immediately after
the empty-sweep check and before the token-bearing check: filter
`sweepUtxos` for any whose `output.address` has a
`stakeScriptCredentialHash`. Any such UTxO sits at a Pool Ranger-style
hybrid address other than the target — refuse with a message that lists
the distinct sibling addresses so the member can show the admin exactly
which staking addresses Eternl is reporting under the same account.

Why a structural check rather than a roster check: the browser cannot
fetch the admin's roster without re-introducing the centralized
dependency the page was designed to avoid. The `stakeScriptCredentialHash`
test is conservative (it would also refuse non-Pool Ranger script-stake
addresses, which are extremely rare in member wallets and would still
deserve a refusal) and needs nothing beyond MeshSDK.

### Why the permissionless-registration path doesn't need this

`claude_todo/permissionless_registration.md` is parked. The admin
currently runs `_register_stake.mjs` themselves (admin-gated
registration), so the check lives there and fires *before* the member
spends 2 tADA. If the parked permissionless plan is ever revisited,
the registration-side check would move to an `_ingest_member.mjs`
script (also admin-side, with roster access), and the failure mode
shifts to "member already paid the on-chain deposit and now has to
deregister to recover it." Both checks (registration-side and
sweep-side) survive that move unchanged.

### Files changed

- `_register_stake.mjs` — added the sibling-stake-cred refusal in
  `main()` immediately after the existing `dupPkh` block, plus matching
  bullets in the header comment block and in `HELP`.
- `web/send_from_staking.js` — added the script-stake-cred refusal in
  `buildSweepTx` right after the empty-sweep check, plus a matching
  bullet in the top-of-file Sweep-mode comment block.
- `web/dist/send_from_staking.html` + new hashed bundle in
  `web/dist/assets/` (`send_from_staking-DtQoDA_j.js`, replacing the
  prior `send_from_staking-C1eb9Yeu.js`) — rebuilt via `npm run build`.
- `REQUIREMENTS.md` — updated the `_register_stake.mjs` script-checklist
  entry and the Sweep-mode bullet under `web/send_from_staking.js` to
  describe the new defenses.

### Suggested manual test plan

1. Registration-side regression. With at least one existing member in
   `_1_members.json`, run `_register_stake.mjs --name member_X --addr
   <a sibling receive address from the existing member's Eternl
   account>` — expect refusal naming the existing member, no tx built.
2. Registration-side happy path. Same command with a receive address
   from a different Eternl account → tx builds normally.
3. Sweep-side regression. Construct a wallet that holds UTxOs at two
   distinct Pool Ranger staking addresses (deliberately register
   siblings on a throwaway test member if needed), load the Sweep tool
   with one of them as `?addr=`, click Sweep — expect refusal listing
   the other staking address; no Eternl popup; no tx.
4. Sweep-side happy path. Single Pool Ranger staking address, regular
   Eternl receive UTxOs outside it, Sweep should still work as before.

---

## Safeguard added 2026-05-25 (follow-up) — lock the staking field when no `?addr=`

### The hole this closes

The 2026-05-24 URL-prefill safeguard locked the staking-address field only
*when* `?addr=` was present. Visiting the page at the bare URL
(`http://localhost:3000/send_from_staking`, or the eventual
`https://johnshearing.github.io/pool_ranger/web/dist/send_from_staking.html`)
left the textarea writable as a paste fallback. That fallback reopens
exactly the holes URL-prefill was designed to close: clipboard-swap
malware, typos that survive bech32, phishing-pasted wrong addresses, and
the wrong-account-from-the-same-Eternl-wallet variant that
`assertWalletControlsPaymentKey` cannot fully cover.

Members should never need to type or paste a staking address — the admin's
`_view_members.mjs` report prints a canonical per-member URL with
`?addr=` baked in. A bare visit to the page is not a legitimate workflow.

### What was implemented

In `web/send_from_staking.js`, extended the URL-prefill block with an
`else` branch:

- `stakingInput.value = ''` (defensive — should already be empty).
- `stakingInput.readOnly = true` and greyed background (same lock styling
  as the prefilled case, so the locked state looks consistent regardless
  of how the page was opened).
- `stakingInput.placeholder = ''` so the textarea reads as inert, not as
  "go ahead and paste here."
- `sendBtn.disabled = true` so the action is unavailable, not just
  unfilled.
- `#prefill-note` populated in crimson with: *"No address in the URL.
  Open this page using the link your admin sent you — manual entry is
  disabled for safety."*

Rebuilt `web/dist/` via `npm run build`; new hashed bundle is
`web/dist/assets/send_from_staking-BSWrwoEV.js`, replacing the prior
`send_from_staking-DtQoDA_j.js`.

### What it catches

- A member who bookmarks the bare page URL and visits it without going
  through the admin's link — the page refuses to act until they open
  the proper per-member URL.
- An attacker phishing the bare URL alongside instructions to paste an
  attacker-supplied address — the paste path no longer exists.
- A would-be footgun where a member types or pastes a *valid-looking
  but wrong* staking address (sibling registration, another member's
  address, etc.) that the in-page checks would have to catch downstream.

### What it does not catch

- A phishing URL that bundles a malicious `?addr=` — `assertWalletControlsPaymentKey`
  still has to catch that case (and does, except for the sibling-derivation
  variant that the 2026-05-25 sibling-Pool-Ranger detection covers at sweep
  time). This safeguard narrows the manual-entry surface, not the URL-injection
  surface.

### Trade-off accepted

The page is no longer usable for *anyone* who arrives at the bare URL —
including the admin testing the page out of band. If a manual escape
hatch ever becomes desirable (for example, `?manual=1` to re-enable the
textarea for admin-side testing), it is a one-line addition in the same
block. Not added yet because no current workflow requires it and an
unused escape hatch is itself attack surface.

### Files changed

- `web/send_from_staking.js` — added the `else` branch on the
  `addrFromUrl` check; expanded the surrounding comment to document the
  bare-URL behavior.
- `web/dist/send_from_staking.html` + new hashed bundle in
  `web/dist/assets/` (`send_from_staking-BSWrwoEV.js`) — rebuilt via
  `npm run build`.

### Suggested manual test plan

1. Visit `http://localhost:3000/send_from_staking` with no query string —
   field should appear locked + empty, Send button disabled, crimson
   notice visible.
2. Visit `http://localhost:3000/send_from_staking?addr=<valid staking
   addr>` — field prefilled and locked (grey), green "loaded from your
   admin's link and locked" notice, Send button enabled. Existing flow
   should be unchanged.
3. Visit `http://localhost:3000/send_from_staking?addr=garbage` — field
   prefilled with `garbage`, locked, Send button enabled, but clicking
   Send triggers `validateStakingAddress` and surfaces the
   "must start with addr_test1y / addr1y" error before any Eternl
   popup. (Confirms the URL-injection path still funnels through the
   downstream checks.)

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
