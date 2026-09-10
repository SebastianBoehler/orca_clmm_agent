import { closePositionInstructions, setDefaultFunder } from "@orca-so/whirlpools";
import {
  executeAfterSimulation,
  getSolAndTokenBalances,
  liveEnabled,
  loadRuntime,
  parseAddressEnv,
  printBalanceSummary,
  printLiveHeader,
} from "./common.ts";

const { rpc, wallet } = await loadRuntime();
setDefaultFunder(wallet);
await printLiveHeader(wallet);

const positionMint = parseAddressEnv("POSITION_MINT");
const slippageBps = Number(process.env.SLIPPAGE_BPS || "100");
const pre = await getSolAndTokenBalances(rpc, wallet.address);
printBalanceSummary("Pre-close", pre);

const { instructions, quote, feesQuote, rewardsQuote } = await closePositionInstructions(
  rpc,
  positionMint,
  { slippageToleranceBps: slippageBps, authority: wallet },
);

console.log(`Position mint: ${positionMint}`);
console.log(`Close quote tokenEstA: ${quote.tokenEstA}`);
console.log(`Close quote tokenEstB: ${quote.tokenEstB}`);
console.log(`Fees owed A: ${feesQuote.feeOwedA}`);
console.log(`Fees owed B: ${feesQuote.feeOwedB}`);
for (const [index, reward] of rewardsQuote.rewards.entries()) {
  console.log(`Reward ${index} owed: ${reward.rewardsOwed}`);
}
console.log(`Instruction count: ${instructions.length}`);

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 to submit this close transaction.");
  process.exit(0);
}

const signature = await executeAfterSimulation(rpc, wallet, instructions);
console.log(`Submitted close transaction: ${signature}`);

const post = await getSolAndTokenBalances(rpc, wallet.address);
printBalanceSummary("Post-close", post);
console.log(`SOL delta lamports: ${post.solLamports - pre.solLamports}`);
