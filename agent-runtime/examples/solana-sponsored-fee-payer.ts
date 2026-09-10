import { SystemProgram } from "@solana/web3.js";
import {
  executeWeb3AfterSimulation,
  getSolAndTokenBalances,
  liveEnabled,
  loadWeb3Runtime,
  printBalanceSummary,
  rpcUrl,
} from "./common.ts";
import { createSolanaRpc, mainnet, address } from "@solana/kit";

const { connection, keypair, feePayer } = await loadWeb3Runtime();
const rpc = createSolanaRpc(mainnet(rpcUrl));

console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
console.log(`Sponsored fee payer: ${feePayer ? feePayer.publicKey.toBase58() : "disabled"}`);
console.log(`Live execution: ${liveEnabled() ? "enabled" : "disabled"}`);

const [walletBalances, feePayerLamports] = await Promise.all([
  getSolAndTokenBalances(rpc, address(keypair.publicKey.toBase58())),
  feePayer ? connection.getBalance(feePayer.publicKey, "confirmed") : Promise.resolve(undefined),
]);

printBalanceSummary("Wallet", walletBalances);
if (feePayerLamports !== undefined) {
  console.log(`Fee payer SOL: ${feePayerLamports / 1_000_000_000}`);
}

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 and SOLANA_SPONSORED_SELF_TEST=1 to submit a sponsored self-test.");
  process.exit(0);
}

if (!feePayer) {
  throw new Error("Missing SOLANA_FEE_PAYER_KEYPAIR_PATH for sponsored live execution");
}
if (process.env.SOLANA_SPONSORED_SELF_TEST !== "1") {
  throw new Error("Refusing live sponsored self-test without SOLANA_SPONSORED_SELF_TEST=1");
}

const instruction = SystemProgram.transfer({
  fromPubkey: keypair.publicKey,
  toPubkey: keypair.publicKey,
  lamports: 0,
});

const signature = await executeWeb3AfterSimulation(connection, keypair, [instruction], [], feePayer);
console.log(`Submitted sponsored Solana self-test: ${signature}`);
