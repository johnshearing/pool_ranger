# How to Sign a Transaction with Your Ledger

Two pages live in this folder, for two different audiences:

- **`sign_tx.html`** — admin tool. Accepts an unsigned tx hex from any Pool Ranger
  `_*.mjs` script, signs it with Eternl/Ledger, and prints a copy-pasteable
  `node _submit_tx.mjs …` command. Submission is a separate step.
- **`send_from_staking.html`** — member tool (built from source via `npm run build`).
  A permissionless page: a member pastes their own Pool Ranger staking address
  (no admin server, no API key needed), types a recipient and amount, and the
  page builds, signs (via Eternl/Ledger), and submits the transaction in one
  step. See the "Member page" section at the bottom of this file.

The rest of this document describes the `sign_tx.html` (admin) flow.
No build step is needed for `sign_tx.html` — it uses the browser's Eternl API directly.

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

## Step 1 — Start a Local Web Server

You must serve the page over HTTP — browser wallets require a real server, not a plain file
open. Open a WSL2 terminal and run:

```bash
cd /home/js/aiken/ranger/web
npx serve .
```

It will print something like:

```
   Serving!
   - Local:    http://localhost:3000
```

If `npx serve` is not available, use Python instead:

```bash
cd /home/js/aiken/ranger/web
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
If you see this, it means an older version of `sign_tx.js` is being served — restart the
server and do a hard refresh (Ctrl+Shift+R).

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

A separate page for cooperative members who want to spend ADA from their Pool
Ranger staking address without un-staking the change. It does NOT replace
`sign_tx.html`; it is a self-contained sign-and-submit tool with three pasted
inputs (staking address, recipient, amount) and one button.

### What it does

- Fetches the member's UTxOs at the staking address using Koios (no API key needed).
- Builds a transaction that sends the requested amount to the recipient and
  returns ALL change to the SAME staking address — so the unspent ADA stays
  delegated through the cooperative.
- Signs via Eternl/Ledger (`partialSign=true`, same as `sign_tx.html`).
- Submits via Koios. Displays the resulting tx hash with a Cardanoscan link.

There is no copy-a-command step. Members do not need a terminal or any
admin-run service.

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
`_view_members.mjs`.
