// Spends ADA from a member's Pool Ranger staking address (addr_test1y... /
// addr1y...) and sends the change back to the same staking address — so the
// remaining ADA stays delegated through the coop.
//
// Why a dedicated script: a member's Pool Ranger staking address is a Type-2
// Shelley address whose payment credential is the member's own key and whose
// stake credential is the coop Plutus script. When a generic wallet builds a
// "send" tx, it may pick UTxOs from this address but route change to a
// default wallet address that does NOT carry the coop stake credential —
// silently un-staking the change. This script forces change back to the
// staking address, preserving delegation.
//
// The tx does NOT invoke the coop Plutus script. Only the payment-key side is
// checked. The script stake credential just rides along on the change output.
// No script execution, no Plutus cost models, no ex-units evaluation — same
// complexity as a normal ADA send.
//
// On each run the script:
//   1. Reads --name, --to, --amount from the command line.
//   2. Loads _1_members.json and finds the member by --name.
//   3. Fetches UTxOs at member.poolRangerStakingAddress (the addr_test1y... address).
//   4. Builds a tx with one txOut to --to, change back to contractAddress.
//   5. Prints the unsigned tx hex for signing with the member's Ledger via
//      web/sign_tx.html.
//
// Usage (from ranger/):
//   node _spend_from_staking.mjs --name member_3 --to addr_test1q... --amount 5
//   node _spend_from_staking.mjs --help            # show full help text

import {
  blockchainProvider,
  getTxBuilder,
  loadMembers,
  findMember,
} from './common/common.mjs';

const MEMBERS_FILE = './_1_members.json';

// ── Parse CLI args (--name <value> --to <bech32> --amount <ada>) ──────────
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
  node _spend_from_staking.mjs --name <member-name> --to <bech32-address> --amount <ada>

Options:
  --name <name>     Member label in ${MEMBERS_FILE} whose Pool Ranger staking
                    address (poolRangerStakingAddress) is the source of the funds.
                    Must already exist in the directory.
  --to <addr>       Recipient bech32 address (addr_test1... on Preview,
                    addr1... on mainnet). Where the --amount goes.
  --amount <ada>    Amount to send, in tADA (decimal allowed, e.g. 5.5).
                    Internally converted to lovelace (multiply by 1,000,000).
                    Must be > 0 and small enough that the change UTxO remains
                    above the min-UTxO threshold (~1 tADA).
  -h, --help        Show this help text and exit.

What this does:
  1. Loads ${MEMBERS_FILE} and finds the --name row.
  2. Fetches UTxOs at the member's Pool Ranger staking address
     (member.poolRangerStakingAddress, an addr_test1y... / addr1y... address).
  3. Builds a tx that sends --amount lovelace to --to and returns ALL change
     to the SAME staking address, preserving the coop stake credential.
  4. Prints the unsigned tx hex for signing with the member's Ledger via
     web/sign_tx.html (no script execution, so partialSign on Eternl signs
     the lone payment-key witness needed).
  5. Does NOT mutate ${MEMBERS_FILE} — sends have no audit-trail field.

Next steps after running:
  1. Sign the printed tx hex in web/sign_tx.html (member's Ledger via Eternl).
  2. Submit with:  node _submit_tx.mjs <signed-tx-hex>
                or node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>
  3. Re-run _view_members.mjs to confirm the staking-address balance dropped
     and delegation status is still ok.

Example:
  node _spend_from_staking.mjs --name member_1 --to addr_test1qz... --amount 5`;

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes('-h') || rawArgs.includes('--help')) {
  const askedForHelp = rawArgs.includes('-h') || rawArgs.includes('--help');
  (askedForHelp ? console.log : console.error)(HELP);
  process.exit(askedForHelp ? 0 : 1);
}

const args = parseArgs(process.argv);
const missing = [];
if (!args.name)   missing.push('--name');
if (!args.to)     missing.push('--to');
if (!args.amount) missing.push('--amount');
if (missing.length > 0) {
  console.error(`Missing required argument(s): ${missing.join(', ')}\n`);
  console.error(HELP);
  process.exit(1);
}
if (!(args.to.startsWith('addr_test1') || args.to.startsWith('addr1'))) {
  console.error(`Error: --to must be a bech32 Cardano address (addr_test1... or addr1...), got: ${args.to}\n`);
  console.error(HELP);
  process.exit(1);
}

// Parse --amount as ADA, convert to lovelace string. Refuse negative/zero/NaN.
const ada = Number(args.amount);
if (!Number.isFinite(ada) || ada <= 0) {
  console.error(`Error: --amount must be a positive number, got: ${args.amount}\n`);
  console.error(HELP);
  process.exit(1);
}
// 1 ADA = 1_000_000 lovelace. Round to nearest integer lovelace to avoid float drift.
const lovelace = BigInt(Math.round(ada * 1_000_000));

async function main() {
  // ── Load member directory and pick the source row ──────────────────────
  const members = loadMembers(MEMBERS_FILE);
  const member  = findMember(members, args.name);

  const sourceAddress = member.poolRangerStakingAddress;
  console.log('Member:                 ', member.name);
  console.log('Source (staking) address:', sourceAddress);
  console.log('Recipient:              ', args.to);
  console.log(`Amount:                  ${ada} tADA (${lovelace} lovelace)`);

  // ── Fetch UTxOs at the staking address ─────────────────────────────────
  const coopUtxos = await blockchainProvider.fetchAddressUTxOs(sourceAddress);
  if (coopUtxos.length === 0) {
    console.error(`\nNo UTxOs at staking address ${sourceAddress}. Nothing to spend.`);
    process.exit(1);
  }
  console.log(`\nFound ${coopUtxos.length} UTxO(s) at the staking address.`);

  // ── Build the spend tx (no script execution; payment-key signs) ────────
  // changeAddress is the SAME staking address — that is the whole point.
  console.log('\nBuilding spend transaction...');
  const txBuilder = await getTxBuilder();
  try {
    await txBuilder
      .txOut(args.to, [{ unit: 'lovelace', quantity: lovelace.toString() }])
      .changeAddress(sourceAddress)
      .selectUtxosFrom(coopUtxos)
      .complete();
  } catch (err) {
    const msg = err.message ?? String(err);
    if (/min.*utxo|too small|insufficient/i.test(msg)) {
      console.error('\nError: tx build failed — likely the change would be below the min-UTxO threshold.');
      console.error('Reduce --amount so at least ~1 tADA remains at the staking address,');
      console.error('or wait for a future "sweep" feature that empties the address.');
      console.error('\nUnderlying error:', msg);
      process.exit(1);
    }
    throw err;
  }

  // ── Print unsigned tx for external signing ─────────────────────────────
  const unsignedTxHex = txBuilder.txHex;
  console.log('\nUnsigned tx (sign with Ledger via web/sign_tx.html):');
  console.log(unsignedTxHex);
  console.log('\nAfter signing, submit with:');
  console.log('  node _submit_tx.mjs <signed-tx-hex>');
  console.log('  or: node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>');
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
