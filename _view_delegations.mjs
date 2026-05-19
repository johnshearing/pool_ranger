// Views and verifies each member's on-chain stake delegation.
//
// For every entry in _1_members.json, the script asks Blockfrost what the
// Cardano network currently says about that member's coop stake address,
// then compares it to the most recent entry in member.delegations[].
//
// For each member it prints:
//   - stakeAddress           — the bech32 stake address being checked
//   - contractAddress        — the member's coop base address (where their ADA lives)
//   - contract balance       — total ADA currently held at the contract address
//   - active                 — ledger's view of the stake credential:
//                                true  = currently registered (2 ADA deposit held by
//                                        the ledger; can delegate and earn rewards)
//                                false = was registered, then deregistered (deposit
//                                        refunded; cannot delegate until re-registered)
//                              Not shown at all when the credential was never
//                              registered — that case prints "NOT REGISTERED" instead.
//   - on-chain pool          — full bech32 pool ID the network says is delegating
//   - expected pool          — full bech32 pool ID stored as the latest delegations entry
//   - status                 — this script's verdict comparing chain vs file:
//                                ok       = on-chain pool matches the newest
//                                           member.delegations[] entry (or both are empty)
//                                MISMATCH = chain and file disagree (see below)
//
// A "mismatch" usually means one of:
//   - A delegation tx was built (entry appended) but never submitted.
//   - The submission is still propagating (wait ~20 seconds, then re-run).
//   - The on-chain state was changed by an unrelated tx.
//
// Usage (from ranger/):
//   node _view_delegations.mjs
//   node _view_delegations.mjs --help

import fs from 'fs';
import { blockchainProvider } from './common/common.mjs';

// ── Config ────────────────────────────────────────────────────────────────
const MEMBERS_FILE = './_1_members.json';

const HELP = `Usage:
  node _view_delegations.mjs [--help]

What this does:
  1. Loads ${MEMBERS_FILE}.
  2. For each member, queries Blockfrost for the on-chain delegation
     associated with their coop stakeAddress.
  3. Prints the current pool, expected pool (from the latest delegations
     entry), and whether they match.

Why mismatches occur:
  - A delegation tx was built but never submitted.
  - The submission is still propagating (wait ~20 seconds, then re-run).
  - The on-chain state was changed by an unrelated tx.

Exit codes:
  0  every member matches its expected pool
  1  fatal error (missing files, network failure, etc.)
  2  ran successfully but at least one mismatch was found`;

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

// ── Blockfrost helpers ────────────────────────────────────────────────────
// Returns the /accounts/{stake_address} payload, or null if the stake
// address has never been registered on-chain (Blockfrost 404).
async function fetchAccount(stakeAddress) {
  try {
    return await blockchainProvider.get(`/accounts/${stakeAddress}`);
  } catch (err) {
    const status = err.status_code ?? err.status ?? err.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

// Returns the full bech32 pool ID, or "(none)" when there is no delegation.
function fmtPool(poolId) {
  return poolId ?? '(none)';
}

// Sums the lovelace held in every UTxO at the given address.
// Returns a plain Number (Cardano's max supply fits comfortably in a JS Number).
async function fetchContractBalanceLovelace(address) {
  const utxos = await blockchainProvider.fetchAddressUTxOs(address);
  let total = 0;
  for (const u of utxos) {
    const lov = u.output.amount.find(a => a.unit === 'lovelace');
    if (lov) total += parseInt(lov.quantity, 10);
  }
  return total;
}

// Renders a lovelace amount as "1234.567890 tADA (1234567890 lovelace)".
function fmtAda(lovelace) {
  const ada = (lovelace / 1_000_000).toFixed(6);
  return `${ada} tADA (${lovelace} lovelace)`;
}

async function main() {
  // ── Load member directory ──────────────────────────────────────────────
  if (!fs.existsSync(MEMBERS_FILE)) {
    console.error(`Member directory not found: ${MEMBERS_FILE}`);
    console.error('Register members first with _register_stake.mjs.');
    process.exit(1);
  }
  const members = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));

  console.log(`Verifying on-chain delegations for ${members.length} member(s)…\n`);

  let okCount           = 0;
  let mismatchCount     = 0;
  let unregisteredCount = 0;

  for (const m of members) {
    const delegations  = Array.isArray(m.delegations) ? m.delegations : [];
    const latest       = delegations.length > 0 ? delegations[delegations.length - 1] : null;
    const expectedPool = latest?.poolId ?? null;

    console.log(`── ${m.name} ──────────────────────────────────────────`);
    console.log(`  stakeAddress   : ${m.stakeAddress}`);
    console.log(`  contractAddr   : ${m.contractAddress}`);

    // Contract balance — query the base address directly so this works even
    // when the stake credential is not yet registered.
    try {
      const lovelace = await fetchContractBalanceLovelace(m.contractAddress);
      console.log(`  contract bal   : ${fmtAda(lovelace)}`);
    } catch (err) {
      console.log(`  contract bal   : ERROR (${err.message ?? err})`);
    }

    let account;
    try {
      account = await fetchAccount(m.stakeAddress);
    } catch (err) {
      console.log(`  ERROR fetching account: ${err.message ?? err}\n`);
      continue;
    }

    if (!account) {
      console.log('  on-chain       : NOT REGISTERED');
      if (expectedPool) {
        console.log(`  expected pool  : ${fmtPool(expectedPool)}`);
        console.log('  status         : MISMATCH (file claims a delegation, chain says not registered)');
        mismatchCount++;
      } else {
        console.log('  status         : ok (no delegation recorded, none on-chain)');
        unregisteredCount++;
      }
      console.log();
      continue;
    }

    const onChainPool = account.pool_id ?? null;
    console.log(`  active         : ${account.active}`);
    console.log(`  on-chain pool  : ${fmtPool(onChainPool)}`);
    console.log(`  expected pool  : ${fmtPool(expectedPool)}`);

    if (onChainPool === expectedPool) {
      console.log('  status         : ok');
      okCount++;
    } else {
      console.log('  status         : MISMATCH');
      if (latest) {
        console.log(`                   file entry recorded at ${latest.requestedAt}`);
        console.log(`                   file txHash: ${latest.txHash}`);
        console.log('                   The tx may not have been submitted yet, or is still pending.');
      }
      mismatchCount++;
    }
    console.log();
  }

  console.log('──────────────────────────────────────────────────────');
  console.log(`Summary: ${okCount} ok, ${mismatchCount} mismatch, ${unregisteredCount} unregistered`);

  if (mismatchCount > 0) {
    process.exit(2);
  }
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
