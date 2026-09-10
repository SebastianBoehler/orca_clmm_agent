import { setDefaultFunder } from "@orca-so/whirlpools";
import { closePositionGracefully, getDetailedPositions, openPositionWithBaseToken, sleep, tokenAddressToSymbol } from "../utils";
import { fetchNonZeroTokenBalances, loadKeypairFromFile, SOL_MINT_ADDRESS, USDC_MINT_ADDRESS } from "../solana";
import * as dotenv from "dotenv";
import bs58 from "bs58";
import { ChainId, config } from "@lifi/sdk";
import { swapAssets } from "../lifi";
import { address, createKeyPairSignerFromBytes, createSolanaRpc, mainnet, SolanaError } from "@solana/kit";

dotenv.config();

// Use QuickNode RPC URL from .env file or fall back to default
const rpcUrl = "https://api.mainnet-beta.solana.com";
console.log(`Using RPC URL: ${rpcUrl}`);
config.setRPCUrls({
  [ChainId.SOL]: [rpcUrl],
});

const rpc = createSolanaRpc(mainnet(rpcUrl));

const BASE_TOKENS = [SOL_MINT_ADDRESS, USDC_MINT_ADDRESS];

async function main() {
  const bytes = await loadKeypairFromFile("./examples/keypair.json");
  const byteArray = new Uint8Array(bytes);
  const privateKey = bs58.encode(byteArray);
  const wallet = await createKeyPairSignerFromBytes(bytes);
  console.log("Loaded wallet: ", wallet.address);
  console.log("Time: ", new Date().toLocaleString());

  // Initialize Pyth price service
  setDefaultFunder(wallet);

  // Get positions
  const positions = await getDetailedPositions(wallet.address, rpc, await tokenAddressToSymbol(SOL_MINT_ADDRESS));
  if (positions.length === 0) {
    console.log("No positions found");
    process.exit(0);
  }
  await sleep(1000 * 5);

  for (const position of positions) {
    console.log(position);
    if (!position.isInRange || position.relativePosition <= 0 || position.relativePosition >= 1) {
      const isTokenABase = BASE_TOKENS.includes(position.tokenA.address);
      const baseToken = isTokenABase ? position.tokenA : position.tokenB;

      let baseProfit = 0;
      console.log("Position is out of range");
      const closeResult = await closePositionGracefully(rpc, wallet, position, 10);
      if (!closeResult) throw new Error("Failed to close position");
      const { changes } = closeResult.details;
      const walletChanges = changes.filter((c) => c.owner === wallet.address);
      //console.log(walletChanges);
      const baseChange = walletChanges.find((c) => c.mint === baseToken.address);
      console.log(`${baseToken.symbol} change from close`, baseChange?.changeDecimal);
      baseProfit += baseChange?.changeDecimal || 0;

      for (const change of walletChanges) {
        if (change.mint === USDC_MINT_ADDRESS) continue;
        let fromAmount = change.amount.toString();
        //sol received is from rent, or if sol pair we wanna keep sol anyway
        if (change.mint === SOL_MINT_ADDRESS) {
          console.log("Received SOL back", change.amount);
          continue; //fromAmount = change.change.toString()
        }
        const details = await swapAssets({
          rpc,
          fromAmount,
          fromTokenAddress: change.mint,
          toTokenAddress: baseToken.address,
          walletByteArray: byteArray,
          maxPriceImpact: 0.01,
          maxRetries: Infinity,
        });

        const swapChanges = details.changes.filter((c) => c.owner === wallet.address);
        const baseChange = swapChanges.find((c) => c.mint === baseToken.address);
        console.log(`${baseToken.symbol} change from swap`, baseChange?.changeDecimal);
        baseProfit += baseChange?.changeDecimal || 0;
        console.log("Finished swap");
      }

      console.log(`[loadPositions] Profit in ${baseToken.symbol}: ${baseProfit}`);

      if (closeResult) process.exit(0);

      const balances = await fetchNonZeroTokenBalances(wallet.address);
      const baseBalance = balances.find((b) => b.address === baseToken.address);
      if (!baseBalance) throw new Error(`Base token ${baseToken.symbol} balance not found`);
      console.log(`Base token ${baseToken.symbol} balance: ${baseBalance.balance.uiAmountString}`);

      const range = 0.05; // total width = 5%
      const lowerFrac = 0.2; // 20% of the width below
      const upperFrac = 0.8; // 80% of the width above

      await openPositionWithBaseToken({
        rpc,
        whirlpoolAddress: address(position.whirlpool.address),
        wallet,
        walletByteArray: byteArray,
        baseTokenAddress: address(baseToken.address),
        baseTokenAmount: baseBalance.balance.uiAmount,
        lowerMultiple: 1 - range * lowerFrac,
        upperMultiple: 1 + range * upperFrac,
      });
    }
  }

  await sleep(1000);
}

(async () => {
  while (true) {
    try {
      await main();
    } catch (error) {
      console.error(`[main] Error: ${error}`);
      if (error instanceof SolanaError) {
        console.error("[main] SolanaError cause: ", error.cause);
      }
      await sleep(1000 * 15);
    }
    await sleep(1000 * 15);
  }
})();
