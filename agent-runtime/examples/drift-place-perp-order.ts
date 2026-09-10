import {
  BASE_PRECISION,
  BN,
  configs,
  DriftClient,
  getMarketsAndOraclesForSubscription,
  OrderType,
  PositionDirection,
  Wallet,
} from "@drift-labs/sdk";
import { BulkAccountLoader } from "@drift-labs/sdk/lib/node/accounts/bulkAccountLoader.js";
import { liveEnabled, loadWeb3Runtime, requireEnv, requireNumberEnv } from "./common.ts";

const { connection, keypair } = await loadWeb3Runtime();
const wallet = new Wallet(keypair as any);
const marketIndex = requireNumberEnv("DRIFT_MARKET_INDEX");
const subscription = getMarketsAndOraclesForSubscription(
  "mainnet-beta",
  configs["mainnet-beta"].PERP_MARKETS.filter((market) => market.marketIndex === marketIndex),
  configs["mainnet-beta"].SPOT_MARKETS.filter((market) => market.marketIndex === 0),
);
const driftClient = new DriftClient({
  connection: connection as any,
  wallet,
  env: "mainnet-beta",
  accountSubscription: {
    type: "polling",
    accountLoader: new BulkAccountLoader(connection as any, "confirmed", 5_000),
  },
  ...subscription,
});

const direction = requireEnv("DRIFT_DIRECTION").toUpperCase() === "SHORT"
  ? PositionDirection.SHORT
  : PositionDirection.LONG;
const baseAssetAmount = new BN(requireEnv("DRIFT_BASE_AMOUNT"))
  .mul(BASE_PRECISION);

await driftClient.subscribe();

try {
  const orderParams = {
    orderType: OrderType.MARKET,
    marketIndex,
    direction,
    baseAssetAmount,
  };

  console.log("Prepared Drift perp market order:");
  console.log(JSON.stringify({
    wallet: wallet.publicKey.toBase58(),
    marketIndex,
    direction: direction === PositionDirection.SHORT ? "SHORT" : "LONG",
    baseAssetAmount: baseAssetAmount.toString(),
    live: liveEnabled(),
  }, null, 2));

  if (!liveEnabled()) {
    console.log("Set EXECUTE_LIVE=1 to submit this Drift order.");
    process.exit(0);
  }

  const signature = await driftClient.placePerpOrder(orderParams);
  console.log(`Submitted Drift perp order: ${signature}`);
} finally {
  await driftClient.unsubscribe();
}
