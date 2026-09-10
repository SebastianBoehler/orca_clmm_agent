import {
  explicitLiveActionEnabled,
  getLIFISwapQuote,
  swapAssets,
} from "orca-clmm-agent";
import bs58 from "bs58";
import {
  loadRuntime,
  printLiveHeader,
  requireEnv,
  requireNumberEnv,
} from "./common.ts";

const { rpc, wallet, walletBytes } = await loadRuntime();
await printLiveHeader(wallet);

const fromAmount = requireEnv("FROM_AMOUNT_RAW");
const fromTokenAddress = requireEnv("FROM_TOKEN");
const toTokenAddress = requireEnv("TO_TOKEN");
const slippage = Number(process.env.SLIPPAGE || "0.005");
const maxPriceImpact = Number(process.env.MAX_PRICE_IMPACT || "0.02");
const maxGasUSD = process.env.MAX_GAS_USD ? requireNumberEnv("MAX_GAS_USD") : undefined;

const quote = await getLIFISwapQuote({
  fromAmount,
  fromTokenAddress,
  toTokenAddress,
  privateKey: bs58.encode(walletBytes),
  slippage,
  maxPriceImpact,
  maxGasUSD,
});

console.log(`From amount raw: ${quote.action.fromAmount}`);
console.log(`Expected to amount raw: ${quote.estimate.toAmount}`);
console.log(`Estimated from USD: ${quote.estimate.fromAmountUSD}`);
console.log(`Estimated to USD: ${quote.estimate.toAmountUSD}`);
console.log(`Gas USD: ${quote.estimate.gasCosts?.[0]?.amountUSD || "0"}`);

if (!explicitLiveActionEnabled(process.env, "SUBMIT_LIFI_SWAP")) {
  console.log("Quote only. Set SUBMIT_LIFI_SWAP=1 with EXECUTE_LIVE=1 to execute this LI.FI route.");
  process.exit(0);
}

const details = await swapAssets({
  rpc,
  fromAmount,
  fromTokenAddress,
  toTokenAddress,
  walletByteArray: walletBytes,
  slippage,
  maxPriceImpact,
  maxGasUSD,
});

console.log(`Submitted swap transaction: ${details.signature}`);
