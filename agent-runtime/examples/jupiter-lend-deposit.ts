import { getDepositIxs, getWithdrawIxs } from "@jup-ag/lend/earn";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  executeWeb3AfterSimulation,
  liveEnabled,
  loadWeb3Runtime,
  requireEnv,
} from "./common.ts";

const { connection, keypair } = await loadWeb3Runtime();
const asset = new PublicKey(requireEnv("JUP_LEND_ASSET"));
const amount = new BN(requireEnv("JUP_LEND_AMOUNT_RAW"));
const action = (process.env.JUP_LEND_ACTION || "deposit").toLowerCase();

const { ixs } = action === "withdraw"
  ? await getWithdrawIxs({ amount, asset, signer: keypair.publicKey, connection })
  : await getDepositIxs({ amount, asset, signer: keypair.publicKey, connection });

console.log(JSON.stringify({
  wallet: keypair.publicKey.toBase58(),
  action,
  asset: asset.toBase58(),
  amountRaw: amount.toString(),
  instructionCount: ixs.length,
  live: liveEnabled(),
}, null, 2));

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 to submit this Jupiter Lend transaction.");
  process.exit(0);
}

const signature = await executeWeb3AfterSimulation(connection, keypair, ixs);
console.log(`Submitted Jupiter Lend transaction: ${signature}`);
