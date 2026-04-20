import { BrowserWallet } from '@meshsdk/core';

const txInput   = document.getElementById('tx-hex');
const resultBox = document.getElementById('signed-hex');
const statusBox = document.getElementById('status');
const btn       = document.getElementById('btn-sign');

function setStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? 'crimson' : 'green';
}

btn.addEventListener('click', async () => {
  const unsignedTxHex = txInput.value.trim();
  if (!unsignedTxHex) { setStatus('Paste the unsigned tx hex first.', true); return; }

  resultBox.value = '';
  try {
    setStatus('Connecting to Eternl...');
    const wallet = await BrowserWallet.enable('eternl');

    setStatus('Connected. Approve the transaction on your Ledger...');
    // Returns a complete signed tx CBOR hex (body + witness merged) — ready for _submit_tx.mjs.
    // partialSign = false: Ledger provides the only required signature.
    const signedTxHex = await wallet.signTx(unsignedTxHex, false);

    resultBox.value = signedTxHex;
    setStatus('Signed! Copy the hex below and run: node _submit_tx.mjs <signed-tx-hex>');
  } catch (err) {
    setStatus('Error: ' + (err.message ?? String(err)), true);
  }
});

document.getElementById('btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(resultBox.value);
  document.getElementById('btn-copy').textContent = 'Copied!';
  setTimeout(() => document.getElementById('btn-copy').textContent = 'Copy', 1500);
});
