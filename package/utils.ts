import {
  closePositionAndHarvestYield,
  divergenceLoss,
  fetchOrcaPoolByAddress,
  getOnChainPool,
  getOrcaPositions,
  INVALID_START_TICK_ERROR,
  LIQUIDITY_ZERO_ERROR,
  openPosition,
  TOKEN_MAX_EXCEEDED_ERROR,
  TOKEN_MIN_SUBCEEDED_ERROR,
} from "./orca";
import { PythPriceService } from "./pyth";
import { analyzePositionBalance } from "./analysis";
import {
  INSUFFICIENT_FUNDS_ERROR,
  PYUSD_MINT_ADDRESS,
  Rpc,
  SOL_MINT_ADDRESS,
  TokenWithBalance,
  USDC_MINT_ADDRESS,
  awaitTransactionStatus,
  checkForInstructionError,
  fetchNonZeroTokenBalances,
} from "./solana";
import { BalanceChange, DetailedPosition, OrcaPosition, WhirlpoolInfo } from "./types";
import { ChainId, getToken, getTokens as getLIFITokens, Token } from "@lifi/sdk";
import { IncreaseLiquidityParam } from "@orca-so/whirlpools";
import { getInitializableTickIndex, increaseLiquidityQuoteA, increaseLiquidityQuoteB, priceToTickIndex } from "@orca-so/whirlpools-core";
import { swapAssets } from "./lifi";
import { fromUnixTime, differenceInSeconds } from "date-fns";
import { Address, address, SolanaError, TransactionSigner } from "@solana/kit";
import { AssertionError } from "assert";
import { chunk } from "lodash";
import { getJupiterUSDPrice } from "./jupiter";
import { OrcaError } from "./orca.types";

const pythService = new PythPriceService();
interface TokenWithTime extends Token {
  time: Date;
}
const preloadedTokens: { tokens: TokenWithTime[]; time: Date } = { tokens: [], time: new Date() };

export const getTokens = async () => {
  const { tokens: result } = await getLIFITokens({ chains: [ChainId.SOL] });
  const tokens = result[ChainId.SOL];
  // update prices from jupiter, chunks of 50
  const chunks = chunk(
    tokens.map((token) => token.address),
    50
  );
  for (const chunk of chunks) {
    const result = await getJupiterUSDPrice(chunk);
    for (const [id, obj] of Object.entries(result)) {
      const token = tokens.find((token) => token.address === id);
      if (token) {
        token.priceUSD = obj.usdPrice;
        // @ts-ignore
        token.time = new Date();
      }
    }
  }
  return tokens as TokenWithTime[];
};

export const preloadTokens = async () => {
  const tokens = await getTokens();
  preloadedTokens.tokens = tokens;
  preloadedTokens.time = new Date();
  return tokens;
};

export const getPreloadedTokens = async (maxAgeInSeconds: number = 300) => {
  if (preloadedTokens.tokens.length === 0 || differenceInSeconds(new Date(), preloadedTokens.time) > maxAgeInSeconds) {
    await preloadTokens();
  }
  return preloadedTokens.tokens;
};

/**
 * Token with balance and USD price information
 */
export interface TokenWithPrice extends TokenWithBalance {
  usdPrice: number;
  usdValue: number;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const priceCacheThreshold = Number(process.env.PRICE_CACHE_THRESHOLD || 60);
export async function getUSDPrice({ mintAddress }: { mintAddress: string }) {
  let token = preloadedTokens.tokens.find((token) => token.address === mintAddress);
  if (token) {
    const age = differenceInSeconds(new Date(), token.time);
    if (age < priceCacheThreshold) return +token.priceUSD;
  }

  // get token from LI.FI
  token = {
    ...(await getToken(ChainId.SOL, mintAddress)),
    time: new Date(),
  };
  if (token) {
    const result = await getJupiterUSDPrice([token.address]);
    if (result[token.address]) token.priceUSD = result[token.address].usdPrice;
    // update or push
    if (preloadedTokens.tokens.find((token) => token.address === mintAddress)) {
      preloadedTokens.tokens = preloadedTokens.tokens.map((token) => (token.address === mintAddress ? { ...token, priceUSD: token.priceUSD } : token));
    } else {
      preloadedTokens.tokens.push(token);
    }
    return +token.priceUSD;
  }
  if (mintAddress === PYUSD_MINT_ADDRESS) return 1;

  throw new Error(`[getUSDPrice] Failed to get price for ${mintAddress}`);
}

/**
 * Fetches tokens with balances and adds USD price information
 * @param walletAddress The wallet address to fetch tokens for
 * @param rpcUrl Optional RPC URL
 * @returns Promise resolving to an array of tokens with balances and USD prices
 */
export async function fetchTokensWithPrices(walletAddress: string, rpcUrl?: string): Promise<TokenWithPrice[]> {
  // Get tokens with non-zero balances
  const balances = await fetchNonZeroTokenBalances(walletAddress, rpcUrl);
  //TODO: use getTokens from lifi sdk, includes usdPrice

  // Process tokens in parallel to add price information
  const tokensWithPrices = await Promise.all(
    balances.map(async (balance) => {
      try {
        // Get USD price from Pyth
        const usdPrice = await getUSDPrice({ mintAddress: balance.address });

        // Calculate USD value based on token balance
        const usdValue = convertRawToDecimal(BigInt(balance.balance.amount), balance.decimals) * usdPrice;

        // Return token with added price information
        return {
          ...balance,
          usdPrice,
          usdValue,
        };
      } catch (error) {
        console.warn(`Failed to get price for ${balance.symbol}:`, error);
        // If price fetch fails, return token with zero price/value
        return {
          ...balance,
          usdPrice: 0,
          usdValue: 0,
        };
      }
    })
  );

  // Sort tokens by USD value (highest first)
  return tokensWithPrices.sort((a, b) => b.usdValue - a.usdValue);
}

/**
 * Computes the nearest total range deviation and finds the closest match from a set of range choices.
 * @param current Current pool price
 * @param lowerPrice Lower range price
 * @param upperPrice Upper range price
 * @param ranges Array of range choices (e.g. [0.05, 0.1, 0.15])
 * @returns The closest range value
 */
export function computeNearestTotalRange(current: number, lowerPrice: number, upperPrice: number, ranges: number[]): number {
  // Calculate percent deltas
  const downPct = ((current - lowerPrice) / current) * 100;
  const upPct = ((upperPrice - current) / current) * 100;
  // Total deviation
  const total = (downPct + upPct) / 100;
  // Find the closest range label
  const result = ranges.reduce((closest, r) => (Math.abs(r - total) < Math.abs(closest - total) ? r : closest));
  return result;
}

export const getDetailedPositions = async (
  walletAddress: string,
  rpc: Rpc,
  baseTokenSymbol: string,
  pools?: WhirlpoolInfo[],
  rangeChoices: number[] = [0.05, 0.1, 0.15, 0.2],
  funder?: TransactionSigner
) => {
  const positions = await getOrcaPositions(walletAddress, rpc, pools, funder);
  const detailedPositions: DetailedPosition[] = [];

  for (const position of positions) {
    const [tokenAPrice, tokenBPrice] = await Promise.all([
      getUSDPrice({ mintAddress: position.tokenA.address }),
      getUSDPrice({ mintAddress: position.tokenB.address }),
    ]);

    const { relativePosition } = analyzePositionBalance(position);

    const feeAValueUSD = position.fees.feeAmountA * tokenAPrice;
    const feeBValueUSD = position.fees.feeAmountB * tokenBPrice;
    const totalFeesUSD = feeAValueUSD + feeBValueUSD;
    const { closeQuote } = position;

    const mintSignatures = await rpc.getSignaturesForAddress(address(position.address)).send();
    const blockTime = mintSignatures[mintSignatures.length - 1].blockTime;
    const timestamp = fromUnixTime(Number(blockTime));

    //estimate
    const tokenAValue = convertRawToDecimal(BigInt(closeQuote.tokenEstA), position.tokenA.decimals) * tokenAPrice;
    const tokenBValue = convertRawToDecimal(BigInt(closeQuote.tokenEstB), position.tokenB.decimals) * tokenBPrice;
    const positionValueUSD = tokenAValue + tokenBValue;
    //min value
    const minTokenAValue = convertRawToDecimal(BigInt(closeQuote.tokenMinA), position.tokenA.decimals) * tokenAPrice;
    const minTokenBValue = convertRawToDecimal(BigInt(closeQuote.tokenMinB), position.tokenB.decimals) * tokenBPrice;
    const minPositionValueUSD = minTokenAValue + minTokenBValue;

    // Compute the range using the new utility
    const range = computeNearestTotalRange(+position.currentMarketPrice, position.lowerPrice, position.upperPrice, rangeChoices);

    detailedPositions.push({
      ...position,
      tokenAPrice,
      tokenAAmount: convertRawToDecimal(BigInt(closeQuote.tokenEstA), position.tokenA.decimals),
      tokenBPrice,
      tokenBAmount: convertRawToDecimal(BigInt(closeQuote.tokenEstB), position.tokenB.decimals),
      relativePosition,
      totalFeesUSD,
      createdAt: timestamp,
      positionValueUSD: {
        est: positionValueUSD,
        min: minPositionValueUSD,
      },
      range,
      baseTokenSymbol,
    });
  }

  return detailedPositions;
};

export const tokenAddressToSymbol = async (address: string) => {
  const token = await getToken(ChainId.SOL, address);
  return token.symbol;
};

/**
 * Converts a raw token amount (in smallest units) to decimal format
 * @param rawAmount The amount in smallest units (BigInt)
 * @param decimals The number of decimal places for the token
 * @returns The human-readable decimal amount
 */
export const convertRawToDecimal = (rawAmount: bigint, decimals: number): number => {
  return Number(rawAmount) / Math.pow(10, decimals);
};

export const convertDecimalToRaw = (decimalAmount: number, decimals: number): bigint => {
  return BigInt(Math.round(decimalAmount * Math.pow(10, decimals)));
};

export interface OpenUSDCPositionParams {
  rpc: Rpc;
  whirlpoolAddress: Address;
  wallet: TransactionSigner;
  walletByteArray: Uint8Array;
  baseTokenAddress: Address;
  baseTokenAmount: number;
  lowerMultiple: number;
  upperMultiple: number;
  maxSwapAttempts?: number;
  maxGasUSD?: number;
  maxPriceImpact?: number;
  swapDustToAddress?: Address;
}

/**
 * Opens a position with a base token
 * @returns A promise that resolves when the position is opened
 * @throws Error if the initialization cost is too high
 */
export async function openPositionWithBaseToken({
  rpc,
  whirlpoolAddress,
  wallet,
  walletByteArray,
  baseTokenAddress,
  baseTokenAmount,
  lowerMultiple,
  upperMultiple,
  maxSwapAttempts = 30,
  maxGasUSD = 0.1,
  maxPriceImpact = 0.01,
  swapDustToAddress,
}: OpenUSDCPositionParams) {
  const slippageToleranceBps = 100;
  const whirlpool = await fetchOrcaPoolByAddress(whirlpoolAddress);

  const isTokenABase = whirlpool.tokenA.address === baseTokenAddress;
  const baseToken = isTokenABase ? whirlpool.tokenA : whirlpool.tokenB;
  const pairToken = isTokenABase ? whirlpool.tokenB : whirlpool.tokenA;
  const pairTokenPriceUSD = await getUSDPrice({ mintAddress: pairToken.address });
  const baseTokenPriceUSD = baseTokenAddress === USDC_MINT_ADDRESS ? 1 : await getUSDPrice({ mintAddress: baseTokenAddress });

  const onChainPool = await getOnChainPool(whirlpool, rpc);
  const { price } = onChainPool;

  let portfolio = baseTokenAmount;
  if (baseTokenAddress === SOL_MINT_ADDRESS) portfolio -= 0.05; //0.05 min balance in SOL to keep
  if (portfolio < 0) throw new Error(`[openPos] Negative portfolio: ${portfolio}`);
  //relation between upper and lower multiple if both same difference to 1
  const relation = (upperMultiple - lowerMultiple) / (1 - lowerMultiple);
  const baseDeposit = portfolio / relation;
  const lamports = convertDecimalToRaw(baseDeposit, baseToken.decimals);

  const increaseQuote = isTokenABase ? increaseLiquidityQuoteA : increaseLiquidityQuoteB;

  const lowerTick = priceToTickIndex(price * lowerMultiple, whirlpool.tokenA.decimals, whirlpool.tokenB.decimals);
  const upperTick = priceToTickIndex(price * upperMultiple, whirlpool.tokenA.decimals, whirlpool.tokenB.decimals);
  const quote = increaseQuote(
    lamports,
    slippageToleranceBps,
    BigInt(onChainPool.sqrtPrice),
    getInitializableTickIndex(lowerTick, whirlpool.tickSpacing, false),
    getInitializableTickIndex(upperTick, whirlpool.tickSpacing, true)
  );
  if (quote.liquidityDelta === 0n) {
    console.log(`[openPos] Liquidity delta is 0, no valid quote found`, relation, lamports);
    return;
  }

  const reqTokenAmountRaw = isTokenABase ? quote.tokenEstB : quote.tokenEstA;
  const reqTokenAmount = convertRawToDecimal(reqTokenAmountRaw, pairToken.decimals);
  //console.log(`Required ${PairToken.symbol}: `, reqTokenAmount)
  const pairAmountUSD = reqTokenAmount * pairTokenPriceUSD;
  const baseAmountUSD = baseDeposit * baseTokenPriceUSD;
  const portfolioUSD = portfolio * baseTokenPriceUSD;

  const posValue = baseAmountUSD + pairAmountUSD;
  //const ratioUSDC = baseAmountUSD / posValue;
  const ratioPair = pairAmountUSD / posValue;
  // console.log(`Ratio: `, ratioUSDC.toFixed(3), ratioPair.toFixed(3));
  // console.log(`Est ${baseToken.symbol}`, portfolio * ratioUSDC);
  // console.log(`Est ${pairToken.symbol}`, (portfolio * ratioPair) / pairTokenPriceUSD);

  //so we need ratioPair of portfolio in the pair token
  const usdValueOfPairTokenNeeded = portfolioUSD * ratioPair;
  // so much base token we need to swap to get the pair token
  const amountOfBaseTokenNeeded = usdValueOfPairTokenNeeded / baseTokenPriceUSD;
  const fromAmount = convertDecimalToRaw(amountOfBaseTokenNeeded, baseToken.decimals).toString();
  const details = await swapAssets({
    rpc,
    fromAmount,
    fromTokenAddress: baseTokenAddress,
    toTokenAddress: pairToken.address,
    walletByteArray,
    slippage: 0.005,
    maxPriceImpact,
    maxRetries: maxSwapAttempts,
    confirmation: "finalized",
    maxGasUSD,
  });
  await sleep(1000);

  const tokenChange = details.changes.find((c) => c.owner === wallet.address && c.mint === pairToken.address);
  if (!tokenChange) {
    console.log(details);
    throw new Error(`[openPos] Token change of ${pairToken.address} not found`);
  }
  //console.log(`[openPos] ${pairToken.symbol} change: ${tokenChange.amountDecimal}`);
  const baseChange = details.changes.find((c) => c.owner === wallet.address && c.mint === baseTokenAddress);
  if (!baseChange) throw new Error(`[openPos] ${baseToken.symbol} change not found`);
  let baseBalance = baseChange.amountDecimal;
  //ensure 0.05 min balance in SOL
  if (baseTokenAddress === SOL_MINT_ADDRESS) baseBalance -= 0.05;

  let createdPosition = false;
  let multiplier = 1;
  //refetch for latest price
  while (!createdPosition) {
    const slippageIncluded = tokenChange.amountDecimal * (1 - slippageToleranceBps / 10000);
    const depositAmount = convertDecimalToRaw(slippageIncluded * multiplier, pairToken.decimals);
    //console.log(`[openPos] Deposit amount ${pairToken.symbol}: ${slippageIncluded * multiplier}`);
    const onChainPool = await getOnChainPool(whirlpool, rpc).catch(async (error) => {
      if (error.message.includes("Too Many Requests")) {
        console.log("getOnChainPool error: Too many requests");
        await sleep(1000 * 20);
      } else console.log("getOnChainPool error", error.message || error, typeof error);
      return { price: null, sqrtPrice: null };
    });
    const { price, sqrtPrice } = onChainPool;
    if (!price) continue;
    //console.log('whirlpool price now', price)
    const lowerTick = priceToTickIndex(price * lowerMultiple, whirlpool.tokenA.decimals, whirlpool.tokenB.decimals);
    const upperTick = priceToTickIndex(price * upperMultiple, whirlpool.tokenA.decimals, whirlpool.tokenB.decimals);

    const inverseIncreaseQuote = isTokenABase ? increaseLiquidityQuoteB : increaseLiquidityQuoteA;
    const oppositeQuote = inverseIncreaseQuote(
      depositAmount,
      slippageToleranceBps,
      BigInt(sqrtPrice),
      getInitializableTickIndex(lowerTick, whirlpool.tickSpacing, false),
      getInitializableTickIndex(upperTick, whirlpool.tickSpacing, true)
    );
    const params: IncreaseLiquidityParam = {
      tokenMaxA: oppositeQuote.tokenMaxA,
      tokenMaxB: oppositeQuote.tokenMaxB,
    };
    const baseKey = isTokenABase ? "tokenMaxA" : "tokenMaxB";
    const maxBase = convertRawToDecimal(oppositeQuote[baseKey], baseToken.decimals);

    if (baseBalance < maxBase) {
      //console.log(`Required max ${baseToken.symbol}: ${maxBase}, but only ${baseBalance} available -> Reducing multiplier`);
      multiplier -= 0.001; //0.1%
      await sleep(250);
      continue;
    }

    //if multiplier is at 1 meaning we deposit all of pair token we account less USDC utilization
    if (maxBase < baseBalance * 0.95 && multiplier < 1) {
      //console.log(`[openPos] Utilizing too little ${baseToken.symbol}, skipping`);
      if (multiplier < 1) multiplier += 0.01; //1%
      await sleep(250);
      continue;
    }

    try {
      const openResult = await openPosition({
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
      });
      createdPosition = true;
      return {
        swapSignature: details.signature,
        swapLoss: details.valueLoss + openResult.swapLoss,
        swapPriceImpact: details.priceImpact,
        positionSignature: openResult.signature,
        positionMint: openResult.positionMint,
        feeUSD: details.feeUSD + openResult.details.feeUSD,
        tokenAPriceUSD: isTokenABase ? baseTokenPriceUSD : pairTokenPriceUSD,
        tokenBPriceUSD: isTokenABase ? pairTokenPriceUSD : baseTokenPriceUSD,
      };
    } catch (error: any) {
      if (error instanceof OrcaError) {
        const { message, name } = error;
        const code = error.code;
        if (code === TOKEN_MAX_EXCEEDED_ERROR || code === TOKEN_MIN_SUBCEEDED_ERROR) {
          //console.log(`[openPos] Token amount exceeded error: `, message);
          multiplier -= 0.0025; //0.25%
          await sleep(1000);
          continue;
        }
        if (code === LIQUIDITY_ZERO_ERROR) {
          console.log(`[openPositionWithBaseToken] Liquidity zero error: `, message);
          await sleep(1000);
          continue;
        }
        if (code === INVALID_START_TICK_ERROR) {
          console.log(`[openPositionWithBaseToken] Invalid start tick error: `, message);
          //hope on price change?
          await sleep(1000);
          continue;
        }
        if (message.includes("Initialization cost too high")) {
          console.warn(`[openPositionWithBaseToken] Initialization cost too high error: `, message);
          // swap back into base token and throw error
          const swapBackResult = await swapAssets({
            rpc,
            fromAmount: tokenChange.amount.toString(),
            fromTokenAddress: tokenChange.mint,
            toTokenAddress: baseTokenAddress,
            walletByteArray,
            slippage: 0.005,
            maxPriceImpact: 0.01,
            maxRetries: maxSwapAttempts,
            confirmation: "finalized",
            maxGasUSD,
          });

          return {
            signatures: [details.signature, swapBackResult.signature],
            swapLoss: details.valueLoss + swapBackResult.valueLoss,
            feeUSD: details.feeUSD + swapBackResult.feeUSD,
            error: error,
          };
        }
      }
      if (error instanceof SolanaError) {
        const reason = (error.cause ? error.cause : error) as SolanaError;
        if (checkForInstructionError(reason)) {
          const account = reason.InstructionError[0];
          const code = reason.InstructionError[1].Custom;
          if (code === INSUFFICIENT_FUNDS_ERROR) {
            //quote probably has changed in meantime
            console.log(`[openPositionWithBaseToken] Transaction failed due to insufficient funds error`, account);
            await sleep(1000);
            continue;
          }
          if (code === LIQUIDITY_ZERO_ERROR) {
            console.log(`[openPositionWithBaseToken] Transaction failed due to liquidity zero error`, account);
            await sleep(1000);
            continue;
          }
        }
        if (reason.message && reason.message.includes("Too Many Requests")) {
          //console.log(`[openPositionWithBaseToken] Too many requests error: `, error.message);
          await sleep(1000 * 15);
          continue;
        }
        console.error(`[openPositionWithBaseToken] SolanaError cause: `, reason);
      }
      if (error instanceof AssertionError) {
        if (error.message.includes("not have the required balance")) {
          //console.log(`[openPos] Not enough ${baseToken.symbol} to open position error: `, error.message);
          multiplier -= 0.0025; //0.25%
          await sleep(1000);
          continue;
        }
      }
      if (error.message.includes("Transaction timed out")) {
        console.log(`[openPositionWithBaseToken] Transaction timed out error: `, error.message);
        await sleep(1000 * 15);
        continue;
      }

      console.error(`[openPositionWithBaseToken] Error opening position: `, error);
      throw error;
    }
  }
}

/**
 * Closes a position and harvests yield, handling errors gracefully
 * @param rpc The RPC client
 * @param wallet The wallet signer
 * @param position The position to close
 * @param maxRetries The maximum number of retries
 * @returns A promise that resolves when the position is closed
 */
export const closePositionGracefully = async (
  rpc: any,
  wallet: TransactionSigner,
  position: OrcaPosition & { [key: string]: any },
  maxRetries: number = 10
) => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const result = await closePositionAndHarvestYield(rpc, wallet, position);
      return result;
    } catch (error: any) {
      retries++;
      if (error instanceof SolanaError) {
        let { cause, message, context } = error;
        //TODO: create handler for errors and if cause feed cause into it
        if (message.includes("Transaction failed when it was simulated")) {
          if (checkForInstructionError(cause)) {
            const account = cause.InstructionError[0];
            const code = cause.InstructionError[1].Custom;
            switch (code) {
              case TOKEN_MAX_EXCEEDED_ERROR:
                console.log(`[closePositionGracefully] Transaction failed due to token max exceeded error`, account);
                break;
              case INSUFFICIENT_FUNDS_ERROR:
                console.log(`[closePositionGracefully] Transaction failed due to insufficient funds error`, account);
                break;
              case TOKEN_MIN_SUBCEEDED_ERROR:
                console.log(`[closePositionGracefully] Transaction failed due to token min exceeded error`, account);
                break;
              default:
                console.error(`[closePositionGracefully] Transaction failed due error: `, code);
            }
          }
          await sleep(1000 * 3);
          continue;
        }
        if (message.includes("Too Many Requests") || context?.statusCode === 429 || (cause instanceof SolanaError && cause.context?.statusCode === 429)) {
          console.log(`[closePositionGracefully] Too many requests error`);
          await sleep(1000 * 60);
          continue;
        }
        if (message.includes("Failed to estimate the compute unit consumption")) {
          console.log(`[closePositionGracefully] Failed to estimate the compute unit consumption for this transaction error`, error);
          await sleep(1000);
          continue;
        }
        if (message.includes("Account not found at address")) {
          console.log(`[closePositionGracefully] Seems like position was already closed`, error);
          return;
        }
        console.error(`[closePositionGracefully] Unhandled SolanaError: `, error);
      }
      if (error instanceof OrcaError) {
        console.error(`[closePositionGracefully] OrcaError: `, error.message);
        continue;
      }
      console.error(`[closePositionGracefully] Unhandled Error closing position: `, {
        error,
        message: error?.message,
        cause: error?.cause,
        name: error?.name,
      });
      throw error;
    }
  }
};

export interface ClosePositionWithBaseTokenParams {
  rpc: Rpc;
  wallet: TransactionSigner;
  position: OrcaPosition & { [key: string]: any };
  walletByteArray: Uint8Array;
  baseToken: string;
  maxPriceImpact?: number;
  maxGasUSD?: number;
  maxRetries?: number;
}

export const closePositionWithBaseToken = async ({
  rpc,
  wallet,
  position,
  walletByteArray,
  baseToken,
  maxPriceImpact = 0.02,
  maxGasUSD,
  maxRetries = 50,
}: ClosePositionWithBaseTokenParams) => {
  const closeResult = await closePositionGracefully(rpc, wallet, position);
  if (!closeResult) throw new Error("No close result found");
  await sleep(500);
  const changesInWallet = closeResult.details.changes.filter((c) => c.owner === wallet.address);
  const isTokenABase = position.tokenA.address === baseToken;
  const pairToken = isTokenABase ? position.tokenB : position.tokenA;
  const changeInPairToken = changesInWallet?.find((c) => c.mint === pairToken.address);
  if (!changeInPairToken)
    return {
      closeSignature: closeResult.details.signature,
      feeUSD: closeResult.details.feeUSD,
      swapLoss: 0,
    };
  let swapResult;
  while (!swapResult) {
    try {
      swapResult = await swapAssets({
        rpc,
        fromAmount: changeInPairToken.amount.toString(),
        fromTokenAddress: changeInPairToken.mint,
        toTokenAddress: baseToken,
        walletByteArray,
        slippage: 0.005,
        maxPriceImpact,
        maxRetries,
        confirmation: "finalized",
        maxGasUSD,
      });
    } catch (error) {
      if (error instanceof OrcaError) {
        if (error.message.includes("invalid start tick")) {
          continue;
        }
      }
      throw error;
    }
  }
  const changes = swapResult.changes;
  const changeInBaseToken = changes.find((c) => c.mint === baseToken);
  if (!changeInBaseToken) throw new Error("No change in base token found");
  console.log("changeInBaseToken", changeInBaseToken);

  const closeFees = closeResult.details.feeUSD! + swapResult.feeUSD;

  return {
    closeSignature: closeResult.details.signature,
    swapSignature: swapResult.signature,
    swapLoss: swapResult.valueLoss,
    feeUSD: closeFees,
  };
};

export const joinTransactionChanges = (earlierChanges: BalanceChange[], laterChanges: BalanceChange[]) => {
  const joined: BalanceChange[] = [];

  [...earlierChanges, ...laterChanges].forEach((change) => {
    const existingChange = joined.find((c) => c.mint === change.mint && c.owner === change.owner);
    if (existingChange) {
      existingChange.amount = change.amount;
      existingChange.amountDecimal = change.amountDecimal;
      existingChange.change = BigInt(Number(existingChange.change) + Number(change.change));
      existingChange.changeDecimal = existingChange.changeDecimal + change.changeDecimal;
    } else {
      joined.push(change);
    }
  });

  return joined;
};
