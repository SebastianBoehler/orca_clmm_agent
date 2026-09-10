# Orca Whirlpool Position Management Example

This example demonstrates how to fetch and analyze Orca Whirlpool positions for a given wallet address using TypeScript.

## Setup and Dependencies

```typescript
// Required imports
import { fetchPositionsForOwner, PositionData, setWhirlpoolsConfig } from '@orca-so/whirlpools';
import { createSolanaRpc, mainnet, address } from '@solana/web3.js';
import { isPositionInRange, tickIndexToPrice, priceToSqrtPrice } from '@orca-so/whirlpools-core';
```

## Key Steps

### 1. Initialize Orca Configuration

```typescript
// Set up Orca Whirlpools configuration for mainnet
await setWhirlpoolsConfig('solanaMainnet');

// Create RPC connection
const rpc = createSolanaRpc(mainnet(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com'));
```

### 2. Fetch Whirlpool Data

```typescript
// Fetch whirlpool list from Orca API
const whirlpoolsResponse = await fetch('https://api.mainnet.orca.so/v1/whirlpool/list');
const whirlpoolsData = await whirlpoolsResponse.json();

// Create a map for quick lookup
const whirlpoolsMap = new Map(whirlpoolsData.whirlpools.map(pool => [pool.address, pool]));
```

### 3. Fetch Wallet Positions

```typescript
// Convert wallet address string to PublicKey
const owner = address(walletAddress);

// Fetch all positions for the owner
const positions = await fetchPositionsForOwner(rpc, owner);
```

### 4. Analyze Position Ranges

For each position, we need to:
1. Get the whirlpool info
2. Calculate if the position is in range
3. Convert tick indices to prices for display

```typescript
for (const position of positions) {
    // Skip position bundles
    if (position.isPositionBundle) continue;

    const whirlpoolAddr = position.data.whirlpool.toString();
    const whirlpoolInfo = whirlpoolsMap.get(whirlpoolAddr);
    if (!whirlpoolInfo) continue;

    // Convert current price to sqrt price for range comparison
    const sqrtPrice = priceToSqrtPrice(
        whirlpoolInfo.price,
        whirlpoolInfo.tokenA.decimals,
        whirlpoolInfo.tokenB.decimals
    );

    // Check if position is in range
    const isInRange = isPositionInRange(
        sqrtPrice,
        position.data.tickLowerIndex,
        position.data.tickUpperIndex
    );

    // Convert tick indices to actual prices for display
    const lowerPrice = tickIndexToPrice(
        position.data.tickLowerIndex,
        whirlpoolInfo.tokenA.decimals,
        whirlpoolInfo.tokenB.decimals
    );
    const upperPrice = tickIndexToPrice(
        position.data.tickUpperIndex,
        whirlpoolInfo.tokenA.decimals,
        whirlpoolInfo.tokenB.decimals
    );
}
```

## Important Functions Explained

### priceToSqrtPrice
Converts a decimal price to sqrt price format required by Orca's position range checks.
```typescript
const sqrtPrice = priceToSqrtPrice(price, decimalsA, decimalsB);
```

### isPositionInRange
Checks if a position is currently in range based on the sqrt price and tick indices.
```typescript
const isInRange = isPositionInRange(sqrtPrice, tickLowerIndex, tickUpperIndex);
```

### tickIndexToPrice
Converts a tick index to its corresponding price.
```typescript
const price = tickIndexToPrice(tickIndex, decimalsA, decimalsB);
```

## Data Structures

### WhirlpoolInfo
Contains information about a specific whirlpool:
```typescript
interface WhirlpoolInfo {
    address: string;
    tokenA: WhirlpoolToken;
    tokenB: WhirlpoolToken;
    price: number;
    tickSpacing: number;
    // ... other fields
}
```

### WhirlpoolToken
Contains token-specific information:
```typescript
interface WhirlpoolToken {
    mint: string;
    symbol: string;
    decimals: number;
    // ... other fields
}
```

## Error Handling Tips

1. Always check if position is not a bundle before processing
2. Verify whirlpool info exists before attempting to use it
3. Handle decimal to sqrt price conversions carefully
4. Use appropriate number formats (BigInt vs number) as required by the SDK

## Display Format Example

```typescript
console.log(`Position ${position.data.positionMint}:`);
console.log(`  Status: ${isInRange ? '🟢 In Range' : '🔴 Out of Range'}`);
console.log(`  Tokens: ${whirlpoolInfo.tokenA.symbol}/${whirlpoolInfo.tokenB.symbol}`);
console.log(`  Current Market Price: ${whirlpoolInfo.price.toFixed(6)} ${whirlpoolInfo.tokenB.symbol}`);
console.log(`  Position Range:`);
console.log(`    Lower: ${lowerPrice.toFixed(6)} ${whirlpoolInfo.tokenB.symbol}`);
console.log(`    Upper: ${upperPrice.toFixed(6)} ${whirlpoolInfo.tokenB.symbol}`);
```
