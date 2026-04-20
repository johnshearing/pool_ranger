// Delegates each member's coop stake address to a chosen pool.
//
// Reads a JSON config listing { memberPkh, poolId } assignments, then builds
// one delegation transaction per member. The admin must sign each transaction.
//
// Because the admin uses a Ledger hardware wallet (no .sk file), this script
// prints the unsigned transaction hex for external signing. For Phase 1 testing
// with a software admin wallet, uncomment the SOFTWARE WALLET section below.
//
// Config file format (default: delegation_config.json):
//   [
//     { "memberPkh": "a0627a98...", "poolId": "pool1abc..." },
//     { "memberPkh": "b1738b09...", "poolId": "pool1xyz..." }
//   ]
//
// Usage (from ranger/):
//   node _delegate.mjs
//   node _delegate.mjs ./my_config.json

import fs from 'fs';
import {
  deserializeAddress,
} from '@meshsdk/core';
import {
  blockchainProvider,
  getTxBuilder,
  loadAddressOnly,
  getCoopStakeScript,
  // loadSoftwareWallet,  // uncomment for software wallet testing
} from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const ADMIN_ADDR_PATH = './0_admin_0.addr';
const CONFIG_FILE = process.argv[2] || './delegation_config.json';

// ── SOFTWARE WALLET (Phase 1 testing only) ───────────────────────────────
// Uncomment these two lines to auto-sign with a software admin wallet:
// const ADMIN_SK_PATH = process.env.ADMIN_SK_PATH || './0_admin_test.sk';
// const adminWallet = loadSoftwareWallet(ADMIN_SK_PATH);
// ─────────────────────────────────────────────────────────────────────────

async function buildDelegationTx(adminPkh, adminAddress, memberPkh, poolId) {
  const { scriptCbor, stakeAddress } = getCoopStakeScript(adminPkh, memberPkh);

  // Fetch admin UTxOs from chain (address-only — no .sk needed for reading).
  const adminUtxos = await blockchainProvider.fetchAddressUTxOs(adminAddress);
  if (adminUtxos.length === 0) {
    throw new Error(`Admin wallet has no UTxOs. Fund ${adminAddress} first.`);
  }

  // Find a pure-ADA UTxO for collateral (required for script witness).
  const collateral = adminUtxos.find(
    u => u.output.amount.length === 1 && u.output.amount[0].unit === 'lovelace',
  );
  if (!collateral) {
    throw new Error('No pure-ADA UTxO for collateral in admin wallet.');
  }

  const txBuilder = getTxBuilder();
  await txBuilder
    .delegateStakeCertificate(stakeAddress, poolId)
    .certificateScript(scriptCbor)
    .certificateRedeemerValue('')
    .requiredSignerHash(adminPkh)         // contract requires admin signature
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .changeAddress(adminAddress)
    .selectUtxosFrom(adminUtxos)
    .complete();

  return txBuilder.txHex;
}

async function main() {
  // Read admin address (Ledger hardware wallet — no .sk file).
  const adminAddress = loadAddressOnly(ADMIN_ADDR_PATH);
  const { pubKeyHash: adminPkh } = deserializeAddress(adminAddress);

  console.log('Admin address:', adminAddress);
  console.log('Admin PKH:    ', adminPkh);

  // Read delegation config.
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`\nConfig file not found: ${CONFIG_FILE}`);
    console.error('Create a JSON file: [{ "memberPkh": "hex...", "poolId": "pool1..." }]');
    process.exit(1);
  }

  const delegations = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  console.log(`\nProcessing ${delegations.length} delegation(s)...`);

  for (const { memberPkh, poolId } of delegations) {
    console.log(`\nMember PKH: ${memberPkh.substring(0, 12)}...  →  Pool: ${poolId}`);
    try {
      const unsignedTxHex = await buildDelegationTx(adminPkh, adminAddress, memberPkh, poolId);

      // ── HARDWARE WALLET PATH ─────────────────────────────────────────────
      // Admin Ledger wallet cannot sign here. Print unsigned tx for external signing.
      console.log('  Unsigned tx (sign with Ledger via cardano-hw-cli or web tool):');
      console.log(' ', unsignedTxHex);

      // ── SOFTWARE WALLET PATH (Phase 1 testing) ───────────────────────────
      // Uncomment to auto-sign with software wallet (requires uncomments above):
      // const signedTx = await adminWallet.signTx(unsignedTxHex, true);
      // const txHash = await adminWallet.submitTx(signedTx);
      // console.log('  Tx Hash:', txHash);

    } catch (err) {
      console.error(`  FAILED:`, err.message ?? err);
    }
  }

  console.log('\nDone. Sign and submit any printed unsigned transactions to complete delegation.');
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
