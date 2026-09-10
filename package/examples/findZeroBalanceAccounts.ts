//TODO: wont work since web3 package, use solana/kit instead
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import "dotenv/config";

async function findZeroBalanceAccounts() {
  const walletAddress = process.env.WALLET_ADDRESS;
  if (!walletAddress) throw new Error("WALLET_ADDRESS is required");

  // Connect to Solana
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  console.log(`Finding token accounts for wallet: ${walletAddress}`);

  // Get all token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(walletAddress), { programId: TOKEN_PROGRAM_ID });

  console.log(`Total token accounts found: ${tokenAccounts.value.length}`);

  // Filter for zero balance accounts
  const zeroBalanceAccounts = tokenAccounts.value.filter((account) => {
    const amount = account.account.data.parsed.info.tokenAmount.amount;
    return amount === "0";
  });

  console.log(`\nZero balance accounts (${zeroBalanceAccounts.length}):`);

  if (zeroBalanceAccounts.length === 0) {
    console.log("No zero balance accounts found.");
  } else {
    // Display zero balance accounts with details
    zeroBalanceAccounts.forEach((account, index) => {
      const { mint, tokenAmount } = account.account.data.parsed.info;
      const accountAddress = account.pubkey.toString();

      console.log(`\n${index + 1}. Account: ${accountAddress}`);
      console.log(`   Mint: ${mint}`);
      console.log(`   Balance: ${tokenAmount.uiAmount} (${tokenAmount.decimals} decimals)`);
      console.log(`   Command to close: spl-token close ${accountAddress} --owner ${walletAddress}`);
    });
  }

  console.log("\nTo close an account and reclaim rent, use:");
  console.log("spl-token close <ACCOUNT_ADDRESS> --owner <WALLET_ADDRESS>");
}

findZeroBalanceAccounts().catch((err) => console.error(err));
