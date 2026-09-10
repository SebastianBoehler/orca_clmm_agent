import { PositionData } from "@orca-so/whirlpools";
import { Address, Signature } from "@solana/kit";

export interface WhirlpoolToken {
  address: string;
  programId: string;
  imageUrl: string;
  name: string;
  symbol: string;
  decimals: number;
  tags: string[];
}

export interface VolumeData {
  day: number;
  week: number;
  month: number;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface Stats {
  volume: string;
  fees: string;
  rewards: string;
  yieldOverTvl: string;
}

export interface WhirlpoolInfo {
  address: string;
  whirlpoolsConfig: string;
  whirlpoolBump: number[];
  tickSpacing: number;
  tickSpacingSeed: number[];
  feeRate: number;
  protocolFeeRate: number;
  liquidity: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  protocolFeeOwedA: string;
  protocolFeeOwedB: string;
  tokenMintA: string;
  tokenVaultA: string;
  feeGrowthGlobalA: string;
  tokenMintB: string;
  tokenVaultB: string;
  feeGrowthGlobalB: string;
  rewardLastUpdatedTimestamp: string;
  updatedAt: string;
  updatedSlot: number;
  writeVersion: number;
  hasWarning: boolean;
  poolType: "whirlpool" | "splashpool";
  tokenA: WhirlpoolToken;
  tokenB: WhirlpoolToken;
  price: string;
  tvlUsdc: string;
  yieldOverTvl: string;
  tokenBalanceA: string;
  tokenBalanceB: string;
  stats: {
    [key: string]: Stats;
  };
}

export interface WhirlpoolResponse {
  data: WhirlpoolInfo[];
  meta: {
    cursor: {
      prev: string | null;
      next: string | null;
    };
  };
}

export interface OrcaPosition {
  isInRange: boolean;
  name: string;
  fees: {
    feeAmountA: number;
    feeAmountB: number;
  };
  address: string;
  data: {
    liquidity: string;
    positionMint: string;
    tickLowerIndex: number;
    tickUpperIndex: number;
    feeGrowthCheckpointA: string;
    feeGrowthCheckpointB: string;
  };
  closeQuote: {
    tokenEstA: string;
    tokenMinA: string;
    tokenEstB: string;
    tokenMinB: string;
  };
  tokenA: WhirlpoolToken;
  tokenB: WhirlpoolToken;
  currentMarketPrice: string;
  lowerPrice: number;
  upperPrice: number;
  whirlpool: {
    address: string;
    price: string;
    tickSpacing: number;
  };
}

export interface DetailedPosition extends OrcaPosition {
  createdAt: Date;
  tokenAPrice: number;
  tokenBPrice: number;
  tokenAAmount: number;
  tokenBAmount: number;
  positionValueUSD: {
    min: number;
    est: number;
  };
  totalFeesUSD: number;
  relativePosition: number;
  range: number;
  baseTokenSymbol: string;
}

export interface BalanceChange {
  mint: Address;
  owner: Address | undefined;
  amount: BigInt;
  amountDecimal: number;
  change: BigInt;
  changeDecimal: number;
}

export interface TransactionDetails {
  changes: BalanceChange[];
  feeUSD: number;
  signature: Signature;
  [key: string]: any;
}

export const isPositionBundle = (position: PositionData) => position.isPositionBundle;
