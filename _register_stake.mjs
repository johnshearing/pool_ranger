// Registers a member's coop stake credential on-chain.
//
// The coop stake credential is a Plutus script parameterized by admin_pkh and
// member_pkh. Each member gets a unique stake address. Registering it costs a
// 2 ADA deposit (refunded on deregistration). The member pays and signs.
//
// After registration, the member should move their ADA to the printed
// "coop base address" — that address has their own spending key as payment
// credential and the coop script as stake credential.
//
// ── SIGNING MODES ────────────────────────────────────────────────────────────
// HARDWARE WALLET (default): reads member address from an .addr file, builds
//   the transaction, and prints the unsigned tx hex for signing via Ledger
//   (cardano-hw-cli or a web tool). Submit the signed tx separately.
//
// SOFTWARE WALLET (testing): uncomment the SOFTWARE WALLET section below.
//   The wallet auto-signs and submits in one step.
// ─────────────────────────────────────────────────────────────────────────────
//
// Usage (from ranger/):
//   node _register_stake.mjs
//   MEMBER_ADDR_PATH=./0_member_2.addr node _register_stake.mjs
//
// Software wallet usage:
//   MEMBER_SK_PATH=./0_member_2.sk node _register_stake.mjs  (after uncommenting below)

import {
  deserializeAddress,
} from '@meshsdk/core';
import {
  blockchainProvider,
  getTxBuilder,
  loadSoftwareWallet,
  loadAddressOnly,
  getCoopStakeScript,
} from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const ADMIN_ADDR_PATH = './0_admin.addr';

// ── HARDWARE WALLET (default) ─────────────────────────────────────────────
const MEMBER_ADDR_PATH = process.env.MEMBER_ADDR_PATH || './0_member_1.addr';

// ── SOFTWARE WALLET (Phase 1 testing) — uncomment both lines to enable ────
// const MEMBER_SK_PATH = process.env.MEMBER_SK_PATH || './0_member_1.sk';
// const memberWallet = loadSoftwareWallet(MEMBER_SK_PATH);
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  // ── Resolve member address and PKH ──────────────────────────────────────
  // HARDWARE WALLET: read address from file.
  const memberAddress = loadAddressOnly(MEMBER_ADDR_PATH);
  // SOFTWARE WALLET: derive address from wallet object instead:
  // const memberAddress = (await memberWallet.getUsedAddresses())[0]
  //                    ?? (await memberWallet.getUnusedAddresses())[0];

  const { pubKeyHash: memberPkh } = deserializeAddress(memberAddress);
  console.log('Member address:', memberAddress);
  console.log('Member PKH:    ', memberPkh);

  // Read admin address (Ledger hardware wallet — no .sk file).
  const adminAddress = loadAddressOnly(ADMIN_ADDR_PATH);
  const { pubKeyHash: adminPkh } = deserializeAddress(adminAddress);
  console.log('Admin address: ', adminAddress);
  console.log('Admin PKH:     ', adminPkh);

  // Derive the parameterized coop stake script for this member.
  const { scriptCbor, scriptHash, stakeAddress, memberCoopBaseAddress } =
    getCoopStakeScript(adminPkh, memberPkh);

  console.log('\nCoop stake script hash:', scriptHash);
  console.log('Coop stake address:    ', stakeAddress);
  console.log('Member coop base addr: ', memberCoopBaseAddress);

  // ── Fetch member UTxOs ───────────────────────────────────────────────────
  // HARDWARE WALLET: fetch from chain using address only.
  const memberUtxos = await blockchainProvider.fetchAddressUTxOs(memberAddress);
  // SOFTWARE WALLET: fetch from wallet object instead:
  // const memberUtxos = await memberWallet.getUtxos();

  if (memberUtxos.length === 0) {
    console.error('\nMember wallet has no UTxOs. Fund it first.');
    process.exit(1);
  }

  // Find a pure-ADA UTxO for collateral.
  // Plutus script witnesses in Conway era require collateral even for certificates.
  const collateral = memberUtxos.find(
    u => u.output.amount.length === 1 && u.output.amount[0].unit === 'lovelace',
  );
  if (!collateral) {
    console.error('\nNo pure-ADA UTxO for collateral. Send a small separate UTxO to the member wallet first.');
    process.exit(1);
  }

  console.log('\nBuilding registration transaction...');

  // Build the registration transaction.
  // registerStakeCertificate adds a RegisterCredential certificate.
  // For a script stake credential, certificateScript provides the Plutus witness.
  // certificateRedeemerValue('') passes an empty redeemer (_redeemer: Data unused).
  const txBuilder = getTxBuilder();
  await txBuilder
    .registerStakeCertificate(stakeAddress)
    .certificateScript(scriptCbor, 'V3')
    .certificateRedeemerValue('')
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .changeAddress(memberAddress)
    .selectUtxosFrom(memberUtxos)
    .complete();

  const unsignedTxHex = txBuilder.txHex;

  // ── Sign and submit ──────────────────────────────────────────────────────
  // HARDWARE WALLET: print unsigned tx for external signing.
  console.log('\nUnsigned tx (sign with Ledger via cardano-hw-cli or web tool):');
  console.log(unsignedTxHex);
  console.log('\nAfter signing, submit with:');
  console.log('  cardano-cli transaction submit --tx-file signed.tx --testnet-magic 2');

  // SOFTWARE WALLET: uncomment to auto-sign and submit:
  // const signedTx = await memberWallet.signTx(unsignedTxHex);
  // const txHash = await memberWallet.submitTx(signedTx);
  // console.log('\nRegistration submitted! Tx Hash:', txHash);

  console.log('\nOnce confirmed, move your ADA to your coop base address:');
  console.log(' ', memberCoopBaseAddress);
  console.log('\nSave this address — it is where your ADA should live in the cooperative.');
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});