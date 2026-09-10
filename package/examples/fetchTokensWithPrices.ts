import { fetchTokensWithPrices } from '../utils';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    const walletAddress = process.env.WALLET_ADDRESS;
    if (!walletAddress) throw new Error("WALLET_ADDRESS is required");
    
    console.log(`Fetching tokens with prices for wallet: ${walletAddress}`);
    
    // Fetch tokens with USD prices
    const tokensWithPrices = await fetchTokensWithPrices(walletAddress);
    
    // Display total portfolio value
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + token.usdValue, 0);
    console.log(`Total portfolio value: $${totalValue.toFixed(2)} USD`);
    
    // Display token details
    console.log('\nToken Details:');
    tokensWithPrices.forEach(token => {
      console.log(`${token.symbol} (${token.name}):`);
      console.log(`  Balance: ${token.balance.uiAmount} ${token.symbol}`);
      console.log(`  Price: $${token.usdPrice.toFixed(4)} USD`);
      console.log(`  Value: $${token.usdValue.toFixed(4)} USD`);
      console.log('');
    });
  } catch (error) {
    console.error('Error fetching tokens with prices:', error);
  }
}

main();
