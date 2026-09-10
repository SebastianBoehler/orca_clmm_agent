const _ = require('lodash');

/**
 * Extracts, maps, and upserts unique tokens from pools into Supabase.
 */
async function saveTokens(pools, supabase) {
  const tokensA = pools.map(pool => pool.tokenA);
  const tokensB = pools.map(pool => pool.tokenB);
  const tokens = [...tokensA, ...tokensB];
  const uniqueTokens = Array.from(
    new Map(tokens.map(token => [token.address, token])).values()
  );
  const tokensForSupabase = uniqueTokens.map(token => ({
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
    imageUrl: token.imageUrl,
    programId: token.programId,
    name: token.name,
  }));
  const { error } = await supabase
    .from('tokens')
    .upsert(tokensForSupabase, { onConflict: 'address' });
  if (error) {
    throw error;
  }
  return tokensForSupabase.length;
}

/**
 * Maps and upserts pools into Supabase.
 */
async function savePools(pools, supabase) {
  const poolsForSupabase = pools.map(pool => ({
    address: pool.address,
    whirlpoolsConfig: pool.whirlpoolsConfig,
    tickSpacing: pool.tickSpacing,
    feeRate: pool.feeRate,
    protocolFeeRate: pool.protocolFeeRate,
    liquidity: pool.liquidity,
    sqrtPrice: pool.sqrtPrice,
    tickCurrentIndex: pool.tickCurrentIndex,
    protocolFeeOwedA: pool.protocolFeeOwedA,
    protocolFeeOwedB: pool.protocolFeeOwedB,
    tvlUsdc: pool.tvlUsdc,
    fees24h: pool.stats && pool.stats["24h"] ? pool.stats["24h"].fees : null,
    volume24h: pool.stats && pool.stats["24h"] ? pool.stats["24h"].volume : null,
    tokenMintA: pool.tokenMintA,
    tokenVaultA: pool.tokenVaultA,
    feeGrowthGlobalA: pool.feeGrowthGlobalA,
    tokenMintB: pool.tokenMintB,
    tokenVaultB: pool.tokenVaultB,
    feeGrowthGlobalB: pool.feeGrowthGlobalB,
    rewardLastUpdatedTimestamp: pool.rewardLastUpdatedTimestamp,
    updatedAt: new Date().toISOString(),
    poolType: pool.poolType
  }));
  const { error } = await supabase
    .from('pools')
    .upsert(poolsForSupabase, { onConflict: 'address' });
  if (error) {
    throw error;
  }
  return poolsForSupabase.length;
}

/**
 * Maps price rows and inserts them in chunks.
 */
async function saveSnapshot(pools, supabase, chunkSize = 10) {
  const rows = pools.map(pool => ({
    price: pool.price,
    poolAddress: pool.address,
    timestamp: new Date().toISOString(),
    volume1h: pool.stats['1h']?.volume,
    fees1h: pool.stats['1h']?.fees,
    liquidity: pool.liquidity,
  }));
  const chunks = _.chunk(rows, chunkSize);
  let totalInserted = 0;
  for (const chunk of chunks) {
    const { error } = await supabase
      .from('snapshots')
      .insert(chunk);
    if (error) {
      throw error;
    }
    totalInserted += chunk.length;
  }
  return totalInserted;
}

module.exports = { saveTokens, savePools, saveSnapshot };
