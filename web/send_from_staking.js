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
//   - Koios (no API key) for both UTxO fetch and tx submit. Permissionless:
//     the page works without any Pool Ranger admin-run infrastructure.
//   - MeshSDK MeshTxBuilder for tx assembly in the browser. No evaluator is
//     passed because this tx does NOT execute any Plutus script — only the
//     payment-key side of the staking address is checked. The script stake
//     credential just rides along on the change output.
//   - BrowserWallet.signTx(hex, true) — partialSign=true matches sign_tx.html;
//     Eternl/Ledger signs the lone payment-key witness and Mesh merges the
//     witness back into the tx body, returning a complete signed tx CBOR.
//
// To switch to mainnet later: change NETWORK below and update the prefix
// check in validateStakingAddress.

import {
  BrowserWallet,
  KoiosProvider,
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

    setStatus('Connecting to Koios to fetch UTxOs…');
    const koios = new KoiosProvider(NETWORK);

    const utxos = await koios.fetchAddressUTxOs(stakingAddr);
    if (utxos.length === 0) {
      throw new Error('No UTxOs at the staking address. Nothing to spend.');
    }

    setStatus(`Found ${utxos.length} UTxO(s) at the staking address. Building transaction…`);
    const txBuilder = new MeshTxBuilder({
      fetcher: koios,
      submitter: koios,
      network: NETWORK,
      verbose: false,
    });

    try {
      await txBuilder
        .txOut(recipient, [{ unit: 'lovelace', quantity: lovelace.toString() }])
        .changeAddress(stakingAddr)
        .selectUtxosFrom(utxos)
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

    setStatus('Connecting to Eternl…');
    const wallet = await BrowserWallet.enable('eternl');

    setStatus('Approve the transaction on your Ledger device.');
    const signedTxHex = await wallet.signTx(unsignedTxHex, true);

    setStatus('Submitting transaction to the Cardano network…');
    const txHash = await koios.submitTx(signedTxHex);

    setStatus('Transaction submitted!', 'success');
    showResult(txHash);
  } catch (err) {
    setStatus('Error: ' + (err.message ?? String(err)), 'error');
    console.error(err);
  } finally {
    sendBtn.disabled = false;
  }
});
