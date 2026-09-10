import { openPositionInstructions, setDefaultFunder } from "@orca-so/whirlpools";
import {
  executeAfterSimulation,
  formatRaw,
  liveEnabled,
  loadRuntime,
  parseAddressEnv,
  printLiveHeader,
  requireNumberEnv,
} from "./common.ts";

const { rpc, wallet } = await loadRuntime();
setDefaultFunder(wallet);
await printLiveHeader(wallet);

const pool = parseAddressEnv("ORCA_POOL");
const lowerPrice = requireNumberEnv("LOWER_PRICE");
const upperPrice = requireNumberEnv("UPPER_PRICE");
const slippageBps = Number(process.env.SLIPPAGE_BPS || "100");
const tokenMaxA = BigInt(process.env.TOKEN_MAX_A_RAW || process.env.TOKEN_A_RAW || "0");
const tokenMaxB = BigInt(process.env.TOKEN_MAX_B_RAW || process.env.TOKEN_B_RAW || "0");
const quoteParam = { tokenMaxA, tokenMaxB };

if (tokenMaxA === 0n && tokenMaxB === 0n) {
  throw new Error("Set TOKEN_MAX_A_RAW and/or TOKEN_MAX_B_RAW");
}

const result = await openPositionInstructions(
  rpc,
  pool,
  quoteParam,
  lowerPrice,
  upperPrice,
  { slippageToleranceBps: slippageBps, funder: wallet },
);

console.log(`Position mint: ${result.positionMint}`);
console.log(`Initialization cost lamports: ${result.initializationCost}`);
console.log(`Token max A: ${tokenMaxA} raw (${formatRaw(tokenMaxA, 9)} if 9 decimals)`);
console.log(`Token max B: ${tokenMaxB} raw (${formatRaw(tokenMaxB, 6)} if 6 decimals)`);
console.log(`Instruction count: ${result.instructions.length}`);

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 to submit this bounded open transaction.");
  process.exit(0);
}

const signature = await executeAfterSimulation(rpc, wallet, result.instructions);
console.log(`Submitted open transaction: ${signature}`);
