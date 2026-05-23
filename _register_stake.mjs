// Registers a member's coop stake credential on-chain and records the member
// in the cooperative directory (_1_members.json).
//
// The coop stake credential is a Plutus script parameterized by admin_pkh and
// member_pkh. Each member gets a unique stake address. Registering it costs a
// 2 ADA deposit (refunded on deregistration). The member pays and signs.
//
// After successful registration, the member should move their ADA to the
// printed "contract address" — that address has the member's own spending key
// as payment credential and the coop script as stake credential.
//
// On each run the script:
//   1. Reads --name and --addr from the command line. --addr is the member's
//      bech32 base address (addr_test1... or addr1...) supplied directly on
//      the command line — there are no separate .addr files.
//   2. Loads _1_members.json (creates it as [] if missing).
//   3. Errors if the name or memberPkh is already present (no duplicates).
//   4. Derives memberPkh, PoolRangerRewardAddress, Pool Ranger staking address, and script hash.
//   5. Appends a new record to _1_members.json.
//   6. Builds the on-chain stake-registration tx and prints the unsigned hex.
//
// Member record shape:
//   {
//     "name":                       "member_3",
//     "registeredReceiveAddress":   "addr_test1q...",   // member's base address (their Ledger receive addr)
//     "memberPkh":                  "a0627a98...",      // payment PKH of registeredReceiveAddress
//     "poolRangerRewardAddress":    "stake_test17...",  // coop stake/reward address (script-controlled)
//     "poolRangerStakingAddress":   "addr_test1y...",   // member's payment key + coop stake script
//     "scriptHash":                 "c5097507...",      // parameterized coop stake script hash
//     "registration":               { "txHash": "...", "requestedAt": "<ISO 8601>" },
//     "delegations":                []                  // appended to by _delegate.mjs over time
//   }
//
// Each delegation entry has the shape:
//   { "poolId": "pool1...", "requestedAt": "<ISO 8601>", "txHash": "<hex>" }
//
// Usage (from ranger/):
//   node _register_stake.mjs --name member_3 --addr addr_test1q...
//   node _register_stake.mjs --help          # show full help text
//
// Re-running for an existing name or PKH will error. To re-derive values for
// an existing member, remove that member's entry from _1_members.json first.

import fs from 'fs';
import {
  deserializeAddress,
  resolveTxHash,
} from '@meshsdk/core';
import {
  blockchainProvider,
  getTxBuilder,
  getCoopStakeScript,
} from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
// Admin info is normally looked up from the ADMIN_NAME entry in _1_members.json.
// Special case: when the directory is empty (bootstrap), the very first
// registration MUST be the admin — in that case --addr supplies both the
// member's and the admin's address (they are the same person).
const ADMIN_NAME   = 'admin_0';
const MEMBERS_FILE = './_1_members.json';

// ── Parse CLI args (--name <value> --addr <bech32>) ───────────────────────
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
  node _register_stake.mjs --name <member-name> --addr <bech32-address>

Options:
  --name <name>   Human-readable label for the member (e.g. "member_3"). Must be
                  unique within _1_members.json.
  --addr <addr>   Member's bech32 base address (addr_test1... on Preview,
                  addr1... on mainnet). memberPkh, poolRangerRewardAddress,
                  poolRangerStakingAddress, and scriptHash are all derived
                  from this address. There are no .addr files — paste the address
                  directly. The admin obtains a new member's address from the
                  member (email, message, etc.) at onboarding time.
  -h, --help      Show this help text and exit.

What this does:
  1. Loads ./_1_members.json (creates [] if the file is missing).
  2. Errors if a member with this --name or derived memberPkh is already in the file.
  3. Derives the parameterized coop stake script for this member.
  4. Builds a stake-registration transaction (2 ADA deposit, refunded on deregister).
  5. Computes the registration txHash via resolveTxHash on the unsigned tx.
  6. Appends the new member record to _1_members.json with the registration
     { txHash, requestedAt } stamped in, and an empty delegations: [] array.
  7. Prints the unsigned tx hex for signing with the member's Ledger via
     web/sign_tx.html.

Next steps after running:
  1. Sign the printed tx hex in web/sign_tx.html (member's Ledger via Eternl).
  2. Submit with:  node _submit_tx.mjs <signed-tx-hex>
                or node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
  3. The submitted tx hash should match the registration txHash printed.
  4. Once confirmed on-chain, move the member's ADA to the printed contract address.

Example:
  node _register_stake.mjs --name member_3 --addr addr_test1qz...`;

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes('-h') || rawArgs.includes('--help')) {
  // No args, -h, or --help: print help and exit (0 if user asked for it, 1 otherwise).
  const askedForHelp = rawArgs.includes('-h') || rawArgs.includes('--help');
  (askedForHelp ? console.log : console.error)(HELP);
  process.exit(askedForHelp ? 0 : 1);
}

const args = parseArgs(process.argv);
const missing = [];
if (!args.name) missing.push('--name');
if (!args.addr) missing.push('--addr');
if (missing.length > 0) {
  console.error(`Missing required argument(s): ${missing.join(', ')}\n`);
  console.error(HELP);
  process.exit(1);
}
if (!(args.addr.startsWith('addr_test1') || args.addr.startsWith('addr1'))) {
  console.error(`Error: --addr must be a bech32 Cardano address (addr_test1... or addr1...), got: ${args.addr}\n`);
  console.error(HELP);
  process.exit(1);
}

async function main() {
  // ── Load member directory (or start fresh) ─────────────────────────────
  const members = fs.existsSync(MEMBERS_FILE)
    ? JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'))
    : [];

  // ── Resolve member address and PKH ─────────────────────────────────────
  const memberAddress = args.addr;
  const { pubKeyHash: memberPkh } = deserializeAddress(memberAddress);
  console.log('Member name:   ', args.name);
  console.log('Member address:', memberAddress);
  console.log('Member PKH:    ', memberPkh);

  // ── Uniqueness checks (name and memberPkh) ─────────────────────────────
  const dupName = members.find(m => m.name === args.name);
  if (dupName) {
    console.error(`\nError: a member named "${args.name}" already exists in ${MEMBERS_FILE}.`);
    process.exit(1);
  }
  const dupPkh = members.find(m => m.memberPkh === memberPkh);
  if (dupPkh) {
    console.error(`\nError: memberPkh ${memberPkh} is already registered as "${dupPkh.name}" in ${MEMBERS_FILE}.`);
    process.exit(1);
  }

  // ── Resolve admin info ─────────────────────────────────────────────────
  // Normal path: look up the ADMIN_NAME record in _1_members.json.
  // Bootstrap path: if the directory is empty, the first member must be the
  // admin, and admin == this member.
  const adminRecord = members.find(m => m.name === ADMIN_NAME);
  let adminAddress, adminPkh;
  if (adminRecord) {
    adminAddress = adminRecord.registeredReceiveAddress;
    adminPkh     = adminRecord.memberPkh;
  } else {
    if (args.name !== ADMIN_NAME) {
      console.error(`\nError: ${MEMBERS_FILE} has no "${ADMIN_NAME}" entry yet.`);
      console.error(`The admin must be registered before any other member. Run first:`);
      console.error(`  node _register_stake.mjs --name ${ADMIN_NAME} --addr <admin-bech32-address>`);
      process.exit(1);
    }
    adminAddress = memberAddress;
    adminPkh     = memberPkh;
  }
  console.log('Admin address: ', adminAddress);
  console.log('Admin PKH:     ', adminPkh);

  // ── Derive parameterized coop stake script for this member ─────────────
  const { scriptHash, stakeAddress, memberCoopBaseAddress } =
    getCoopStakeScript(adminPkh, memberPkh);
  const contractAddress = memberCoopBaseAddress;

  console.log('\nCoop stake script hash:        ', scriptHash);
  console.log('PoolRangerRewardAddress:       ', stakeAddress);
  console.log('Pool Ranger staking address:   ', contractAddress);

  // ── Fetch member UTxOs ─────────────────────────────────────────────────
  const memberUtxos = await blockchainProvider.fetchAddressUTxOs(memberAddress);
  if (memberUtxos.length === 0) {
    console.error('\nMember wallet has no UTxOs. Fund it first.');
    process.exit(1);
  }

  console.log('\nBuilding registration transaction...');

  // Stake registration does NOT execute the script — it only pays the 2 ADA deposit.
  // Script execution happens during withdrawal and deregistration, not here.
  const txBuilder = await getTxBuilder();
  await txBuilder
    .registerStakeCertificate(stakeAddress)
    .changeAddress(memberAddress)
    .selectUtxosFrom(memberUtxos)
    .complete();

  const unsignedTxHex = txBuilder.txHex;
  const registrationTxHash = resolveTxHash(unsignedTxHex);

  // ── Append to member directory ─────────────────────────────────────────
  members.push({
    name: args.name,
    registeredReceiveAddress: memberAddress,
    memberPkh,
    poolRangerRewardAddress: stakeAddress,
    poolRangerStakingAddress: contractAddress,
    scriptHash,
    registration: {
      txHash: registrationTxHash,
      requestedAt: new Date().toISOString(),
    },
    delegations: [],
  });
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2) + '\n');
  console.log(`\nAppended "${args.name}" to ${MEMBERS_FILE} (registration txHash: ${registrationTxHash}).`);

  // ── Print unsigned tx for external signing ─────────────────────────────
  console.log('\nUnsigned tx (sign with Ledger via web/sign_tx.html):');
  console.log(unsignedTxHex);
  console.log('\nAfter signing, submit with:');
  console.log('  node _submit_tx.mjs <signed-tx-hex>');
  console.log('  or: node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>');
  console.log(`\nThe submitted tx hash should match: ${registrationTxHash}`);

  console.log('\nOnce confirmed, move your ADA to your Pool Ranger staking address:');
  console.log(' ', contractAddress);
  console.log('\nThis is where your ADA must live to participate in the cooperative.');
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
