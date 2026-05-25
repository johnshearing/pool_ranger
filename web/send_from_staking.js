// Pool Ranger — Staking Address Tool (permissionless member page).
//
// Two modes (radio toggle at top of the page):
//
//   SPEND — spend UTxOs at the member's Pool Ranger staking address
//     (addr_test1y... on Preview, addr1y... on mainnet), send a chosen amount
//     to a chosen recipient, and return all change to the SAME staking
//     address — preserving the coop stake credential so the change stays
//     delegated.
//
//   SWEEP — gather every UTxO Eternl owns OUTSIDE the staking address and
//     consolidate them into one output at the staking address. Existing
//     staking-address UTxOs are not touched. Increases the member's
//     delegated stake in one tx. No recipient, no amount — one button.
//
// Architecture choices (apply to both modes):
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
//
// Sweep-mode specifics:
//   - Inputs are added with explicit .txIn() for every non-staking UTxO so
//     coin selection cannot leave any behind. This is what makes a sweep
//     actually drain the wallet (not just "pick enough to cover X").
//   - The single output is sized at (total non-staking lovelace - 2 tADA
//     fee/min-UTxO buffer) and goes to the staking address. The 2 tADA
//     buffer covers worst-case fee; the residual (~1.5-1.83 tADA after
//     the real fee) lands at the staking address as change because
//     .changeAddress is also the staking address. Net result: every
//     non-staking lovelace minus fee ends up at the staking address.
//   - Refuses to proceed if any source UTxO sits at another address with a
//     script stake credential — that's a sibling Pool Ranger registration
//     in the same Eternl account, and sweeping out of it would silently
//     drain a second staking address.
//   - Refuses to proceed if any source UTxO carries native tokens. Token
//     sweep would need per-asset bundling in the output and min-UTxO
//     recalculation — left out of v1 deliberately. Members with tokens
//     should consolidate them in Eternl first, then re-run the sweep.

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
const modeRadios     = document.querySelectorAll('input[name="mode"]');
const recipientGroup = document.getElementById('recipient-group');
const amountGroup    = document.getElementById('amount-group');
const modeDescription = document.getElementById('mode-description');

const SPEND_DESCRIPTION = 'Spend ADA from your Pool Ranger staking address. The change goes back to the same address so the rest of your ADA stays delegated through the cooperative.';
const SWEEP_DESCRIPTION = 'Sweep all ADA from your other Eternl addresses into your Pool Ranger staking address. Only this account\'s UTxOs at addresses OUTSIDE the staking address are moved — existing staking balance is not disturbed.';

// 2 tADA buffer covers worst-case fee for a many-input tx plus min-UTxO
// floor. Residual (buffer minus real fee) lands at the staking address as
// change. Tune only if fee or min-UTxO rules change materially.
const SWEEP_FEE_BUFFER_LOVELACE = 2_000_000n;

function getMode() {
  return document.querySelector('input[name="mode"]:checked')?.value ?? 'spend';
}

function updateModeUI() {
  const mode = getMode();
  if (mode === 'sweep') {
    recipientGroup.style.display = 'none';
    amountGroup.style.display = 'none';
    modeDescription.textContent = SWEEP_DESCRIPTION;
    sendBtn.textContent = 'Sign and sweep with Eternl (Ledger)';
  } else {
    recipientGroup.style.display = '';
    amountGroup.style.display = '';
    modeDescription.textContent = SPEND_DESCRIPTION;
    sendBtn.textContent = 'Sign and submit with Eternl (Ledger)';
  }
}

modeRadios.forEach(r => r.addEventListener('change', updateModeUI));
updateModeUI();

// URL-prefill: if the admin's per-member link contains ?addr=addr_test1y…,
// fill the staking-address textarea from it and lock the field so the member
// cannot accidentally paste a different value over it. Eliminates typing,
// clipboard-swap, and wrong-account-paste mistakes for members who arrive via
// the canonical link in the admin's report.
//
// If the page is opened with no ?addr= at all, the field is still locked but
// left empty and the Send button disabled. Manual entry as a fallback would
// reopen the clipboard-swap / typo / phishing-paste holes that prefill exists
// to close. Members must arrive via the canonical per-member link printed by
// _view_members.mjs; a bare visit to the page is intentionally inert.
const addrFromUrl = new URLSearchParams(window.location.search).get('addr');
if (addrFromUrl) {
  stakingInput.value = addrFromUrl;
  stakingInput.readOnly = true;
  stakingInput.style.backgroundColor = '#f0f0f0';
  if (prefillNote) {
    prefillNote.textContent = 'Address loaded from your admin\'s link and locked.';
    prefillNote.style.color = 'green';
  }
} else {
  stakingInput.value = '';
  stakingInput.readOnly = true;
  stakingInput.placeholder = '';
  stakingInput.style.backgroundColor = '#f0f0f0';
  sendBtn.disabled = true;
  if (prefillNote) {
    prefillNote.textContent =
      'No address in the URL. Open this page using the link your admin sent you — manual entry is disabled for safety.';
    prefillNote.style.color = 'crimson';
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

async function buildSpendTx(wallet, stakingAddr) {
  const recipient = recipientInput.value.trim();
  const amountStr = amountInput.value.trim();

  validateBech32Address(recipient, 'Recipient address');

  const ada = Number(amountStr);
  if (!Number.isFinite(ada) || ada <= 0) {
    throw new Error('Amount must be a positive number of tADA.');
  }
  const lovelace = BigInt(Math.round(ada * 1_000_000));

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
  const txBuilder = new MeshTxBuilder({ network: NETWORK, verbose: false });

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

  return txBuilder.txHex;
}

async function buildSweepTx(wallet, stakingAddr) {
  setStatus('Fetching UTxOs from Eternl…');
  const allUtxos = await wallet.getUtxos();
  const sweepUtxos = allUtxos.filter(u => u.output.address !== stakingAddr);
  if (sweepUtxos.length === 0) {
    throw new Error(
      'Nothing to sweep — Eternl reports no UTxOs at addresses outside your Pool Ranger staking address. ' +
      'Any ADA you have is already at the staking address.',
    );
  }

  // Refuse if any source UTxO sits at an address with a script stake credential.
  // Such an address is a Pool Ranger-style hybrid address other than the one
  // we're sweeping into — i.e. a sibling Pool Ranger registration in the same
  // Eternl account. Sweeping out of it would silently move funds from one of
  // the member's Pool Ranger staking addresses into another. The registration
  // script in _register_stake.mjs blocks new sibling registrations, but this
  // check defends against any that pre-date the registration-side guard.
  const siblingPoolRangerUtxos = sweepUtxos.filter(u => {
    try {
      return Boolean(deserializeAddress(u.output.address).stakeScriptCredentialHash);
    } catch {
      return false;
    }
  });
  if (siblingPoolRangerUtxos.length > 0) {
    const otherAddrs = [...new Set(siblingPoolRangerUtxos.map(u => u.output.address))];
    throw new Error(
      `Sweep refused: ${siblingPoolRangerUtxos.length} of your UTxO(s) sit at ${otherAddrs.length} other ` +
      `Pool Ranger-style staking address(es) (addresses with a script stake credential, distinct from the ` +
      `sweep destination). Sweeping them would move funds out of a Pool Ranger staking address that is not ` +
      `the destination — almost certainly not what you want.\n\n` +
      `Other staking address(es) detected:\n  ${otherAddrs.join('\n  ')}\n\n` +
      `Contact your admin if you believe you are registered under more than one Pool Ranger staking address ` +
      `and want to consolidate them deliberately.`,
    );
  }

  // v1: refuse to sweep wallets that hold native tokens / NFTs at the source
  // addresses. Bundling tokens into the staking-address output requires
  // per-asset min-UTxO math we have not implemented yet, and a partial sweep
  // that silently leaves token-bearing UTxOs behind would mislead the member
  // about whether the sweep was "complete". Better to refuse loudly.
  const tokenBearing = sweepUtxos.filter(u =>
    u.output.amount.some(a => a.unit !== 'lovelace'),
  );
  if (tokenBearing.length > 0) {
    throw new Error(
      `Sweep cannot proceed: ${tokenBearing.length} of your wallet UTxOs contain native tokens or NFTs.\n` +
      'Send the tokens to a separate Cardano address using Eternl first, then retry the sweep with ADA-only UTxOs.',
    );
  }

  const totalLovelace = sweepUtxos.reduce((sum, u) => {
    const ll = u.output.amount.find(a => a.unit === 'lovelace');
    return sum + BigInt(ll?.quantity ?? '0');
  }, 0n);

  if (totalLovelace <= SWEEP_FEE_BUFFER_LOVELACE) {
    const totalAda = (Number(totalLovelace) / 1_000_000).toFixed(6);
    const bufferAda = (Number(SWEEP_FEE_BUFFER_LOVELACE) / 1_000_000).toFixed(2);
    throw new Error(
      `Not enough ADA to sweep. Found ${totalAda} tADA across ${sweepUtxos.length} UTxO(s) outside the staking address, ` +
      `but at least ${bufferAda} tADA is needed to cover the transaction fee.`,
    );
  }

  const outputLovelace = totalLovelace - SWEEP_FEE_BUFFER_LOVELACE;
  const totalAda = (Number(totalLovelace) / 1_000_000).toFixed(6);

  setStatus(
    `Sweeping ${totalAda} tADA from ${sweepUtxos.length} UTxO(s) into your staking address.\n` +
    `Verify the destination address on the Ledger screen — it must match the address shown above. Building transaction…`,
  );

  const txBuilder = new MeshTxBuilder({ network: NETWORK, verbose: false });

  // Explicit .txIn() for every UTxO so coin selection cannot omit any.
  // .selectUtxosFrom() would only pick enough to cover the output; this
  // forces the full drain that "sweep" implies.
  //
  // The 5th arg (scriptSize=0) marks each input as a plain pay-to-pubkey
  // UTxO with no attached reference script. Without it, Mesh treats the
  // input as "incomplete" and tries to look up the source tx through a
  // fetcher — which we deliberately don't provide.
  for (const u of sweepUtxos) {
    txBuilder.txIn(u.input.txHash, u.input.outputIndex, u.output.amount, u.output.address, 0);
  }

  await txBuilder
    .txOut(stakingAddr, [{ unit: 'lovelace', quantity: outputLovelace.toString() }])
    .changeAddress(stakingAddr)
    .complete();

  return txBuilder.txHex;
}

sendBtn.addEventListener('click', async () => {
  const stakingAddr = stakingInput.value.trim();
  const mode = getMode();

  clearResult();
  setStatus('');

  try {
    validateStakingAddress(stakingAddr);

    if (!window.cardano?.eternl) {
      throw new Error('Eternl extension not found. Install Eternl and refresh.');
    }

    sendBtn.disabled = true;

    setStatus('Connecting to Eternl…');
    const wallet = await BrowserWallet.enable('eternl');

    setStatus('Verifying the staking address belongs to the selected Eternl account…');
    await assertWalletControlsPaymentKey(wallet, stakingAddr);

    const unsignedTxHex = mode === 'sweep'
      ? await buildSweepTx(wallet, stakingAddr)
      : await buildSpendTx(wallet, stakingAddr);

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
