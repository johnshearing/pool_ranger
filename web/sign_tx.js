// Uses the raw CIP-30 browser API — no bundling required.
// Eternl exposes window.cardano.eternl; signTx returns the witness set CBOR hex.
// _submit_tx.mjs assembles the complete tx and submits.

const txInput   = document.getElementById('tx-hex');
const cmdOut    = document.getElementById('cmd-out');
const statusBox = document.getElementById('status');
const btn       = document.getElementById('btn-sign');

function setStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? 'crimson' : 'green';
}

btn.addEventListener('click', async () => {
  const unsignedTxHex = txInput.value.trim();
  if (!unsignedTxHex) { setStatus('Paste the unsigned tx hex first.', true); return; }

  cmdOut.value = '';
  setStatus('');

  try {
    if (!window.cardano?.eternl) {
      setStatus('Eternl not found. Install the Eternl extension and refresh.', true);
      return;
    }

    setStatus('Connecting to Eternl...');
    const api = await window.cardano.eternl.enable();

    setStatus('Connected. Approve the transaction on your Ledger...');
    // Returns witness set CBOR hex (not a complete tx — _submit_tx.mjs assembles it)
    // partialSign: true — required when the tx contains a Plutus script stake credential.
    // Eternl/Ledger signs the payment key witness; script witnesses are not needed for registration.
    const witnessHex = await api.signTx(unsignedTxHex, true);

    cmdOut.value = `node _submit_tx.mjs ${unsignedTxHex} ${witnessHex}`;
    setStatus('Signed! Copy the command below and run it from ranger/.');
  } catch (err) {
    setStatus('Error: ' + (err.message ?? String(err)), true);
  }
});

document.getElementById('btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(cmdOut.value);
  document.getElementById('btn-copy').textContent = 'Copied!';
  setTimeout(() => { document.getElementById('btn-copy').textContent = 'Copy Command'; }, 1500);
});
