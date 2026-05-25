# How to Sign a Transaction with Your Ledger

Two pages live in this folder, for two different audiences:

- **`sign_tx.html`** — admin tool. Accepts an unsigned tx hex from any Pool Ranger
  `_*.mjs` script, signs it with Eternl/Ledger, and prints a copy-pasteable
  `node _submit_tx.mjs …` command. Submission is a separate step.
- **`send_from_staking.html`** — member tool (built from source via `npm run build`).
  A permissionless page titled "Pool Ranger — Staking Address Tool" with a
  radio toggle at the top selecting between two modes — **Spend FROM staking
  address** (default — spend a chosen amount to a recipient, change returns
  to the staking address) and **Sweep INTO staking address** (consolidate
  every UTxO Eternl owns at addresses OUTSIDE the staking address into one
  output at the staking address, increasing the member's delegated stake).
  No admin server, no API key, no terminal step — the page builds, signs
  (via Eternl/Ledger), and submits in one click. See the "Member page"
  section at the bottom of this file.

The rest of this document describes the `sign_tx.html` (admin) flow.
Both pages are produced by the same Vite build — run `npm run build` once and
both `dist/sign_tx.html` and `dist/send_from_staking.html` are ready to serve.

---

## Before You Start — Checklist

Work through this list before opening the page. Most failures trace back to one of these.

- [ ] **Eternl extension installed in your Windows browser (Chrome or Edge).**   
  - If it is not there, install it from the Chrome Web Store and set up your Ledger account inside it.  
- [ ] **Ledger is plugged in, unlocked, and showing the Cardano app on its screen.**  
  - If the Cardano app is not open, Eternl cannot talk to the device.  
- [ ] **Correct Ledger account selected in Eternl.**  
  - The account in Eternl must match the address you used when you ran `_register_stake.mjs`.  
  - If Eternl is on the wrong account, the Ledger will sign with the wrong key and Eternl will report a hash mismatch error.  
- [ ] **Ledger Cardano app is up to date.**   
  - Open Ledger Live → My Ledger → update the Cardano app if an update is available.  

---

## Step 1 — Build and Start a Local Web Server

You must serve the page over HTTP — browser wallets require a real server, not a plain file
open. Open a WSL2 terminal and run:

```bash
cd /home/js/aiken/ranger/web
npm install            # first time only
npm run build
npx serve dist
```

It will print something like:

```
   Serving!
   - Local:    http://localhost:3000
```

If `npx serve` is not available, use Python instead:

```bash
cd /home/js/aiken/ranger/web/dist
python3 -m http.server 3000
```

**Leave this terminal open.**  
If you close it or it stops, the server stops too.  
If you navigate to the page and see raw HTML text instead of a rendered webpage, it means the  
server is no longer running — restart it with the command above, then refresh the browser.

---

## Step 2 — Open the Page in Your Windows Browser

Open Chrome or Edge and go to:

```
http://localhost:3000/sign_tx.html
```

WSL2 shares `localhost` with Windows, so this address works directly in your Windows
browser. Do not open the file directly from the filesystem — it must go through the server.

---

## Step 3 — Sign the Transaction

1. Paste the unsigned tx hex that `_register_stake.mjs` printed into the first text box.
2. Confirm your Ledger is plugged in, unlocked, and showing the Cardano app screen.
3. Click **"Sign with Eternl (Ledger)"**.
4. Eternl will open a connection dialog — approve it.
5. Eternl will then display the transaction details and ask you to confirm on the Ledger.
6. Review and approve on the Ledger device itself.
7. After the Ledger signs, Eternl closes and a complete `node _submit_tx.mjs ...` command
   appears in the second text box on the page.

---

## Step 4 — Submit the Signed Transaction

Click **"Copy Command"**, then paste it into a WSL2 terminal from the `ranger/` directory:

```bash
cd /home/js/aiken/ranger
node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
```

Both hex values are pre-filled in the copied command — you do not need to type them.
The script will print `Submitted! Tx hash: ...` on success.

---

## Troubleshooting

**The page shows raw HTML text instead of rendering.**
The web server stopped. Go back to Step 1, restart it, and refresh the browser.

**Nothing happens when I click the Sign button.**
Open the browser inspector (F12 → Console tab) and click Sign again to see the error.
Most likely causes: Eternl is not installed, or Eternl's dApp Connector is disabled.

**Eternl flashes open and closes with `ErrorSignTx.canOnlySignPartially`.**
This is normal for Plutus script transactions and is handled automatically by the page.
If you see this, it means an older version of the page is being served — rebuild
(`npm run build`), restart the server, and do a hard refresh (Ctrl+Shift+R).

**Eternl shows `ledgerTxHashMismatch`.**
The Ledger signed with the wrong key. Check:
- Is the correct Ledger account selected in Eternl? It must match the address printed by
  `_register_stake.mjs` (Member address line).
- Is the Cardano app open on the Ledger screen at the moment you press Sign?
- Is the Ledger Cardano app up to date in Ledger Live?

**`_submit_tx.mjs` fails with a CBOR or import error.**
Make sure you are running Node.js 18 or later (`node --version`). Run the command from
inside `ranger/`, not from `ranger/web/` or any other folder.

---

## Member Page — `send_from_staking.html`

A separate page for cooperative members. It does NOT replace `sign_tx.html`;
it is a self-contained sign-and-submit tool. A radio toggle at the top of
the page selects between two modes:

- **Spend FROM staking address** (default) — spend a chosen amount of ADA
  from the Pool Ranger staking address to any recipient. The change returns
  to the same staking address so unspent ADA stays delegated. Two inputs
  (recipient, amount).
- **Sweep INTO staking address** — gather every UTxO the active Eternl
  account holds at addresses OUTSIDE the staking address and consolidate
  them into one output at the staking address. No recipient, no amount —
  one button. Used to increase the member's delegated stake in a single tx.

The staking address itself is normally not typed — the admin's per-member
link prefills it from the `?addr=…` query string and locks the field.

### What it does

Both modes share the same wiring:

- Verifies that the staking address's payment key is actually controlled by
  the currently selected Eternl account (`wallet.getUsedAddresses()` +
  `wallet.getUnusedAddresses()`). Refuses the request if not — catches
  wrong-account-selected and pasted-someone-else's-address mistakes before
  any tx is built.
- Reads UTxOs directly from Eternl (CIP-30 `wallet.getUtxos()`). Eternl
  already tracks the staking address because the member owns its payment
  key, even though the stake credential is the Pool Ranger script. No
  external chain-data provider (Koios, Blockfrost, CORS proxy) is involved.
- Builds the transaction locally with MeshSDK's MeshTxBuilder using its
  built-in protocol parameters — no network fetcher needed.
- Signs via Eternl/Ledger (`partialSign=true`, same as `sign_tx.html`).
  MeshSDK merges the Ledger's witness into the transaction and returns a
  complete signed tx.
- Submits through Eternl (`wallet.submitTx`) — Eternl forwards to the
  Cardano network via its own backend. Displays the resulting tx hash with
  a Cardanoscan link.

**Spend mode specifics:** filters wallet UTxOs to those at the staking
address only, builds a tx with the requested amount to the recipient and
`changeAddress` set to the staking address so unspent ADA stays delegated.

**Sweep mode specifics:** filters wallet UTxOs to those NOT at the staking
address, refuses up-front if any of them hold native tokens or NFTs (token
sweep is deliberately not implemented in v1), then sums the lovelace,
explicitly adds every UTxO with `.txIn()` (so coin selection cannot leave
any behind), and emits a single output to the staking address sized at
`(total − 2 tADA fee/min-UTxO buffer)`. The residual after the real fee
lands at the staking address via `changeAddress`. A pre-Ledger status line
tells the member exactly how much tADA from how many UTxOs is about to
move — that is the known-good number to compare against the Ledger screen.

There is no copy-a-command step. Members do not need a terminal or any
admin-run service. The entire flow runs inside the browser using only the
Eternl extension and the member's Ledger.

### Building the page (admin only — members open the hosted version)

```bash
cd /home/js/aiken/ranger/web
npm install            # first time only
npm run build
```

`dist/send_from_staking.html` and `dist/sign_tx.html` are produced together.
Host the `dist/` directory wherever the rest of the Pool Ranger pages live
(GitHub Pages).

### Local preview

```bash
cd /home/js/aiken/ranger/web
npm run build
npx serve dist
# open http://localhost:3000/send_from_staking.html
```

### Member checklist

Same as the admin checklist above: Eternl extension installed, correct Ledger
account selected in Eternl, Ledger plugged in with the Cardano app open. The
member's "Pool Ranger staking address" is the value on the
`D. Pool Ranger staking address` line of the report the admin generates with
`_view_members.mjs`. Members normally do not type the address — they click
the per-member Spend tool link the admin sends, which prefills and locks
the staking-address field; only the mode toggle (Spend vs. Sweep) and the
recipient + amount (Spend mode only) need attention.

### Verifying on the Ledger screen

Both modes show a status line just before Eternl opens the Ledger prompt:

- **Spend mode:** the recipient address and amount you typed.
- **Sweep mode:** "Sweeping X.XXXXXX tADA from N UTxO(s) into your staking
  address." That is the known-good number to compare against the Ledger.

The Ledger displays every output address and amount before signing. **Always
verify both on the device** — addresses must match the page, and amounts
must match the status line. Do not approve if anything differs.
