import { PublicKey, type ParsedInstruction, type PartiallyDecodedInstruction } from "@solana/web3.js";
import { loadWeb3Runtime } from "./common.ts";

type Instruction = ParsedInstruction | PartiallyDecodedInstruction;

const PROGRAM_LABELS = new Map<string, string>([
  ["11111111111111111111111111111111", "System Program"],
  ["ComputeBudget111111111111111111111111111111", "Compute Budget"],
  ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "SPL Token"],
  ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "SPL Token 2022"],
  ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "Associated Token"],
  ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo"],
  ["Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo", "Memo"],
  ["whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", "Orca Whirlpools"],
  ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "Jupiter Aggregator"],
  ["JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", "Jupiter Aggregator"],
  ["JUP2jxvgrRVjKfo3fYrPfM7DbK9PBBN3fZv5uJaaVTa", "Jupiter Aggregator"],
  ["jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9", "Jupiter Lend"],
  ["jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC", "Jupiter Lend"],
  ["KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", "Kamino Lend"],
  ["dRiftyHA39BrtS5sU4cSZJXLe2AZg2G2zX8iSn7bC4", "Drift"],
  ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", "Raydium AMM"],
  ["cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", "Meteora DAMM v2"],
  ["LFi11111111111111111111111111111111111111111", "LI.FI"],
]);

const PROTOCOL_PRIORITY = [
  "LI.FI",
  "Orca Whirlpools",
  "Jupiter Aggregator",
  "Jupiter Lend",
  "Kamino Lend",
  "Drift",
  "Meteora DAMM v2",
  "Raydium AMM",
];

const { connection, keypair } = await loadWeb3Runtime();
const wallet = keypair.publicKey;
const limit = Number(process.env.HISTORY_LIMIT || "10");
const before = process.env.HISTORY_BEFORE;
const delayMs = Number(process.env.HISTORY_DELAY_MS || "500");

const signatures = await connection.getSignaturesForAddress(
  wallet,
  {
    limit,
    ...(before ? { before } : {}),
  },
  "confirmed",
);

console.log(`Wallet: ${wallet.toBase58()}`);
console.log(`Recent signatures: ${signatures.length}`);

for (const entry of signatures) {
  await sleep(delayMs);
  const tx = await getParsedTransactionWithRetry(entry.signature).catch((error: any) => {
    console.log(JSON.stringify({
      signature: entry.signature,
      slot: entry.slot,
      blockTime: entry.blockTime,
      status: entry.err ? "failed" : "unknown",
      note: `Transaction details unavailable from RPC: ${error?.message || error}`,
    }, null, 2));
    return null;
  });

  if (!tx) {
    console.log(JSON.stringify({
      signature: entry.signature,
      slot: entry.slot,
      blockTime: entry.blockTime,
      status: entry.err ? "failed" : "unknown",
      note: "Transaction details unavailable from RPC",
    }, null, 2));
    continue;
  }

  const labels = labelPrograms(collectProgramIds(
    tx.transaction.message.instructions,
    tx.meta?.innerInstructions || undefined,
  ));
  const tokenDeltas = getWalletTokenDeltas(tx.meta?.preTokenBalances || [], tx.meta?.postTokenBalances || [], wallet);
  const summary = {
    signature: entry.signature,
    slot: entry.slot,
    blockTime: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
    status: tx.meta?.err ? "failed" : "confirmed",
    feeLamports: tx.meta?.fee || 0,
    primaryProtocol: choosePrimaryProtocol(labels),
    programs: labels,
    solDeltaLamports: getWalletSolDelta(tx, wallet),
    tokenDeltas,
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function getParsedTransactionWithRetry(signature: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch (error: any) {
      if (!String(error?.message || error).includes("429") || attempt === 4) {
        throw error;
      }
      await sleep(2 ** attempt * 1_000);
    }
  }
  return null;
}

function collectProgramIds(
  instructions: Instruction[],
  innerInstructions: Array<{ instructions: Instruction[] }> = [],
) {
  const programIds = new Set<string>();
  for (const instruction of instructions) {
    programIds.add(getProgramId(instruction));
  }
  for (const group of innerInstructions || []) {
    for (const instruction of group.instructions as Instruction[]) {
      programIds.add(getProgramId(instruction));
    }
  }
  programIds.delete("");
  return [...programIds].sort();
}

function getProgramId(instruction: Instruction) {
  const programId = "programId" in instruction ? instruction.programId : undefined;
  return programId?.toString() || "";
}

function labelPrograms(programIds: string[]) {
  return programIds.map((programId) => ({
    programId,
    label: PROGRAM_LABELS.get(programId) || "Unknown",
  }));
}

function choosePrimaryProtocol(labels: ReturnType<typeof labelPrograms>) {
  for (const protocol of PROTOCOL_PRIORITY) {
    if (labels.some((item) => item.label === protocol)) return protocol;
  }
  const unknown = labels.find((item) => item.label === "Unknown");
  return unknown ? `Unknown: ${unknown.programId}` : labels[0]?.label || "Unknown";
}

function getWalletSolDelta(tx: Awaited<ReturnType<typeof connection.getParsedTransaction>>, walletAddress: PublicKey) {
  if (!tx?.meta) return null;
  const accountIndex = tx.transaction.message.accountKeys.findIndex((account) => account.pubkey.equals(walletAddress));
  if (accountIndex < 0) return null;
  return tx.meta.postBalances[accountIndex] - tx.meta.preBalances[accountIndex];
}

function getWalletTokenDeltas(
  preBalances: NonNullable<NonNullable<Awaited<ReturnType<typeof connection.getParsedTransaction>>>["meta"]>["preTokenBalances"],
  postBalances: NonNullable<NonNullable<Awaited<ReturnType<typeof connection.getParsedTransaction>>>["meta"]>["postTokenBalances"],
  walletAddress: PublicKey,
) {
  const byKey = new Map<string, { mint: string; decimals: number; pre: bigint; post: bigint }>();
  const add = (side: "pre" | "post", balances: typeof preBalances) => {
    for (const balance of balances || []) {
      if (balance.owner !== walletAddress.toBase58()) continue;
      const key = `${balance.accountIndex}:${balance.mint}`;
      const existing = byKey.get(key) || {
        mint: balance.mint,
        decimals: balance.uiTokenAmount.decimals,
        pre: 0n,
        post: 0n,
      };
      existing[side] = BigInt(balance.uiTokenAmount.amount || "0");
      byKey.set(key, existing);
    }
  };

  add("pre", preBalances);
  add("post", postBalances);

  return [...byKey.values()]
    .map((balance) => ({
      mint: balance.mint,
      decimals: balance.decimals,
      deltaRaw: (balance.post - balance.pre).toString(),
      deltaUi: formatRaw(balance.post - balance.pre, balance.decimals),
    }))
    .filter((balance) => balance.deltaRaw !== "0");
}

function formatRaw(raw: bigint, decimals: number) {
  const sign = raw < 0n ? "-" : "";
  const abs = raw < 0n ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fractional = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${sign}${whole}${fractional ? `.${fractional}` : ""}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
