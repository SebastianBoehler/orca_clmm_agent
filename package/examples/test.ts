import * as dotenv from "dotenv";
import { divergenceLoss } from "../orca";
import { awaitTransactionStatus, fetchNonZeroTokenBalances, getTransactionDetails, SOL_MINT_ADDRESS, USDC_MINT_ADDRESS } from "../solana";
import { getLIFISwapQuote, getLIFITransactionLinks, swapAssets } from "../lifi";
import { loadKeypairFromFile } from "../solana";
import bs58 from "bs58";
import { convertRawToDecimal, getPreloadedTokens, getUSDPrice, preloadTokens, sleep } from "../utils";
import { getJupiterSwapQuote, getJupiterUSDPrice } from "../jupiter";
import { convertQuoteToRoute, executeRoute } from "@lifi/sdk";
import { createKeyPairSignerFromBytes, createSolanaRpc, mainnet, Signature } from "@solana/kit";
import { getOkxSwapInstruction } from "../okx";

dotenv.config();

const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
console.log(`Using RPC URL: ${rpcUrl}`);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const rpc = createSolanaRpc(mainnet(rpcUrl));

// ---------------------------------------------------------------------------
// Example: Calculate divergence (impermanent) loss for a hypothetical position
// ---------------------------------------------------------------------------
// Parameters:
// p    - Current price (tokenB per tokenA)
// p_i  - Initial price when the position was opened
// p_a  - Lower price bound of the range
// p_b  - Upper price bound of the range
// depositA - Amount of token A deposited
// depositB - Amount of token B deposited
//
// Here we assume the current price moved to 1.2, it was 1.0 at entry,
// the position range spans from 0.8 to 1.5 and we originally deposited
// 1000 units of token A and 1200 units of token B.
const dlExample = divergenceLoss(1, 1.0, 0.8, 1.5, 1000, 0.3586);
//console.log("Divergence loss example:", dlExample);

async function main() {
  const bytes = await loadKeypairFromFile("./examples/keypair.json");
  const byteArray = new Uint8Array(bytes);
  const privateKey = bs58.encode(byteArray);
  const wallet = await createKeyPairSignerFromBytes(bytes);

  const balances = await fetchNonZeroTokenBalances(wallet.address);
  const USDCBalance = balances.find((b) => b.address === USDC_MINT_ADDRESS);
  if (!USDCBalance) throw new Error("No USDC balance found");

  const okxSwapInstruction = await getOkxSwapInstruction({
    chainIndex: "501", // SOL
    chainId: "1",
    amount: USDCBalance.balance.uiAmount.toString(),
    fromTokenAddress: USDC_MINT_ADDRESS,
    toTokenAddress: "",
    slippage: "100",
    userWalletAddress: wallet.address,
  });

  console.log("OKX Swap Instruction:", okxSwapInstruction);
}

main();
