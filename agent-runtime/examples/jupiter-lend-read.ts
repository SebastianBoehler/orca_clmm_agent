import { Client } from "@jup-ag/lend-read";
import { PublicKey } from "@solana/web3.js";
import { loadWeb3Runtime } from "./common.ts";

const { connection, keypair } = await loadWeb3Runtime();
const client = new Client(connection);
const user = keypair.publicKey;
const token = new PublicKey(process.env.JUP_LEND_TOKEN || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

console.log(`Wallet: ${user.toBase58()}`);
console.log(`Token: ${token.toBase58()}`);

const listedTokens = await client.liquidity.listedTokens();
console.log(`Listed token count: ${listedTokens.length}`);

const tokenData = await client.liquidity.getOverallTokenData(token);
console.log("Token market data:");
console.log(JSON.stringify({
  supplyRate: tokenData.supplyRate?.toString(),
  borrowRate: tokenData.borrowRate?.toString(),
  totalSupply: tokenData.totalSupply?.toString(),
  totalBorrow: tokenData.totalBorrow?.toString(),
  utilization: tokenData.lastStoredUtilization?.toString(),
}, null, 2));

try {
  const [{ userSupplyData }, { userBorrowData }] = await Promise.all([
    client.liquidity.getUserSupplyData(user, token),
    client.liquidity.getUserBorrowData(user, token),
  ]);
  console.log(`User supply: ${userSupplyData.supply?.toString()}`);
  console.log(`User borrow: ${userBorrowData.borrow?.toString()}`);
} catch (error: any) {
  if (error?.code === "ACCOUNT_NOT_FOUND") {
    console.log("User has no Jupiter Lend account for this token.");
  } else {
    throw error;
  }
}
