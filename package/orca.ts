import {
  closePositionInstructions,
  fetchPositionsForOwner,
  harvestPositionInstructions,
  openPositionInstructions,
  setDefaultFunder,
  type IncreaseLiquidityParam,
} from "@orca-so/whirlpools";
import {
  isPositionInRange,
  tickIndexToPrice,
  priceToSqrtPrice,
  increaseLiquidityQuoteB,
  getInitializableTickIndex,
  priceToTickIndex,
  increaseLiquidityQuoteA,
  sqrtPriceToPrice,
} from "@orca-so/whirlpools-core";
import { isPositionBundle, TransactionDetails, WhirlpoolInfo, type OrcaPosition, type WhirlpoolResponse } from "./types";
import { executeInstructions, SOL_MINT_ADDRESS, USDC_MINT_ADDRESS } from "./solana";
import { convertDecimalToRaw, convertRawToDecimal, getUSDPrice, joinTransactionChanges, sleep } from "./utils";
import { swapAssets } from "./lifi";
import { fetchAllFixedTickArrayWithFilter, fetchWhirlpool, fixedTickArrayWhirlpoolFilter } from "@orca-so/whirlpools-client";
import { differenceInSeconds } from "date-fns";
import { address, Address, Instruction, Signature, SolanaError, TransactionSigner } from "@solana/kit";
import {
  DivergenceLossResult,
  GetLiquidityInTicksParams,
  OpenPositionParams,
  OrcaError,
  OrcaToken,
  PositionYieldLimits,
  PositionYieldRange,
} from "./orca.types";

// Constants for tick array configuration
const TICK_ARRAY_SIZE = 88; // Number of physical ticks in a tick array

// The absolute min/max tick indices for Orca Whirlpools
// For tickspacing=1, these are -443636 and 443636
const ABSOLUTE_MIN_TICK_INDEX = -443636;
const ABSOLUTE_MAX_TICK_INDEX = 443636;

const PRELOADED_TOKENS: { tokens: OrcaToken[]; time: Date } = { tokens: [], time: new Date() };

//https://github.com/orca-so/whirlpools/blob/main/programs/whirlpool/src/errors.rs
export const TOKEN_MAX_EXCEEDED_ERROR = BigInt(6017);
export const TOKEN_MIN_SUBCEEDED_ERROR = BigInt(6018);
export const INVALID_START_TICK_ERROR = BigInt(6001);
export const LIQUIDITY_ZERO_ERROR = BigInt(6012);

export const setOrcaDefaultFunder = setDefaultFunder;
/**
 * Calculates the minimum tick index based on the pool's tickspacing
 * @param tickSpacing The tickspacing of the pool
 * @returns The minimum tick index that is a valid multiple of tickSpacing
 */
export const calculateMinTickIndex = (tickSpacing: number): number => {
  // The min tick index should be a multiple of tickSpacing
  return Math.ceil(ABSOLUTE_MIN_TICK_INDEX / tickSpacing) * tickSpacing;
};

/**
 * Calculates the maximum tick index based on the pool's tickspacing
 * @param tickSpacing The tickspacing of the pool
 * @returns The maximum tick index that is a valid multiple of tickSpacing
 */
export const calculateMaxTickIndex = (tickSpacing: number): number => {
  // The max tick index should be a multiple of tickSpacing
  return Math.floor(ABSOLUTE_MAX_TICK_INDEX / tickSpacing) * tickSpacing;
};

/**
 * Calculates the start tick index for a tick array given a tick index and tickspacing
 * @param tickIndex The current tick index
 * @param tickSpacing The tick spacing of the pool
 * @returns The start tick index of the tick array containing the given tick
 */
export const getTickArrayStartIndex = (tickIndex: number, tickSpacing: number): number => {
  const ticksInArray = TICK_ARRAY_SIZE * tickSpacing;
  // Find the closest multiple of (tickSpacing * TICK_ARRAY_SIZE) that is less than or equal to tickIndex
  return Math.floor(tickIndex / ticksInArray) * ticksInArray;
};

/**
 * Converts tick index to price, handling edge cases for infinite ranges
 * @param tickIndex The tick index to convert
 * @param decimalsA Token A decimals
 * @param decimalsB Token B decimals
 * @param tickSpacing The tick spacing of the pool
 * @returns The price or undefined for infinite bounds
 */
const convertTickToPrice = (tickIndex: number, decimalsA: number, decimalsB: number, tickSpacing: number) => {
  // Check if the tick index is at the min/max boundaries for this tickSpacing
  const minTick = calculateMinTickIndex(tickSpacing);
  const maxTick = calculateMaxTickIndex(tickSpacing);

  if (tickIndex === minTick) return 0;
  if (tickIndex === maxTick) return Infinity;

  // For normal ticks, convert to price
  return tickIndexToPrice(tickIndex, decimalsA, decimalsB);
};

/**
 * Converts position fees to decimal format
 * @param feeQuote The fee quote object containing feeOwedA and feeOwedB
 * @param tokenADecimals Decimals for token A
 * @param tokenBDecimals Decimals for token B
 * @returns Object with converted fee amounts
 */
export const convertPositionFees = (feeQuote: { feeOwedA: bigint; feeOwedB: bigint }, tokenADecimals: number, tokenBDecimals: number) => {
  return {
    feeAmountA: convertRawToDecimal(feeQuote.feeOwedA, tokenADecimals),
    feeAmountB: convertRawToDecimal(feeQuote.feeOwedB, tokenBDecimals),
  };
};

/**
 * Fetches all Orca Whirlpool pools from the API
 * @returns A promise that resolves to an array of WhirlpoolResponse objects
 */
export const fetchOrcaPools = async () => {
  let continueFetching = true;
  const whirlpools: WhirlpoolResponse["data"] = [];
  let cursor: string | null = null;

  while (continueFetching) {
    const url = `https://api.orca.so/v2/solana/pools?size=1000${cursor ? `&after=${cursor}` : ""}&stats=5m,15m,30m,1H,2H,4H,8H,24H,7D,30D`;
    const whirlpoolsResponse = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // no cache
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
    const status = whirlpoolsResponse.status;
    if (status !== 200) {
      throw new Error(`Failed to fetch pools: ${status}`);
    }

    const whirlpoolsData = (await whirlpoolsResponse.json()) as WhirlpoolResponse;
    whirlpools.push(...whirlpoolsData.data);
    if (!whirlpoolsData.meta.cursor) {
      console.log("[fetchOrcaPools] No cursor found", url);
      continueFetching = false;
      break;
    }
    if (!whirlpoolsData.meta.cursor.next) {
      continueFetching = false;
      break;
    }
    cursor = whirlpoolsData.meta.cursor.next;
  }
  return whirlpools;
};

export const getOrcaTokens = async () => {
  let continueFetching = true;
  const tokens: OrcaToken[] = [];
  let cursor: string | null = null;

  while (continueFetching) {
    const tokensResponse = await fetch(`https://api.orca.so/v2/solana/tokens?size=1000${cursor ? `&after=${cursor}` : ""}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // no cache
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
    const status = tokensResponse.status;
    if (status !== 200) {
      throw new Error(`Failed to fetch tokens: ${status}`);
    }

    const tokensData = (await tokensResponse.json()) as { data: OrcaToken[]; meta: { cursor: { next: string | null } } };
    if (!tokensData.meta.cursor.next) {
      continueFetching = false;
    }
    tokens.push(...tokensData.data);
    cursor = tokensData.meta.cursor.next;
  }
  return tokens;
};

export const preloadOrcaTokens = async () => {
  const tokens = await getOrcaTokens();
  PRELOADED_TOKENS.tokens = tokens;
  PRELOADED_TOKENS.time = new Date();
  return PRELOADED_TOKENS.tokens;
};

export const getPreloadedOrcaTokens = async (maxAgeInSeconds: number = 300) => {
  if (PRELOADED_TOKENS.tokens.length === 0 || differenceInSeconds(new Date(), PRELOADED_TOKENS.time) > maxAgeInSeconds) {
    await preloadOrcaTokens();
  }
  return PRELOADED_TOKENS.tokens;
};

/**
 * Fetches a specific Orca Whirlpool pool by address from the API
 * @param address The address of the Whirlpool pool
 * @returns A promise that resolves to a WhirlpoolResponse object
 */
export const fetchOrcaPoolByAddress = async (address: string) => {
  const whirlpoolsResponse = await fetch(`https://api.orca.so/v2/solana/pools/${address}?stats=5m,15m,30m,1H,2H,4H,8H,24H,7D,30D`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // no cache
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
  const whirlpoolsData = (await whirlpoolsResponse.json()) as { data: WhirlpoolInfo };
  return whirlpoolsData.data;
};

/**
 * Fetches and analyzes Orca Whirlpool positions for a given wallet address
 * @param walletAddress - The wallet address to fetch positions for
 * @param rpc - The RPC connection to use
 * @param pools - Optional list of whirlpools to fetch positions for
 * @returns A promise that resolves when all positions have been processed
 */
export const getOrcaPositions = async (walletAddress: string, rpc: any, pools?: WhirlpoolInfo[], funder?: TransactionSigner) => {
  try {
    // Fetch whirlpool list from Orca API
    const whirlpools = pools || (await fetchOrcaPools());
    //console.log(`Fetched ${whirlpools.length} whirlpools`);
    const whirlpoolsMap = new Map(whirlpools.map((pool) => [pool.address, pool]));
    const owner = address(walletAddress);

    // Fetch all positions for the owner
    const positions = await fetchPositionsForOwner(rpc, owner);

    const mappedPositions: OrcaPosition[] = [];
    for (const position of positions) {
      if (!isPositionBundle(position)) {
        const whirlpoolAddr = position.data.whirlpool.toString();

        // Get whirlpool info from our map
        let whirlpoolInfo = whirlpoolsMap.get(whirlpoolAddr);
        if (!whirlpoolInfo) {
          whirlpoolInfo = await fetchOrcaPoolByAddress(whirlpoolAddr);
          if (!whirlpoolInfo) {
            console.log(`[getOrcaPositions] No whirlpool info found for ${whirlpoolAddr}`);
            continue;
          }
          whirlpoolsMap.set(whirlpoolAddr, whirlpoolInfo);
        }
        const onChainPool = await getOnChainPool(whirlpoolInfo, rpc);
        const price = onChainPool.price;

        // Get the tickspacing from the whirlpool info
        const tickSpacing = whirlpoolInfo.tickSpacing;

        const sqrtPrice = priceToSqrtPrice(price, whirlpoolInfo.tokenA.decimals, whirlpoolInfo.tokenB.decimals);
        const isInRange = isPositionInRange(sqrtPrice, position.data.tickLowerIndex, position.data.tickUpperIndex);
        const lowerPrice = convertTickToPrice(position.data.tickLowerIndex, whirlpoolInfo.tokenA.decimals, whirlpoolInfo.tokenB.decimals, tickSpacing);
        const upperPrice = convertTickToPrice(position.data.tickUpperIndex, whirlpoolInfo.tokenA.decimals, whirlpoolInfo.tokenB.decimals, tickSpacing);

        const { positionMint } = position.data;
        const slippageToleranceBps = 100;
        const { feesQuote, quote: closeQuote } = await closePositionInstructions(
          rpc,
          positionMint,
          { slippageToleranceBps, authority: funder }
        );
        const fees = convertPositionFees(feesQuote, whirlpoolInfo.tokenA.decimals, whirlpoolInfo.tokenB.decimals);

        const obj = {
          //TODO: check: sometimes token symbols seem to be other way around
          name: `${whirlpoolInfo.tokenA.symbol}/${whirlpoolInfo.tokenB.symbol}`,
          fees,
          isInRange,
          whirlpool: {
            address: whirlpoolInfo.address,
            price: whirlpoolInfo.price,
            tickSpacing: whirlpoolInfo.tickSpacing,
          },
          address: position.address,
          data: {
            liquidity: position.data.liquidity.toString(),
            positionMint: position.data.positionMint,
            tickLowerIndex: position.data.tickLowerIndex,
            tickUpperIndex: position.data.tickUpperIndex,
            feeGrowthCheckpointA: position.data.feeGrowthCheckpointA.toString(),
            feeGrowthCheckpointB: position.data.feeGrowthCheckpointB.toString(),
          },
          closeQuote: {
            tokenEstA: closeQuote.tokenEstA.toString(),
            tokenMinA: closeQuote.tokenMinA.toString(),
            tokenEstB: closeQuote.tokenEstB.toString(),
            tokenMinB: closeQuote.tokenMinB.toString(),
          },
          tokenA: whirlpoolInfo.tokenA,
          tokenB: whirlpoolInfo.tokenB,
          currentMarketPrice: price.toString(),
          lowerPrice,
          upperPrice,
        };
        mappedPositions.push(obj);
      }
    }

    return mappedPositions;
  } catch (error) {
    console.error("Error fetching Orca positions:", error);
    throw error;
  }
};

/**
 * Calculates the estimated yield for a given position.
 * @param params - The parameters for the yield calculation.
 * @returns The estimated yield.
 * @throws Will throw an error if the position is not found or if the stats are not available.
 */
export const getEstimatedYield = async (params: PositionYieldRange | PositionYieldLimits) => {
  const { poolAddress, tokenAAmountUSD, tokenBAmountUSD, statsType } = params;
  let { liquidity, fees, rewards } = params;
  let { pool } = params;
  if (!tokenAAmountUSD && !tokenBAmountUSD) throw new Error("At least one of tokenAAmountUSD or tokenBAmountUSD must be provided");
  if (tokenAAmountUSD && tokenBAmountUSD) throw new Error("Only one of tokenAAmountUSD or tokenBAmountUSD should be provided");

  if (!pool) pool = await fetchOrcaPoolByAddress(poolAddress);
  if (poolAddress !== pool.address) throw new Error("Pool address does not match");
  const price = Number(pool.price);
  if (!liquidity) liquidity = Number(pool.liquidity);

  const priceResults = await Promise.all([getUSDPrice({ mintAddress: pool.tokenA.address }), getUSDPrice({ mintAddress: pool.tokenB.address })]);
  const tokenAPrice = priceResults[0];
  const tokenBPrice = priceResults[1];
  const tokenAAmount = tokenAAmountUSD ? tokenAAmountUSD / tokenAPrice : undefined;
  const tokenBAmount = tokenBAmountUSD ? tokenBAmountUSD / tokenBPrice : undefined;

  let lowerMultiple: number = 0;
  let upperMultiple: number = 0;
  if ("range" in params) {
    const { range } = params;
    lowerMultiple = 1 - range / 2;
    upperMultiple = 1 + range / 2;
  } else if ("lowerLimit" in params && "upperLimit" in params) {
    const { lowerLimit, upperLimit } = params;
    lowerMultiple = lowerLimit / price;
    upperMultiple = upperLimit / price;
  } else throw new Error("Range or lowerLimit and upperLimit must be provided");

  const increaseLiquidityQuote = tokenAAmount ? increaseLiquidityQuoteB : increaseLiquidityQuoteA;
  let lamports = 0n;
  if (tokenAAmount) lamports = convertDecimalToRaw(tokenAAmount, pool.tokenA.decimals);
  if (tokenBAmount) lamports = convertDecimalToRaw(tokenBAmount, pool.tokenB.decimals);
  // const MAX_U64 = (2n ** 64n) - 1n;
  // if (lamports > MAX_U64) throw new Error('Requested amount too large for u64');
  const lowerTick = getInitializableTickIndex(priceToTickIndex(price * lowerMultiple, pool.tokenA.decimals, pool.tokenB.decimals), pool.tickSpacing);
  const upperTick = getInitializableTickIndex(priceToTickIndex(price * upperMultiple, pool.tokenA.decimals, pool.tokenB.decimals), pool.tickSpacing);
  const quote = increaseLiquidityQuote(
    lamports,
    100, //slippageToleranceBps
    priceToSqrtPrice(price, pool.tokenA.decimals, pool.tokenB.decimals),
    lowerTick,
    upperTick
  );

  //TODO: calculate with avg pool liq from last x h / days for more accurate yield
  const liqShare = Number(quote.liquidityDelta) / liquidity;
  const stats = pool.stats[statsType || "24h"];
  if (!stats) throw new Error(`No stats found for ${statsType}`);

  const tokenAValue = convertRawToDecimal(BigInt(quote.tokenEstA), pool.tokenA.decimals) * tokenAPrice;
  const tokenBValue = convertRawToDecimal(BigInt(quote.tokenEstB), pool.tokenB.decimals) * tokenBPrice;
  const positionValue = tokenAValue + tokenBValue;
  //expcted 24h yield
  if (!fees) fees = Number(stats.fees);
  if (!rewards) rewards = Number(stats.rewards);
  const expYield = ((fees + rewards) * liqShare) / positionValue;
  return expYield;
};

/**
 * Closes a position and harvests yield
 * @param rpc The RPC client
 * @param wallet The wallet signer
 * @param position The position to close
 * @returns A promise that resolves when the position is closed
 * @throws Will throw an error if the position is not found
 * @throws SolanaError if the transaction fails
 */
export const closePositionAndHarvestYield = async (
  rpc: any,
  wallet: TransactionSigner,
  position: OrcaPosition & { [key: string]: any }
): Promise<{ signature: Signature; details: TransactionDetails }> => {
  const positionMint = address(position.data.positionMint);
  const { instructions: closeInstructions, feesQuote, rewardsQuote } = await closePositionInstructions(rpc, positionMint);
  console.log("[closePositionAndHarvestYield] got close instructions");

  // const rewardsOwed = rewardsQuote.rewards.reduce((acc, reward) => acc + Number(reward.rewardsOwed), 0);
  // const hasOwedFees = feesQuote.feeOwedA > 0 || feesQuote.feeOwedB > 0;
  // const hasOwedRewards = rewardsOwed > 0;
  // const instructions: Instruction[] = [];
  // let harvestDetails: TransactionDetails | undefined;
  // //if outstanding fees or rewards - harvest
  // if (hasOwedFees || hasOwedRewards) {
  //   const { instructions: harvestInstructions } = await harvestPositionInstructions(rpc, positionMint);
  //   if (joinInstructions) instructions.push(...harvestInstructions);
  //   else {
  //     const { signature, details } = await executeInstructions(rpc, wallet, harvestInstructions);
  //     harvestDetails = details;
  //     console.log("[closePositionAndHarvestYield] executed harvest instructions");
  //     await sleep(500);
  //   }
  // }
  // instructions.push(...closeInstructions);
  console.log("[closePositionAndHarvestYield] executing final instructions");

  const { signature, details } = await executeInstructions(rpc, wallet, closeInstructions);
  if (!signature) throw new Error("Failed to close position");
  console.log(`Position closed: ${signature}`);

  // if (harvestDetails) {
  //   details.changes = joinTransactionChanges(harvestDetails.changes, details.changes);
  //   details.feeUSD = details.feeUSD + harvestDetails.feeUSD;
  // }

  return {
    details,
    signature,
  };
};

export const getOnChainPool = async (whirlpool: WhirlpoolInfo, rpc: any) => {
  const result = await fetchWhirlpool(rpc, address(whirlpool.address));
  const { data: pool } = result;
  const price = sqrtPriceToPrice(pool.sqrtPrice, whirlpool.tokenA.decimals, whirlpool.tokenB.decimals);
  return {
    ...pool,
    price,
  };
};

const SKIP_DUST_THRESHOLD = Number(process.env.SKIP_DUST_THRESHOLD || 0.1);
export const openPosition = async ({
  rpc,
  whirlpoolAddress,
  params,
  price,
  lowerMultiple,
  upperMultiple,
  slippageToleranceBps,
  wallet,
  swapDustToAddress,
  walletByteArray,
  maxGasUSD,
}: OpenPositionParams) => {
  console.log("[openPosition] Getting quote");
  const { instructions, positionMint, initializationCost } = await openPositionInstructions(
    rpc,
    whirlpoolAddress,
    params,
    price * lowerMultiple,
    price * upperMultiple,
    { slippageToleranceBps, funder: wallet }
  );
  const initCostDecimal = convertRawToDecimal(initializationCost, 9); //SOL
  //non-refundable cost
  if (initCostDecimal > 0) throw new OrcaError(`[openPosition] Initialization cost too high: ${initCostDecimal} SOL`, 999n);
  const { signature, details } = await executeInstructions(rpc, wallet, instructions);

  console.log("[openPosition] token max amounts", params);

  let swapSignature;
  let swapLoss = 0;
  if (swapDustToAddress) {
    if (!walletByteArray) throw new Error("Private key needed to swap dust");
    console.log(`Swapping dust`);
    const walletChanges = details.changes.filter((c) => c.owner === wallet.address);
    const tokenChanges = walletChanges.filter((c) => c.mint !== swapDustToAddress && c.mint !== SOL_MINT_ADDRESS);

    for (const change of tokenChanges) {
      if (change.mint === positionMint) continue;
      const fromAmount = change.amount.toString();
      //TODO: if dust is about 2 USD cents, skip swap as gas fee is same or even higher - not worth it
      const price = await getUSDPrice({ mintAddress: change.mint });
      const amountUSD = change.amountDecimal * price;
      // dust is valued less than 10 cents
      if (amountUSD < SKIP_DUST_THRESHOLD) {
        console.log(`Skipping swap for dust ${change.mint} ${amountUSD}`);
        continue;
      }
      let retries = 0;
      while (retries < 3) {
        const maxPriceImpact = retries > 0 ? 0.05 : 0.02; //default
        try {
          const swapDetails = await swapAssets({
            rpc,
            fromAmount,
            fromTokenAddress: change.mint,
            toTokenAddress: swapDustToAddress,
            walletByteArray,
            maxPriceImpact,
            maxGasUSD,
            maxRetries: 5, // default
          });
          swapSignature = swapDetails.signature;
          details.feeUSD += swapDetails.feeUSD;
          swapLoss += swapDetails.valueLoss;
          // TODO: join changes on mint address and sum up changes
          // details.changes.push(...swapDetails.details.changes);
          console.log(`Successfully swapped ${fromAmount} ${change.mint} to ${swapDustToAddress}`);
          break;
        } catch (error: any) {
          await sleep(1000 * (retries + 1));
          console.error(`Failed to swap ${fromAmount} ${change.mint} to ${swapDustToAddress}`, error?.message || error);
        }
        retries++;
      }
    }
  }
  return {
    positionMint,
    signature,
    details,
    swapSignature,
    swapLoss,
  };
};

/**
 * Calculate divergence (impermanent) loss and details in a CLMM range.
 * Basically just the loss in value difference form just HODLing the tokens vs LPing them.
 * @param p   Current price (tokenB per tokenA)
 * @param p_i Initial price at position entry
 * @param p_a Lower price bound of the range
 * @param p_b Upper price bound of the range
 * @param depositA Initial deposit amount of token A
 * @param depositB Initial deposit amount of token B
 * @returns   Object with impermanent loss and related values
 */
export const divergenceLoss = (p: number, p_i: number, p_a: number, p_b: number, depositA: number, depositB: number): DivergenceLossResult => {
  if (p_a >= p_b) throw new Error("Invalid range");
  const sqrt = Math.sqrt;
  const inv = (x: number) => 1 / x;

  // Compute liquidity constant for the range
  const sqrtPi = sqrt(p_i);
  const sqrtPa = sqrt(p_a);
  const sqrtPb = sqrt(p_b);
  const L = depositB / (sqrtPi - sqrtPa);

  // Determine token amounts at current price
  let amountA: number;
  let amountB: number;
  if (p <= p_a) {
    amountA = depositA + depositB / p_a;
    amountB = 0;
  } else if (p >= p_b) {
    amountA = 0;
    amountB = depositB + depositA * p_b;
  } else {
    const sqrtP = sqrt(p);
    amountA = L * (inv(sqrtP) - inv(sqrtPb));
    amountB = L * (sqrtP - sqrtPa);
  }

  // Compute values
  const holdValue = depositA * p + depositB;
  const lpValue = amountA * p + amountB;
  const totalIL = lpValue / holdValue - 1;

  const changeA = amountA - depositA;
  const changeB = amountB - depositB;
  const ilAPct = depositA ? (changeA / depositA) * 100 : null;
  const ilBPct = depositB ? (changeB / depositB) * 100 : null;

  return { totalIL, amountA, amountB, changeA, changeB, ilAPct, ilBPct, holdValue, lpValue };
};

export const getLiquidityInTicks = async ({ poolAddress, rpc }: GetLiquidityInTicksParams) => {
  const [whirlpool, onChainPool] = await Promise.all([fetchOrcaPoolByAddress(poolAddress), fetchWhirlpool(rpc, address(poolAddress))]);

  const { tickCurrentIndex } = onChainPool.data;
  const { tokenA, tokenB, tickSpacing } = whirlpool;

  // compute price window around current price
  const priceNow = tickIndexToPrice(tickCurrentIndex, tokenA.decimals, tokenB.decimals);

  // fetch and sort all tick arrays for this pool
  const filter = fixedTickArrayWhirlpoolFilter(address(whirlpool.address));
  const tickArrays = await fetchAllFixedTickArrayWithFilter(rpc, [filter]);
  tickArrays.sort((a, b) => a.data.startTickIndex - b.data.startTickIndex);

  const data: Array<{ tickIndex: number; price: number; liquidity: number }> = [];
  let liquidity = 0n;

  // sweep from left to right using liquidityNet
  for (const ta of tickArrays) {
    const { startTickIndex, ticks } = ta.data;
    for (let i = 0; i < ticks.length; i++) {
      const tickIndex = startTickIndex + i * tickSpacing;
      const tick = ticks[i];
      if (!tick.initialized) continue;

      liquidity += BigInt(tick.liquidityNet);

      const price = convertTickToPrice(tickIndex, tokenA.decimals, tokenB.decimals, tickSpacing);
      data.push({ tickIndex, price, liquidity: Number(liquidity) });
    }
  }

  return { data, currentPrice: priceNow };
};
