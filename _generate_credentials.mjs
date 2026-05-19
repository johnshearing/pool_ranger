// Creates a software wallet for testing.
//
// Output:
//   0_admin_0.sk   — root private key (BIP32 bech32) — KEEP SECRET, never share
//
// The wallet's address is printed to the console. There are no .addr files
// anymore — addresses live in _1_members.json. To enrol this wallet into the
// cooperative, copy the printed address and run:
//
//   node _register_stake.mjs --name <name> --addr <printed-address>
//
// The production admin and members all use a Ledger hardware wallet, not a
// software wallet — this script is kept around only for automated testing
// scenarios. See the hardware-wallet scaffold at the bottom of this file for
// integration paths.

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

// Print the first unused address — copy this into _register_stake.mjs --addr.
const admin_address = (await admin_wallet.getUnusedAddresses())[0];

console.log('Admin wallet created successfully.');
console.log('Address  :', admin_address);
console.log('Key file : 0_admin_0.sk  (keep secret)');
console.log('');
console.log('Next step: enrol this wallet by copying the address above into:');
console.log(`  node _register_stake.mjs --name admin_0 --addr ${admin_address}`);


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
