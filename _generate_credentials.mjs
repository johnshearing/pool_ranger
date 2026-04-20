// Creates the Pool Ranger administrator wallet.
// Run this once to generate the admin's root key and save the address.
//
// Output files (written to the current directory):
//   0_admin_0.sk   — root private key (BIP32 bech32) — KEEP SECRET, never share
//   0_admin_0.addr — first unused address for the admin wallet
//
// Hardware wallet support is scaffolded at the bottom of this file.
// Members will use a hardware wallet (Ledger / Trezor) for their staking key
// so their spending key is never exposed to the cooperative.

import fs from 'node:fs';
import {
  MeshWallet,
} from "@meshsdk/core";


// --- Software wallet (admin) ---

// Generate a root key for the admin wallet
const admin_secret_key = MeshWallet.brew(true);

// Save secret key to file — keep this file private, back it up securely
fs.writeFileSync('0_admin_0.sk', admin_secret_key);

const admin_wallet = new MeshWallet({
  networkId: 0,  // 0 = testnet (Preview), 1 = mainnet
  key: {
    type: 'root',
    bech32: admin_secret_key,
  },
});

// Save first unused address to file
const admin_address = (await admin_wallet.getUnusedAddresses())[0];
fs.writeFileSync('0_admin_0.addr', admin_address);

console.log('Admin wallet created successfully.');
console.log('Address :', admin_address);
console.log('Key file : 0_admin_0.sk  (keep secret)');
console.log('Addr file: 0_admin_0.addr');


// --- Hardware wallet scaffold (not yet implemented) ---
//
// Members keep their spending key on a hardware wallet (Ledger or Trezor).
// The cooperative only ever needs the *staking credential*, never the spending key.
// Nothing here touches member funds — only the staking key is shared.
//
// Two integration paths are planned:
//
// PATH 1 — CIP-30 browser dApp connector (Phase 2, Web UI)
//   Members connect via Eternl, Nami, Lace, Flint, or Yoroi.
//   The wallet signs stake registration and delegation certificates on the device
//   without the private key ever leaving the hardware wallet.
//   Reference: https://cips.cardano.org/cip/CIP-30
//
//   Example (browser only — not available in Node.js):
//
//   const api = await window.cardano.eternl.enable();
//   const rewardAddresses = await api.getRewardAddresses();
//   // rewardAddresses[0] is the staking credential (bech32 stake address)
//
// PATH 2 — Direct HID connection (Phase 1 CLI, future)
//   Use @ledgerhq/hw-transport-node-hid to talk to the device over USB.
//   Derive the staking public key at path m/1852'/1815'/0'/2/0 (Shelley stake key).
//   Use that public key to build stake registration and delegation transactions.
//   The member signs on the device; no private key ever leaves it.
//
//   Packages needed:
//     npm install @ledgerhq/hw-transport-node-hid
//     npm install @cardano-foundation/ledgerjs-hw-app-cardano
//
//   Example skeleton (not yet wired up):
//
//   import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
//   import Ada from '@cardano-foundation/ledgerjs-hw-app-cardano';
//
//   const transport = await TransportNodeHid.create();
//   const ada = new Ada(transport);
//   const result = await ada.getExtendedPublicKey({
//     path: "m/1852'/1815'/0'",  // account-level key
//   });
//   // result.publicKeyHex + result.chainCodeHex → derive stake credential hash
//   await transport.close();
