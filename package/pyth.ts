import { AssetType, HermesClient } from '@pythnetwork/hermes-client';

export class PythPriceService {
    private hermesClient: HermesClient;

    constructor(endpoint: string = 'https://hermes.pyth.network') {
        this.hermesClient = new HermesClient(endpoint);
    }

    /**
     * Get Price Feeds matching the query
     * @param query The query to search for
     * @param filter The filter to apply
     * @returns Array of price feeds
     * @example 'BTC/USD'
     */
    async getPriceFeeds(query: string, filter: AssetType = 'crypto') {
        try {
            const priceFeeds = await this.hermesClient.getPriceFeeds({
                query,
                assetType: filter
            });
            return priceFeeds
        } catch (error) {
            console.error(`Error fetching price for feed ${query}:`, error);
            throw error;
        }
    }

    /**
     * Format raw price data into USD decimal format
     * @param priceData The price data to format
     * @returns Formatted price data
     */
    private formatPrice(priceData: any) {
        if (!priceData || !priceData.price) return null;
        
        const price = priceData.price;
        const value = Number(price.price) * Math.pow(10, price.expo);
        const confidence = Number(price.conf) * Math.pow(10, price.expo);
        
        return {
            price: value,
            confidence,
            timestamp: price.publish_time,
        };
    }

    /**
     * Get the price of a token in USD
     * @param token The token to get the price for
     * @returns The price of the token in USD
     */
    async getUSDPrice(token: string): Promise<number> {
        token = token.toUpperCase();
        const feeds = await this.getPriceFeeds(token, 'crypto');
        const usdFeed = feeds.find(feed => feed.attributes.symbol === `Crypto.${token}/USD`);
        if (usdFeed) {
            const priceData = await this.getLatestPrices([usdFeed.id]);
            if (!priceData || !priceData[0].price) throw new Error(`Failed to get price for token: ${token}`);
            return priceData[0].price;
        }

        const solFeed = feeds.find(feed => feed.attributes.quote_currency === 'SOL' && feed.attributes.base === token);
        if (solFeed) {
            const solPrice = await this.getUSDPrice('SOL');
            const tokenPrice = await this.getLatestPrices([solFeed.id]);
            if (!tokenPrice || !tokenPrice[0].price) throw new Error(`Failed to get price for token: ${token}`);
            return tokenPrice[0].price * solPrice;
        }
        
        throw new Error(`Failed to get price for token: ${token}`);
    }

    /**
     * Get latest prices for multiple price feeds
     * @param priceFeedIds Array of Pyth price feed IDs
     * @returns Array of formatted price data
     */
    async getLatestPrices(priceFeedIds: string[]) {
        try {
            const { parsed } = await this.hermesClient.getLatestPriceUpdates(priceFeedIds);
            if (!parsed) return [];
            return parsed.map(data => ({
                id: data.id,
                ...this.formatPrice(data)
            }));
        } catch (error) {
            console.error('Error fetching multiple prices:', error);
            throw error;
        }
    }
}
