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
// Pool Ranger lives at the intersection of two Cardano address kinds. Mixing
// them up is the #1 source of confusion, so spend a minute on this section.
//
// 1. Reward address — bech32 prefix "stake_test1…".
//      A reward address (older Cardano docs also call it a "stake address",
//      which this script avoids because it sounds too much like "Pool Ranger
//      staking address" — kind 2b below — which is a completely different
//      thing) is NOT a place where ADA lives. You cannot send ADA to one
//      with a normal payment tx — Eternl will not even let you try. Its job
//      is to be the on-chain handle for ONE stake credential. The chain
//      uses it to record: which pool is this credential delegated to? How
//      much reward has it accumulated? Is it currently registered?
//
//      This script surfaces TWO different reward addresses per member. Both
//      share the "stake_test1…" prefix and look superficially alike. Do not
//      confuse them — they identify completely different credentials:
//
//        a. WalletRewardAddress
//             Handle for the credential of the member's REGULAR wallet stake
//             key — i.e. the staking of the Ledger wallet itself, separate
//             from Pool Ranger. Pool Ranger does NOT control this; the
//             member's own wallet does (Eternl may or may not have delegated
//             it on its own). We derive this at runtime from member.registeredReceiveAddress.
//             The script uses it only to enumerate every receive address
//             belonging to the wallet (see "Other wallet receive addresses" below).
//
//        b. PoolRangerRewardAddress
//             Handle for the parameterized Pool Ranger Plutus script
//             credential, derived once per member at registration. Pool
//             Ranger's admin controls delegation here; this is the credential
//             that earns the cooperative's allocated staking rewards on the
//             ADA parked at the Pool Ranger staking address (see 2b below).
//             Stored as member.poolRangerRewardAddress in _1_members.json.
//
// 2. Base address — bech32 prefix "addr_test1…".
//      THIS is where ADA lives. Every base address glues together two halves:
//        - payment credential (controls who can SPEND the ADA), and
//        - stake credential   (controls who can DELEGATE the stake).
//      Pool Ranger uses two distinct base addresses per member:
//
//        a. Registered receive address (member.registeredReceiveAddress)
//             payment_cred = member's own payment key (member can spend)
//             stake_cred   = member's own stake key   (the wallet's own staking)
//           This is the bech32 address the member sent to the admin out-of-band
//           when they joined. It is the first receive address of their Ledger
//           wallet. Ledger and Eternl will also derive many sibling addresses
//           from the same wallet account, all sharing the same payment + stake
//           credentials but with different derivation indices. Those siblings
//           are also part of the wallet — see "Other wallet receive addresses" below.
//           WalletRewardAddress (1a) is the reward-address handle for the
//           stake_cred of this address and all its siblings.
//
//        b. Pool Ranger staking address (member.poolRangerStakingAddress)
//             payment_cred = member's own payment key (member can still spend)
//             stake_cred   = the Pool Ranger script  (admin controls delegation)
//           This is the address members move ADA TO once they join. The
//           member's own key still signs spends — Pool Ranger cannot lock the
//           funds — but the script credential makes the chain route delegation
//           and rewards through the parameterized stake script. ADA parked
//           here is what is staking via Pool Ranger and what earns the
//           cooperative's allocated rewards. PoolRangerRewardAddress (1b) is
//           the reward-address handle for the stake_cred of this address.
//
// ───────────────────────────────────────────────────────────────────────────
// THE FOUR ADDRESS LINES IN THE OUTPUT, AND WHY EACH EXISTS.
//
// A. Registered receive addr
//      UTxOs at member.registeredReceiveAddress only. Equal to what _view_wallet_balances.mjs
//      already shows. Useful to recognise the address from the receipt the
//      member originally sent.
//
// B. WalletRewardAddress  (HANDLE ONLY — does NOT contribute to wallet total)
//      The bech32 reward address for the wallet's own stake key (kind 1a in
//      the address model above). Reward addresses cannot hold ADA in normal
//      UTxOs, so this line is a credential handle, not a balance. It is
//      printed because it is the credential whose sibling addresses are
//      enumerated in C — without seeing the handle the reader has no way
//      to verify which stake key C is rooted at.
//
// C. Other wallet receive addresses
//      Sum of UTxOs at every other address sharing the wallet's stake
//      credential — i.e. every other derived receive address of the same
//      Ledger account. We enumerate them with Blockfrost's
//      /accounts/{WalletRewardAddress}/addresses endpoint.
//
//      Why this matters: when a member spends from any wallet address using
//      Eternl + Ledger, Eternl is free to pick UTxOs from any address that
//      belongs to the wallet AND drop the change at any wallet address it
//      pleases — often a fresh receive address, not the original one. Over
//      time, "balance at the registered receive address" drifts away from
//      "ADA the member actually still has in their wallet." This line catches
//      the drift. If it is non-zero it usually means Eternl has been moving
//      funds around; the member should consider sweeping it back to the Pool
//      Ranger staking address if they want it staking via the cooperative.
//
// D. Pool Ranger staking address
//      UTxOs at member.poolRangerStakingAddress. This IS the ADA being staked via
//      Pool Ranger. Equal to what _view_delegations.mjs calls "contract bal".
//
// The "Wallet total" line below the four address lines is A + C + D — the
// member's total ADA holdings on-chain across the three address kinds that
// actually hold ADA. B is the reward-credential handle, so it contributes
// no balance and is omitted from the sum.
//
// ───────────────────────────────────────────────────────────────────────────
// REGISTRATION
//
// Read straight from member.registration in _1_members.json (no Blockfrost
// call). Two fields:
//   requestedAt — ISO timestamp the registration tx was built by
//                 _register_stake.mjs. Treat as "approximate join date".
//   txHash      — the registration transaction hash. Useful as the audit
//                 trail for "when and how did this member join Pool Ranger".
// Omitted entirely if the row has no registration field (older records).
//
// ───────────────────────────────────────────────────────────────────────────
// DELEGATION
//
// One on-chain call (the same /accounts/{stake_address} request used for
// rewards) feeds two diagnostic fields in the Delegation section:
//
//   active — whether the Pool Ranger stake credential is currently registered
//            on the Cardano network. Possible values:
//              true            — registered. The 2 ADA registration deposit
//                                is held by the ledger; the credential can
//                                delegate to a pool and earn rewards.
//              false           — was registered, then deregistered. The 2
//                                ADA deposit was refunded. Cannot delegate
//                                or earn rewards until re-registered.
//              (line omitted)  — when the credential has never been
//                                registered on-chain at all, the "active"
//                                line is replaced by "on-chain : NOT
//                                REGISTERED". No false-vs-never-registered
//                                ambiguity in the output.
//
//   status — this script's verdict comparing chain vs file. Possible values:
//              ok
//                  on-chain pool matches the newest member.delegations[]
//                  entry in _1_members.json. Nothing to reconcile.
//              ok (no delegation recorded, none on-chain)
//                  credential has never been registered and the local
//                  history is empty. Nothing to reconcile.
//              MISMATCH
//                  the chain and the local file disagree about which pool
//                  this member is delegated to. Usual causes:
//                    - a delegation tx was built and appended to history
//                      but never submitted;
//                    - the submission is still propagating (wait ~20s and
//                      re-run);
//                    - an unrelated tx changed the on-chain state.
//              MISMATCH (file claims a delegation, chain says not registered)
//                  the local file has a delegations[] entry but the chain
//                  has no account record at all. Indicates a tx that was
//                  appended to history but never confirmed on-chain.
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

// Base URL of the member-facing "send from staking address" page. The admin
// emails each member their own line of the report (see the Spend tool line
// printed per member below), which deep-links to this URL with the member's
// staking address prefilled. The page reads ?addr=… on load, fills the box,
// and locks it so the member never has to paste their address.
// TODO: switch to the GitHub Pages URL once the page is published there,
// e.g. https://johnshearing.github.io/pool_ranger/web/dist/send_from_staking.html
const SEND_FROM_STAKING_BASE = 'http://localhost:3000/send_from_staking.html';

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
async function fetchAddressesForWalletReward(walletRewardAddress) {
  const all = [];
  let page = 1;
  while (true) {
    let chunk;
    try {
      chunk = await blockchainProvider.get(
        `/accounts/${walletRewardAddress}/addresses?page=${page}&count=100`,
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
// Returns null if member.registeredReceiveAddress is an enterprise address (no stake half) or
// if its stake credential is a script (shouldn't happen for a Ledger receive
// address, but we guard).
function deriveWalletRewardAddress(memberAddress) {
  const parts = deserializeAddress(memberAddress);
  if (parts.stakeScriptCredentialHash) return null;   // script-stake — not a wallet
  if (!parts.stakeCredentialHash)      return null;   // enterprise — no stake half
  return serializeRewardAddress(parts.stakeCredentialHash, false, NETWORK_ID);
}

// ── Per-member report ──────────────────────────────────────────────────────
async function reportMember(member) {
  console.log(`── ${member.name} ──────────────────────────────────────────`);

  // Registration metadata (when the member joined, what tx registered them)
  if (member.registration) {
    console.log('  Registration:');
    console.log(`    requestedAt              : ${member.registration.requestedAt ?? '(unknown)'}`);
    console.log(`    txHash                   : ${member.registration.txHash ?? '(unknown)'}`);
  }

  // A. Registered receive address
  let balA = { lovelace: 0, utxoCount: 0 };
  try {
    balA = await fetchBalance(member.registeredReceiveAddress);
  } catch (err) {
    console.log(`  ERROR fetching registered receive addr: ${err.message ?? err}`);
  }

  // B. WalletRewardAddress + C. Other wallet receive addresses (sharing wallet stake credential)
  let balB = { lovelace: 0, utxoCount: 0, count: 0 };
  let walletRewardAddress = null;
  let walletRewardRegistered = true;
  let walletRewardWarning = null;
  try {
    walletRewardAddress = deriveWalletRewardAddress(member.registeredReceiveAddress);
    if (walletRewardAddress) {
      const { addresses, registered } = await fetchAddressesForWalletReward(walletRewardAddress);
      walletRewardRegistered = registered;
      if (!registered) {
        walletRewardWarning =
          'wallet stake key not yet registered on-chain — siblings cannot be enumerated';
      } else {
        const others = addresses.filter(a => a !== member.registeredReceiveAddress);
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
      walletRewardWarning =
        'member.registeredReceiveAddress has no normal stake credential — cannot enumerate sibling addresses';
    }
  } catch (err) {
    console.log(`  ERROR enumerating wallet addresses: ${err.message ?? err}`);
  }

  // D. Pool Ranger staking address
  let balC = { lovelace: 0, utxoCount: 0 };
  try {
    balC = await fetchBalance(member.poolRangerStakingAddress);
  } catch (err) {
    console.log(`  ERROR fetching Pool Ranger base addr: ${err.message ?? err}`);
  }

  // Print balances
  console.log('  Wallet balances:');
  console.log(`    A. Registered receive addr        : ${member.registeredReceiveAddress}`);
  console.log(`       balance                        : ${fmtAda(balA.lovelace)} across ${balA.utxoCount} UTxO(s)`);
  if (walletRewardAddress) {
    console.log(`    B. WalletRewardAddress            : ${walletRewardAddress}`);
    console.log(`       (handle only — does not contribute to wallet total)`);
    console.log(`    C. Other wallet receive addresses : ${balB.count} sibling address(es) sharing the wallet's stake key`);
    if (walletRewardWarning) {
      console.log(`       note                           : ${walletRewardWarning}`);
    } else {
      console.log(`       balance                        : ${fmtAda(balB.lovelace)} across ${balB.utxoCount} UTxO(s)`);
    }
  } else if (walletRewardWarning) {
    console.log(`    B. WalletRewardAddress            : (could not derive)`);
    console.log(`    C. Other wallet receive addresses : (skipped)`);
    console.log(`       note                           : ${walletRewardWarning}`);
  }
  console.log(`    D. Pool Ranger staking address    : ${member.poolRangerStakingAddress}`);
  console.log(`       balance                        : ${fmtAda(balC.lovelace)} across ${balC.utxoCount} UTxO(s)`);
  console.log(`       Spend tool (send THIS link to ${member.name}):`);
  console.log(`         ${SEND_FROM_STAKING_BASE}?addr=${member.poolRangerStakingAddress}`);

  const total = balA.lovelace + balB.lovelace + balC.lovelace;
  console.log(`    ─────────`);
  console.log(`    Wallet total (A + C + D)          : ${fmtAda(total)}`);
  console.log();

  if (balB.lovelace > 0) {
    console.log(`    Note: ${fmtAda(balB.lovelace)} is sitting on derived addresses outside`);
    console.log(`          your registered receive address. Eternl moves funds around when`);
    console.log(`          you spend. If you want this ADA staking via Pool Ranger, sweep`);
    console.log(`          it to your Pool Ranger staking address shown above.`);
  }

  // Delegation + rewards (one call, two pieces of info)
  let account = null;
  try {
    account = await fetchStakeAccount(member.poolRangerRewardAddress);
  } catch (err) {
    console.log(`  ERROR fetching stake account: ${err.message ?? err}`);
  }

  const delegations = Array.isArray(member.delegations) ? member.delegations : [];
  const latest      = delegations.length > 0 ? delegations[delegations.length - 1] : null;
  const expected    = latest?.poolId ?? null;

  console.log('  Delegation status (at PoolRangerRewardAddress):');
  console.log(`    PoolRangerRewardAddress  : ${member.poolRangerRewardAddress}`);
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
  console.log('  Rewards (at PoolRangerRewardAddress):');
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
    console.log(`  A. Registered receive addresses     : ${fmtAda(totals.balA)}`);
    console.log(`  C. Other wallet receive addresses   : ${fmtAda(totals.balB)}`);
    console.log(`  D. Pool Ranger staking addresses    : ${fmtAda(totals.balC)}`);
    console.log(`  Wallet grand total (A + C + D)      : ${fmtAda(totals.balA + totals.balB + totals.balC)}`);
    console.log(`  Withdrawable rewards (sum)          : ${fmtAda(totals.withdrawable)}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
