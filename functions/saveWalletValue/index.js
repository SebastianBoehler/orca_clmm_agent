const functions = require('@google-cloud/functions-framework');
const { fetchNonZeroTokenBalances, SOL_MINT_ADDRESS } = require('orca-clmm-agent');
const { createClient } = require('@supabase/supabase-js');
const { address, createNoopSigner } = require('@solana/kit');

// Supabase environment variables (set in Cloud Functions configuration)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[saveWalletValue] Supabase credentials not set');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const walletAddress = process.env.WALLET_ADDRESS;
if (!walletAddress) throw new Error("WALLET_ADDRESS is required");
const noopSigner = createNoopSigner(address(walletAddress));

/**
 * HTTP Cloud Function that calculates the total USD value of a Solana wallet
 * and persists the result to Supabase.
 *
 * Request (POST): {
 *   "wallet": "<walletPublicKey>",
 *   "rpcUrl": "<optionalRpcUrl>"
 * }
 */
functions.http('saveWalletValue', async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Get tokens with non-zero balances and USD prices
    const balance = await fetchNonZeroTokenBalances(noopSigner.address);
    const solBalance = balance.find((b) => b.address === SOL_MINT_ADDRESS);
    const positions = await getDetailedPositions(noopSigner.address, rpc);
    const positionValue = positions.reduce((acc, pos) => acc + pos.positionValueUSD.est, 0);

    // Persist to Supabase (upsert by wallet address)
    const { error } = await supabase
      .from('wallet')
      .upsert(
        {
          value: solBalance.balance.uiAmount,
          //timestamp: new Date().toISOString(),
        }
      );

    if (error) {
      console.error('[saveWalletValue] Supabase upsert error:', error);
      return res.status(500).json({ success: false, message: 'Database error', error: error.message });
    }

    return res.status(200).json({ success: true, value: solBalance.balance.uiAmount });
  } catch (err) {
    console.error('[saveWalletValue] Failed to calculate wallet value:', err);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});
