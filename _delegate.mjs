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

import fs from 'fs';
import { resolveTxHash } from '@meshsdk/core';
import {
  blockchainProvider,
  getTxBuilder,
  getCoopStakeScript,
} from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
// Admin info (address, PKH) is looked up from the ADMIN_NAME entry in
// _1_members.json — no separate .addr file is needed.
const ADMIN_NAME   = 'admin_0';
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
  2. Refuses if the member's latest delegation already targets the same pool.
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

async function buildDelegationTx(adminPkh, adminAddress, memberPkh, poolId) {
  const { scriptCbor, stakeAddress } = getCoopStakeScript(adminPkh, memberPkh);

  const adminUtxos = await blockchainProvider.fetchAddressUTxOs(adminAddress);
  if (adminUtxos.length === 0) {
    throw new Error(`Admin wallet has no UTxOs. Fund ${adminAddress} first.`);
  }

  // Pure-ADA UTxO required for collateral (script witness needs it).
  const collateral = adminUtxos.find(
    u => u.output.amount.length === 1 && u.output.amount[0].unit === 'lovelace',
  );
  if (!collateral) {
    throw new Error('No pure-ADA UTxO for collateral in admin wallet.');
  }

  const txBuilder = await getTxBuilder();
  await txBuilder
    .delegateStakeCertificate(stakeAddress, poolId)
    .certificateScript(scriptCbor, 'V3')
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
  // ── Load member directory ──────────────────────────────────────────────
  if (!fs.existsSync(MEMBERS_FILE)) {
    console.error(`Member directory not found: ${MEMBERS_FILE}`);
    console.error('Register members first with _register_stake.mjs.');
    process.exit(1);
  }
  const members = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));

  // ── Find the requested member ──────────────────────────────────────────
  const member = members.find(m => m.name === args.name);
  if (!member) {
    console.error(`Error: no member named "${args.name}" in ${MEMBERS_FILE}.`);
    console.error('Known members:', members.map(m => m.name).join(', ') || '(none)');
    process.exit(1);
  }

  // Defensive: older records may predate the delegations field.
  if (!Array.isArray(member.delegations)) {
    member.delegations = [];
  }

  // Refuse a no-op redelegation to the same pool.
  const latest = member.delegations[member.delegations.length - 1];
  if (latest && latest.poolId === args.pool) {
    console.error(`Error: "${member.name}" is already delegated to ${args.pool} (entry from ${latest.requestedAt}).`);
    console.error('Nothing to do. Pick a different pool, or remove that entry to re-issue.');
    process.exit(1);
  }

  // ── Resolve admin info from _1_members.json ────────────────────────────
  const adminRecord = members.find(m => m.name === ADMIN_NAME);
  if (!adminRecord) {
    console.error(`Error: admin record "${ADMIN_NAME}" not found in ${MEMBERS_FILE}.`);
    console.error('Register the admin as a member first via _register_stake.mjs.');
    process.exit(1);
  }
  const adminAddress = adminRecord.address;
  const adminPkh     = adminRecord.memberPkh;

  console.log('Admin address:', adminAddress);
  console.log('Admin PKH:    ', adminPkh);
  console.log(`\nDelegating "${member.name}"  →  ${args.pool}`);
  if (latest) {
    console.log(`(previously: ${latest.poolId} at ${latest.requestedAt})`);
  } else {
    console.log('(first delegation for this member)');
  }

  // ── Build the delegation transaction ───────────────────────────────────
  const unsignedTxHex = await buildDelegationTx(
    adminPkh,
    adminAddress,
    member.memberPkh,
    args.pool,
  );
  const txHash = resolveTxHash(unsignedTxHex);

  // ── Append to the member's delegation history ──────────────────────────
  member.delegations.push({
    poolId: args.pool,
    requestedAt: new Date().toISOString(),
    txHash,
  });
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2) + '\n');
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
