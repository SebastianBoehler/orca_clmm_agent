const endpoint = new URL("https://api.kamino.finance/v2/kamino-market");
const programId = process.env.KAMINO_PROGRAM_ID;

if (programId) {
  endpoint.searchParams.set("programId", programId);
}

const response = await fetch(endpoint, { headers: { accept: "application/json" } });

if (!response.ok) {
  throw new Error(`Kamino market discovery failed: ${response.status} ${await response.text()}`);
}

const markets = await response.json();

if (!Array.isArray(markets)) {
  throw new Error("Kamino market discovery returned an unexpected shape");
}

console.log(`Kamino markets returned: ${markets.length}`);

for (const market of markets) {
  console.log(JSON.stringify({
    name: market.name,
    description: market.description,
    lendingMarket: market.lendingMarket,
    lookupTable: market.lookupTable,
    isPrimary: market.isPrimary,
    isCurated: market.isCurated,
  }, null, 2));
}
