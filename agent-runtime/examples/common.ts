import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  mainnet,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  assertSuccessfulConfirmation,
  awaitTransactionStatus,
  loadKeypairFromFile,
  SOL_MINT_ADDRESS,
  TOKEN_PROGRAM_ID,
} from "orca-clmm-agent";
import {
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type TransactionInstruction,
} from "@solana/web3.js";

export const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
export const keypairPath = process.env.KEYPAIR_PATH || "/workspace/package/examples/keypair.json";
export const feePayerKeypairPath = process.env.SOLANA_FEE_PAYER_KEYPAIR_PATH;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function requireBigIntEnv(name: string): bigint {
  return BigInt(requireEnv(name));
}

export function requireNumberEnv(name: string): number {
  const value = Number(requireEnv(name));
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric env var: ${name}`);
  return value;
}

export function liveEnabled(): boolean {
  return process.env.EXECUTE_LIVE === "1";
}

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const maybeContext = error && typeof error === "object" && "context" in error
    ? (error as { context?: { statusCode?: number } }).context
    : undefined;
  return message.includes("429")
    || message.includes("421")
    || maybeContext?.statusCode === 429
    || maybeContext?.statusCode === 421;
}

export function isTransientRpcError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error && typeof error === "object" && "cause" in error
    ? (error as { cause?: { code?: string; message?: string } }).cause
    : undefined;
  return isRateLimitError(error)
    || message.includes("fetch failed")
    || message.includes("request to rpc timed out")
    || message.includes("Connect Timeout")
    || cause?.code === "UND_ERR_CONNECT_TIMEOUT";
}

export async function withRpcBackoff<T>(
  label: string,
  operation: () => Promise<T>,
  options: { attempts?: number; initialDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 7;
  const initialDelayMs = options.initialDelayMs ?? 2_000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientRpcError(error) || attempt === attempts - 1) {
        throw error;
      }
      const delayMs = initialDelayMs * 2 ** attempt;
      console.warn(`${label} hit a transient RPC error; retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts`);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadRuntime() {
  const rpc = createSolanaRpc(mainnet(rpcUrl));
  const bytes = await loadKeypairFromFile(keypairPath);
  const wallet = await createKeyPairSignerFromBytes(bytes);
  const feePayer = await loadSponsoredFeePayer();
  return { rpc, wallet, walletBytes: bytes, feePayer };
}

export async function loadWeb3Runtime() {
  const bytes = await loadKeypairFromFile(keypairPath);
  const keypair = Keypair.fromSecretKey(bytes);
  const feePayer = feePayerKeypairPath
    ? Keypair.fromSecretKey(await loadKeypairFromFile(feePayerKeypairPath))
    : undefined;
  const connection = new Connection(rpcUrl, "confirmed");
  return { connection, keypair, walletBytes: bytes, feePayer };
}

export async function loadSponsoredFeePayer() {
  if (!feePayerKeypairPath) return undefined;
  const bytes = await loadKeypairFromFile(feePayerKeypairPath);
  return createKeyPairSignerFromBytes(bytes);
}

export async function getSolAndTokenBalances(rpc: any, owner: Address): Promise<{
  solLamports: bigint;
  tokenAccounts: Array<{ mint: string; amount: bigint; decimals: number }>;
}> {
  const [sol, tokens] = await Promise.all([
    rpc.getBalance(owner).send(),
    rpc.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, { encoding: "jsonParsed" }).send(),
  ]);
  return {
    solLamports: BigInt(sol.value),
    tokenAccounts: tokens.value.map((item: any) => ({
      mint: item.account.data.parsed.info.mint,
      amount: BigInt(item.account.data.parsed.info.tokenAmount.amount),
      decimals: Number(item.account.data.parsed.info.tokenAmount.decimals),
    })),
  };
}

export function printBalanceSummary(label: string, snapshot: Awaited<ReturnType<typeof getSolAndTokenBalances>>) {
  console.log(`${label} SOL: ${formatRaw(snapshot.solLamports, 9)}`);
  for (const token of snapshot.tokenAccounts.filter((t) => t.amount !== 0n)) {
    console.log(`${label} token ${token.mint}: ${formatRaw(token.amount, token.decimals)} raw=${token.amount}`);
  }
}

export function formatRaw(raw: bigint, decimals: number): string {
  return (Number(raw) / 10 ** decimals).toString();
}

export async function printLiveHeader(wallet: TransactionSigner) {
  console.log(`Wallet: ${wallet.address}`);
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Native SOL mint: ${SOL_MINT_ADDRESS}`);
  console.log(`Sponsored fee payer: ${feePayerKeypairPath ? "configured" : "disabled"}`);
  console.log(`Live execution: ${liveEnabled() ? "enabled" : "disabled"}`);
}

export function parseAddressEnv(name: string) {
  return address(requireEnv(name));
}

export async function executeAfterSimulation(rpc: any, wallet: TransactionSigner, instructions: Instruction[]) {
  const latestBlockHash = await rpc.getLatestBlockhash().send();
  const feePayer = await loadSponsoredFeePayer();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => feePayer
      ? setTransactionMessageFeePayerSigner(feePayer, tx)
      : setTransactionMessageFeePayer(wallet.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash.value, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const wire = getBase64EncodedWireTransaction(signed);
  const simulation = await rpc.simulateTransaction(wire, { encoding: "base64" }).send();
  console.log(`Simulation units consumed: ${simulation.value.unitsConsumed ?? "unknown"}`);
  if (simulation.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }
  const signature = await rpc.sendTransaction(wire, {
    maxRetries: 3n,
    skipPreflight: false,
    encoding: "base64",
  }).send();
  await awaitTransactionStatus(rpc, signature, "finalized");
  return signature;
}

export async function executeWeb3AfterSimulation(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  lookupTableAccounts: AddressLookupTableAccount[] = [],
  sponsoredFeePayer?: Keypair,
) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const feePayer = sponsoredFeePayer || payer;
  const message = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions,
  }).compileToV0Message(lookupTableAccounts);
  const transaction = new VersionedTransaction(message);
  const signers = feePayer.publicKey.equals(payer.publicKey) ? [payer] : [payer, feePayer];
  transaction.sign(signers);

  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  console.log(`Simulation units consumed: ${simulation.value.unitsConsumed ?? "unknown"}`);
  if (simulation.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    maxRetries: 3,
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }, "confirmed");
  assertSuccessfulConfirmation(confirmation);
  return signature;
}
