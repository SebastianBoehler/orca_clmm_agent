import { type Address, type Hex } from "viem";
import { liveEnabled, loadEvmConfig, loadSmartAccount, requireEnv } from "./common.ts";

const { chain, rpcUrl, pimlicoUrl } = loadEvmConfig();
const { account, smartClient } = await loadSmartAccount(chain, rpcUrl, pimlicoUrl);

const quoteUrl = new URL("https://li.quest/v1/quote");
quoteUrl.searchParams.set("fromChain", process.env.LIFI_FROM_CHAIN || chain.id.toString());
quoteUrl.searchParams.set("toChain", requireEnv("LIFI_TO_CHAIN"));
quoteUrl.searchParams.set("fromToken", requireEnv("LIFI_FROM_TOKEN"));
quoteUrl.searchParams.set("toToken", requireEnv("LIFI_TO_TOKEN"));
quoteUrl.searchParams.set("fromAmount", requireEnv("LIFI_FROM_AMOUNT_RAW"));
quoteUrl.searchParams.set("fromAddress", account.address);
if (process.env.LIFI_TO_ADDRESS) quoteUrl.searchParams.set("toAddress", process.env.LIFI_TO_ADDRESS);
if (process.env.LIFI_INTEGRATOR) quoteUrl.searchParams.set("integrator", process.env.LIFI_INTEGRATOR);

const headers: Record<string, string> = { accept: "application/json" };
if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;

const response = await fetch(quoteUrl, { headers });
if (!response.ok) {
  throw new Error(`LI.FI quote failed: ${response.status} ${await response.text()}`);
}

const quote: any = await response.json();
const request = quote.transactionRequest;
console.log(`Source chain: ${chain.name} (${chain.id})`);
console.log(`Smart account fromAddress: ${account.address}`);
console.log(`Tool: ${quote.tool || quote.toolDetails?.name || "unknown"}`);
console.log(`From amount USD: ${quote.estimate?.fromAmountUSD || "unknown"}`);
console.log(`To amount USD: ${quote.estimate?.toAmountUSD || "unknown"}`);
console.log(`Gas USD: ${quote.estimate?.gasCosts?.[0]?.amountUSD || "unknown"}`);
console.log(`Transaction request present: ${Boolean(request?.to && request?.data)}`);

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 and EVM_LIFI_EXECUTE=1 to submit through the smart account.");
  process.exit(0);
}

if (!smartClient || !pimlicoUrl) {
  throw new Error("PIMLICO_API_KEY or PIMLICO_RPC_URL is required for gasless live execution");
}
if (process.env.EVM_LIFI_EXECUTE !== "1") {
  throw new Error("Refusing live LI.FI execution without EVM_LIFI_EXECUTE=1");
}
if (!request?.to || !request?.data) {
  throw new Error("LI.FI quote did not return an executable transactionRequest");
}

const hash = await smartClient.sendTransaction({
  to: request.to as Address,
  data: request.data as Hex,
  value: request.value ? BigInt(request.value) : 0n,
});
console.log(`Submitted gasless LI.FI route hash: ${hash}`);
