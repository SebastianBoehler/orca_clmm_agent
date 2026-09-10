const lodash = require('lodash');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Fetches recent price rows for a pool and aggregates average liquidity,
 * total fees and (placeholder) average reward over a given period.
 *
 * @param {string} poolAddress Orca pool address
 * @returns {Promise<{avgLiquidity:number,avgFees:number}>}
 */
async function getAveragePoolStats(poolAddress, hourBucket = 1) {
  // Fetch up to 1000 recent price entries for the pool within the period
  let { data, error } = await supabase
    .from('snapshots')
    .select('liquidity,fees1h')
    .eq('poolAddress', poolAddress)
    .order('timestamp', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Supabase error while fetching price rows:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return { avgLiquidity: 0, avgFees: 0 };
  }

  if (hourBucket > 1) {
    //bucket data int chunks and sum up over val within one chunk
    const buckets = lodash.chunk(data, hourBucket);
    data = buckets.map(bucket => {
      return {
        liquidity: Math.round(lodash.meanBy(bucket, (row) => Number(row.liquidity))), // liq avg
        fees1h: Math.round(lodash.sumBy(bucket, (row) => Number(row.fees1h))) // fees sum
      }
    });
  }

  const avgLiquidity = Math.round(lodash.meanBy(data, (row) => Number(row.liquidity) || 0));
  const avgFees = Math.round(lodash.meanBy(data, (row) => Number(row.fees1h) || 0));

  //console.log('Average liquidity:', avgLiquidity);
  //console.log('Average fees:', avgFees);
  return { avgLiquidity, avgFees };
}

module.exports = { getAveragePoolStats };
