import { getLendingTokenDetails, getUserLendingPositionByAsset } from "@jup-ag/lend/earn";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { formatRaw, loadWeb3Runtime, withRpcBackoff } from "./common.ts";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP_USDC_LENDING_TOKEN = "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D";

const { connection, keypair } = await loadWeb3Runtime();
const user = keypair.publicKey;
const lendingTokens = (process.env.JUP_LEND_TOKENS || JUP_USDC_LENDING_TOKEN)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => new PublicKey(value));

const principalByAsset = parsePrincipalEnv(process.env.JUP_LEND_PRINCIPAL_RAW_BY_ASSET);
const legacyPrincipal = process.env.JUP_LEND_USDC_PRINCIPAL_RAW;

const [latestSignatures, parsedTokenAccounts] = await Promise.all([
  withRpcBackoff("latest wallet signature", () => connection.getSignaturesForAddress(user, { limit: 1 })),
  withRpcBackoff("token accounts", () => connection.getParsedTokenAccountsByOwner(user, {
    programId: TOKEN_PROGRAM_ID,
  })),
]);

const tokenBalances = new Map<string, bigint>();
for (const account of parsedTokenAccounts.value) {
  const info = account.account.data.parsed.info;
  tokenBalances.set(info.mint, BigInt(info.tokenAmount.amount));
}

const jupiterLend = [];
for (const lendingToken of lendingTokens) {
  const detail = await withRpcBackoff(`Jupiter Lend token ${lendingToken.toBase58()}`, () =>
    getLendingTokenDetails({ lendingToken, connection }));
  const asset = detail.asset;
  const position = await withRpcBackoff(`Jupiter Lend user position ${asset.toBase58()}`, () =>
    getUserLendingPositionByAsset({ user, asset, connection }));
  const principalRaw = principalByAsset.get(asset.toBase58())
    ?? (asset.toBase58() === USDC_MINT && legacyPrincipal ? BigInt(legacyPrincipal) : undefined);
  const underlyingRaw = BigInt(position.underlyingAssets.toString());

  jupiterLend.push({
    protocol: "Jupiter Lend",
    asset: asset.toBase58(),
    lendingTokenMint: detail.address.toBase58(),
    decimals: detail.decimals,
    sharesRaw: position.lendingTokenShares.toString(),
    sharesUi: formatRaw(BigInt(position.lendingTokenShares.toString()), detail.decimals),
    underlyingAssetsRaw: underlyingRaw.toString(),
    underlyingAssetsUi: formatRaw(underlyingRaw, detail.decimals),
    walletUnderlyingBalanceRaw: position.underlyingBalance.toString(),
    walletUnderlyingBalanceUi: formatRaw(BigInt(position.underlyingBalance.toString()), detail.decimals),
    receiptTokenWalletBalanceRaw: (tokenBalances.get(detail.address.toBase58()) ?? 0n).toString(),
    principalRaw: principalRaw?.toString() ?? null,
    principalUi: principalRaw ? formatRaw(principalRaw, detail.decimals) : null,
    accruedYieldRaw: principalRaw ? (underlyingRaw - principalRaw).toString() : null,
    accruedYieldUi: principalRaw ? formatRaw(underlyingRaw - principalRaw, detail.decimals) : null,
    supplyRateBps: detail.supplyRate.toString(),
    rewardsRateBps: detail.rewardsRate.toString(),
    totalRateBps: (BigInt(detail.supplyRate.toString()) + BigInt(detail.rewardsRate.toString())).toString(),
    totalAssetsRaw: detail.totalAssets.toString(),
    totalSupplyRaw: detail.totalSupply.toString(),
    convertToAssetsRaw: detail.convertToAssets.toString(),
    convertToSharesRaw: detail.convertToShares.toString(),
    managementNotes: [
      "Accrued yield is embedded in the receipt-token exchange rate.",
      "Exact PnL requires principal/cost basis from action logs or JUP_LEND_PRINCIPAL_RAW_BY_ASSET.",
      "Withdraw or redeem instructions must still be simulated before live exit.",
    ],
  });
}

console.log(JSON.stringify({
  asOf: new Date().toISOString(),
  wallet: user.toBase58(),
  latestSignature: latestSignatures[0]?.signature ?? null,
  positions: {
    jupiterLend,
  },
}, null, 2));

function parsePrincipalEnv(value: string | undefined): Map<string, bigint> {
  const result = new Map<string, bigint>();
  if (!value) return result;

  for (const entry of value.split(",")) {
    const [asset, raw] = entry.split(":").map((part) => part.trim());
    if (!asset || !raw) {
      throw new Error("JUP_LEND_PRINCIPAL_RAW_BY_ASSET must use mint:raw,mint:raw");
    }
    result.set(new PublicKey(asset).toBase58(), BigInt(raw));
  }

  return result;
}
