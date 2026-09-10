import { differenceInHours } from "date-fns";
import { DetailedPosition } from "orca-clmm-agent";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchPools = async (statsType: string = "24h", tokenFilter: string = "USDC") => {
  const token = process.env.POOLS_API_TOKEN;
  if (!token) throw new Error("POOLS_API_TOKEN is required");
  const response = await fetch(`https://orca-clmm-agent.vercel.app/api/pools?limit=25&statsType=${statsType}&token=${tokenFilter}`, {
    headers: {
      // Auth header bypasses server caching
      Authorization: `Bearer ${token}`,
    },
  });
  const data: any = await response.json();
  //TODO: add pool RSI into response in nextjs app
  return data.pools as any[];
};

export const poolsAsText = (pools: any[]) => {
  // Return structured JSON of pools for LLM prompt
  const simplePools = pools.map((pool) => {
    return {
      name: `${pool.tokenA.symbol}/${pool.tokenB.symbol}`,
      id: pool.id,
      //address: pool.address,
      yields: pool.yields,
      priceChange: pool.price_change,
      volatility: pool.volatility,
      tvlUsdc: Number(pool.tvlUsdc),
      volume24h: Number(pool.volume24h),
    };
  });
  return JSON.stringify({ pools: simplePools }, null, 2);
};

//use fs to append logs to an log file
export const writeLog = (log: string) => {
  const fs = require("fs");
  fs.appendFile("log.txt", log + "\n", (err: any) => {
    if (err) throw err;
  });
};

export const clearLog = () => {
  const fs = require("fs");
  fs.writeFile("log.txt", "", (err: any) => {
    if (err) throw err;
  });
};

export const getLastLogLines = (amount: number = 50) => {
  const fs = require("fs");
  const data = fs.readFileSync("log.txt", "utf8");
  const lines: string[] = data.split("\n");
  return lines.slice(-amount);
};

export async function logPosition(position: DetailedPosition, baseTokenAddress: string, cachedPos?: Record<string, any>) {
  //log dashed line
  const isTokenABase = position.tokenA.address === baseTokenAddress;
  const baseTokenPriceStart = isTokenABase ? cachedPos?.openTokenAPriceUSD : cachedPos?.openTokenBPriceUSD;
  const baseTokenPriceEnd = isTokenABase ? position.tokenAPrice : position.tokenBPrice;
  console.log({ baseTokenPriceStart, baseTokenPriceEnd, isTokenABase });
  const baseTokenPriceChgPct = ((baseTokenPriceEnd - baseTokenPriceStart) / baseTokenPriceStart) * 100;
  const { positionValueUSD, name, totalFeesUSD, tokenAAmount, tokenBAmount, createdAt } = position;
  const valueChange = cachedPos ? positionValueUSD.est - cachedPos.openValueUSD : 0;
  const valueChangePct = cachedPos ? (valueChange / cachedPos.openValueUSD) * 100 : 0;
  const accYield = (totalFeesUSD / positionValueUSD.est) * 100;
  const duration = differenceInHours(Date.now(), createdAt);
  console.log("----------------------------------------");
  console.log(`${name}: min: ${positionValueUSD.min.toFixed(2)}$ est: ${positionValueUSD.est.toFixed(2)}$`);
  console.log(`Total fees: ${totalFeesUSD.toFixed(4)} USD`);
  console.log(`Value change: ${valueChangePct.toFixed(4)}%`);
  console.log(`Yield: ${accYield.toFixed(4)}%`);
  console.log(`In range: ${position.isInRange ? "Yes" : "No"}`);
  console.log(`Relative position: ${position.relativePosition}`);
  console.log(`Token ${position.tokenA.symbol}: ${tokenAAmount}`);
  console.log(`Token ${position.tokenB.symbol}: ${tokenBAmount}`);
  console.log(`Range: ${position.range}`);
  console.log(`Pool price: ${position.currentMarketPrice}`);
  console.log(`Base token price change: ${baseTokenPriceChgPct.toFixed(4)}%`);
  console.log(`Created at: ${createdAt.toLocaleString()} (${duration.toFixed(0)} hours)`);
  console.log(`Mint: ${position.address}`);
  console.log("----------------------------------------");

  return {
    valueChangePct,
    baseTokenPriceChgPct,
  };
}
