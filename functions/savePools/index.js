const { createClient } = require('@supabase/supabase-js');
const functions = require('@google-cloud/functions-framework');
const { fetchOrcaPools, USDC_MINT_ADDRESS, SOL_MINT_ADDRESS } = require('orca-clmm-agent');
const { saveTokens, savePools, saveSnapshot } = require('local-utils');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials in environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const checkPoolForToken = (pool) => {
  const tokenA = pool.tokenA.address === SOL_MINT_ADDRESS || pool.tokenA.address === USDC_MINT_ADDRESS
  const tokenB = pool.tokenB.address === SOL_MINT_ADDRESS || pool.tokenB.address === USDC_MINT_ADDRESS
  return tokenA || tokenB
}

/**
 * Combined HTTP Cloud Function to fetch all Orca pools, tokens, and prices, and store in Supabase
 * @param {Object} req Cloud Function request context
 * @param {Object} res Cloud Function response context
 */
functions.http('savePools', async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }
  console.log('Starting savePools function');

  try {
    // Fetch all Orca pools using the orca-clmm-agent package
    console.log('Fetching Orca pools...');
    const pools = await fetchOrcaPools();
    console.log(`Fetched ${pools.length} Orca pools`);

    const filtered = pools.filter(pool => checkPoolForToken(pool) && pool.tvlUsdc > 100);
    console.log(`Filtered ${filtered.length} pools with TVL > 100 USDC`);

    // Save tokens
    const tokenCount = await saveTokens(filtered, supabase)
      .catch(error => {
        console.error('Error saving tokens:', error);
        return 0;
      });
    console.log(`Upserted ${tokenCount} tokens into Supabase`);

    // Save pools
    const poolCount = await savePools(filtered, supabase)
      .catch(error => {
        console.error('Error saving pools:', error);
        return 0;
      });
    console.log(`Upserted ${poolCount} pools into Supabase`);

    // Save prices (chunked)
    const priceCount = await saveSnapshot(filtered, supabase, 100)
      .catch(error => {
        console.error('Error saving prices:', error);
        return 0;
      });
    console.log(`Inserted ${priceCount} pool prices into Supabase`);

    res.status(200).json({
      success: true,
      message: `Successfully fetched and stored ${poolCount} pools, ${tokenCount} tokens, ${priceCount} prices`,
      pools: poolCount,
      tokens: tokenCount,
      prices: priceCount,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in savePools function:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch and store pools/tokens/prices',
      error: error.message
    });
  }
});
