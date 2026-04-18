// Checks specified wallet balances.
//
// Each entry in WALLETS uses one of two modes:
//   { name, skPath }   — software wallet: derives address from root key file
//   { name, addrPath } — address-only: looks up UTxOs directly (no private key needed;
//                        works for hardware wallets like Ledger where there is no .sk file)

import fs from "node:fs";
import dotenv from "dotenv";
import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";

dotenv.config(); // Loads BLOCKFROST_API from .env

// ==================== CONFIG ====================
const WALLETS = [
  { name: "Original (hello-world)", skPath: "../hello-world/me.sk" },
  { name: "Admin (Ledger)",         addrPath: "./0_admin.addr" },
  { name: "Member_1 (Ledger)",         addrPath: "./0_member_1.addr" },
  { name: "Member_2 (Ledger)",         addrPath: "./0_member_2.addr" }   
];

const NETWORK_ID = 0; // 0 = Preview testnet
// ===============================================

async function main() {
  console.log("Checking balances on Cardano Preview testnet...\n");

  const provider = new BlockfrostProvider(process.env.BLOCKFROST_API);

  for (const walletInfo of WALLETS) {
    try {
      let address;
      let utxos;

      if (walletInfo.skPath) {
        // Software wallet — derive address from root key
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

      } else if (walletInfo.addrPath) {
        // Address-only wallet (hardware wallet) — query UTxOs directly
        address = fs.readFileSync(walletInfo.addrPath, "utf8").trim();
        utxos = await provider.fetchAddressUTxOs(address);
      }

      let totalLovelace = 0;
      utxos.forEach((utxo) => {
        const lovelaceAsset = utxo.output.amount.find(a => a.unit === "lovelace");
        if (lovelaceAsset) totalLovelace += parseInt(lovelaceAsset.quantity);
      });

      const totalAda = (totalLovelace / 1_000_000).toFixed(6);

      console.log(`${walletInfo.name}`);
      console.log(`   Address : ${address}`);
      console.log(`   Balance : ${totalAda} tADA (${totalLovelace} lovelace)`);
      console.log(`   UTxOs   : ${utxos.length}`);
      console.log("   ────────────────────────────────\n");

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