const functions = require('@google-cloud/functions-framework');
const { createClient } = require('@supabase/supabase-js');
const { subHours } = require('date-fns');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * HTTP Cloud Function to delete old price rows and pools not updated in last 24h
 * GET endpoint, no parameters required
 *
 * Deletes from:
 *   - 'snapshots' where timestamp < now - 7d
 *   - 'pools' where updatedAt < now - 12h
 *   - 'yields' where updatedAt < now - 12h
 */
functions.http('deleteOldData', async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }
  try {
    const now = new Date();
    const cutoff7d = subHours(now, 24 * 7).toISOString();
    const cutoff12h = subHours(now, 12).toISOString();

    // Delete old price rows in batches (overcomes 1k-row cap)
    async function deleteInBatches(table, filterField, cutoff) {
      let deleted = 0;
      while (true) {
        const { data: rows, error: selErr } = await supabase
          .from(table)
          .select('id')
          .lt(filterField, cutoff)
          .limit(1000);
        if (selErr) throw selErr;
        if (!rows || rows.length === 0) break;
        const ids = rows.map(r => r.id);
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .in('id', ids);
        if (delErr) throw delErr;
        deleted += ids.length;
      }
      console.log(`Deleted ${deleted} rows from ${table}`);
    }

    // Delete old pools and yields rows
    await Promise.allSettled([
      supabase
        .from('pools')
        .delete()
        .lt('updatedAt', cutoff12h),
      supabase
        .from('yields')
        .delete()
        .lt('updatedAt', cutoff12h), //TODO: yields could be deleted faster than 24h I guess
      deleteInBatches('snapshots', 'timestamp', cutoff7d)
    ]);

    return res.status(200).json({
      success: true,
      message: 'Run complete'
    });
  } catch (error) {
    console.error('Error in deleteOldData function:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete old data',
      error: error.message
    });
  }
});
