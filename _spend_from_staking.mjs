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
  findAdmin,
  getCoopStakeScript,
  deserializeAddress,
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

// ── Address validation helpers ─────────────────────────────────────────────
// Bech32-parse a Cardano address. Catches checksum failures, truncations,
// and typos that a simple prefix check would let through.
function validateBech32Address(addr, fieldName) {
  try {
    deserializeAddress(addr);
  } catch (err) {
    throw new Error(`${fieldName} is not a valid bech32 Cardano address: ${err.message ?? err}`);
  }
}

// Confirm the source address really is a Pool Ranger hybrid (Type-2 Shelley
// with a script stake credential). Catches a stale or hand-edited
// poolRangerStakingAddress entry that points at a plain payment address —
// which would silently route change to a non-staking address and un-delegate
// the residue on every spend.
function validateStakingAddress(addr) {
  validateBech32Address(addr, 'poolRangerStakingAddress');
  if (!(addr.startsWith('addr_test1y') || addr.startsWith('addr1y'))) {
    throw new Error(
      `poolRangerStakingAddress must start with "addr_test1y" (Preview) or ` +
      `"addr1y" (mainnet) — a Type-2 Shelley address with a script stake ` +
      `credential. Got: ${addr}`,
    );
  }
  const { stakeScriptCredentialHash } = deserializeAddress(addr);
  if (!stakeScriptCredentialHash) {
    throw new Error(
      `poolRangerStakingAddress does not carry a script stake credential, ` +
      `so it is not a Pool Ranger staking address. Re-run _register_stake.mjs ` +
      `for this member to repair the directory entry.`,
    );
  }
}

// Confirm the payment-key hash embedded in member.poolRangerStakingAddress
// matches the member.memberPkh stored alongside it. The two fields are
// written together by _register_stake.mjs and should never disagree; if they
// do, the row was hand-edited or got swapped with another member's, and
// signing a spend tx based on it would spend from the wrong member's address.
// Refuse loudly rather than build a tx the operator did not intend.
function assertMemberOwnsStakingAddress(member) {
  const { pubKeyHash } = deserializeAddress(member.poolRangerStakingAddress);
  if (pubKeyHash !== member.memberPkh) {
    throw new Error(
      `Internal inconsistency in ${MEMBERS_FILE} for "${member.name}":\n` +
      `  poolRangerStakingAddress encodes payment-key hash: ${pubKeyHash}\n` +
      `  memberPkh field says:                              ${member.memberPkh}\n` +
      `These must match. Re-run _register_stake.mjs for this member to repair the row.`,
    );
  }
}

// Re-derive the stake-side fields from the on-row payment-key hashes and
// confirm they match what _register_stake.mjs originally wrote. Pure CBOR
// math — no network call. Catches a fully coordinated row swap that drags
// registration.txHash along (which slips past assertRegistrationOnChain),
// and catches a stale row where the admin has rotated since registration
// (different adminPkh ⇒ different scriptHash for every member). On match
// the row's scriptHash, poolRangerRewardAddress, and poolRangerStakingAddress
// are mathematically proven to be the unique outputs of
// getCoopStakeScript(currentAdminPkh, member.memberPkh).
function assertScriptHashDerivation(admin, member) {
  const derived = getCoopStakeScript(admin.memberPkh, member.memberPkh);
  if (derived.scriptHash !== member.scriptHash) {
    throw new Error(
      `${member.name}: scriptHash does not match the script derived from ` +
      `(adminPkh=${admin.memberPkh}, memberPkh=${member.memberPkh}).\n` +
      `  Row says:   ${member.scriptHash}\n` +
      `  Derived:    ${derived.scriptHash}\n` +
      `Either the row was tampered with, or the admin has rotated since ` +
      `this member registered. Re-run _register_stake.mjs to re-register ` +
      `under the current admin.`,
    );
  }
  if (derived.memberCoopBaseAddress !== member.poolRangerStakingAddress) {
    throw new Error(
      `${member.name}: poolRangerStakingAddress does not match the address ` +
      `derived from this row's memberPkh and the current admin.\n` +
      `  Row says:   ${member.poolRangerStakingAddress}\n` +
      `  Derived:    ${derived.memberCoopBaseAddress}`,
    );
  }
  if (derived.stakeAddress !== member.poolRangerRewardAddress) {
    throw new Error(
      `${member.name}: poolRangerRewardAddress does not match the reward ` +
      `address derived from this row's memberPkh and the current admin.\n` +
      `  Row says:   ${member.poolRangerRewardAddress}\n` +
      `  Derived:    ${derived.stakeAddress}`,
    );
  }
}

// On-chain proof that this row really was registered. Fetches the stake
// certificates inside member.registration.txHash and confirms
// member.poolRangerRewardAddress was registered there. The chain is
// immutable; _1_members.json is not — so this binds the row's stake side
// to a real on-chain event the admin previously signed. Catches a row
// whose stake-address fields were edited without updating registration.txHash
// (the most likely accidental tamper). A coordinated swap that also drags
// registration.txHash along can still slip past — at that point the
// operator must rely on the Ledger device screen showing the actual source
// address before they approve.
async function assertRegistrationOnChain(member) {
  const txHash = member?.registration?.txHash;
  if (!txHash) {
    throw new Error(
      `${member.name}: registration.txHash is missing from ${MEMBERS_FILE} — ` +
      `cannot verify the row against on-chain state. Re-run _register_stake.mjs to repair.`,
    );
  }
  let stakes;
  try {
    stakes = await blockchainProvider.get(`/txs/${txHash}/stakes`);
  } catch (err) {
    const status = err.status_code ?? err.status ?? err.response?.status;
    if (status === 404) {
      throw new Error(
        `${member.name}: registration.txHash ${txHash} was not found on this network.\n` +
        `Either the row is corrupt, or BLOCKFROST_API in .env points at the wrong network ` +
        `(mainnet vs Preview).`,
      );
    }
    throw err;
  }
  const registered = (Array.isArray(stakes) ? stakes : []).find(
    s => s.address === member.poolRangerRewardAddress && s.registration === true,
  );
  if (!registered) {
    throw new Error(
      `${member.name}: poolRangerRewardAddress\n  ${member.poolRangerRewardAddress}\n` +
      `was NOT registered in tx ${txHash} according to Blockfrost. The row's stake address ` +
      `was likely edited without re-running _register_stake.mjs (the txHash and the address ` +
      `no longer correspond).`,
    );
  }
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
try {
  validateBech32Address(args.to, '--to');
} catch (err) {
  console.error(`Error: ${err.message}\n`);
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
// Cardano's min-UTxO rule for a plain ADA-only output is ~1 tADA. Refuse here
// with a clear message so the operator does not have to decode a generic
// build-time "value too small" error.
if (ada < 1) {
  console.error(`Error: --amount must be at least 1 tADA (Cardano min-UTxO rule for ADA-only outputs). Got: ${args.amount}\n`);
  console.error(HELP);
  process.exit(1);
}
// 1 ADA = 1_000_000 lovelace. Round to nearest integer lovelace to avoid float drift.
const lovelace = BigInt(Math.round(ada * 1_000_000));

async function main() {
  // ── Load member directory and pick the source row ──────────────────────
  const members = loadMembers(MEMBERS_FILE);
  const admin   = findAdmin(members);
  const member  = findMember(members, args.name);

  const sourceAddress = member.poolRangerStakingAddress;

  // Source-address must be a real Pool Ranger hybrid before we route change
  // to it. Catches stale / hand-edited members.json rows.
  validateStakingAddress(sourceAddress);

  // Cross-check that the payment-key half of the staking address matches the
  // memberPkh field on the same row. Catches a row whose two fields drifted
  // apart through hand-edits or a swap with another member.
  assertMemberOwnsStakingAddress(member);

  // Re-derive scriptHash + addresses from (adminPkh, memberPkh) and confirm
  // the row's stake-side fields are exactly what the math produces.
  // Catches fully coordinated row swaps and stale rows registered under a
  // previous admin.
  assertScriptHashDerivation(admin, member);

  // Anchor the row to immutable on-chain history: confirm the stake address
  // on this row really was registered by the tx whose hash this row also
  // stores. Catches partial JSON tampering where stake-side fields were
  // edited but registration.txHash was not.
  await assertRegistrationOnChain(member);

  // Refuse a no-op tx whose recipient is the same address we're spending
  // from. Wastes a fee and almost certainly indicates a copy-paste mistake.
  if (args.to === sourceAddress) {
    throw new Error(
      `--to is the same address as the source staking address. ` +
      `That would just pay a fee to move ADA to itself.`,
    );
  }

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

  // Balance summary so the operator can sanity-check before signing.
  // Sum lovelace across all UTxOs at the source address; change ≈ total - amount - fee.
  const totalLovelace = coopUtxos.reduce((sum, u) => {
    const ll = u.output.amount.find(a => a.unit === 'lovelace');
    return sum + BigInt(ll?.quantity ?? '0');
  }, 0n);
  const totalAda      = Number(totalLovelace) / 1_000_000;
  const approxChange  = (Number(totalLovelace - lovelace) / 1_000_000);
  console.log(`\nFound ${coopUtxos.length} UTxO(s) at the staking address.`);
  console.log(`Source balance:          ${totalAda.toFixed(6)} tADA (${totalLovelace} lovelace)`);
  console.log(`Sending:                 ${ada} tADA → ${args.to}`);
  console.log(`Approx change returned:  ~${approxChange.toFixed(6)} tADA (less the network fee, back to the staking address)`);

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
