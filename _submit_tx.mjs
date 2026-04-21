// Submits a signed transaction to the Cardano Preview testnet via Blockfrost.
//
// Usage (from ranger/):
//   node _submit_tx.mjs <signed-tx-hex>
//   node _submit_tx.mjs <unsigned-tx-hex> <witness-hex>   ← output from sign_tx.html

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

let txToSubmit;

if (arg2) {
  // Assemble: replace element [1] (witness set) in the unsigned tx with the signed witnesses.
  // The tx body bytes are preserved exactly — the Ledger's signature remains valid.
  const tx = decodeFirstSync(Buffer.from(arg1, 'hex'));
  tx[1] = decodeFirstSync(Buffer.from(arg2, 'hex'));
  txToSubmit = encode(tx).toString('hex');
  console.log('Assembled signed transaction from unsigned tx + witness set.');
} else {
  txToSubmit = arg1;
}

const txHash = await blockchainProvider.submitTx(txToSubmit);
console.log('Submitted! Tx hash:', txHash);
