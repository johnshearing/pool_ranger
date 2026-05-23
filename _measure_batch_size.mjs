// Empirical measurement of a multi-delegation tx's actual byte size.
//
// Builds a delegation transaction in memory (NOT submitted) covering every
// entry in _1_delegation_config.json, then reports:
//   - per-script CBOR size (the dominant per-member cost)
//   - total unsigned-tx byte size
//   - derived per-tx baseline overhead (everything that is NOT script witnesses)
//   - a recommended BATCH_SIZE that leaves ~25% headroom against the 16 KB cap
//
// Why we measure rather than estimate: the plan in
// claude_queries/withdraw_and_batch_delegate_plan.md guessed ~400 bytes per
// script. The first measurement on the current contract showed 917 bytes —
// more than 2× higher. So the BATCH_SIZE constant must come from real data,
// not from the plan's headline number.
//
// Re-run this script after any contract change. It is read-only (no file
// writes, no tx submission), so it is safe to run any time.
//
// Usage (from ranger/):
//   node _measure_batch_size.mjs

import fs from 'fs';
import {
  blockchainProvider,
  getTxBuilder,
  loadMembers,
  findAdmin,
  findMember,
  pickAdaCollateral,
  addDelegationCert,
  getCoopStakeScript,
} from './common/common.mjs';

const MEMBERS_FILE = './_1_members.json';
const CONFIG_FILE  = './_1_delegation_config.json';
const TX_SIZE_CAP  = 16384;   // Cardano protocol parameter (Preview/mainnet)
const HEADROOM     = 0.75;    // use only 75% of the remaining budget

async function main() {
  // ── Load inputs ────────────────────────────────────────────────────────
  const members = loadMembers(MEMBERS_FILE);
  const admin   = findAdmin(members);
  const config  = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (config.length === 0) {
    throw new Error(`${CONFIG_FILE} is empty — add at least one entry to measure.`);
  }

  // ── Sample one parameterized script to get its compiled size ───────────
  // Every member's script has the same shape (same validator, two pkh
  // parameters), so any one sample gives the per-script byte cost.
  const sample = findMember(members, config[0].name);
  const { scriptCbor } = getCoopStakeScript(admin.memberPkh, sample.memberPkh);
  const scriptBytes = scriptCbor.length / 2;

  console.log(`Per-script CBOR size: ${scriptBytes} bytes (sampled from ${sample.name})`);

  // ── Build a multi-delegation tx in memory ──────────────────────────────
  // Adds one cert + one script witness per config entry. Single collateral
  // input is enough — collateral is per-tx, not per-script-purpose.
  const adminUtxos = await blockchainProvider.fetchAddressUTxOs(admin.registeredReceiveAddress);
  const collateral = pickAdaCollateral(adminUtxos, admin.registeredReceiveAddress);
  const txBuilder  = await getTxBuilder();

  for (const entry of config) {
    const m = findMember(members, entry.name);
    addDelegationCert(txBuilder, {
      adminPkh:  admin.memberPkh,
      memberPkh: m.memberPkh,
      poolId:    entry.poolId,
    });
  }

  await txBuilder
    .requiredSignerHash(admin.memberPkh)
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .changeAddress(admin.registeredReceiveAddress)
    .selectUtxosFrom(adminUtxos)
    .complete();

  const txHex   = txBuilder.txHex;
  const txBytes = txHex.length / 2;
  const N       = config.length;

  // Derived: everything in the tx that is NOT a script witness.
  // Includes the tx body (inputs, outputs, certs, fee), redeemers, and
  // CBOR overhead. This baseline scales sub-linearly with batch size
  // (cert overhead grows with N, but slowly), so using it for larger
  // batches is a slight under-estimate. Good enough for picking BATCH_SIZE.
  const totalScriptBytes = N * scriptBytes;
  const baseline         = txBytes - totalScriptBytes;

  console.log('');
  console.log(`Measured tx of ${N} delegations:`);
  console.log(`  total unsigned tx size : ${txBytes} bytes`);
  console.log(`  ${N} script witnesses    : ${totalScriptBytes} bytes  (${N} × ${scriptBytes})`);
  console.log(`  derived baseline       : ${baseline} bytes  (everything else)`);

  // ── Recommend a BATCH_SIZE ─────────────────────────────────────────────
  // Theoretical ceiling: how many scripts fit if we fill the budget exactly.
  // Recommended: same calculation but with a HEADROOM safety factor so a
  // protocol-parameter tightening or per-tx-overhead growth (more inputs,
  // more outputs) does not blow the cap.
  const remaining        = TX_SIZE_CAP - baseline;
  const ceilingBatch     = Math.floor(remaining / scriptBytes);
  const recommendedBatch = Math.floor((remaining * HEADROOM) / scriptBytes);

  console.log('');
  console.log(`Sizing against the ${TX_SIZE_CAP}-byte tx cap:`);
  console.log(`  budget after baseline  : ${remaining} bytes`);
  console.log(`  theoretical max batch  : ${ceilingBatch} delegations/tx`);
  console.log(`  recommended batch (${(HEADROOM*100).toFixed(0)}%) : ${recommendedBatch} delegations/tx`);
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
