import { estimateComputeUnitLimitFactory, getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { TransactionDetails, WhirlpoolToken } from "./types";
import { fetchOrcaPools, INVALID_START_TICK_ERROR, LIQUIDITY_ZERO_ERROR, TOKEN_MAX_EXCEEDED_ERROR, TOKEN_MIN_SUBCEEDED_ERROR } from "./orca";
import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import {
  Address,
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSolanaErrorFromTransactionError,
  Instruction,
  mainnet,
  pipe,
  prependTransactionMessageInstructions,
  RpcMainnet,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransaction,
  signTransactionMessageWithSigners,
  SolanaRpcApiDevnet,
  SolanaRpcApiMainnet,
  TransactionSigner,
} from "@solana/kit";
import { convertRawToDecimal, getUSDPrice, sleep } from "./utils";
import { differenceInSeconds } from "date-fns";
import { OrcaError } from "./orca.types";
import { getCloseAccountInstruction } from "@solana-program/token-2022";

/**
 * Interface for token with balance information
 */
export interface TokenWithBalance extends WhirlpoolToken {
  balance: {
    amount: string;
    decimals: number;
    uiAmount: number;
    uiAmountString: string;
  };
}

export interface TokenWithBalanceAndPrice extends TokenWithBalance {
  usdPrice: number;
  usdValue: number;
}

export type Rpc = RpcMainnet<SolanaRpcApiMainnet | SolanaRpcApiDevnet>;

export const INSUFFICIENT_FUNDS_ERROR = 1n;
export const SLIPPAGE_EXCEEDED_ERROR = 15001n;
export const COMPUTATIONAL_BUDGET_EXCEEDED_ERROR = 4615038n;
export const TRANSACTION_TIMEOUT_THRESHOLD = Number(process.env.TRANSACTION_TIMEOUT_THRESHOLD || 60);

/**
 * Native SOL mint address
 */
export const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
export const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const PYUSD_MINT_ADDRESS = "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo";

export const TOKEN_PROGRAM_ID = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
//some tokens might need 2022 token program can be verified by fetching min account and checking owner field

/**
 * Fetches SOL and token balances for a given wallet address
 * @param walletAddress The Solana wallet address to fetch balances for
 * @param rpcUrl Optional RPC URL (defaults to mainnet)
 * @returns Promise resolving to an array of tokens with balances (including SOL)
 */
export async function fetchTokensWithBalanceByWallet(
  walletAddress: string,
  rpcUrl: string = "https://api.mainnet-beta.solana.com"
): Promise<TokenWithBalance[]> {
  // Create RPC connection
  const rpc = createSolanaRpc(mainnet(rpcUrl));

  // Convert wallet address string to address
  const walletAddr = address(walletAddress);

  // Fetch token accounts, SOL balance, and Orca pools in parallel
  const [tokensResponse, solBalanceResponse, pools] = await Promise.all([
    // Fetch token accounts owned by the wallet
    rpc.getTokenAccountsByOwner(walletAddr, { programId: TOKEN_PROGRAM_ID }, { encoding: "jsonParsed" }).send(),
    // Fetch SOL balance
    rpc.getBalance(walletAddr).send(),
    fetchOrcaPools(),
  ]);

  const { value: tokensInWallet } = tokensResponse;
  const { value: solBalance } = solBalanceResponse;

  const tokens = [...pools.map((pool) => pool.tokenA), ...pools.map((pool) => pool.tokenB)];

  // Create a unique set of tokens (removing duplicates)
  const uniqueTokens = tokens.reduce((acc: WhirlpoolToken[], token) => {
    if (!acc.some((t) => t.address === token.address)) {
      acc.push(token);
    }
    return acc;
  }, []);

  // Map token accounts to token metadata with balance
  const tokensWithBalance: TokenWithBalance[] = tokensInWallet
    .map(({ account }) => {
      const mint = account.data.parsed.info.mint;
      const match = uniqueTokens.find((token) => token.address === mint);

      if (!match) return null;

      return {
        ...match,
        balance: account.data.parsed.info.tokenAmount,
      } as TokenWithBalance;
    })
    .filter((token): token is TokenWithBalance => token !== null);

  // Find SOL token from uniqueTokens
  const solToken = uniqueTokens.find((token) => token.address === SOL_MINT_ADDRESS || token.symbol === "SOL");

  if (solToken) {
    // Create SOL token with balance
    const solTokenWithBalance: TokenWithBalance = {
      ...solToken,
      balance: {
        amount: solBalance.toString(),
        decimals: 9,
        uiAmount: convertRawToDecimal(solBalance, 9),
        uiAmountString: convertRawToDecimal(solBalance, 9).toString(),
      },
    };

    // Add SOL to the beginning of the tokens array
    return [solTokenWithBalance, ...tokensWithBalance];
  }

  // If SOL token not found in uniqueTokens, return just the other tokens
  return tokensWithBalance;
}

/**
 * Fetches token balances for a given wallet address and returns only tokens with non-zero balances
 * @param walletAddress The Solana wallet address to fetch balances for
 * @param rpcUrl Optional RPC URL (defaults to mainnet)
 * @returns Promise resolving to an array of tokens with balances
 */
export async function fetchNonZeroTokenBalances(walletAddress: string, rpcUrl?: string): Promise<TokenWithBalanceAndPrice[]> {
  const tokens = await fetchTokensWithBalanceByWallet(walletAddress, rpcUrl);
  const filtered = tokens.filter((token) => Number(token.balance.uiAmount) > 0);
  const usdPrices = await Promise.all(filtered.map((token) => getUSDPrice({ mintAddress: token.address })));
  filtered.forEach((token: any, index) => {
    token.usdPrice = usdPrices[index];
    token.usdValue = token.balance.uiAmount * token.usdPrice;
  });
  return filtered as TokenWithBalanceAndPrice[];
}

export async function loadKeypairFromFile(filePath: string) {
  const resolvedPath = path.resolve(filePath.startsWith("~") ? filePath.replace("~", homedir()) : filePath);
  const loadedKeyBytes = Uint8Array.from(JSON.parse(readFileSync(resolvedPath, "utf8")));
  return loadedKeyBytes;
}

/**
 * Executes a set of instructions on the Solana blockchain
 * @param rpc The Solana RPC client
 * @param wallet The wallet to sign the transaction with
 * @param instructions The instructions to execute
 * @returns The signature of the executed transaction
 * @throws Error if the transaction fails
 */
export async function executeInstructions(rpc: Rpc, wallet: TransactionSigner, instructions: Instruction[]) {
  //create transaction message
  const latestBlockHash = await rpc.getLatestBlockhash().send();
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(wallet.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash.value, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );

  //estimate compute unit and estimate fee
  const getComputeUnitEstimateForTransactionMessage = estimateComputeUnitLimitFactory({ rpc });
  const [computeUnitEstimate, medianPrioritizationFee] = await Promise.all([
    getComputeUnitEstimateForTransactionMessage(transactionMessage),
    rpc
      .getRecentPrioritizationFees()
      .send()
      .then((fees) => fees.map((fee) => Number(fee.prioritizationFee)).sort((a, b) => a - b)[Math.floor(fees.length / 2)]),
  ]);
  //console.log(`Compute unit estimate: ${computeUnitEstimate}`);
  //console.log(`Median prioritization fee: ${medianPrioritizationFee}`);
  const transactionMessageWithComputeUnitInstructions = prependTransactionMessageInstructions(
    [
      getSetComputeUnitLimitInstruction({ units: computeUnitEstimate + 100_000 }),
      getSetComputeUnitPriceInstruction({ microLamports: medianPrioritizationFee }),
    ],
    transactionMessage
  );

  //sign and submit
  const signedTransaction = await signTransactionMessageWithSigners(transactionMessageWithComputeUnitInstructions);
  const base64EncodedWireTransaction = getBase64EncodedWireTransaction(signedTransaction);

  // Might need loop to get signature, if not loaded first try
  const signature = await rpc
    .sendTransaction(base64EncodedWireTransaction, {
      maxRetries: 3n,
      skipPreflight: true,
      encoding: "base64",
      //preflightCommitment: 'confirmed' // depth of simulation
    })
    .send();

  await sleep(250);
  await awaitTransactionStatus(rpc, signature, "finalized");

  const details = await getTransactionDetails(rpc, signature);
  const fee = details.meta?.fee || 0n;
  const feeDecimals = convertRawToDecimal(fee, 9);
  console.log("Tx fee in SOL:", feeDecimals, "USD:", details.feeUSD);
  console.log("Tx Hash:", signature);

  return { signature, details };
}

export async function awaitTransactionStatus(rpc: Rpc, signature: Signature, status: "confirmed" | "finalized") {
  console.log(`[awaitTransactionStatus] Waiting for transaction ${signature} to be ${status}`);
  const startTime = new Date();
  while (true) {
    const statuses = await rpc.getSignatureStatuses([signature]).send();
    if (statuses.value[0] && !statuses.value[0].err) {
      const confirmationStatus = statuses.value[0].confirmationStatus;
      if (confirmationStatus === status) {
        //console.log(`[awaitTransactionStatus] Transaction ${signature}: ${confirmationStatus}`)
        break;
      }
    } else if (statuses.value[0]?.err) {
      console.error(`[awaitTransactionStatus] Error from transaction`);
      const error = statuses.value[0].err;
      const isInstructionError = checkForInstructionError(error);
      if (isInstructionError) {
        console.error(`[awaitTransactionStatus] Transaction failed: ${error.InstructionError[1].Custom}`);
        const errCode = error.InstructionError[1].Custom;
        if (errCode === TOKEN_MAX_EXCEEDED_ERROR) {
          throw new OrcaError(`[awaitTransactionStatus] exceeds max amount`, TOKEN_MAX_EXCEEDED_ERROR);
        }
        if (errCode === TOKEN_MIN_SUBCEEDED_ERROR) {
          throw new OrcaError(`[awaitTransactionStatus] subceeds min amount`, TOKEN_MIN_SUBCEEDED_ERROR);
        }
        if (errCode === INVALID_START_TICK_ERROR) {
          throw new OrcaError(`[awaitTransactionStatus] invalid start tick`, INVALID_START_TICK_ERROR);
        }
        if (errCode === LIQUIDITY_ZERO_ERROR) {
          throw new OrcaError(`[awaitTransactionStatus] liquidity amount is zero`, LIQUIDITY_ZERO_ERROR);
        }
      }
      const solanaError = getSolanaErrorFromTransactionError(error);
      throw solanaError;
    }
    await sleep(1000);
    const elapsedTime = differenceInSeconds(new Date(), startTime);
    if (elapsedTime > TRANSACTION_TIMEOUT_THRESHOLD) {
      //console.error(`[awaitTransactionStatus] Transaction ${signature} timed out`);
      //TODO:handle SolanaError: custom program error: #6001
      throw new Error(`[awaitTransactionStatus] Transaction timed out: ${signature}`);
    }
  }
}

export async function getTransactionDetails(rpc: Rpc, signature: Signature) {
  const details = await rpc
    .getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      encoding: "jsonParsed",
    })
    .send();
  if (!details) {
    throw new Error("Failed to get transaction details");
  }

  //assuming index 0 is always wallet
  const accountKeys = details.transaction.message.accountKeys;
  const solMint = address(SOL_MINT_ADDRESS);
  //const wallet = details.transaction.message.accountKeys[0];
  const preTokenBalances = details.meta?.preTokenBalances || [];
  const postTokenBalances = details.meta?.postTokenBalances || [];
  //calculate and get all tokens with their balances and balance change
  const changes = [];
  for (const pre of preTokenBalances) {
    //parse raw string
    const { amount, decimals } = pre.uiTokenAmount;
    const post = postTokenBalances?.find((p) => p.mint === pre.mint && p.owner === pre.owner);
    if (post) {
      const { amount: postAmount } = post.uiTokenAmount;
      const changeAmount = BigInt(postAmount) - BigInt(amount);
      if (changeAmount === 0n) continue;
      const change = {
        mint: pre.mint,
        owner: pre.owner,
        amount: BigInt(postAmount),
        amountDecimal: convertRawToDecimal(BigInt(postAmount), decimals),
        change: changeAmount,
        changeDecimal: convertRawToDecimal(changeAmount, decimals),
      };
      changes.push(change);
    }
  }

  // Handle new tokens received that were not in preTokenBalances (e.g., first time swap)
  for (const post of postTokenBalances) {
    if (!preTokenBalances.some((pre) => pre.mint === post.mint && pre.owner === post.owner)) {
      const { amount, decimals } = post.uiTokenAmount;
      const changeAmount = BigInt(amount);
      if (changeAmount === 0n) continue;
      changes.push({
        mint: post.mint,
        owner: post.owner,
        amount: changeAmount,
        amountDecimal: convertRawToDecimal(changeAmount, decimals),
        change: changeAmount,
        changeDecimal: convertRawToDecimal(changeAmount, decimals),
      });
    }
  }

  const preBalances = details.meta?.preBalances || [];
  const postBalances = details.meta?.postBalances || [];

  for (let idx = 0; idx < accountKeys.length; idx++) {
    const account = accountKeys[idx];
    const changeLamports = postBalances[idx] - preBalances[idx];
    if (changeLamports !== 0n) {
      const change = {
        mint: solMint,
        owner: account.pubkey,
        amount: BigInt(postBalances[idx]),
        amountDecimal: convertRawToDecimal(BigInt(postBalances[idx]), 9),
        change: BigInt(changeLamports),
        changeDecimal: convertRawToDecimal(BigInt(changeLamports), 9),
      };
      changes.push(change);
    }
  }

  const solPrice = await getUSDPrice({ mintAddress: SOL_MINT_ADDRESS });
  const fee = details.meta?.fee || 0n;
  const feeDecimals = convertRawToDecimal(fee, 9);
  const feeUSD = feeDecimals * solPrice;

  return { ...details, changes, feeUSD, signature } as unknown as TransactionDetails;
}

export interface CreatedAssociatedTokenAccount {
  ata: Address;
  owner: Address | undefined;
  mint: Address;
}

/**
 * Parses transaction details to find any associated token accounts created.
 * @param details Transaction details from {@link getTransactionDetails}
 * @returns Array of created ATA information
 */
export const getCreatedAssociatedTokenAccounts = (details: TransactionDetails): CreatedAssociatedTokenAccount[] => {
  const created: CreatedAssociatedTokenAccount[] = [];
  const accountKeys = details.transaction.message.accountKeys;
  const instructions = details.transaction.message.instructions;

  // First pass: detect created ATAs
  for (const ix of instructions) {
    const programMatch = ix.program === "spl-associated-token-account" || ix.programId === ASSOCIATED_TOKEN_PROGRAM_ID.toString();
    if (!programMatch) continue;

    // Handle both compiled and parsed (jsonParsed) instruction formats
    if (Array.isArray(ix.accounts) && ix.accounts.length >= 4) {
      // Compiled format: account indices point into message.accountKeys
      const ataKey = accountKeys[ix.accounts[1]];
      const ownerKey = accountKeys[ix.accounts[2]];
      const mintKey = accountKeys[ix.accounts[3]];

      const ata = address((ataKey as any).pubkey ?? ataKey);
      const owner = address((ownerKey as any).pubkey ?? ownerKey);
      const mint = address((mintKey as any).pubkey ?? mintKey);

      created.push({ ata, owner, mint });
    } else if ((ix as any).parsed && (ix as any).parsed.info) {
      // Parsed format (jsonParsed): extract fields from the info object
      const info: any = (ix as any).parsed.info;
      const ata = address(info.account);
      const mint = address(info.mint);
      // The owner field may be named owner, wallet, or source depending on SPL-ATA version
      const ownerRaw: string | undefined = info.owner ?? info.wallet ?? info.source;
      const owner = ownerRaw ? address(ownerRaw) : undefined;
      created.push({ ata, owner, mint });
    }
  }

  // Second pass: remove ATAs that are closed in the same transaction
  for (const ix of instructions) {
    if (ix.program === "spl-token" || ix.programId === TOKEN_PROGRAM_ID.toString()) {
      if ((ix as any).parsed?.type === "closeAccount") {
        const ataToClose = address((ix as any).parsed.info.account);
        const index = created.findIndex((c) => c.ata.toString() === ataToClose.toString());
        if (index !== -1) {
          created.splice(index, 1);
        }
      }
    }
  }

  return created;
};

export async function closeAssociatedTokenAccount(rpc: Rpc, wallet: TransactionSigner, ata: Address) {
  //TODO: needs to be tested
  const closeTokenAccountIx = getCloseAccountInstruction({
    account: ata,
    destination: wallet.address,
    owner: wallet.address,
  });

  return await executeInstructions(rpc, wallet, [closeTokenAccountIx]);
}

export async function simulateTransaction(rpc: Rpc, wallet: TransactionSigner, instructions: Instruction[]) {
  //create transaction message
  const latestBlockHash = await rpc.getLatestBlockhash().send();
  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(wallet.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash.value, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );

  //estimate compute unit and estimate fee
  const getComputeUnitEstimateForTransactionMessage = estimateComputeUnitLimitFactory({
    rpc,
  });
  const computeUnitEstimate = await getComputeUnitEstimateForTransactionMessage(transactionMessage);
  const medianPrioritizationFee = await rpc
    .getRecentPrioritizationFees()
    .send()
    .then((fees) => fees.map((fee) => Number(fee.prioritizationFee)).sort((a, b) => a - b)[Math.floor(fees.length / 2)]);
  console.log(`Compute unit estimate: ${computeUnitEstimate}`);
  console.log(`Median prioritization fee: ${medianPrioritizationFee}`);
  const transactionMessageWithComputeUnitInstructions = prependTransactionMessageInstructions(
    [
      getSetComputeUnitLimitInstruction({ units: computeUnitEstimate + 100_000 }),
      getSetComputeUnitPriceInstruction({ microLamports: medianPrioritizationFee }),
    ],
    transactionMessage
  );

  //sign and submit
  // @ts-ignore
  const signedTransaction = await signTransactionMessageWithSigners(transactionMessageWithComputeUnitInstructions);
  const base64EncodedWireTransaction = getBase64EncodedWireTransaction(signedTransaction);

  const simulationResult = await rpc
    .simulateTransaction(base64EncodedWireTransaction, {
      //skipPreflight: true,
      encoding: "base64",
    })
    .send();
  if (simulationResult.value.err) {
    console.error("Simulation error:", simulationResult.value.err);
    throw simulationResult.value.err;
  }

  const estimatedFee = simulationResult.value.unitsConsumed || 0n;
  console.log("Estimated Fee:", estimatedFee);
  const decimal = convertRawToDecimal(estimatedFee, 9);
  console.log("Estimated Fee in SOL:", decimal);

  return {
    estimatedFee: decimal,
  };
}

export type InstrErrorDetail = { Custom: BigInt };
export type InstructionError = { InstructionError: [BigInt, InstrErrorDetail] };

export function checkForInstructionError(err: any): err is InstructionError {
  return (
    err?.InstructionError &&
    typeof err.InstructionError[0] === "bigint" &&
    err.InstructionError[1] !== undefined &&
    typeof (err.InstructionError[1] as InstrErrorDetail).Custom === "bigint"
  );
}
