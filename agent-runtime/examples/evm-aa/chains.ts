import {
  arbitrum,
  avalanche,
  base,
  bsc,
  gnosis,
  linea,
  mainnet,
  optimism,
  polygon,
  scroll,
  type Chain,
} from "viem/chains";

const chains = [
  { chain: mainnet, pimlicoSlug: "ethereum" },
  { chain: arbitrum, pimlicoSlug: "arbitrum" },
  { chain: optimism, pimlicoSlug: "optimism" },
  { chain: base, pimlicoSlug: "base" },
  { chain: polygon, pimlicoSlug: "polygon" },
  { chain: bsc, pimlicoSlug: "bsc" },
  { chain: avalanche, pimlicoSlug: "avalanche" },
  { chain: gnosis, pimlicoSlug: "gnosis" },
  { chain: scroll, pimlicoSlug: "scroll" },
  { chain: linea, pimlicoSlug: "linea" },
];

export function resolveEvmChain(value: string): Chain {
  const normalized = value.toLowerCase();
  const match = chains.find(({ chain, pimlicoSlug }) =>
    chain.id.toString() === normalized ||
    chain.name.toLowerCase() === normalized ||
    pimlicoSlug === normalized,
  );
  if (!match) {
    throw new Error(`Unsupported EVM chain: ${value}`);
  }
  return match.chain;
}

export function pimlicoSlugForChain(chainId: number): string {
  const match = chains.find((item) => item.chain.id === chainId);
  if (!match) throw new Error(`Unsupported Pimlico chain id: ${chainId}`);
  return match.pimlicoSlug;
}

export function supportedEvmChains(): Array<{ id: number; name: string }> {
  return chains.map(({ chain }) => ({ id: chain.id, name: chain.name }));
}
