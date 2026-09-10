import { configs, DriftClient, getMarketsAndOraclesForSubscription, Wallet } from "@drift-labs/sdk";
import { BulkAccountLoader } from "@drift-labs/sdk/lib/node/accounts/bulkAccountLoader.js";
import { loadWeb3Runtime } from "./common.ts";

const { connection, keypair } = await loadWeb3Runtime();
const wallet = new Wallet(keypair as any);
const marketIndexes = (process.env.DRIFT_MARKET_INDEXES || "0")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value));
const spotMarketIndexes = (process.env.DRIFT_SPOT_MARKET_INDEXES || "0")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value));
const subscription = getMarketsAndOraclesForSubscription(
  "mainnet-beta",
  configs["mainnet-beta"].PERP_MARKETS.filter((market) => marketIndexes.includes(market.marketIndex)),
  configs["mainnet-beta"].SPOT_MARKETS.filter((market) => spotMarketIndexes.includes(market.marketIndex)),
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

await driftClient.subscribe();

try {
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`State: ${(await driftClient.getStatePublicKey()).toBase58()}`);

  let user;
  try {
    user = driftClient.getUser();
  } catch (error: any) {
    if (String(error?.message || error).includes("has no user")) {
      console.log("Wallet has no initialized Drift user account.");
      process.exit(0);
    }
    throw error;
  }
  const userAccount = user.getUserAccount();
  console.log(`Authority: ${userAccount.authority.toBase58()}`);
  console.log(`Subaccount id: ${userAccount.subAccountId}`);
  console.log(`Open orders: ${userAccount.orders.filter((order: any) => order.status?.open).length}`);
  console.log("Account risk:");
  console.log(JSON.stringify({
    totalCollateral: user.getTotalCollateral().toString(),
    freeCollateral: user.getFreeCollateral().toString(),
    initialMarginRequirement: user.getMarginRequirement("Initial" as any).toString(),
    maintenanceMarginRequirement: user.getMaintenanceMarginRequirement().toString(),
    leverage: user.getLeverage(true).toString(),
    marginRatio: user.getMarginRatio().toString(),
  }, null, 2));
  console.log("Perp positions:");
  for (const position of userAccount.perpPositions) {
    if (!position.baseAssetAmount.isZero()) {
      const oracle = driftClient.getOracleDataForPerpMarket(position.marketIndex);
      console.log(JSON.stringify({
        marketIndex: position.marketIndex,
        baseAssetAmount: position.baseAssetAmount.toString(),
        quoteAssetAmount: position.quoteAssetAmount.toString(),
        quoteEntryAmount: position.quoteEntryAmount.toString(),
        quoteBreakEvenAmount: position.quoteBreakEvenAmount.toString(),
        openOrders: position.openOrders,
        openBids: position.openBids.toString(),
        openAsks: position.openAsks.toString(),
        settledPnl: position.settledPnl.toString(),
        lastCumulativeFundingRate: position.lastCumulativeFundingRate.toString(),
        oraclePrice: oracle.price.toString(),
        oracleConfidence: oracle.confidence.toString(),
        oracleSlot: oracle.slot.toString(),
        hasSufficientOracleData: oracle.hasSufficientNumberOfDataPoints,
        unrealizedPnlWithFunding: user.getUnrealizedPNL(true, position.marketIndex).toString(),
        unrealizedFundingPnl: user.getUnrealizedFundingPNL(position.marketIndex).toString(),
        liquidationPrice: user.liquidationPrice(position.marketIndex).toString(),
        marketLiabilityValue: user.getPerpMarketLiabilityValue(position.marketIndex).toString(),
      }, null, 2));
    }
  }
} finally {
  await driftClient.unsubscribe();
}
