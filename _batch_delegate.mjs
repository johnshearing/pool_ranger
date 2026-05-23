// Delegates many members in a single transaction.
//
// Reads _1_delegation_config.json + _1_members.json.
// Validates each config entry (required fields, pool1... prefix, member exists).
// Classifies each entry into skip / drift / build using checkDelegationStatus.
// Refuses the whole batch if any entry is in drift (with a per-member breakdown so you can see what's out of sync).
// Refuses if pending > BATCH_SIZE with a "trim the config" message.
// Builds one tx with N certs + N script witnesses + one collateral + one admin signer.
// Snapshots _1_members.json to _1_members_PRE_BATCH.json before writing, for one-command rollback.
// Appends history for all batched members (they all share the same txHash).
// Prints the unsigned hex plus its byte size for sanity-checking against the cap.
//
//
// Reads _1_delegation_config.json (a flat array of {name, memberPkh, poolId}
// entries — the "name" field is optional, kept only for human readability),
// classifies each entry against the local history and the on-chain delegation,
// and builds ONE delegation transaction covering everyone whose intended pool
// is actually a change.
//
// Compared to running _delegate.mjs once per member:
//   - One Cardano tx fee instead of N. Per-member cost drops roughly 10×.
//   - One admin Ledger signature instead of N. Much less ceremony at epoch
//     boundaries when re-balancing the cooperative across pools.
//
// BATCH_SIZE = 12 was chosen with _measure_batch_size.mjs:
//   - per-script CBOR  : 917 bytes (measured)
//   - per-tx baseline  : ~520 bytes (measured at N=3, grows slowly with N)
//   - tx size cap      : 16,384 bytes (Cardano protocol parameter)
//   - 75 % headroom    : 12 × 917 + ~600 baseline ≈ 11.6 KB, well under cap.
// Re-run _measure_batch_size.mjs after any contract change to validate.
//
// Skip-and-drift classification (per entry):
//   - skip   : the requested pool already matches BOTH the local history
//              AND the current on-chain delegation. Nothing to do — would
//              just pay a fee for no effect.
//   - drift  : local history and chain disagree about the current pool.
//              Refusing the whole batch — the admin must reconcile manually
//              before re-running (see checkDelegationStatus in common.mjs).
//   - build  : not a skip, not a drift; include in the batched tx.
//
// Multi-batch limitation (intentional in v1):
//   If the pending set exceeds BATCH_SIZE, the script refuses. The plan
//   envisioned emitting one unsigned tx per batch in a single run, but each
//   tx must reference admin-wallet UTxOs to pay its fee, and naively built
//   sibling txs would all pick the same UTxOs and conflict at submission.
//   Resolving that needs either UTxO partitioning or a wait-for-confirmation
//   flow, neither of which we need yet. For now: trim the config to ≤12
//   entries, run, sign, submit, repeat for the rest. This will be revisited
//   when the cooperative actually has more than 12 active delegations.
//
// Rollback snapshot:
//   Right before _1_members.json is overwritten, the script copies it to
//   _1_members_PRE_BATCH.json. If the admin decides not to submit the tx,
//   restore the pre-batch state with:
//     cp _1_members_PRE_BATCH.json _1_members.json
//   This is also useful if Ledger signing or Blockfrost submission fails
//   after the script has already appended pending entries to history.
//
// Like _delegate.mjs, this script builds and writes history but never signs
// or submits — the admin signs the unsigned hex on a Ledger via
// web/sign_tx.html and submits with _submit_tx.mjs.
//
// Usage (from ranger/):
//   node _batch_delegate.mjs
//   node _batch_delegate.mjs --help

import fs from 'fs';
import { resolveTxHash } from '@meshsdk/core';
import {
  blockchainProvider,
  getTxBuilder,
  loadMembers,
  writeMembers,
  findAdmin,
  pickAdaCollateral,
  addDelegationCert,
  appendDelegationHistory,
  checkDelegationStatus,
} from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const MEMBERS_FILE  = './_1_members.json';
const CONFIG_FILE   = './_1_delegation_config.json';
const SNAPSHOT_FILE = './_1_members_PRE_BATCH.json';
const BATCH_SIZE    = 12;

const HELP = `Usage:
  node _batch_delegate.mjs

What this does:
  1. Reads ${CONFIG_FILE}: a flat array of
     {name, memberPkh, poolId} entries.
  2. For each entry, classifies it against the local history and the
     on-chain delegation:
        skip   = requested pool already matches both
        drift  = local history and chain disagree (refuse the whole batch)
        build  = include in the tx
  3. Refuses if more than BATCH_SIZE (${BATCH_SIZE}) entries are pending —
     multi-batch in one run is not yet supported (see source for why).
  4. Builds ONE delegation transaction with one cert + one parameterized
     script witness per pending member, all signed by the admin.
  5. Snapshots ${MEMBERS_FILE} to ${SNAPSHOT_FILE}
     so the admin can roll back with one cp command if they decide not to
     submit the tx (or if anything else goes wrong post-build).
  6. Appends {poolId, requestedAt, txHash} to every affected member's
     delegations[] history in ${MEMBERS_FILE}.
  7. Prints the unsigned tx hex for signing with the admin's Ledger via
     web/sign_tx.html.

Next steps after running:
  1. Sign the printed tx hex in web/sign_tx.html (admin's Ledger via Eternl).
  2. Submit with:  node _submit_tx.mjs <signed-tx-hex>
                or node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
  3. The submitted tx hash should match the txHash printed by this script.
  4. If you build a tx but never submit it, the simplest cleanup is:
       cp ${SNAPSHOT_FILE} ${MEMBERS_FILE}
     That restores the pre-batch state in one command. Alternatively, run
     _view_delegations.mjs to find the affected members and remove the
     stale delegations[] entries by hand. Without one of these, drift
     detection will block the next run.`;

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

async function main() {
  // ── Load inputs ────────────────────────────────────────────────────────
  const members = loadMembers(MEMBERS_FILE);
  const admin   = findAdmin(members);

  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(
      `Delegation config not found: ${CONFIG_FILE}\n` +
      'Create it as an array of {name, memberPkh, poolId} entries.',
    );
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!Array.isArray(config) || config.length === 0) {
    throw new Error(`${CONFIG_FILE} is empty or not an array.`);
  }

  console.log(`Loaded ${config.length} delegation request(s) from ${CONFIG_FILE}.`);
  console.log('Admin address:', admin.registeredReceiveAddress);
  console.log('Admin PKH:    ', admin.memberPkh);
  console.log('');

  // ── Walk the config, classify each entry ───────────────────────────────
  // Pre-classify every entry before building anything: if even one row is
  // drifted, we want to refuse the whole batch up front rather than emit
  // a partial result.
  const pending   = [];
  const skipped   = [];
  const driftRows = [];

  for (const entry of config) {
    if (!entry.memberPkh || !entry.poolId) {
      throw new Error(
        `Config entry missing required field: ${JSON.stringify(entry)}\n` +
        'Each entry needs memberPkh and poolId (name is optional).',
      );
    }
    if (!entry.poolId.startsWith('pool1')) {
      throw new Error(
        `Config entry has invalid poolId "${entry.poolId}" — must be bech32 ("pool1...").`,
      );
    }

    const member = members.find(m => m.memberPkh === entry.memberPkh);
    if (!member) {
      const label = entry.name ?? '<no name>';
      throw new Error(
        `Config entry references unknown memberPkh: ${entry.memberPkh} (name "${label}").\n` +
        'Make sure the member is registered in _1_members.json first.',
      );
    }

    const status = await checkDelegationStatus(member, entry.poolId);

    if (status.drift) {
      driftRows.push({ member, entry, status });
      continue;
    }
    if (status.skip) {
      skipped.push({ member, entry, status });
      continue;
    }
    pending.push({ member, entry, status });
  }

  // ── Drift refusal: short-circuit before building anything ──────────────
  if (driftRows.length > 0) {
    console.error(`Drift detected on ${driftRows.length} member(s). Refusing to proceed.`);
    console.error('');
    for (const { member, status } of driftRows) {
      console.error(`  - ${member.name}:`);
      console.error(`      history says : ${status.historyPool ?? '(none)'}`);
      console.error(`      chain says   : ${status.chainPool ?? '(none)'}`);
    }
    console.error('');
    console.error('Reconcile manually. Common causes:');
    console.error('  - a previous delegation tx was built but never submitted');
    console.error('  - _1_members.json was edited by hand');
    console.error('Run _view_delegations.mjs to inspect, then either submit the');
    console.error('pending tx or remove the stale delegations[] entry, and re-run.');
    process.exit(1);
  }

  // ── Skips are informational ────────────────────────────────────────────
  for (const { member, entry } of skipped) {
    console.log(`  skip   ${member.name.padEnd(12)} already delegated to ${entry.poolId}`);
  }

  if (pending.length === 0) {
    console.log('');
    console.log('Nothing to do — every member in the config is already delegated.');
    return;
  }

  // ── BATCH_SIZE cap check ───────────────────────────────────────────────
  if (pending.length > BATCH_SIZE) {
    console.error('');
    console.error(`Error: ${pending.length} pending delegations exceeds BATCH_SIZE (${BATCH_SIZE}).`);
    console.error(`Multi-batch in one run is not yet supported. Trim ${CONFIG_FILE}`);
    console.error(`to ${BATCH_SIZE} or fewer entries and run again, then repeat for the rest`);
    console.error('after each batch confirms on-chain.');
    process.exit(1);
  }

  console.log('');
  console.log(`Building one tx with ${pending.length} delegation(s):`);
  for (const { member, entry } of pending) {
    console.log(`  delegate ${member.name.padEnd(12)} → ${entry.poolId}`);
  }

  // ── Build the batched tx ───────────────────────────────────────────────
  // Single collateral input covers all script certs in the tx (collateral
  // is per-tx, not per-script-purpose). Single requiredSignerHash for the
  // admin satisfies the publish handler's signed_by_admin check across
  // every cert in this tx.
  const adminUtxos = await blockchainProvider.fetchAddressUTxOs(admin.registeredReceiveAddress);
  const collateral = pickAdaCollateral(adminUtxos, admin.registeredReceiveAddress);

  const txBuilder = await getTxBuilder();
  for (const { member, entry } of pending) {
    addDelegationCert(txBuilder, {
      adminPkh:  admin.memberPkh,
      memberPkh: member.memberPkh,
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

  const unsignedTxHex = txBuilder.txHex;
  const txHash = resolveTxHash(unsignedTxHex);

  // ── Append delegation history entries (all share the same txHash) ──────
  for (const { member, entry } of pending) {
    appendDelegationHistory(member, { poolId: entry.poolId, txHash });
  }
  // Snapshot the current _1_members.json before overwriting it, so the
  // admin can roll back with one cp command if they decide not to submit.
  fs.copyFileSync(MEMBERS_FILE, SNAPSHOT_FILE);
  writeMembers(MEMBERS_FILE, members);
  console.log('');
  console.log(`Appended ${pending.length} delegation entry(ies) to ${MEMBERS_FILE} (txHash: ${txHash}).`);
  console.log(`Pre-batch snapshot: ${SNAPSHOT_FILE}`);
  console.log(`  rollback with:   cp ${SNAPSHOT_FILE} ${MEMBERS_FILE}`);

  // ── Print unsigned tx for external signing ─────────────────────────────
  console.log('');
  console.log(`Unsigned tx (${(unsignedTxHex.length / 2)} bytes — sign via web/sign_tx.html):`);
  console.log(unsignedTxHex);
  console.log('');
  console.log('After signing, submit with:');
  console.log('  node _submit_tx.mjs <signed-tx-hex>');
  console.log('  or: node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>');
  console.log('');
  console.log(`The submitted tx hash should match: ${txHash}`);
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
