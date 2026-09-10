import { analyzePositionBalance } from "./analysis";
import { OrcaPosition, WhirlpoolToken } from "./types";

const token = (symbol: string): WhirlpoolToken => ({
  address: `${symbol}-mint`,
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  imageUrl: "",
  name: symbol,
  symbol,
  decimals: 6,
  tags: [],
});

const position = (overrides: Partial<OrcaPosition>): OrcaPosition => ({
  name: "A/B",
  isInRange: true,
  fees: { feeAmountA: 0, feeAmountB: 0 },
  address: "position",
  data: {
    liquidity: "1",
    positionMint: "mint",
    tickLowerIndex: 0,
    tickUpperIndex: 0,
    feeGrowthCheckpointA: "0",
    feeGrowthCheckpointB: "0",
  },
  closeQuote: {
    tokenEstA: "0",
    tokenMinA: "0",
    tokenEstB: "0",
    tokenMinB: "0",
  },
  tokenA: token("A"),
  tokenB: token("B"),
  currentMarketPrice: "2",
  lowerPrice: 1,
  upperPrice: 4,
  whirlpool: {
    address: "pool",
    price: "2",
    tickSpacing: 64,
  },
  ...overrides,
});

describe("analyzePositionBalance", () => {
  it("reports midpoint for an in-range logarithmic price range", () => {
    const result = analyzePositionBalance(position({ currentMarketPrice: "2" }));

    expect(result.relativePosition).toBeCloseTo(0.5);
    expect(result.description).toContain("50.0% of range");
  });

  it("reports fully token A below range", () => {
    const result = analyzePositionBalance(position({ isInRange: false, currentMarketPrice: "0.5" }));

    expect(result.relativePosition).toBe(0);
    expect(result.description).toContain("fully in A");
  });

  it("reports full-range positions as balanced", () => {
    const result = analyzePositionBalance(position({ lowerPrice: 0, upperPrice: Infinity }));

    expect(result.relativePosition).toBe(0.5);
    expect(result.description).toContain("Full range");
  });
});
