# Orca CLMM Agent

[![CI](https://github.com/SebastianBoehler/orca_clmm_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/SebastianBoehler/orca_clmm_agent/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orca-clmm-agent.svg)](https://www.npmjs.com/package/orca-clmm-agent)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/SebastianBoehler/orca_clmm_agent/blob/main/LICENSE)

A TypeScript library for managing and analyzing Orca Whirlpool concentrated
liquidity positions on Solana.

> Transaction warning: helpers such as `openPosition`,
> `openPositionWithBaseToken`, `closePositionAndHarvestYield`, and
> `closePositionWithBaseToken` can send real mainnet transactions when passed a
> live signer. Use a limited hot wallet for testing.

## Features

- Fetch and analyze Orca Whirlpool positions for a wallet
- Calculate position balance and relative position within price range
- Convert tick indices to prices and vice versa
- Fetch fee quotes and convert to human-readable format
- Analyze position status (in-range, out-of-range)

## Installation

```bash
npm install orca-clmm-agent
# or
yarn add orca-clmm-agent
# or
bun add orca-clmm-agent
```

## Usage

### Loading Positions

```typescript
import { getOrcaPositions } from "orca-clmm-agent";
import { createSolanaRpc, mainnet } from "@solana/kit";

// Create RPC connection
const rpc = createSolanaRpc(mainnet("https://api.mainnet-beta.solana.com"));

// Get positions for a wallet
const walletAddress = "";
const positions = await getOrcaPositions(walletAddress, rpc); // getDetailedPositions(walletAddress, rpc)

// Process positions
for (const position of positions) {
  console.log(`Position ${position.name}:`);
  console.log(`Current Price: ${position.currentMarketPrice}`);
  console.log(`In Range: ${position.isInRange}`);
}
```

### Test Lanes

The default test lane is offline and suitable for CI:

```bash
npm run build
npm run test:unit
```

Integration tests hit live Solana/Orca infrastructure and may require a paid or
high-quota RPC endpoint:

```bash
RPC_URL=https://your-rpc.example npm run test:integration
```

### Open Position Example

```typescript
import { setDefaultFunder } from "@orca-so/whirlpools";
import * as dotenv from "dotenv";
import { loadKeypairFromFile } from "./solana";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  mainnet,
} from "@solana/kit";
import { fetchOrcaPoolByAddress, openPosition } from "orca-clmm-agent";

dotenv.config();

async function openPositionExample() {
  const bytes = await loadKeypairFromFile("./examples/keypair.json");
  const wallet = await createKeyPairSignerFromBytes(bytes);
  setDefaultFunder(wallet);

  const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
  const rpc = createSolanaRpc(mainnet(rpcUrl));

  const whirlpoolAddress = address(
    "CJX9KVBAwobF7ijE7cd4kujyaHw2QCjyN9be94i5Seyo"
  );
  const pool = await fetchOrcaPoolByAddress(whirlpoolAddress);
  const onChainPool = await getOnChainPool(pool, rpc); // for latest price

  await openPosition({
    rpc,
    whirlpoolAddress,
    params: { tokenMaxA: 1_000_000n, tokenMaxB: 0n },
    price: onChainPool.price,
    lowerMultiple: 0.9,
    upperMultiple: 1.1,
    slippageToleranceBps: 100,
    wallet,
  });
}

openPositionExample();
```

## License

MIT

### Visualizing Liquidity Depth

The example script `examples/getLiquidityInTicks.ts` exports a `points.json` file containing the global liquidity at each tick. Use `examples/main.py` to plot bid and ask depth around the current price. The values in `points.json` are cumulative – do not sum them again when graphing.
