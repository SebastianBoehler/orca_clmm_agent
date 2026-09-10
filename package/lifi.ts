import {
  ChainId,
  getQuote,
  createConfig,
  Solana,
  KeypairWalletAdapter,
  config,
  RouteExtended,
  convertQuoteToRoute,
  executeRoute,
  SDKError,
  BaseError,
  ErrorName,
  TransactionRequestParameters,
  TransactionRequest,
} from "@lifi/sdk";
import { awaitTransactionStatus, COMPUTATIONAL_BUDGET_EXCEEDED_ERROR, getTransactionDetails, Rpc, SLIPPAGE_EXCEEDED_ERROR, SOL_MINT_ADDRESS } from "./solana";
import { convertRawToDecimal, getUSDPrice, sleep } from "./utils";
import dotenv from "dotenv";
import {
  address,
  createKeyPairSignerFromBytes,
  getBase64Encoder,
  getTransactionDecoder,
  Signature,
  signTransactionMessageWithSigners,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SolanaError,
  TransactionSigner,
} from "@solana/kit";
import { TransactionDetails } from "./types";
import bs58 from "bs58";
import { Connection, Keypair, VersionedTransaction, ComputeBudgetProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getJupiterSwapQuote } from "./jupiter";
import { OrcaError } from "./orca.types";
import { INVALID_START_TICK_ERROR } from "./orca";
import {
  isAmbiguousTransactionTimeout,
  submitSimulatedSolanaTransaction,
} from "./transaction-safety";
dotenv.config();

const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

createConfig({
  integrator: process.env.LIFI_INTEGRATOR || "orca-clmm-agent",
  preloadChains: true,
  apiKey: process.env.LIFI_API_KEY,
});

export interface GetLIFISwapQuoteParams {
  fromAmount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  privateKey: string;
  slippage?: number;
  maxPriceImpact?: number;
  maxGasUSD?: number;
}

const NoQuoteWithinPriceImpactError = (msg: string) => new SDKError(new BaseError(ErrorName.NotFoundError, 404, msg));

export const getLIFISwapQuote = async ({
  fromAmount,
  fromTokenAddress,
  toTokenAddress,
  privateKey,
  slippage = 0.005, // 0.5%
  maxPriceImpact = 0.03, // hides with price impact >= 3%
  maxGasUSD = 0.1,
}: GetLIFISwapQuoteParams) => {
  const [fromTokenUSDPrice, toTokenUSDPrice] = await Promise.all([
    getUSDPrice({ mintAddress: fromTokenAddress }),
    getUSDPrice({ mintAddress: toTokenAddress }),
  ]);
  console.log("fromTokenUSDPrice", fromTokenUSDPrice);
  console.log("toTokenUSDPrice", toTokenUSDPrice);
  if (fromTokenAddress === SOL_MINT_ADDRESS) fromTokenAddress = address("11111111111111111111111111111111");
  if (toTokenAddress === SOL_MINT_ADDRESS) toTokenAddress = address("11111111111111111111111111111111");
  const walletAdapter = new KeypairWalletAdapter(privateKey);
  config.setProviders([
    Solana({
      getWalletAdapter: async () => walletAdapter,
    }),
  ]);
  const walletAddress = walletAdapter.publicKey?.toString();
  if (!walletAddress) {
    throw new Error("Failed to get wallet address");
  }
  const quote = await getQuote({
    fromChain: ChainId.SOL,
    toChain: ChainId.SOL,
    fromAmount,
    fromToken: fromTokenAddress,
    toToken: toTokenAddress,
    fromAddress: walletAddress,
    toAddress: walletAddress,
    //maxPriceImpact,
    slippage,
    skipSimulation: true,
  });
  const { estimate, action } = quote;
  if (!estimate) throw new Error("[getLIFISwapQuote] Failed to get quote");
  //const { toAmountUSD, fromAmountUSD } = estimate;
  const { toAmount } = estimate;
  const gasCostsUSD = estimate.gasCosts?.[0].amountUSD || 0;
  if (+gasCostsUSD > maxGasUSD) {
    throw new Error(`[getLIFISwapQuote] Gas costs exceed max ${maxGasUSD} (${gasCostsUSD})`);
  }
  // if (!toAmountUSD || !fromAmountUSD) {
  //   throw new Error("[getLIFISwapQuote] No toAmountUSD or fromAmountUSD");
  // }
  console.log(`[LIFI] Price Impact:`, +estimate.toAmountUSD! - +estimate.fromAmountUSD!);
  const { fromToken, toToken } = action;
  const toAmountUSD = convertRawToDecimal(BigInt(toAmount), toToken.decimals) * toTokenUSDPrice;
  const fromAmountUSD = convertRawToDecimal(BigInt(fromAmount), fromToken.decimals) * fromTokenUSDPrice;
  console.log("Difference in toAmountUSD", +quote.estimate.toAmountUSD! / toAmountUSD);
  quote.estimate.fromAmountUSD = fromAmountUSD.toString();
  quote.estimate.toAmountUSD = toAmountUSD.toString();
  const priceImpact = (+toAmountUSD - +fromAmountUSD) / +fromAmountUSD;
  if (priceImpact < maxPriceImpact * -1) {
    const maxPriceImpactPct = (maxPriceImpact * 100).toFixed(3);
    const priceImpactPct = (priceImpact * 100).toFixed(3);
    console.error(`Price impact ${priceImpactPct}% exceeds max ${maxPriceImpactPct}%`);
    console.log(`From: $${fromAmountUSD} -> To: $${toAmountUSD}`);
    throw NoQuoteWithinPriceImpactError(`Price impact exceeds max ${maxPriceImpactPct}%`);
  }

  const fees = quote.estimate.feeCosts?.filter((fee) => fee.amount !== "0") || [];
  //console.log("Fees:", fees);
  if (fees.some((fee) => fee.name !== "Rent Exemption Deposit")) {
    console.warn("Quote includes non-rent exemption deposit fees");
  }

  return quote;
};

export const getLIFITransactionLinks = (route: RouteExtended) => {
  const transactionLinks: string[] = [];
  route.steps.forEach((step, index) => {
    step.execution?.process.forEach((process) => {
      if (process.txHash) {
        transactionLinks.push(process.txHash);
      }
    });
  });
  return transactionLinks;
};

export interface SwapAssetsParams {
  rpc: Rpc;
  fromAmount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  walletByteArray: Uint8Array;
  slippage?: number;
  maxPriceImpact?: number;
  maxRetries?: number;
  confirmation?: "confirmed" | "finalized";
  maxGasUSD?: number;
}

export const swapAssets = async ({
  rpc,
  fromAmount,
  fromTokenAddress,
  toTokenAddress,
  walletByteArray,
  slippage = 0.005, // 0.5%
  maxPriceImpact = 0.02, // 2%
  maxRetries = 5,
  confirmation = "finalized",
  maxGasUSD,
}: SwapAssetsParams): Promise<TransactionDetails & { valueLoss: number }> => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log(`[swapAssets] Getting quote to swap ${fromAmount} with max price impact ${maxPriceImpact}`);
      //console.log(`From token: ${fromTokenAddress}`);
      //console.log(`To token: ${toTokenAddress}`);
      const privateKey = bs58.encode(walletByteArray);
      const wallet = await createKeyPairSignerFromBytes(walletByteArray);
      const quote = await getLIFISwapQuote({
        fromAmount,
        fromTokenAddress,
        toTokenAddress,
        privateKey,
        slippage,
        maxPriceImpact,
        maxGasUSD,
      });
      if (!quote.transactionRequest) throw new Error("[swapAssets] No transaction request");
      const gasCostsUSD = quote.estimate.gasCosts?.[0].amountUSD;
      console.log("gasCosts for swap in USD:", gasCostsUSD, quote.estimate.gasCosts?.[0].amount);

      //TODO: simluate trx to properly calculate price impact?

      const signature = await manuallExecuteLIFISwap(quote.transactionRequest, privateKey);
      const route = convertQuoteToRoute(quote);
      const fromUSD = +(quote.estimate.fromAmountUSD || 0);
      const toUSD = +(quote.estimate.toAmountUSD || 0);
      const priceImpact = (toUSD - fromUSD) / fromUSD;
      console.log(`${route.fromToken.symbol} -> ${route.toToken.symbol}:`);
      console.log(`From: $${fromUSD} -> To: $${toUSD}`);
      //console.log("Expected to amount", quote.estimate.toAmount);
      console.log(`Price Impact: $${toUSD - fromUSD}`);
      console.log(`Price Impact: ${(priceImpact * 100).toFixed(3)}%`);
      console.log("txHash: ", signature);
      await awaitTransactionStatus(rpc, signature, confirmation);
      const details = await getTransactionDetails(rpc, signature);
      const toTokenChange = details.changes.find((c) => c.mint === toTokenAddress && c.owner === wallet.address);
      if (!toTokenChange) throw new Error("No change in to token found");
      const actualToAmount = toTokenChange.changeDecimal;
      const toTokenUSDPrice = await getUSDPrice({ mintAddress: toTokenAddress });
      const actualToUSD = actualToAmount * toTokenUSDPrice;
      console.log("toTokenUSDPrice", toTokenUSDPrice);
      //console.log("Actual to amount", actualToAmount);
      console.log(`From: $${fromUSD} -> To: $${actualToUSD}`);
      console.log("Actual Price Impact: $", actualToUSD - fromUSD, " token received", actualToAmount);

      const feesUSD = quote.estimate.feeCosts?.reduce((acc, fee) => acc + +fee.amountUSD, 0) || 0;
      console.log("Fees for swap: $", feesUSD);
      details.feeUSD += feesUSD;

      return {
        ...details,
        valueLoss: actualToUSD - fromUSD,
        priceImpact,
      };
    } catch (error: any) {
      retries++;
      if (error instanceof SDKError) {
        if (error.message.includes("No available quotes")) {
          console.log(`[swapAssets] No quote found`);
        } else if (error.message.includes("Price impact exceeds max")) {
          console.log(`[swapAssets] Price impact exceeds max`);
        } else if (error.message.includes("Too Many Requests")) {
          console.log(`[swapAssets] Too many requests`);
          const minutes = error.message.match(/retry in (\d+) minute/);
          const hours = error.message.match(/retry in (\d+) hour/);
          if (minutes) {
            console.log(`[swapAssets] Retrying in ${minutes[1]} minutes`);
            await sleep(1000 * 60 * Number(minutes[1]));
            continue;
          }
          if (hours) {
            console.log(`[swapAssets] Retrying in ${hours[1]} hours`);
            await sleep(1000 * 60 * 60 * Number(hours[1]));
            continue;
          }
        } else console.error(`[swapAssets] Failed to execute swap: ${error}`);
        await sleep(1000 * 25);
        continue;
      }
      if (error instanceof Error) {
        if (error.message.includes("Gas costs exceed max")) {
          console.log(error.message);
          await sleep(1000 * 5);
          continue;
        }
        if (isAmbiguousTransactionTimeout(error)) {
          throw error;
        }
      }
      if (error instanceof SolanaError) {
        const code = error.context?.code;
        if (code === SLIPPAGE_EXCEEDED_ERROR || code === Number(SLIPPAGE_EXCEEDED_ERROR)) {
          console.log("[swapAssets] Slippage exceeded error");
          await sleep(1000 * 5);
          continue;
        }
        if (code === COMPUTATIONAL_BUDGET_EXCEEDED_ERROR) {
          console.log("[swapAssets] Computational budget exceeded error");
          await sleep(1000 * 5);
          continue;
        }
        if (error.message.includes("Program failed to complete")) {
          // probably missing priority fee
          console.log("[swapAssets] Program failed to complete");
          await sleep(1000 * 5);
          continue;
        }
      }
      if (error instanceof OrcaError) {
        if (error.code === INVALID_START_TICK_ERROR) {
          console.log("[swapAssets] Orca Invalid start tick error");
          await sleep(1000 * 5);
          continue;
        }
      }
      console.error("unhandled error in swapAssets", error);
      throw error;
    }
  }
  throw new Error(`[swapAssets] Failed to execute swap after ${maxRetries} retries, seems no quotes available`);
};

export const manuallExecuteLIFISwap = async (transactionRequest: TransactionRequest, privateKey: string) => {
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey)); // get Solana keypair
    if (!transactionRequest.data) throw new Error("[manuallExecuteLIFISwap] No transaction data");

    const connection = new Connection(rpcUrl, "confirmed"); // create a connection
    const decodedTx = getBase64Encoder().encode(transactionRequest.data) as Uint8Array;
    const deserializedTx = VersionedTransaction.deserialize(decodedTx); // deserialize decoded tx data into VersionedTransaction

    deserializedTx.sign([keypair]); // sign the tx with your keypair

    // Abort if total required fee exceeds user-defined max
    // const MAX_FEE_LAMPORTS = 150_000; // ≈ $0.01 at $150/SOL
    // try {
    //   const feeCheckResp = await connection.getFeeForMessage(deserializedTx.message, "confirmed");
    //   const totalFeeLamports = feeCheckResp.value ?? 0;
    //   if (totalFeeLamports > MAX_FEE_LAMPORTS) {
    //     throw new Error(`[manuallExecuteLIFISwap] Required fee ${totalFeeLamports} lamports exceeds max ${MAX_FEE_LAMPORTS}`);
    //   }
    // } catch (feeErr) {
    //   console.warn("[manuallExecuteLIFISwap] Fee check failed:", feeErr);
    // }

    const signature = await submitSimulatedSolanaTransaction(connection, deserializedTx);

    return signature as Signature;
  } catch (error: any) {
    console.error(`[manuallExecuteLIFISwap] Failed to execute swap: ${error}`);
    throw new SolanaError(SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, error);
  }
};
