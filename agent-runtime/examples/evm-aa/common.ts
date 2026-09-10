import { createPublicClient, http, isHex, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPaymasterClient, entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { pimlicoSlugForChain, resolveEvmChain, supportedEvmChains } from "./chains.ts";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function liveEnabled(): boolean {
  return process.env.EXECUTE_LIVE === "1";
}

export function loadEvmConfig() {
  const chain = resolveEvmChain(process.env.EVM_CHAIN || "base");
  const rpcUrl = process.env.EVM_RPC_URL || chain.rpcUrls.default.http[0];
  const pimlicoApiKey = process.env.PIMLICO_API_KEY;
  const pimlicoSlug = pimlicoSlugForChain(chain.id);
  const pimlicoUrl = process.env.PIMLICO_RPC_URL || (
    pimlicoApiKey
      ? `https://api.pimlico.io/v2/${pimlicoSlug}/rpc?apikey=${pimlicoApiKey}`
      : undefined
  );
  return { chain, rpcUrl, pimlicoUrl };
}

export async function loadSmartAccount(chain: Chain, rpcUrl: string, pimlicoUrl?: string) {
  const privateKey = requirePrivateKey();
  const owner = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner,
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const paymaster = pimlicoUrl ? createPaymasterClient({ transport: http(pimlicoUrl) }) : undefined;
  const smartClient = pimlicoUrl
    ? createSmartAccountClient({
      account,
      chain,
      bundlerTransport: http(pimlicoUrl),
      paymaster,
    })
    : undefined;

  return { account, owner, publicClient, smartClient };
}

function requirePrivateKey(): Hex {
  const value = requireEnv("EVM_PRIVATE_KEY");
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!isHex(normalized) || normalized.length !== 66) {
    throw new Error("EVM_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return normalized;
}

export function printSupportedChains() {
  console.log(`Supported EVM chains: ${JSON.stringify(supportedEvmChains())}`);
}
