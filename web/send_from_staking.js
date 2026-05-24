// Pool Ranger — Send from Staking Address (permissionless member page).
//
// Builds, signs, and submits a transaction that:
//   - spends UTxOs at the member's Pool Ranger staking address (addr_test1y...
//     on Preview, addr1y... on mainnet),
//   - sends a chosen amount to a chosen recipient,
//   - returns all change to the SAME staking address — preserving the coop
//     stake credential so the change stays delegated.
//
// Architecture choices:
//   - Eternl (CIP-30) supplies UTxOs and submits the tx. Eternl tracks the
//     hybrid staking address (member's payment key + Pool Ranger script
//     stake credential) because the member owns the payment key. This means
//     no external chain-data provider is needed — no Koios, no Blockfrost,
//     no CORS proxy, no admin server.
//   - MeshTxBuilder uses its built-in DEFAULT_PROTOCOL_PARAMETERS for fee
//     calculation. No evaluator is passed because this tx does NOT execute
//     any Plutus script — only the payment-key side of the staking address
//     is checked. The script stake credential just rides along on the
//     change output.
//   - BrowserWallet.signTx(hex, true) — partialSign=true matches sign_tx.html;
//     Eternl/Ledger signs the lone payment-key witness and Mesh merges the
//     witness back into the tx body, returning a complete signed tx CBOR.

import {
  BrowserWallet,
  MeshTxBuilder,
  deserializeAddress,
} from '@meshsdk/core';

const NETWORK = 'preview';
const CARDANOSCAN_BASE = NETWORK === 'mainnet'
  ? 'https://cardanoscan.io'
  : 'https://preview.cardanoscan.io';

const stakingInput   = document.getElementById('staking-addr');
const recipientInput = document.getElementById('recipient');
const amountInput    = document.getElementById('amount');
const sendBtn        = document.getElementById('btn-send');
const statusBox      = document.getElementById('status');
const resultBox      = document.getElementById('result');
const prefillNote    = document.getElementById('prefill-note');

// URL-prefill: if the admin's per-member link contains ?addr=addr_test1y…,
// fill the staking-address textarea from it and lock the field so the member
// cannot accidentally paste a different value over it. Eliminates typing,
// clipboard-swap, and wrong-account-paste mistakes for members who arrive via
// the canonical link in the admin's report.
const addrFromUrl = new URLSearchParams(window.location.search).get('addr');
if (addrFromUrl) {
  stakingInput.value = addrFromUrl;
  stakingInput.readOnly = true;
  stakingInput.style.backgroundColor = '#f0f0f0';
  if (prefillNote) {
    prefillNote.textContent = 'Address loaded from your admin\'s link and locked.';
    prefillNote.style.color = 'green';
  }
}

function setStatus(msg, kind = 'info') {
  statusBox.textContent = msg;
  statusBox.style.color = { info: '#333', error: 'crimson', success: 'green' }[kind] ?? '#333';
}

function clearResult() {
  resultBox.innerHTML = '';
}

function showResult(txHash) {
  const url = `${CARDANOSCAN_BASE}/transaction/${txHash}`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = txHash;
  resultBox.textContent = 'Tx submitted: ';
  resultBox.appendChild(a);
}

function validateBech32Address(addr, fieldName) {
  if (!addr) throw new Error(`${fieldName} is empty.`);
  if (!(addr.startsWith('addr_test1') || addr.startsWith('addr1'))) {
    throw new Error(`${fieldName} must start with "addr_test1" (Preview) or "addr1" (mainnet).`);
  }
  deserializeAddress(addr);
}

function validateStakingAddress(addr) {
  validateBech32Address(addr, 'Pool Ranger staking address');
  // Type-2 Shelley address: payment-key + stake-script. Bech32 'y' marker.
  if (!(addr.startsWith('addr_test1y') || addr.startsWith('addr1y'))) {
    throw new Error(
      'That does not look like a Pool Ranger staking address.\n' +
      'It should start with "addr_test1y" (testnet) or "addr1y" (mainnet).\n' +
      'Use the address from the "Pool Ranger staking address" line in the report your admin sent you.',
    );
  }
}

// Reject a staking address whose payment-key hash is not controlled by the
// currently selected Eternl account. Catches the "wrong account selected in
// Eternl" / "pasted a different member's hybrid address" cases before any tx
// is built, so change can never be returned to an address the member did not
// intend. Compares the typed address's payment-key hash against every known
// payment-key hash in the active account (used + unused chain addresses).
async function assertWalletControlsPaymentKey(wallet, stakingAddr) {
  const { pubKeyHash: typedPkh } = deserializeAddress(stakingAddr);
  const [usedAddrs, unusedAddrs] = await Promise.all([
    wallet.getUsedAddresses(),
    wallet.getUnusedAddresses(),
  ]);
  const knownPkhs = new Set(
    [...usedAddrs, ...unusedAddrs].map(a => deserializeAddress(a).pubKeyHash),
  );
  if (!knownPkhs.has(typedPkh)) {
    throw new Error(
      'The payment key in this Pool Ranger staking address is not controlled by the currently selected Eternl account.\n' +
      'Open Eternl and switch to the account you used when you registered with Pool Ranger, then try again.\n' +
      '(If you only use one account, double-check that you pasted the right address from your admin\'s report.)',
    );
  }
}

sendBtn.addEventListener('click', async () => {
  const stakingAddr = stakingInput.value.trim();
  const recipient   = recipientInput.value.trim();
  const amountStr   = amountInput.value.trim();

  clearResult();
  setStatus('');

  try {
    validateStakingAddress(stakingAddr);
    validateBech32Address(recipient, 'Recipient address');

    const ada = Number(amountStr);
    if (!Number.isFinite(ada) || ada <= 0) {
      throw new Error('Amount must be a positive number of tADA.');
    }
    const lovelace = BigInt(Math.round(ada * 1_000_000));

    if (!window.cardano?.eternl) {
      throw new Error('Eternl extension not found. Install Eternl and refresh.');
    }

    sendBtn.disabled = true;

    setStatus('Connecting to Eternl…');
    const wallet = await BrowserWallet.enable('eternl');

    setStatus('Verifying the staking address belongs to the selected Eternl account…');
    await assertWalletControlsPaymentKey(wallet, stakingAddr);

    setStatus('Fetching UTxOs from Eternl…');
    const allUtxos = await wallet.getUtxos();
    const stakingUtxos = allUtxos.filter(u => u.output.address === stakingAddr);
    if (stakingUtxos.length === 0) {
      throw new Error(
        'Eternl returned no UTxOs at the Pool Ranger staking address. ' +
        'Either there is nothing to spend there, or this Eternl account does not own the payment key for that address.',
      );
    }

    setStatus(`Found ${stakingUtxos.length} UTxO(s) at the staking address. Building transaction…`);
    const txBuilder = new MeshTxBuilder({
      network: NETWORK,
      verbose: false,
    });

    try {
      await txBuilder
        .txOut(recipient, [{ unit: 'lovelace', quantity: lovelace.toString() }])
        .changeAddress(stakingAddr)
        .selectUtxosFrom(stakingUtxos)
        .complete();
    } catch (err) {
      const msg = err.message ?? String(err);
      if (/min.*utxo|too small|insufficient/i.test(msg)) {
        throw new Error(
          'Amount too large — the change at the staking address would fall below the min-UTxO threshold.\n' +
          'Reduce the amount so at least ~1 tADA remains at the staking address.',
        );
      }
      throw err;
    }

    const unsignedTxHex = txBuilder.txHex;

    setStatus('Approve the transaction on your Ledger device…');
    const signedTxHex = await wallet.signTx(unsignedTxHex, true);

    setStatus('Submitting transaction via Eternl…');
    const txHash = await wallet.submitTx(signedTxHex);

    setStatus('Transaction submitted!', 'success');
    showResult(txHash);
  } catch (err) {
    setStatus('Error: ' + (err.message ?? String(err)), 'error');
    console.error(err);
  } finally {
    sendBtn.disabled = false;
  }
});
