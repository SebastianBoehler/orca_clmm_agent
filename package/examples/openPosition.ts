import { setDefaultFunder } from "@orca-so/whirlpools";
import * as dotenv from "dotenv";
import { fetchNonZeroTokenBalances, loadKeypairFromFile, SOL_MINT_ADDRESS, USDC_MINT_ADDRESS } from "../solana";
import { ChainId, config } from "@lifi/sdk";
import { address, createKeyPairSignerFromBytes, createSolanaRpc, mainnet } from "@solana/kit";
import { closePositionWithBaseToken, getDetailedPositions, openPositionWithBaseToken, sleep, tokenAddressToSymbol } from "../utils";
import bs58 from "bs58";

dotenv.config();

// Use QuickNode RPC URL from .env file or fall back to default
const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
console.log(`Using RPC URL: ${rpcUrl}`);
config.setRPCUrls({
  [ChainId.SOL]: [rpcUrl],
});

const rpc = createSolanaRpc(mainnet(rpcUrl));

async function main() {
  const bytes = await loadKeypairFromFile("./examples/keypair.json");
  const byteArray = new Uint8Array(bytes);
  const privateKey = bs58.encode(byteArray);
  const wallet = await createKeyPairSignerFromBytes(bytes);
  setDefaultFunder(wallet);

  console.log(`Using wallet: ${wallet.address}`);
  const whirlpoolAddress = address("27ExzqiGapKFd6NhffapRfdSkuykTVUqY5qeuNnrzBNm"); // SOL / CHILLHOUSE

  const baseToken = SOL_MINT_ADDRESS;

  const balance = await fetchNonZeroTokenBalances(wallet.address);
  const tokenBalance = balance.find((b) => b.address === baseToken);
  const solBalance = balance.find((b) => b.address === SOL_MINT_ADDRESS);
  if (!tokenBalance || !solBalance) throw new Error("No token balance found");
  console.log(balance.map((b) => `${b.symbol}: $${b.usdValue}`));

  const result = await openPositionWithBaseToken({
    rpc,
    whirlpoolAddress,
    wallet,
    walletByteArray: byteArray,
    baseTokenAddress: address(baseToken),
    lowerMultiple: 0.9,
    upperMultiple: 1.1,
    baseTokenAmount: Number(tokenBalance.balance.uiAmount),
    swapDustToAddress: address(baseToken),
    maxGasUSD: 0.3,
  });
  const txHash = result?.positionSignature;
  console.log("open pos feeUSD", result?.feeUSD, result?.swapLoss);
  if (!txHash) throw new Error("No transaction hash found");

  await sleep(1000 * 10);

  const positions = await getDetailedPositions(wallet.address, rpc, await tokenAddressToSymbol(baseToken));
  const walletBalance = await fetchNonZeroTokenBalances(wallet.address, rpcUrl);
  const walletBaseBalance = walletBalance.find((b) => b.address === baseToken);
  if (!walletBaseBalance) throw new Error("No base token balance found");
  //console.log(`[after pos created] Total value: $${totalValue}`);

  const closeResult = await closePositionWithBaseToken({
    rpc,
    wallet,
    position: positions[0],
    walletByteArray: byteArray,
    maxPriceImpact: 0.03,
    baseToken,
  });
  //console.log("closeFees", closeResult.feeUSD);
  //console.log("swapLoss", closeResult.swapLoss);
  const totalSwapLoss = result.swapLoss + closeResult.swapLoss;
  console.log("totalSwapLoss", totalSwapLoss);

  const totalFees = result.feeUSD + closeResult.feeUSD;
  console.log("totalFees", totalFees);

  console.log("loss:", totalFees + totalSwapLoss * -1);
}

main();
