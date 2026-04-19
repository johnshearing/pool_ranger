// Submits a signed transaction hex to the Cardano Preview testnet via Blockfrost.
//
// Usage (from ranger/):
//   node _submit_tx.mjs <signed-tx-hex>

import { blockchainProvider } from './common/common.mjs';

const signedTxHex = process.argv[2];

if (!signedTxHex) {
  console.error('Usage: node _submit_tx.mjs <signed-tx-hex>');
  process.exit(1);
}

const txHash = await blockchainProvider.submitTx(signedTxHex);
console.log('Submitted! Tx hash:', txHash);
