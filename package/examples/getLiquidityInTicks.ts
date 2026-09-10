// exportFullLiquidity.ts

import fs from "fs";
import dotenv from "dotenv";
import { createSolanaRpc, mainnet } from "@solana/kit";
import { fetchAllFixedTickArrayWithFilter, fixedTickArrayWhirlpoolFilter } from "@orca-so/whirlpools-client";
import { fetchOrcaPoolByAddress, getOnChainPool, getLiquidityInTicks } from "../orca"; // your helper to fetch pool data
import { getInitializableTickIndex, priceToTickIndex, tickIndexToPrice } from "@orca-so/whirlpools-core";
import { address } from "@solana/kit";

dotenv.config();

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL must be set in .env");
  const rpc = createSolanaRpc(mainnet(rpcUrl));
  // configure your pool address and desired window (e.g. ±40%)
  const poolAddress = address("Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE");

  const temp = await getLiquidityInTicks({ poolAddress, rpc });

  // fetch on‐chain Whirlpool data
  const whirlpool = await fetchOrcaPoolByAddress(poolAddress);
  const pool = await getOnChainPool(whirlpool, rpc);
  const currentPrice = +pool.price;
  const { tokenA, tokenB, tickCurrentIndex, tickSpacing } = whirlpool;

  // compute price window
  const priceNow = tickIndexToPrice(tickCurrentIndex, tokenA.decimals, tokenB.decimals);

  // fetch all tick arrays for this pool
  const filter = fixedTickArrayWhirlpoolFilter(poolAddress);
  const tickArrays = await fetchAllFixedTickArrayWithFilter(rpc, [filter]);
  tickArrays.sort((a, b) => a.data.startTickIndex - b.data.startTickIndex);

  // sweep liquidity using liquidityNet
  const fullData: Array<{ tickIndex: number; price: number; liquidity: number }> = [];
  let liquidity = 0n;

  for (const ta of tickArrays) {
    const { startTickIndex, ticks } = ta.data;
    for (let i = 0; i < ticks.length; i++) {
      const tickIndex = startTickIndex + i * tickSpacing;
      const tick = ticks[i];
      if (!tick.initialized) continue;

      liquidity += BigInt(tick.liquidityNet);

      const price = tickIndexToPrice(tickIndex, tokenA.decimals, tokenB.decimals);
      fullData.push({ tickIndex, price, liquidity: Number(liquidity) });
    }
  }

  // write out JSON file
  const outPath = "./examples/points.json";
  const out = { currentPrice, data: fullData };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Exported ${fullData.length} entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
