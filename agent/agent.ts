import * as dotenv from "dotenv";
import bs58 from "bs58";
import { ChainId, config } from "@lifi/sdk";
import {
  closePositionWithBaseToken,
  divergenceLoss,
  fetchNonZeroTokenBalances,
  getDetailedPositions,
  getUSDPrice,
  loadKeypairFromFile,
  openPositionWithBaseToken,
  setOrcaDefaultFunder,
  sleep,
  SOL_MINT_ADDRESS,
  tokenAddressToSymbol,
  USDC_MINT_ADDRESS,
} from "orca-clmm-agent";
import { fetchPools, logPosition, writeLog } from "./utils";
import { getPoolRecommendation } from "./gemini";
import { address, createKeyPairSignerFromBytes, createNoopSigner, createSolanaRpc, isTransactionSigner, mainnet, SolanaError } from "@solana/kit";
import { getPositionByAddress, savePositions, updatePosition } from "./supabase";
import { differenceInMinutes } from "date-fns";

//TODO: if positiv price impact while swapping into, accept more when swapping out as we can accept more price impact

dotenv.config();
// Use QuickNode RPC URL from .env file or fall back to default
const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
console.log(`Using RPC URL: ${rpcUrl}`);
config.setRPCUrls({
  [ChainId.SOL]: [rpcUrl],
});

const rpc = createSolanaRpc(mainnet(rpcUrl));
//clearLog()

const BASE_TOKEN = SOL_MINT_ADDRESS;
const POOLS_FILTER = "SOL";
const STATS_TYPE = "4h";
const openPosCache = new Map<string, any>();
const maxGasUSD = 0.4;

export async function runAgent() {
  // Set up Orca Whirlpools configuration for mainnet
  const [baseTokenSymbol, bytes] = await Promise.all([
    tokenAddressToSymbol(BASE_TOKEN),
    loadKeypairFromFile("./keypair.json"),
  ]);
  const byteArray = new Uint8Array(bytes);
  const privateKey = bs58.encode(byteArray);
  const wallet = await createKeyPairSignerFromBytes(bytes);

  if (!isTransactionSigner(wallet)) throw new Error("Wallet is not a transaction signer");
  //console.log("Loaded wallet: ", wallet.address);
  console.log("Time: ", new Date().toLocaleString());

  setOrcaDefaultFunder(wallet);
  const positions = await getDetailedPositions(wallet.address, rpc, baseTokenSymbol);

  if (!positions.length) {
    const pools = await fetchPools(STATS_TYPE, POOLS_FILTER);
    const recommendation = await getPoolRecommendation(pools, undefined, BASE_TOKEN);
    const recommendedPool = pools.find((p) => p.address === recommendation.address);
    if (!recommendedPool) throw new Error(`Recommended Pool ${recommendation.address} not found`);

    const balance = await fetchNonZeroTokenBalances(wallet.address);
    const tokenBalance = balance.find((b) => b.address === BASE_TOKEN);
    if (!tokenBalance) throw new Error("No token balance found");
    const tokenUsdPrice = await getUSDPrice({ mintAddress: tokenBalance.address });
    const tokenValue = tokenBalance.balance.uiAmount * tokenUsdPrice;
    writeLog(`${tokenBalance.symbol} balance: ${tokenBalance.balance.uiAmount} @ ${tokenUsdPrice.toFixed(2)} = $${tokenValue.toFixed(2)}`);
    console.log(recommendation);

    const isBullish = recommendation.sentiment === "BULLISH";
    let lowerMultiple = isBullish ? 1 - recommendation.range * 0.3 : 1 - recommendation.range * 0.7;
    let upperMultiple = isBullish ? 1 + recommendation.range * 0.7 : 1 + recommendation.range * 0.3;

    // if base token is tokenA the range needs to be inverted
    const isTokenABase = recommendedPool.tokenA.address === BASE_TOKEN;
    if (isTokenABase) {
      lowerMultiple = 1 - Math.abs(upperMultiple - 1);
      upperMultiple = 1 + Math.abs(lowerMultiple - 1);
    }

    console.log({
      BASE_TOKEN,
      baseTokenAmount: Number(tokenBalance.balance.uiAmount),
    });
    const openPosResult = await openPositionWithBaseToken({
      rpc,
      whirlpoolAddress: address(recommendedPool.address),
      wallet,
      walletByteArray: byteArray,
      baseTokenAddress: address(BASE_TOKEN),
      lowerMultiple,
      upperMultiple,
      baseTokenAmount: Number(tokenBalance.balance.uiAmount),
      swapDustToAddress: address(BASE_TOKEN),
      maxGasUSD,
    });
    if (!openPosResult) {
      writeLog("No position opened, maybe gas too high, no quote found, etc\n");
      await sleep(1000 * 5);
      return;
    }

    await sleep(1000 * 15);

    const positions = await getDetailedPositions(wallet.address, rpc, baseTokenSymbol);
    const position = positions.find((p) => p.data.positionMint === openPosResult.positionMint);
    if (!position) throw new Error("Position not found");

    const posObj = {
      address: position.address,
      openSwapSignature: openPosResult.swapSignature,
      openPositionSignature: openPosResult.positionSignature,
      openSwapLoss: openPosResult.swapLoss,
      openSwapPriceImpact: openPosResult.swapPriceImpact,
      openFeeUSD: openPosResult.feeUSD,
      openTokenAPriceUSD: openPosResult.tokenAPriceUSD,
      openTokenBPriceUSD: openPosResult.tokenBPriceUSD,
      openValueUSD: position.positionValueUSD.est,
    };

    await savePositions([posObj]);
    openPosCache.set(position.address, {
      ...posObj,
      openPoolPrice: position.currentMarketPrice,
      initialDepositA: position.tokenAAmount,
      initialDepositB: position.tokenBAmount,
    });
    writeLog(
      `Position opened on ${recommendedPool.tokenA.symbol}/${recommendedPool.tokenB.symbol} with range ${recommendation.range} for reason: \n${recommendation.reason}\n`
    );
    return;
  }

  for (const pos of positions) {
    const cachedPos = openPosCache.get(pos.address);
    if (cachedPos) {
      const IL = divergenceLoss(
        Number(pos.currentMarketPrice),
        cachedPos.openPoolPrice,
        pos.lowerPrice,
        pos.upperPrice,
        cachedPos.initialDepositA,
        cachedPos.initialDepositB
      );
      console.log("IL", IL);
    }
    logPosition(pos, BASE_TOKEN, cachedPos);
    //TODO: consider selling when 100% in base token as we are then at thr profitable end of the range
    if (!pos.isInRange) {
      // if within tolerance skip closing and wait as it might move back into range
      // especially ig 100% in base token we could just wait out full 10 minutes
      const isWithinUpperTolerance = +pos.currentMarketPrice <= pos.upperPrice * 1.02;
      const isWithinLowerTolerance = +pos.currentMarketPrice >= pos.lowerPrice * 0.98;
      const isWithinTolerance = isWithinUpperTolerance && isWithinLowerTolerance;
      if (cachedPos && isWithinTolerance) {
        //TODO: or more than x % from range limit away
        if (cachedPos.outOfRangeSince && differenceInMinutes(new Date(), cachedPos.outOfRangeSince) < 10) {
          console.log("Position out of range for less than 10 minutes, skipping...");
          continue;
        } else if (!cachedPos.outOfRangeSince) {
          cachedPos.outOfRangeSince = new Date();
          continue;
        }
      }
      console.log("Position out of range, closing...", !!cachedPos);
      await sleep(1000);
      const closeResult = await closePositionWithBaseToken({
        rpc,
        wallet,
        position: pos,
        walletByteArray: byteArray,
        maxPriceImpact: 0.03,
        baseToken: BASE_TOKEN,
        maxGasUSD,
        maxRetries: Infinity,
      });
      const dbPos = await getPositionByAddress(pos.address);

      if (!closeResult) throw new Error("Failed to close position");
      console.log("closeResult", JSON.stringify(closeResult, null, 2));
      if (!dbPos.length) throw new Error("Position not found in database");

      const totalGasUSD = dbPos[0].openFeeUSD + closeResult.feeUSD; // positiv value
      const totalSwapLossUSD = dbPos[0].openSwapLoss + closeResult.swapLoss; // neg if loss, pos if profit
      const posValueLoss = pos.positionValueUSD.est - dbPos[0].openValueUSD; // neg if loss, pos if profit
      console.log("totalGasUSD", totalGasUSD);
      console.log("totalSwapLossUSD", totalSwapLossUSD);
      console.log("posValueLoss", posValueLoss);
      const sideCrossed = pos.relativePosition >= 1 ? "upper" : "lower";

      const duration = differenceInMinutes(new Date(), pos.createdAt);
      const accYield = (pos.totalFeesUSD / dbPos[0].openValueUSD) * 100;
      const message = `Position on ${pos.name} moved out of range at ${sideCrossed} threshold after ${duration} minutes and has been closed.
It yielded ${accYield.toFixed(2)}% return.
Brutto profit: $${pos.totalFeesUSD.toFixed(2)}
Net profit: $${(pos.totalFeesUSD + totalSwapLossUSD + posValueLoss + totalGasUSD * -1).toFixed(2)}
Net includes position values loss, gas fees and swap losses
Total gas: $${totalGasUSD.toFixed(2)}, Swap change: $${totalSwapLossUSD.toFixed(2)}, Position value change: $${posValueLoss.toFixed(2)}
\n`;
      console.log(message);
      writeLog(message);

      await updatePosition(pos.address, {
        closeFeeUSD: closeResult.feeUSD,
        closeSwapLoss: closeResult.swapLoss,
        closeValueUSD: pos.positionValueUSD.est,
        closePositionSignature: closeResult.closeSignature,
        closeSwapSignature: closeResult.swapSignature,
      });

      //bc for some reason balance is not updated immediately
      await sleep(1000 * 15);

      //TODO: using signature get tx details to get base token balance after close ?!
    } else if (cachedPos && cachedPos.outOfRangeSince) {
      cachedPos.outOfRangeSince = undefined;
    }
  }

  await sleep(1000 * 60);
}
