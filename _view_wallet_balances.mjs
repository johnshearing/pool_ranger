// Checks wallet balances for everyone in the cooperative.
//
// Source of truth: ./_1_members.json. The script reads the member directory,
// then for each member queries Blockfrost for the UTxOs at member.address
// (their Ledger receive address) and prints the ADA balance.
//
// There are no .addr files — all addresses now live in _1_members.json.
//
// Optional EXTRA_WALLETS block below: lets you check a few non-member wallets
// (e.g. the hello-world software wallet kept for testing). Each entry has:
//   { name, skPath }   — software wallet: derive address from a root key file
//   { name, address }  — address-only: look up UTxOs directly

import fs from "node:fs";
import dotenv from "dotenv";
import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";

dotenv.config(); // Loads BLOCKFROST_API from .env

// ==================== CONFIG ====================
const MEMBERS_FILE = "./_1_members.json";

// Non-member wallets to also check. Leave empty if you only care about the
// cooperative directory. Useful for keeping an eye on test/funding wallets.
const EXTRA_WALLETS = [
  { name: "Original (hello-world)", skPath: "../hello-world/me.sk" },
];

const NETWORK_ID = 0; // 0 = Preview testnet
// ===============================================

function loadMembers() {
  if (!fs.existsSync(MEMBERS_FILE)) {
    console.error(`Member directory not found: ${MEMBERS_FILE}`);
    console.error("Register members first with _register_stake.mjs.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(MEMBERS_FILE, "utf8"));
}

async function printBalance(label, address, utxos) {
  let totalLovelace = 0;
  utxos.forEach((utxo) => {
    const lovelaceAsset = utxo.output.amount.find(a => a.unit === "lovelace");
    if (lovelaceAsset) totalLovelace += parseInt(lovelaceAsset.quantity);
  });

  const totalAda = (totalLovelace / 1_000_000).toFixed(6);

  console.log(`${label}`);
  console.log(`   Address : ${address}`);
  console.log(`   Balance : ${totalAda} tADA (${totalLovelace} lovelace)`);
  console.log(`   UTxOs   : ${utxos.length}`);
  console.log("   ────────────────────────────────\n");
}

async function main() {
  console.log("Checking balances on Cardano Preview testnet...\n");

  const provider = new BlockfrostProvider(process.env.BLOCKFROST_API);

  // ── Cooperative members (from _1_members.json) ───────────────────────────
  const members = loadMembers();
  for (const member of members) {
    try {
      const utxos = await provider.fetchAddressUTxOs(member.address);
      await printBalance(`${member.name} (Ledger)`, member.address, utxos);
    } catch (err) {
      console.log(`Failed to check ${member.name}:`);
      console.log(`   ${err.message}\n`);
    }
  }

  // ── Extra non-member wallets (optional) ──────────────────────────────────
  for (const walletInfo of EXTRA_WALLETS) {
    try {
      let address;
      let utxos;

      if (walletInfo.skPath) {
        const skBech32 = fs.readFileSync(walletInfo.skPath, "utf8").trim();
        const wallet = new MeshWallet({
          networkId: NETWORK_ID,
          fetcher: provider,
          submitter: provider,
          key: { type: "root", bech32: skBech32 },
        });
        address = (await wallet.getUsedAddresses())[0]
               ?? (await wallet.getUnusedAddresses())[0];
        utxos = await wallet.getUtxos();
      } else if (walletInfo.address) {
        address = walletInfo.address;
        utxos = await provider.fetchAddressUTxOs(address);
      } else {
        console.log(`Skipping ${walletInfo.name}: no skPath or address provided.\n`);
        continue;
      }

      await printBalance(walletInfo.name, address, utxos);
    } catch (err) {
      console.log(`Failed to check ${walletInfo.name}:`);
      console.log(`   ${err.message}\n`);
    }
  }

  console.log("Balance check complete.");
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
});
