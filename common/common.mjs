// Shared utilities for Pool Ranger off-chain scripts.
// Mirrors vesting/common/common.mjs, adapted for the parameterized coop stake script.

import 'dotenv/config';
import fs from 'fs';
import {
  MeshWallet,
  BlockfrostProvider,
  MeshTxBuilder,
  serializePlutusScript,
  deserializeAddress,
  serializeRewardAddress,
  resolvePlutusScriptHash,
  applyParamsToScript,
} from '@meshsdk/core';
import { serializeAddress } from '@meshsdk/core-csl';
import { DEFAULT_V3_COST_MODEL_LIST } from '@meshsdk/common';

// ── Blockchain provider (Blockfrost, Preview testnet) ──────────────────────
export const blockchainProvider = new BlockfrostProvider(process.env.BLOCKFROST_API);

// ── Plutus V3 cost-model patch ────────────────────────────────────────────
// MeshSDK 1.9.0-beta.102 ships a bundled DEFAULT_V3_COST_MODEL_LIST that lags
// behind the live Preview/mainnet networks (e.g., Preview currently has 350
// entries, MeshSDK ships 297). When MeshSDK computes the tx's
// script_data_hash, it uses the stale list, producing a hash the ledger
// rejects with `ScriptIntegrityHashMismatch`.
//
// Fix: fetch live V3 cost models from Blockfrost and mutate the imported
// array in place. Because `@meshsdk/core-cst` imports this binding from
// `@meshsdk/common`, the mutation is visible to the txBuilder's internal
// hashScriptData() call. We patch lazily on first getTxBuilder() to avoid
// blocking module load.
let v3CostModelsPatched = false;
async function patchV3CostModelsOnce() {
  if (v3CostModelsPatched) return;
  const params = await blockchainProvider.get('/epochs/latest/parameters');
  const liveV3 = params.cost_models?.PlutusV3;
  if (liveV3 && typeof liveV3 === 'object') {
    const liveList = Object.values(liveV3);
    if (liveList.length > 0) {
      DEFAULT_V3_COST_MODEL_LIST.length = 0;
      DEFAULT_V3_COST_MODEL_LIST.push(...liveList);
    }
  }
  v3CostModelsPatched = true;
}

// ── TxBuilder factory ──────────────────────────────────────────────────────
// Returns a fresh MeshTxBuilder per transaction. Do not reuse across txs.
// Async because we lazily fetch and patch live V3 cost models on first call
// (see patchV3CostModelsOnce above).
export async function getTxBuilder() {
  await patchV3CostModelsOnce();
  return new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    network: 0,   // 0 = testnet
    verbose: true,
  });
}

// ── Wallet helpers ─────────────────────────────────────────────────────────
// For software wallets (members with .sk files during Phase 1 testing).
export function loadSoftwareWallet(skPath) {
  return new MeshWallet({
    networkId: 0,
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    key: {
      type: 'root',
      bech32: fs.readFileSync(skPath, 'utf8').trim(),
    },
  });
}

// Address-only wallets (Ledger hardware wallet — admin and production members)
// are not loaded from files anymore. Their bech32 address lives in
// _1_members.json (see the `address` field on each member record) and scripts
// read it from there. Pass that string directly to blockchainProvider
// methods such as fetchAddressUTxOs().

// ── Plutus blueprint ───────────────────────────────────────────────────────
// Loaded relative to the script working directory (ranger/).
const blueprint = JSON.parse(fs.readFileSync('./plutus.json', 'utf8'));

function findValidator(purpose) {
  const entry = blueprint.validators.find(v => v.title === `coop_stake.coop_stake.${purpose}`);
  if (!entry) throw new Error(`Validator 'coop_stake.${purpose}' not found in plutus.json. Run 'aiken build' first.`);
  return entry;
}

// ── getCoopStakeScript ─────────────────────────────────────────────────────
// Central factory for all stake-related operations in Pool Ranger.
// Each member's stake script is a unique parameterized instance.
//
// Parameters (both are 28-byte hex strings / 56 hex chars):
//   adminPkh  — admin payment key hash (from deserializeAddress)
//   memberPkh — this member's payment key hash
//
// Returns:
//   scriptCbor            — parameterized script CBOR hex (for certificate witness)
//   scriptHash            — 28-byte hex script hash
//   stakeAddress          — bech32 stake/reward address (stake_test1...)
//   memberCoopBaseAddress — bech32 base address where member should move their ADA
//                           payment cred = member's own key, stake cred = this script
export function getCoopStakeScript(adminPkh, memberPkh) {
  // The withdraw and publish entries share the same compiledCode.
  // Parameter order must match the validator signature:
  //   validator coop_stake(admin_pkh, member_pkh)
  const rawCode = findValidator('withdraw').compiledCode;
  const scriptCbor = applyParamsToScript(rawCode, [adminPkh, memberPkh], 'Mesh');

  // Derive script hash via an enterprise address (no stake credential).
  const enterpriseAddr = serializePlutusScript(
    { code: scriptCbor, version: 'V3' },
    undefined,
    0,   // networkId = 0 (testnet)
  ).address;
  const scriptHash = resolvePlutusScriptHash(enterpriseAddr);

  // Stake (reward) address: isScriptHash=true so it uses a script credential.
  const stakeAddress = serializeRewardAddress(scriptHash, true, 0);

  // Member's coop base address:
  //   payment_credential = member's own VerificationKey (spending stays theirs)
  //   stake_credential   = this script's hash (cooperative controls delegation)
  const memberCoopBaseAddress = serializeAddress(
    { pubKeyHash: memberPkh, stakeScriptCredentialHash: scriptHash },
    0,
  );

  return { scriptCbor, scriptHash, stakeAddress, memberCoopBaseAddress };
}

export { deserializeAddress };

// ── Members-file helpers ──────────────────────────────────────────────────
// _1_members.json is the off-chain directory of every wallet the cooperative
// knows about (admin + members). These helpers are used by every script that
// needs to read or update that directory. They throw on error rather than
// calling process.exit, so the caller's top-level `.catch()` decides policy
// and the error message stays in one place.

// loadMembers — read and parse the directory file.
//   file: optional path, defaults to './_1_members.json' (relative to ranger/).
// Throws if the file does not exist (script almost certainly should not run).
export function loadMembers(file = './_1_members.json') {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Member directory not found: ${file}\n` +
      'Register members first with _register_stake.mjs.',
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// writeMembers — serialize and write the directory back to disk.
// Preserves the trailing newline convention used by _delegate.mjs.
export function writeMembers(file, members) {
  fs.writeFileSync(file, JSON.stringify(members, null, 2) + '\n');
}

// findAdmin — look up the admin record by name.
//   members:   array from loadMembers().
//   adminName: defaults to 'admin_0' (Pool Ranger convention).
// Throws if no row matches.
export function findAdmin(members, adminName = 'admin_0') {
  const admin = members.find(m => m.name === adminName);
  if (!admin) {
    throw new Error(
      `admin record "${adminName}" not found in members file. ` +
      'Register the admin first via _register_stake.mjs.',
    );
  }
  return admin;
}

// findMember — look up a member row by name, with a helpful error listing
// the known names when the lookup fails.
export function findMember(members, name) {
  const member = members.find(m => m.name === name);
  if (!member) {
    const known = members.map(m => m.name).join(', ') || '(none)';
    throw new Error(
      `no member named "${name}" in members file.\n` +
      `Known members: ${known}`,
    );
  }
  return member;
}

// ── Tx-building helpers ───────────────────────────────────────────────────
// These wrap the small per-tx pieces that _delegate.mjs and the future
// _batch_delegate.mjs both need. Anything that is per-tx (collateral, change
// address, signer hash) is selected once; anything that is per-certificate
// (delegation cert + script witness) is added through addDelegationCert().

// pickAdaCollateral — choose a pure-ADA UTxO from a wallet's UTxO list to
// serve as Plutus collateral. Plutus scripts require collateral, and the
// collateral input must contain only ADA (no native tokens).
//   utxos:        result of blockchainProvider.fetchAddressUTxOs(address).
//   walletLabel:  string used only in error messages, e.g. the wallet's
//                 address or a short name like 'admin'.
// Throws if the wallet has no UTxOs at all, or no pure-ADA UTxO.
export function pickAdaCollateral(utxos, walletLabel) {
  if (utxos.length === 0) {
    throw new Error(`Wallet ${walletLabel} has no UTxOs. Fund it first.`);
  }
  const collateral = utxos.find(
    u => u.output.amount.length === 1 && u.output.amount[0].unit === 'lovelace',
  );
  if (!collateral) {
    throw new Error(`No pure-ADA UTxO for collateral in wallet ${walletLabel}.`);
  }
  return collateral;
}

// addDelegationCert — attach ONE parameterized delegation certificate plus
// its script witness to an already-created MeshTxBuilder.
// Designed so a single-member script calls it once and a batched script
// calls it N times on the same builder before `.complete()`.
//   txBuilder: a MeshTxBuilder from getTxBuilder().
//   adminPkh:  payment-key hash of the cooperative admin (script param).
//   memberPkh: payment-key hash of the member being delegated (script param).
//   poolId:    bech32 pool ID (must start with 'pool1').
// Returns nothing; mutates the builder via its chainable API.
export function addDelegationCert(txBuilder, { adminPkh, memberPkh, poolId }) {
  const { scriptCbor, stakeAddress } = getCoopStakeScript(adminPkh, memberPkh);
  txBuilder
    .delegateStakeCertificate(stakeAddress, poolId)
    .certificateScript(scriptCbor, 'V3')
    .certificateRedeemerValue('');
}

// appendDelegationHistory — push a new {poolId, requestedAt, txHash} entry
// onto a member's delegations[] array, creating the array if older records
// predate the field.
// Does not write to disk — the caller batches writes with writeMembers().
export function appendDelegationHistory(member, { poolId, txHash }) {
  if (!Array.isArray(member.delegations)) {
    member.delegations = [];
  }
  member.delegations.push({
    poolId,
    requestedAt: new Date().toISOString(),
    txHash,
  });
}

// ── On-chain query helpers ────────────────────────────────────────────────

// fetchStakeAccount — query Blockfrost for a stake address's account record.
// Returns the /accounts/{stakeAddress} payload, or null if the stake address
// has never been registered on-chain (Blockfrost returns 404).
// Pattern lifted from _view_delegations.mjs so every script handles the
// "never registered" case the same way.
export async function fetchStakeAccount(stakeAddress) {
  try {
    return await blockchainProvider.get(`/accounts/${stakeAddress}`);
  } catch (err) {
    const status = err.status_code ?? err.status ?? err.response?.status;
    if (status === 404) return null;
    throw err;
  }
}

// checkDelegationStatus — decide whether a planned delegation is a no-op,
// drifted, or worth proceeding with.
//
//   member:        a row from _1_members.json (uses member.stakeAddress and
//                  member.delegations).
//   targetPoolId:  the pool we are about to delegate to (bech32 'pool1...').
//
// Returns { skip, drift, chainPool, historyPool, latestEntry }:
//   skip         — true when the target equals BOTH the latest history entry
//                  AND the on-chain delegation; safe to skip with no fee paid.
//   drift        — true when history and chain disagree. Two common causes:
//                  (a) a delegation tx was built but never submitted, or
//                  (b) _1_members.json was edited by hand or fell out of sync.
//                  The caller is expected to refuse and ask the user to
//                  reconcile manually rather than auto-fix the file, because
//                  the right reconciliation depends on context.
//   chainPool    — current on-chain pool, or null if unregistered/undelegated.
//   historyPool  — newest delegations[] entry's poolId, or null if none.
//   latestEntry  — the full newest delegations[] entry (for log lines that
//                  want requestedAt/txHash), or null.
export async function checkDelegationStatus(member, targetPoolId) {
  const delegations = Array.isArray(member.delegations) ? member.delegations : [];
  const latestEntry = delegations.length > 0 ? delegations[delegations.length - 1] : null;
  const historyPool = latestEntry?.poolId ?? null;

  const account   = await fetchStakeAccount(member.stakeAddress);
  const chainPool = account?.pool_id ?? null;

  return {
    skip:  chainPool === targetPoolId && historyPool === targetPoolId,
    drift: chainPool !== historyPool,
    chainPool,
    historyPool,
    latestEntry,
  };
}
