import {
  assertSuccessfulConfirmation,
  getLIFISwapQuote,
  SOL_MINT_ADDRESS,
  USDC_MINT_ADDRESS,
} from "orca-clmm-agent";
import { openPositionInstructions, setDefaultFunder } from "@orca-so/whirlpools";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import {
  executeAfterSimulation,
  liveEnabled,
  loadRuntime,
  parseAddressEnv,
  printLiveHeader,
  requireBigIntEnv,
  requireEnv,
  requireNumberEnv,
  rpcUrl,
} from "./common.ts";

type FlowStep = "swap" | "open";

const step = requireEnv("FLOW_STEP") as FlowStep;
if (step !== "swap" && step !== "open") {
  throw new Error("FLOW_STEP must be swap or open");
}

const { rpc, wallet, walletBytes } = await loadRuntime();
setDefaultFunder(wallet);
await printLiveHeader(wallet);

if (step === "swap") {
  await runSwapStep();
} else {
  await runOpenStep();
}

async function runSwapStep() {
  const fromAmount = requireEnv("FROM_AMOUNT_RAW");
  const fromTokenAddress = process.env.FROM_TOKEN || SOL_MINT_ADDRESS;
  const toTokenAddress = process.env.TO_TOKEN || USDC_MINT_ADDRESS;
  const slippage = Number(process.env.SLIPPAGE || "0.005");
  const maxPriceImpact = Number(process.env.MAX_PRICE_IMPACT || "0.02");
  const maxGasUSD = process.env.MAX_GAS_USD ? requireNumberEnv("MAX_GAS_USD") : undefined;
  const quote = await getLIFISwapQuote({
    fromAmount,
    fromTokenAddress,
    toTokenAddress,
    privateKey: bs58.encode(walletBytes),
    slippage,
    maxPriceImpact,
    maxGasUSD,
  });

  const transactionData = quote.transactionRequest?.data;
  if (!transactionData) {
    throw new Error("LI.FI quote did not include a Solana transaction");
  }
  if (Array.isArray(transactionData) && transactionData.length !== 1) {
    throw new Error(`Expected one LI.FI Solana transaction, received ${transactionData.length}`);
  }

  const serializedTransaction = Array.isArray(transactionData)
    ? transactionData[0]
    : transactionData;
  const tx = VersionedTransaction.deserialize(Buffer.from(String(serializedTransaction), "base64"));
  tx.sign([Keypair.fromSecretKey(walletBytes)]);
  const connection = new Connection(rpcUrl, "confirmed");
  const simulation = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  console.log(JSON.stringify({
    step,
    live: liveEnabled(),
    fromToken: quote.action.fromToken.address,
    toToken: quote.action.toToken.address,
    fromAmountRaw: quote.action.fromAmount,
    expectedToAmountRaw: quote.estimate.toAmount,
    estimatedFromUSD: quote.estimate.fromAmountUSD,
    estimatedToUSD: quote.estimate.toAmountUSD,
    gasUSD: quote.estimate.gasCosts?.[0]?.amountUSD || "0",
    feeCosts: quote.estimate.feeCosts?.map((fee) => ({
      name: fee.name,
      amount: fee.amount,
      amountUSD: fee.amountUSD,
      included: fee.included,
    })) || [],
    simulationErr: simulation.value.err,
    unitsConsumed: simulation.value.unitsConsumed ?? null,
    instructionRequirement: "Append a pre-submit action-log entry before rerunning this same step with EXECUTE_LIVE=1.",
  }, bigintReplacer, 2));

  if (simulation.value.err) {
    throw new Error(`Swap simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
  if (!liveEnabled()) return;

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    maxRetries: 3,
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  const confirmation = await connection.confirmTransaction(signature, "confirmed");
  assertSuccessfulConfirmation(confirmation);
  console.log(JSON.stringify({ step, submittedSignature: signature }, null, 2));
}

async function runOpenStep() {
  const pool = parseAddressEnv("ORCA_POOL");
  const lowerPrice = requireNumberEnv("LOWER_PRICE");
  const upperPrice = requireNumberEnv("UPPER_PRICE");
  const slippageBps = Number(process.env.SLIPPAGE_BPS || "100");
  const tokenMaxA = requireBigIntEnv("TOKEN_MAX_A_RAW");
  const tokenMaxB = requireBigIntEnv("TOKEN_MAX_B_RAW");
  const result = await openPositionInstructions(
    rpc,
    pool,
    { tokenMaxA, tokenMaxB },
    lowerPrice,
    upperPrice,
    { slippageToleranceBps: slippageBps, funder: wallet },
  );
  console.log(JSON.stringify({
    step,
    live: liveEnabled(),
    pool,
    lowerPrice,
    upperPrice,
    slippageBps,
    tokenMaxA,
    tokenMaxB,
    positionMint: result.positionMint,
    initializationCost: result.initializationCost,
    instructionCount: result.instructions.length,
    instructionRequirement: "Append a pre-submit action-log entry before rerunning this same step with EXECUTE_LIVE=1.",
  }, bigintReplacer, 2));

  if (!liveEnabled()) return;

  const signature = await executeAfterSimulation(rpc, wallet, result.instructions);
  console.log(JSON.stringify({
    step,
    positionMint: result.positionMint,
    submittedSignature: signature,
  }, bigintReplacer, 2));
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
