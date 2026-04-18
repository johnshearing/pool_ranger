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

// ── Blockchain provider (Blockfrost, Preview testnet) ──────────────────────
export const blockchainProvider = new BlockfrostProvider(process.env.BLOCKFROST_API);

// ── TxBuilder factory ──────────────────────────────────────────────────────
// Returns a fresh MeshTxBuilder per transaction. Do not reuse across txs.
export function getTxBuilder() {
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

// For address-only wallets (Ledger hardware wallet — admin and production members).
// Returns the address string; cannot be used to sign.
export function loadAddressOnly(addrPath) {
  return fs.readFileSync(addrPath, 'utf8').trim();
}

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
