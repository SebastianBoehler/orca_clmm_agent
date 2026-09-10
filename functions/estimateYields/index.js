const functions = require('@google-cloud/functions-framework');
const { getEstimatedYield, fetchOrcaPools, preloadTokens, USDC_MINT_ADDRESS, SOL_MINT_ADDRESS } = require('orca-clmm-agent');
const { getAveragePoolStats } = require('local-utils');
const { createClient } = require('@supabase/supabase-js');
const lodash = require('lodash');

// Supabase environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_YIELDS_TABLE = 'yields';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const checkPoolForToken = (pool) => {
  const tokenA = pool.tokenA.address === SOL_MINT_ADDRESS || pool.tokenA.address === USDC_MINT_ADDRESS
  const tokenB = pool.tokenB.address === SOL_MINT_ADDRESS || pool.tokenB.address === USDC_MINT_ADDRESS
  return tokenA || tokenB
}

/**
 * HTTP Cloud Function that estimates yields for all pools and preset ranges
 *
 * GET endpoint, no parameters.
 * For each pool, estimates yields for ranges 0.05, 0.1, 0.15.
 * Writes each chunk's results to the database (Supabase yields table).
 * Does not return yield data in the HTTP response.
 */
functions.http('estimateYields', async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    const { statsType, disableAvg } = req.query
    // Fetch all pools from Supabase
    const [pools, _] = await Promise.all([
      fetchOrcaPools(),
      preloadTokens()
    ])
    // Filter pools by numeric volume24h >= 10000
    const minVolume = 1000;
    const minTvlUsd = 1000;
    const filteredPools = pools.filter(pool => {
      const vol = parseFloat(pool.stats['24h'].volume);
      const tvl = parseFloat(pool.tvlUsdc);
      return !isNaN(vol) && vol >= minVolume && !isNaN(tvl) && tvl >= minTvlUsd && checkPoolForToken(pool);
    });
    console.log(`Filtered ${filteredPools.length} pools from ${pools.length} in database`);

    // Chunk pools in batches of 10
    const poolChunks = lodash.chunk(filteredPools, 10);
    const ranges = [0.05, 0.1, 0.15];

    for (const chunk of poolChunks) {
      // For each pool in chunk
      // Precompute average stats for each pool in the chunk
      const poolStatsCache = new Map();
      if (!disableAvg) {
        for (const pool of chunk) {
          if (!poolStatsCache.has(pool.address)) {
            const stats = await getAveragePoolStats(pool.address, parseInt(statsType));
            poolStatsCache.set(pool.address, stats);
          }
        }
      }

      const chunkResults = await Promise.all(chunk.flatMap(pool =>
        ranges.map(async range => {
          try {
            const { avgFees } = poolStatsCache.get(pool.address) || {}
            // Use dummy amounts for yield estimation but feed stats
            const yieldVal = await getEstimatedYield({
              poolAddress: pool.address,
              range,
              tokenAAmountUSD: 50,
              pool,
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

      // Filter out errored results for DB write
      const dbRows = chunkResults.filter(r => !r.error && r.yield && !isNaN(r.yield));
      if (dbRows.length > 0) {
        const { error: upsertError } = await supabase
          .from(SUPABASE_YIELDS_TABLE)
          .upsert(dbRows, { onConflict: ['poolAddress', 'range', 'statsType'] });
        if (upsertError) {
          console.error('Error upserting yields into Supabase:', upsertError);
        } else {
          //console.log(`Successfully upserted ${dbRows.length} yield rows for chunk.`);
        }
      }
      await sleep(1000 * 3);
    }

    res.status(200).json({
      success: true,
      message: 'Successfully calculated and stored yields for all pools and ranges'
    });
  } catch (error) {
    console.error('Error in estimateYields function:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate and store yields',
      error: error.message
    });
  }
});
