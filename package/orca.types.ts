import { IncreaseLiquidityParam } from "@orca-so/whirlpools";
import { Address, TransactionSigner } from "@solana/kit";
import { WhirlpoolInfo } from "./types";
import { Rpc } from "./solana";

export interface OrcaToken {
  address: string;
  mintAuthority: string | null;
  supply: number;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: string | null;
  tokenProgram: string;
  extensions: Record<string, unknown>;
  tags: string[];
  updatedEpoch: number;
  updatedAt: string;
  priceUsdc: number | null;
  metadata: {
    description: string;
    image: string;
    name: string;
    risk: number;
    symbol: string;
  };
  stats: {
    "24h": {
      volume: number | null;
    };
  };
}

export class OrcaError extends Error {
  code: BigInt;
  constructor(message: string, code: BigInt) {
    super(message);
    this.name = "OrcaError";
    this.code = code;
  }
}

export interface OpenPositionParams {
  rpc: any;
  whirlpoolAddress: Address;
  params: IncreaseLiquidityParam;
  price: number;
  lowerMultiple: number;
  upperMultiple: number;
  slippageToleranceBps: number;
  wallet: TransactionSigner;
  swapDustToAddress?: string;
  walletByteArray?: Uint8Array;
  maxGasUSD?: number;
}

export interface PositionYield {
  poolAddress: string;
  tokenAAmountUSD?: number;
  tokenBAmountUSD?: number;
  pool?: WhirlpoolInfo;
  statsType?: "1h" | "2h" | "4h" | "8h" | "24h" | "7d" | "30d";
  liquidity?: number;
  fees?: number;
  rewards?: number;
}

export interface PositionYieldRange extends PositionYield {
  range: number;
}
export interface PositionYieldLimits extends PositionYield {
  lowerLimit: number;
  upperLimit: number;
}

export interface DivergenceLossResult {
  totalIL: number;
  amountA: number;
  amountB: number;
  changeA: number;
  changeB: number;
  ilAPct: number | null;
  ilBPct: number | null;
  holdValue: number;
  lpValue: number;
}

export interface GetLiquidityInTicksParams {
  poolAddress: Address;
  rpc: Rpc;
}
