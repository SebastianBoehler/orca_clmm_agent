import { OrcaPosition } from './types';

/**
 * Analyzes the position of the current price within the price range
 * Returns the relative position (0-1) and a description of where in the range we are
 * @param position The Orca position to analyze
 */
export function analyzePositionBalance(position: OrcaPosition): {
    relativePosition: number;
    description: string;
} {
    // Handle positions that are out of range
    if (!position.isInRange) {
        return {
            relativePosition: Number(position.currentMarketPrice) < position.lowerPrice ? 0 : 1,
            description: Number(position.currentMarketPrice) < position.lowerPrice 
                ? `Price below range - fully in ${position.tokenA.symbol}` 
                : `Price above range - fully in ${position.tokenB.symbol}`
        };
    }

    // Handle positions with infinite ranges (full range positions)
    if (position.lowerPrice === 0 || position.upperPrice === Infinity) {
        // For full range positions, we consider them approximately 50/50 balanced
        return {
            relativePosition: 0.5,
            description: `Full range position - approximately 50/50 balance`
        };
    }

    // Calculate position on logarithmic scale for normal ranges
    const logLower = Math.log(position.lowerPrice);
    const logUpper = Math.log(position.upperPrice);
    const logCurrent = Math.log(+position.currentMarketPrice);

    // Calculate relative position (0-1)
    const relativePosition = (logCurrent - logLower) / (logUpper - logLower);
    const percentPosition = (relativePosition * 100).toFixed(1);

    // Create dynamic description with actual percentage
    const description = `Price at ${percentPosition}% of range${
        Math.abs(relativePosition - 0.5) <= 0.05 
            ? " - approximately 50/50 balance" 
            : relativePosition < 0.5 
                ? ` - weighted towards ${position.tokenB.symbol}` 
                : ` - weighted towards ${position.tokenA.symbol}`}`;

    return {
        relativePosition,
        description
    };
}
