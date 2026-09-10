import { formatEther, parseEther, type Address, type Hex } from "viem";
import { liveEnabled, loadEvmConfig, loadSmartAccount, printSupportedChains } from "./common.ts";

const { chain, rpcUrl, pimlicoUrl } = loadEvmConfig();
const { account, owner, publicClient, smartClient } = await loadSmartAccount(chain, rpcUrl, pimlicoUrl);

console.log(`Chain: ${chain.name} (${chain.id})`);
console.log(`Owner EOA: ${owner.address}`);
console.log(`SimpleAccount: ${account.address}`);
console.log(`Execution RPC configured: ${Boolean(rpcUrl)}`);
console.log(`Pimlico bundler/paymaster configured: ${Boolean(pimlicoUrl)}`);
printSupportedChains();

const [ownerBalance, accountBalance, code] = await Promise.all([
  publicClient.getBalance({ address: owner.address }),
  publicClient.getBalance({ address: account.address }),
  publicClient.getCode({ address: account.address }),
]);

console.log(`Owner native balance: ${formatEther(ownerBalance)}`);
console.log(`SimpleAccount native balance: ${formatEther(accountBalance)}`);
console.log(`SimpleAccount deployed: ${Boolean(code && code !== "0x")}`);

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 and EVM_SELF_TEST=1 to submit a gas-sponsored self-test.");
  process.exit(0);
}

if (!smartClient || !pimlicoUrl) {
  throw new Error("PIMLICO_API_KEY or PIMLICO_RPC_URL is required for gasless live execution");
}
if (process.env.EVM_SELF_TEST !== "1") {
  throw new Error("Refusing live EVM execution without EVM_SELF_TEST=1");
}

const to = (process.env.EVM_SELF_TEST_TO || account.address) as Address;
const data = (process.env.EVM_SELF_TEST_DATA || "0x") as Hex;
const value = process.env.EVM_SELF_TEST_VALUE_ETH
  ? parseEther(process.env.EVM_SELF_TEST_VALUE_ETH)
  : 0n;

const hash = await smartClient.sendTransaction({ to, data, value });
console.log(`Submitted gasless UserOperation/transaction hash: ${hash}`);
