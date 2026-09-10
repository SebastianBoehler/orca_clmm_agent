const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const deleteOldData = async () => {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString();
  console.log(`Deleting old data before ${cutoff24h}`);

  // Delete old rows in batches to avoid 1k limit
  async function deleteInBatches(table, filterField) {
    let total = 0;
    while (true) {
      const { data: rows, error: selError } = await supabase
        .from(table)
        .select('id')
        .lt(filterField, cutoff24h)
        .limit(1000);
      if (selError) throw selError;
      if (!rows || rows.length === 0) break;
      const ids = rows.map(r => r.id);
      const { error: delError } = await supabase
        .from(table)
        .delete()
        .in('id', ids);
      if (delError) throw delError;
      total += ids.length;
    }
    console.log(`Deleted ${total} rows from ${table}`);
  }

  // run batches
  await deleteInBatches('prices', 'timestamp');

  // Finished
  console.log('Batch deletion complete');
};

// Run the function
deleteOldData();
