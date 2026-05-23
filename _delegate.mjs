// Delegates a single member's coop stake address to a chosen pool.
//
// Looks up the member in _1_members.json by --name, builds the delegation
// transaction, computes its on-chain txHash, and appends a new entry to that
// member's `delegations` history. The unsigned tx hex is printed for signing
// by the admin's Ledger (via web/sign_tx.html). Submission happens separately
// with _submit_tx.mjs.
//
// The newest entry in `delegations` is always the current/intended
// delegation. Past entries are preserved as history — useful when reviewing
// how the cooperative has moved stake between pools over time.
//
// Because the admin uses a Ledger hardware wallet (no .sk file), this script
// only builds the tx; it never signs or submits.
//
// Delegation entry shape (appended to member.delegations):
//   {
//     "poolId":      "pool1...",
//     "requestedAt": "2026-05-18T18:42:01.123Z",  // when the tx was built
//     "txHash":      "abc123..."                   // tx body hash (stable across signing)
//   }
//
// Usage (from ranger/):
//   node _delegate.mjs --name <member-name> --pool <pool-id>
//   node _delegate.mjs --help                # show full help text
//
// Example:
//   node _delegate.mjs --name member_1 --pool pool1knap9hldvhww0fjqew26sxkfjpj3c8tp8uuj7j3729lzqn9x70r
//
// The script refuses to delegate if the member's most recent delegation entry
// already targets the same pool (nothing to do). Remove that last entry first
// if you really want to re-issue the same delegation.

import { resolveTxHash } from '@meshsdk/core';
import {
  blockchainProvider,
  getTxBuilder,
  loadMembers,
  writeMembers,
  findAdmin,
  findMember,
  pickAdaCollateral,
  addDelegationCert,
  appendDelegationHistory,
  checkDelegationStatus,
} from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const MEMBERS_FILE = './_1_members.json';

// ── Parse CLI args (--name <value> --pool <bech32>) ──────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag.startsWith('--')) {
      args[flag.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const HELP = `Usage:
  node _delegate.mjs --name <member-name> --pool <pool1...>

Options:
  --name <name>   Name of the member in _1_members.json to delegate.
  --pool <id>     Bech32 pool ID (must start with "pool1").
  -h, --help      Show this help text and exit.

What this does:
  1. Looks up the member in ./_1_members.json by --name.
  2. Refuses if either:
     - the requested pool already matches both the local history and the
       on-chain delegation (no-op — would just pay a fee for nothing), or
     - the local history and the on-chain delegation disagree (drift —
       you need to reconcile manually before re-running).
  3. Builds a delegation transaction (admin must sign it later).
  4. Computes the txHash and appends {poolId, requestedAt, txHash} to the
     member's delegations history in _1_members.json.
  5. Prints the unsigned tx hex for signing with the admin's Ledger via
     web/sign_tx.html.

Next steps after running:
  1. Sign the printed tx hex in web/sign_tx.html (admin's Ledger via Eternl).
  2. Submit with:  node _submit_tx.mjs <signed-tx-hex>
                or node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
  3. The submitted tx hash should match the txHash printed by this script.
  4. If you build a tx but never submit it, remove that stale entry from the
     member's delegations array in _1_members.json by hand.

Example:
  node _delegate.mjs --name member_1 --pool pool1knap9hldvhww0fjqew26sxkfjpj3c8tp8uuj7j3729lzqn9x70r`;

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes('-h') || rawArgs.includes('--help')) {
  const askedForHelp = rawArgs.includes('-h') || rawArgs.includes('--help');
  (askedForHelp ? console.log : console.error)(HELP);
  process.exit(askedForHelp ? 0 : 1);
}

const args = parseArgs(process.argv);
const missing = [];
if (!args.name) missing.push('--name');
if (!args.pool) missing.push('--pool');
if (missing.length > 0) {
  console.error(`Missing required argument(s): ${missing.join(', ')}\n`);
  console.error(HELP);
  process.exit(1);
}
if (!args.pool.startsWith('pool1')) {
  console.error(`Error: --pool must be a bech32 pool ID starting with "pool1" (got: ${args.pool})\n`);
  console.error(HELP);
  process.exit(1);
}

async function main() {
  // ── Load directory and look up the requested member + admin ────────────
  const members = loadMembers(MEMBERS_FILE);
  const member  = findMember(members, args.name);
  const admin   = findAdmin(members);

  // ── No-op / drift check ────────────────────────────────────────────────
  // Compares the requested pool against BOTH the local history and the
  // current on-chain delegation. Refuses on drift and lets the user
  // reconcile manually (see checkDelegationStatus in common.mjs).
  const status = await checkDelegationStatus(member, args.pool);

  if (status.drift) {
    console.error(`Error: drift detected on "${member.name}":`);
    console.error(`  history says : ${status.historyPool ?? '(none)'}`);
    console.error(`  chain says   : ${status.chainPool ?? '(none)'}`);
    console.error('Reconcile manually before retrying. Common causes:');
    console.error('  - a previous delegation tx was built but never submitted');
    console.error('  - _1_members.json was edited by hand');
    console.error('Run _view_delegations.mjs to inspect, then either submit the');
    console.error('pending tx or remove the stale delegations[] entry.');
    process.exit(1);
  }

  if (status.skip) {
    const when = status.latestEntry?.requestedAt ?? 'unknown';
    console.error(`Error: "${member.name}" is already delegated to ${args.pool} (entry from ${when}).`);
    console.error('Nothing to do. Pick a different pool, or remove that entry to re-issue.');
    process.exit(1);
  }

  console.log('Admin address:', admin.registeredReceiveAddress);
  console.log('Admin PKH:    ', admin.memberPkh);
  console.log(`\nDelegating "${member.name}"  →  ${args.pool}`);
  if (status.latestEntry) {
    console.log(`(previously: ${status.latestEntry.poolId} at ${status.latestEntry.requestedAt})`);
  } else {
    console.log('(first delegation for this member)');
  }

  // ── Build the delegation transaction ───────────────────────────────────
  const adminUtxos = await blockchainProvider.fetchAddressUTxOs(admin.registeredReceiveAddress);
  const collateral = pickAdaCollateral(adminUtxos, admin.registeredReceiveAddress);

  const txBuilder = await getTxBuilder();
  addDelegationCert(txBuilder, {
    adminPkh:  admin.memberPkh,
    memberPkh: member.memberPkh,
    poolId:    args.pool,
  });
  await txBuilder
    .requiredSignerHash(admin.memberPkh)   // contract requires admin signature
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

  // ── Append to the member's delegation history ──────────────────────────
  appendDelegationHistory(member, { poolId: args.pool, txHash });
  writeMembers(MEMBERS_FILE, members);
  console.log(`\nAppended delegation entry to ${MEMBERS_FILE} (txHash: ${txHash}).`);

  // ── Print unsigned tx for external signing ─────────────────────────────
  console.log('\nUnsigned tx (sign with admin Ledger via web/sign_tx.html):');
  console.log(unsignedTxHex);
  console.log('\nAfter signing, submit with:');
  console.log('  node _submit_tx.mjs <signed-tx-hex>');
  console.log('  or: node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>');
  console.log(`\nThe submitted tx hash should match: ${txHash}`);
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
