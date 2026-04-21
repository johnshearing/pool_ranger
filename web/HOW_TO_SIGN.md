# How to Sign a Transaction with Your Ledger

Use this page after running `_register_stake.mjs` (or any other script that prints an
unsigned tx hex). No build step is needed — the page uses the browser's Eternl API directly.

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
