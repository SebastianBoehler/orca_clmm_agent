const functions = require('@google-cloud/functions-framework');
const { getEstimatedYield, fetchOrcaPools, preloadTokens } = require('orca-clmm-agent');
const { createClient } = require('@supabase/supabase-js');
const lodash = require('lodash');
const { getAveragePoolStats } = require('./utils');

async function main() {
  // Fetch all pools from Supabase
  const [pools, _] = await Promise.all([
    fetchOrcaPools(),
    preloadTokens()
  ])
  const statsType = '24h';
  // Filter pools by numeric volume24h >= 10000
  const minVolume = 1000;
  const minTvlUsd = 1000;
  const filteredPools = pools.filter(pool => {
    const vol = parseFloat(pool.stats['24h'].volume);
    const tvl = parseFloat(pool.tvlUsdc);
    return !isNaN(vol) && vol >= minVolume && !isNaN(tvl) && tvl >= minTvlUsd;
  });
  console.log(`Filtered ${filteredPools.length} pools from ${pools.length} in database`);

  // Chunk pools in batches of 10
  const poolChunks = lodash.chunk(filteredPools, 10);
  const ranges = [0.05, 0.1, 0.15];

  for (const chunk of poolChunks) {
    const poolStatsCache = new Map();
    for (const pool of chunk) {
      if (!poolStatsCache.has(pool.address)) {
        const stats = await getAveragePoolStats(pool.address, parseInt(statsType));
        poolStatsCache.set(pool.address, stats);
      }
    }
          
    // For each pool in chunk
    const chunkResults = await Promise.all(chunk.flatMap(pool =>
      ranges.map(async range => {
        try {
          const { avgFees } = poolStatsCache.get(pool.address)
          // Use dummy amounts for yield estimation
          const yieldVal = await getEstimatedYield({
            poolAddress: pool.address,
            range,
            tokenAAmountUSD: 50,
            pool,
            statsType,
            fees: avgFees
          });
          //console.log(`Estimated yield for pool ${pool.address}, range ${range}:`, yieldVal);
          return {
            poolAddress: pool.address,
            range,
            yield: yieldVal,
            updatedAt: new Date().toISOString(),
            statsType,
          };
        } catch (err) {
          console.warn(`Failed to estimate yield for pool ${pool.address}, range ${range}:`, err.message || err);
          return {
            error: err.message,
          };
        }
      })
    ));

    // find and log 55PEF93fJcnL54mSSWFmcHgPN4HY92W2t59besaDMjZc
    const pool = chunkResults.find(pool => pool.poolAddress === '55PEF93fJcnL54mSSWFmcHgPN4HY92W2t59besaDMjZc');
    if (pool) console.log(pool);
  }
}

main()
