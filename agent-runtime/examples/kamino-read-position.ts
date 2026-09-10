import { address } from "@solana/kit";
import {
  KaminoMarket,
  PROGRAM_ID,
  VanillaObligation,
} from "@kamino-finance/klend-sdk";
import { loadRuntime } from "./common.ts";

async function discoverKaminoMarket() {
  const response = await fetch("https://api.kamino.finance/v2/kamino-market", {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Kamino market discovery failed: ${response.status} ${await response.text()}`);
  }

  const markets = await response.json();
  if (!Array.isArray(markets)) {
    throw new Error("Kamino market discovery returned an unexpected shape");
  }

  const selected = markets.find((market) => market.isPrimary) || markets[0];
  if (!selected?.lendingMarket) {
    throw new Error("Kamino market discovery returned no lending market");
  }

  return selected;
}

const { rpc, wallet } = await loadRuntime();
const discoveredMarket = process.env.KAMINO_MARKET ? undefined : await discoverKaminoMarket();
const selectedMarketAddress = process.env.KAMINO_MARKET || discoveredMarket?.lendingMarket;

if (!selectedMarketAddress) {
  throw new Error("Kamino market address was not configured or discovered");
}

const marketAddress = address(selectedMarketAddress);
const market = await KaminoMarket.load(rpc as any, marketAddress, 400);

if (!market) {
  throw new Error(`Unable to load Kamino market ${marketAddress}`);
}

const obligation = await market.getObligationByWallet(
  wallet.address,
  new VanillaObligation(PROGRAM_ID),
);

console.log(`Wallet: ${wallet.address}`);
console.log(`Market: ${marketAddress}`);
if (discoveredMarket) {
  console.log(`Market source: discovered ${discoveredMarket.name || "unnamed market"}`);
}

if (!obligation) {
  console.log("No vanilla obligation found for this wallet.");
  process.exit(0);
}

console.log(JSON.stringify({
  loanToValue: obligation.loanToValue().toString(),
  deposits: obligation.getDeposits().length,
  borrows: obligation.getBorrows().length,
}, null, 2));
