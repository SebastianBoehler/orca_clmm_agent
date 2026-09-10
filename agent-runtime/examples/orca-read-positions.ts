import { fetchPositionsForOwner } from "@orca-so/whirlpools";
import { isPositionInRange, sqrtPriceToPrice, tickIndexToPrice } from "@orca-so/whirlpools-core";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
import { loadRuntime, printBalanceSummary, getSolAndTokenBalances, printLiveHeader, withRpcBackoff } from "./common.ts";

const { rpc, wallet } = await loadRuntime();
await printLiveHeader(wallet);

const balances = await getSolAndTokenBalances(rpc, wallet.address);
printBalanceSummary("Wallet", balances);

const positions = (await withRpcBackoff(
  "Orca position discovery",
  () => fetchPositionsForOwner(rpc, wallet.address),
  { attempts: 6, initialDelayMs: 2_000 },
))
  .filter((p: any) => !p.isPositionBundle)
  .map((p: any) => p as any);
console.log(`Orca position count: ${positions.length}`);

for (const position of positions) {
  const pool = await withRpcBackoff(
    `Orca pool read ${position.data.whirlpool}`,
    () => fetchWhirlpool(rpc, position.data.whirlpool),
    { attempts: 6, initialDelayMs: 2_000 },
  );
  const currentPrice = sqrtPriceToPrice(pool.data.sqrtPrice, 9, 6);
  const lowerPrice = tickIndexToPrice(position.data.tickLowerIndex, 9, 6);
  const upperPrice = tickIndexToPrice(position.data.tickUpperIndex, 9, 6);
  const inRange = isPositionInRange(pool.data.sqrtPrice, position.data.tickLowerIndex, position.data.tickUpperIndex);

  console.log(JSON.stringify({
    position: position.address,
    positionMint: position.data.positionMint,
    pool: position.data.whirlpool,
    liquidity: position.data.liquidity.toString(),
    tickLower: position.data.tickLowerIndex,
    tickUpper: position.data.tickUpperIndex,
    lowerPrice,
    upperPrice,
    currentPrice,
    inRange,
  }, null, 2));
}
