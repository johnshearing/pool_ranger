// Pool Ranger — combined member report (balances + delegation + rewards).
//
// Usage:
//   node _view_members.mjs                  # report every row in _1_members.json
//   node _view_members.mjs --name member_3  # report just one member
//   node _view_members.mjs --help
//
// ───────────────────────────────────────────────────────────────────────────
// THE ADDRESS MODEL — read this before reading the output.
//
// _view_delegations.mjs prints two addresses per member and the labels confuse
// almost everyone the first time. This script prints three. Here is what each
// kind of address is and why it shows up.
//
// 1. Stake address (a.k.a. reward address) — bech32 prefix "stake_test1…".
//      This is NOT a place where ADA lives. You cannot send ADA to a stake
//      address with a normal payment tx — Eternl will not even let you try.
//      Its job is to be the on-chain handle for ONE stake credential. The
//      chain uses it to record: which pool is this credential delegated to?
//      How much reward has it accumulated? Is it currently registered?
//      For Pool Ranger, the stake credential is the parameterized Plutus
//      script, so this address is what we query to ask "which pool is admin
//      delegating member_N's stake to right now?" and "how much reward has
//      member_N's stake credential earned?". Stored as member.stakeAddress.
//
// 2. Base address — bech32 prefix "addr_test1…".
//      THIS is where ADA lives. Every base address glues together two halves:
//        - payment credential (controls who can SPEND the ADA), and
//        - stake credential   (controls who can DELEGATE the stake).
//      Pool Ranger uses two distinct base addresses per member:
//
//        a. Registered receive address (member.address)
//             payment_cred = member's own payment key (member can spend)
//             stake_cred   = member's own stake key   (the wallet's own staking)
//           This is the bech32 address the member sent to the admin out-of-band
//           when they joined. It is the first receive address of their Ledger
//           wallet. Ledger and Eternl will also derive many sibling addresses
//           from the same wallet account, all sharing the same payment + stake
//           credentials but with different derivation indices. Those siblings
//           are also part of the wallet — see "Other wallet addresses" below.
//
//        b. Pool Ranger base address (member.contractAddress)
//             payment_cred = member's own payment key (member can still spend)
//             stake_cred   = the Pool Ranger script  (admin controls delegation)
//           This is the address members move ADA TO once they join. The
//           member's own key still signs spends — Pool Ranger cannot lock the
//           funds — but the script credential makes the chain route delegation
//           and rewards through the parameterized stake script. ADA parked
//           here is what is staking via Pool Ranger and what earns the
//           cooperative's allocated rewards.
//
// ───────────────────────────────────────────────────────────────────────────
// THE THREE BALANCES THIS SCRIPT DISPLAYS, AND WHY EACH EXISTS.
//
// A. Registered receive address balance
//      UTxOs at member.address only. Equal to what _view_wallet_balances.mjs
//      already shows. Useful to recognise the address from the receipt the
//      member originally sent.
//
// B. Other wallet addresses (total)
//      Sum of UTxOs at every other address sharing the wallet's stake
//      credential — i.e. every other derived receive address of the same
//      Ledger account. We enumerate them with Blockfrost's
//      /accounts/{walletStakeAddress}/addresses endpoint.
//
//      Why this matters: when a member spends from any wallet address using
//      Eternl + Ledger, Eternl is free to pick UTxOs from any address that
//      belongs to the wallet AND drop the change at any wallet address it
//      pleases — often a fresh receive address, not the original one. Over
//      time, "balance at the registered receive address" drifts away from
//      "ADA the member actually still has in their wallet." This line catches
//      the drift. If it is non-zero it usually means Eternl has been moving
//      funds around; the member should consider sweeping it back to the Pool
//      Ranger base address if they want it staking via the cooperative.
//
// C. Pool Ranger base address balance
//      UTxOs at member.contractAddress. This IS the ADA being staked via
//      Pool Ranger. Equal to what _view_delegations.mjs calls "contract bal".
//
// The "Wallet total" line below the three balances is just A + B + C — it is
// the member's total ADA holdings on-chain, regardless of which address it
// is sitting at.
//
// ───────────────────────────────────────────────────────────────────────────
// REWARDS
//
// Pulled from the same /accounts/{stake_address} call we already use for the
// delegation drift check. Two numbers per member:
//   - withdrawable now — rewards available to withdraw this moment.
//   - lifetime earned  — cumulative rewards ever earned by this credential.
//
// ───────────────────────────────────────────────────────────────────────────
// RELATED SCRIPTS
//
// _view_delegations.mjs and _view_wallet_balances.mjs are deliberately
// retained. This script is a superset of both, but the narrower scripts are
// faster to run and clearer when you only need one piece of the picture.

import fs from 'fs';
import {
  blockchainProvider,
  loadMembers,
  deserializeAddress,
} from './common/common.mjs';
import { serializeRewardAddress } from '@meshsdk/core';

// ── Config ─────────────────────────────────────────────────────────────────
const MEMBERS_FILE = './_1_members.json';
const NETWORK_ID   = 0;   // 0 = Preview testnet

const HELP = `Usage:
  node _view_members.mjs [--name <member>] [--help]

What this does:
  For each member in ${MEMBERS_FILE} (or just the one matched by --name),
  fetches three categories of balance, the on-chain delegation, and pending
  staking rewards. See the leading comment block of this file for the full
  explanation of the address model.

Flags:
  --name <name>   Limit the report to a single member by name.
  --help, -h      Show this message and exit.`;

// ── CLI parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { name: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (a === '--name') { out.name = argv[++i]; continue; }
    throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

// ── Formatting helpers ─────────────────────────────────────────────────────
function fmtAda(lovelace) {
  const n = Number(lovelace) || 0;
  return `${(n / 1_000_000).toFixed(6)} tADA (${n} lovelace)`;
}

function fmtPool(poolId) {
  return poolId ?? '(none)';
}

// Sum lovelace across a list of UTxOs (shape returned by fetchAddressUTxOs).
function sumLovelace(utxos) {
  let total = 0;
  for (const u of utxos) {
    const lov = u.output.amount.find(a => a.unit === 'lovelace');
    if (lov) total += parseInt(lov.quantity, 10);
  }
  return total;
}

async function fetchBalance(address) {
  const utxos = await blockchainProvider.fetchAddressUTxOs(address);
  return { lovelace: sumLovelace(utxos), utxoCount: utxos.length };
}

// ── On-chain helpers specific to this script ──────────────────────────────
// Returns the /accounts/{stakeAddress} payload, or null on 404.
async function fetchStakeAccount(stakeAddress) {
  try {
    return await blockchainProvider.get(`/accounts/${stakeAddress}`);
  } catch (err) {
    const status = err.status_code ?? err.status ?? err.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

// Enumerate every on-chain address that shares the wallet's stake credential.
// Blockfrost paginates at 100 per page; we walk pages until we get an empty one.
// Returns [] (with note flag) if the stake credential was never registered
// on-chain — that case is normal for a brand-new wallet.
async function fetchAddressesForWalletStake(walletStakeAddress) {
  const all = [];
  let page = 1;
  while (true) {
    let chunk;
    try {
      chunk = await blockchainProvider.get(
        `/accounts/${walletStakeAddress}/addresses?page=${page}&count=100`,
      );
    } catch (err) {
      const status = err.status_code ?? err.status ?? err.response?.status;
      if (status === 404) return { addresses: [], registered: false };
      throw err;
    }
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    for (const row of chunk) all.push(row.address);
    if (chunk.length < 100) break;
    page++;
  }
  return { addresses: all, registered: true };
}

// Derive the wallet's reward (stake) address from the member's base address.
// Returns null if member.address is an enterprise address (no stake half) or
// if its stake credential is a script (shouldn't happen for a Ledger receive
// address, but we guard).
function deriveWalletStakeAddress(memberAddress) {
  const parts = deserializeAddress(memberAddress);
  if (parts.stakeScriptCredentialHash) return null;   // script-stake — not a wallet
  if (!parts.stakeCredentialHash)      return null;   // enterprise — no stake half
  return serializeRewardAddress(parts.stakeCredentialHash, false, NETWORK_ID);
}

// ── Per-member report ──────────────────────────────────────────────────────
async function reportMember(member) {
  console.log(`── ${member.name} ──────────────────────────────────────────`);

  // A. Registered receive address
  let balA = { lovelace: 0, utxoCount: 0 };
  try {
    balA = await fetchBalance(member.address);
  } catch (err) {
    console.log(`  ERROR fetching registered receive addr: ${err.message ?? err}`);
  }

  // B. Other wallet addresses (sharing wallet stake credential)
  let balB = { lovelace: 0, utxoCount: 0, count: 0 };
  let walletStakeAddress = null;
  let walletStakeRegistered = true;
  let walletStakeWarning = null;
  try {
    walletStakeAddress = deriveWalletStakeAddress(member.address);
    if (walletStakeAddress) {
      const { addresses, registered } = await fetchAddressesForWalletStake(walletStakeAddress);
      walletStakeRegistered = registered;
      if (!registered) {
        walletStakeWarning =
          'wallet stake key not yet registered on-chain — siblings cannot be enumerated';
      } else {
        const others = addresses.filter(a => a !== member.address);
        balB.count = others.length;
        for (const addr of others) {
          try {
            const u = await blockchainProvider.fetchAddressUTxOs(addr);
            balB.lovelace  += sumLovelace(u);
            balB.utxoCount += u.length;
          } catch (err) {
            console.log(`  WARN fetching ${addr}: ${err.message ?? err}`);
          }
        }
      }
    } else {
      walletStakeWarning =
        'member.address has no normal stake credential — cannot enumerate sibling addresses';
    }
  } catch (err) {
    console.log(`  ERROR enumerating wallet addresses: ${err.message ?? err}`);
  }

  // C. Pool Ranger base address
  let balC = { lovelace: 0, utxoCount: 0 };
  try {
    balC = await fetchBalance(member.contractAddress);
  } catch (err) {
    console.log(`  ERROR fetching Pool Ranger base addr: ${err.message ?? err}`);
  }

  // Print balances
  console.log('  Wallet balances:');
  console.log(`    Registered receive addr  : ${member.address}`);
  console.log(`       balance               : ${fmtAda(balA.lovelace)} across ${balA.utxoCount} UTxO(s)`);
  if (walletStakeAddress) {
    console.log(`    Other wallet addresses   : ${balB.count} sibling address(es) sharing wallet stake key`);
    console.log(`       walletStakeAddress    : ${walletStakeAddress}`);
    if (walletStakeWarning) {
      console.log(`       note                  : ${walletStakeWarning}`);
    } else {
      console.log(`       balance               : ${fmtAda(balB.lovelace)} across ${balB.utxoCount} UTxO(s)`);
    }
  } else if (walletStakeWarning) {
    console.log(`    Other wallet addresses   : (skipped)`);
    console.log(`       note                  : ${walletStakeWarning}`);
  }
  console.log(`    Pool Ranger base address : ${member.contractAddress}`);
  console.log(`       balance               : ${fmtAda(balC.lovelace)} across ${balC.utxoCount} UTxO(s)`);

  const total = balA.lovelace + balB.lovelace + balC.lovelace;
  console.log(`    ─────────`);
  console.log(`    Wallet total (A + B + C) : ${fmtAda(total)}`);

  if (balB.lovelace > 0) {
    console.log(`    Note: ${fmtAda(balB.lovelace)} is sitting on derived addresses outside`);
    console.log(`          your registered receive address. Eternl moves funds around when`);
    console.log(`          you spend. If you want this ADA staking via Pool Ranger, sweep`);
    console.log(`          it to your Pool Ranger base address shown above.`);
  }

  // Delegation + rewards (one call, two pieces of info)
  let account = null;
  try {
    account = await fetchStakeAccount(member.stakeAddress);
  } catch (err) {
    console.log(`  ERROR fetching stake account: ${err.message ?? err}`);
  }

  const delegations = Array.isArray(member.delegations) ? member.delegations : [];
  const latest      = delegations.length > 0 ? delegations[delegations.length - 1] : null;
  const expected    = latest?.poolId ?? null;

  console.log('  Delegation (Pool Ranger stake credential):');
  console.log(`    stakeAddress             : ${member.stakeAddress}`);
  if (!account) {
    console.log('    on-chain                 : NOT REGISTERED');
    if (expected) {
      console.log(`    expected pool            : ${fmtPool(expected)}`);
      console.log('    status                   : MISMATCH (file claims a delegation, chain says not registered)');
    } else {
      console.log('    status                   : ok (no delegation recorded, none on-chain)');
    }
  } else {
    const onChainPool = account.pool_id ?? null;
    console.log(`    active                   : ${account.active}`);
    console.log(`    on-chain pool            : ${fmtPool(onChainPool)}`);
    console.log(`    expected pool            : ${fmtPool(expected)}`);
    if (onChainPool === expected) {
      console.log('    status                   : ok');
    } else {
      console.log('    status                   : MISMATCH');
      if (latest) {
        console.log(`                               file entry recorded at ${latest.requestedAt}`);
        console.log(`                               file txHash: ${latest.txHash}`);
        console.log('                               The tx may not have been submitted, or is still pending.');
      }
    }
  }

  // Rewards (from the same account object)
  console.log('  Rewards (at Pool Ranger stake credential):');
  if (!account) {
    console.log('    (stake credential not registered — no rewards record on-chain)');
  } else {
    const withdrawable = account.withdrawable_amount ?? '0';
    const lifetime     = account.rewards_sum ?? '0';
    const withdrawn    = account.withdrawals_sum ?? '0';
    console.log(`    Withdrawable now         : ${fmtAda(withdrawable)}`);
    console.log(`    Lifetime earned          : ${fmtAda(lifetime)}`);
    console.log(`    Lifetime withdrawn       : ${fmtAda(withdrawn)}`);
  }

  console.log();
  return { balA: balA.lovelace, balB: balB.lovelace, balC: balC.lovelace,
           withdrawable: parseInt(account?.withdrawable_amount ?? '0', 10) };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(HELP);
    process.exit(1);
  }
  if (args.help) { console.log(HELP); process.exit(0); }

  let members;
  try {
    members = loadMembers(MEMBERS_FILE);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let selected = members;
  if (args.name) {
    const m = members.find(x => x.name === args.name);
    if (!m) {
      const known = members.map(x => x.name).join(', ') || '(none)';
      console.error(`No member named "${args.name}" in ${MEMBERS_FILE}.`);
      console.error(`Known members: ${known}`);
      process.exit(1);
    }
    selected = [m];
  }

  console.log(`Pool Ranger member report — ${selected.length} member(s) on Cardano Preview testnet`);
  console.log('See leading comment block of this script for what each balance and label means.');
  console.log();

  const totals = { balA: 0, balB: 0, balC: 0, withdrawable: 0 };
  for (const m of selected) {
    try {
      const r = await reportMember(m);
      totals.balA         += r.balA;
      totals.balB         += r.balB;
      totals.balC         += r.balC;
      totals.withdrawable += r.withdrawable;
    } catch (err) {
      console.log(`  ERROR reporting ${m.name}: ${err.message ?? err}\n`);
    }
  }

  if (!args.name && selected.length > 1) {
    console.log('────────────────────────────────────────────────────────');
    console.log('Cooperative totals:');
    console.log(`  Registered receive addresses : ${fmtAda(totals.balA)}`);
    console.log(`  Other wallet addresses       : ${fmtAda(totals.balB)}`);
    console.log(`  Pool Ranger base addresses   : ${fmtAda(totals.balC)}`);
    console.log(`  Wallet grand total           : ${fmtAda(totals.balA + totals.balB + totals.balC)}`);
    console.log(`  Withdrawable rewards (sum)   : ${fmtAda(totals.withdrawable)}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
