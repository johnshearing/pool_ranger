// Transfers funds from a software-wallet source (.sk file) to a destination
// address on the Cardano Preview testnet.
//
// The destination address is supplied on the command line as a bech32 string
// (addr_test1... on Preview, addr1... on mainnet).
//
// The source wallet is a software wallet whose root key lives at SOURCE_SK_PATH.
// This script is intended for funding addresses from a development wallet
// (e.g., ../hello-world/me.sk on the Preview testnet). It auto-signs and submits.
//
// Usage (from ranger/):
//   node _transfer_funds.mjs --addr <bech32-address>
//   node _transfer_funds.mjs --help

import fs from "node:fs";
import dotenv from "dotenv";
import {
  BlockfrostProvider,
  MeshTxBuilder,
  MeshWallet,
} from "@meshsdk/core";

dotenv.config(); // loads BLOCKFROST_API from .env

// ==================== CONFIG ====================
const SOURCE_SK_PATH  = "../hello-world/me.sk";  // funding wallet (software, has .sk)
const AMOUNT_ADA      = "400";                   // tADA to send — edit if you need a different amount
const AMOUNT_LOVELACE = String(Number(AMOUNT_ADA) * 1_000_000);
const NETWORK_ID      = 0;                       // 0 = Preview testnet
// ===============================================

const HELP = `Usage:
  node _transfer_funds.mjs --addr <bech32-address>

Options:
  --addr <bech32>   Destination address (Cardano bech32: addr_test1... on Preview,
                    addr1... on mainnet).
  -h, --help        Show this help text and exit.

This script sends ${AMOUNT_ADA} tADA from the software wallet at
${SOURCE_SK_PATH} to the destination, on the Preview testnet. The source wallet
auto-signs and submits. To change the amount, edit AMOUNT_ADA at the top of
this file.

Example:
  node _transfer_funds.mjs --addr addr_test1qztu6w6r3uy842psrgg2qy6ac0vc...`;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag.startsWith("--")) {
      args[flag.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0 || rawArgs.includes("-h") || rawArgs.includes("--help")) {
  const askedForHelp = rawArgs.includes("-h") || rawArgs.includes("--help");
  (askedForHelp ? console.log : console.error)(HELP);
  process.exit(askedForHelp ? 0 : 1);
}

const args = parseArgs(process.argv);
if (!args.addr) {
  console.error("Missing required argument: --addr <bech32>\n");
  console.error(HELP);
  process.exit(1);
}
if (!(args.addr.startsWith("addr_test1") || args.addr.startsWith("addr1"))) {
  console.error(`Error: --addr must be a bech32 Cardano address (addr_test1... or addr1...), got: ${args.addr}\n`);
  console.error(HELP);
  process.exit(1);
}
const receiverAddress = args.addr;

async function main() {
  console.log("🔄 Loading wallets and provider...");

  // 1. Load Blockfrost provider (same as the tutorial scripts)
  const provider = new BlockfrostProvider(process.env.BLOCKFROST_API);

  // 2. Load the source wallet (the one with the balance)
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

  // 3. Get sender details
  const senderAddress = (await senderWallet.getUsedAddresses())[0];
  const utxos = await senderWallet.getUtxos();

  console.log(`📤 Sending ${AMOUNT_ADA} ADA from ${senderAddress}`);
  console.log(`📥 To: ${receiverAddress}`);

  // 4. Build the transaction
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });

  await txBuilder
    .txOut(receiverAddress, [{ unit: "lovelace", quantity: AMOUNT_LOVELACE }])
    .changeAddress(senderAddress)          // any leftover ADA returns here
    .selectUtxosFrom(utxos)                // Mesh automatically picks inputs
    .complete();

  // 5. Sign and submit
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
