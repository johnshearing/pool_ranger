// Transfers funds from one wallet to another

import fs from "node:fs";
import dotenv from "dotenv";
import {
  BlockfrostProvider,
  MeshTxBuilder,
  MeshWallet,
} from "@meshsdk/core";

dotenv.config(); // loads BLOCKFROST_API from .env

// ==================== CONFIG ====================
const SOURCE_SK_PATH = "../hello-world/me.sk";   // ← change if your hello-world folder has a different name
const TARGET_ADDR_PATH = "./0_member_1.addr";         // the wallet receiving the funds
const AMOUNT_ADA = "200";                          // tADA to send — change this (minimum ~2 tADA recommended)
const AMOUNT_LOVELACE = String(Number(AMOUNT_ADA) * 1_000_000);
const NETWORK_ID = 0;                            // 0 = Preview testnet
// ===============================================

async function main() {
  console.log("🔄 Loading wallets and provider...");

  // 1. Load Blockfrost provider (same as the tutorial scripts)
  const provider = new BlockfrostProvider(process.env.BLOCKFROST_API);

  // 2. Load the OLD wallet (the one with the balance — me.sk)
  const sourceKeyBech32 = fs.readFileSync(SOURCE_SK_PATH, "utf8").trim();
  const senderWallet = new MeshWallet({
    networkId: NETWORK_ID,
    fetcher: provider,
    submitter: provider,
    key: {
      type: "root",
      bech32: sourceKeyBech32,
    },
  });

  // 3. Load the target address (0_owner.addr from the vesting project)
  const receiverAddress = fs.readFileSync(TARGET_ADDR_PATH, "utf8").trim();

  // 4. Get sender details
  const senderAddress = (await senderWallet.getUsedAddresses())[0];
  const utxos = await senderWallet.getUtxos();

  console.log(`📤 Sending ${AMOUNT_ADA} ADA from ${senderAddress}`);
  console.log(`📥 To: ${receiverAddress}`);

  // 5. Build the transaction
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });

  await txBuilder
    .txOut(receiverAddress, [{ unit: "lovelace", quantity: AMOUNT_LOVELACE }])
    .changeAddress(senderAddress)          // any leftover ADA returns here
    .selectUtxosFrom(utxos)                // Mesh automatically picks inputs
    .complete();

  // 6. Sign and submit
  const unsignedTx = txBuilder.txHex;
  const signedTx = await senderWallet.signTx(unsignedTx);
  const txHash = await senderWallet.submitTx(signedTx);

  console.log(`✅ Success! Transaction hash: ${txHash}`);
  console.log(`🔗 View on CardanoScan: https://preview.cardanoscan.io/transaction/${txHash}`);
}

main().catch((err) => {
  console.error("❌ Error:", err?.message ?? err);
  process.exit(1);
});