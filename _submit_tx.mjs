// Submits a signed transaction to the Cardano Preview testnet via Blockfrost.
//
// Usage (from ranger/):
//   node _submit_tx.mjs <signed-tx-hex>
//   node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>   ← output from sign_tx.html
//
// When given two arguments, the witnesses from <witness-hex> are MERGED into
// the unsigned tx's existing witness set — preserving any script witnesses
// and redeemers already attached during tx building (required for delegation
// and other script-cert transactions). The tx body bytes are preserved
// exactly, so the Ledger's signature remains valid.

import { blockchainProvider } from './common/common.mjs';
import pkg from 'cbor';
const { decodeFirstSync, encode } = pkg;

const [arg1, arg2] = [process.argv[2], process.argv[3]];

if (!arg1) {
  console.error('Usage:');
  console.error('  node _submit_tx.mjs <signed-tx-hex>');
  console.error('  node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>');
  process.exit(1);
}

// Merge two CBOR witness-set Maps. Existing entries are kept; new entries are
// added. When the same key appears in both, arrays are concatenated, Sets are
// unioned, and Maps are merged (with new entries winning on collision).
function mergeWitnessSets(existing, fresh) {
  const out = new Map(existing);
  for (const [k, v] of fresh.entries()) {
    if (!out.has(k)) {
      out.set(k, v);
      continue;
    }
    const cur = out.get(k);
    if (Array.isArray(cur) && Array.isArray(v)) {
      out.set(k, [...cur, ...v]);
    } else if (cur instanceof Set && v instanceof Set) {
      const merged = new Set(cur);
      for (const item of v) merged.add(item);
      out.set(k, merged);
    } else if (cur instanceof Map && v instanceof Map) {
      const merged = new Map(cur);
      for (const [mk, mv] of v.entries()) merged.set(mk, mv);
      out.set(k, merged);
    } else {
      // Fallback: prefer the fresh value.
      out.set(k, v);
    }
  }
  return out;
}

let txToSubmit;

if (arg2) {
  const tx = decodeFirstSync(Buffer.from(arg1, 'hex'));
  const freshWS = decodeFirstSync(Buffer.from(arg2, 'hex'));
  const existingWS = tx[1] instanceof Map ? tx[1] : new Map();
  tx[1] = mergeWitnessSets(existingWS, freshWS);
  txToSubmit = encode(tx).toString('hex');
  console.log('Merged signed witness into unsigned tx witness set.');
} else {
  txToSubmit = arg1;
}

const txHash = await blockchainProvider.submitTx(txToSubmit);
console.log('Submitted! Tx hash:', txHash);
