export interface OkxSwapInstructionRequest {
  chainIndex: string;
  chainId: string;
  amount: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  slippage: string;
  userWalletAddress: string;
  swapReceiverAddress?: string;
  feePercent?: string;
  fromTokenReferrerWalletAddress?: string;
  toTokenReferrerWalletAddress?: string;
  autoSlippage?: boolean;
  maxAutoSlippage?: string;
  positiveSlippagePercent?: string;
  positiveSlippageFeeAddress?: string;
  dexIds?: string;
  directRoute?: boolean;
  priceImpactProtectionPercentage?: string;
  computeUnitPrice?: string;
  computeUnitLimit?: string;
}

export interface OkxInstructionAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface OkxInstruction {
  data: string;
  accounts: OkxInstructionAccount[];
  programId: string;
}

export interface OkxRouterToken {
  decimal: string;
  isHoneyPot: boolean;
  taxRate: string;
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenUnitPrice: string;
}

export interface OkxRouterResult {
  chainId: string;
  chainIndex: string;
  dexRouterList: Array<{
    router: string;
    routerPercent: string;
    subRouterList: Array<{
      dexProtocol: Array<{ dexName: string; percent: string }>;
      fromToken: OkxRouterToken;
      toToken: OkxRouterToken;
    }>;
  }>;
  estimateGasFee: string;
  fromToken: OkxRouterToken;
  fromTokenAmount: string;
  priceImpactPercentage: string | null;
  quoteCompareList: Array<{
    amountOut: string;
    dexLogo: string;
    dexName: string;
    tradeFee: string;
  }>;
  swapMode: string;
  toToken: OkxRouterToken;
  toTokenAmount: string;
  tradeFee: string;
}

export interface OkxSwapInstructionResponse {
  code: string;
  msg: string;
  data: {
    addressLookupTableAccount: string[];
    instructionLists: OkxInstruction[];
    routerResult: OkxRouterResult;
    tx: {
      from: string;
      minReceiveAmount: string;
      slippage: string;
      to: string;
    };
  };
}

/**
 * Requests a swap instruction for Solana tokens from the OKX DEX aggregator API.
 *
 * API docs: https://web3.okx.com/de/build/dev-docs/dex-api/dex-solana-swap-instruction
 */
export const getOkxSwapInstruction = async (params: OkxSwapInstructionRequest): Promise<OkxSwapInstructionResponse> => {
  // TODO: requires OKX API auth
  const url = new URL("https://web3.okx.com/api/v5/dex/aggregator/swap-instruction");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.append(key, String(value));
  });

  const resp = await fetch(url.toString(), { method: "GET" });

  if (!resp.ok) {
    throw new Error(`[getOkxSwapInstruction] HTTP ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as OkxSwapInstructionResponse;
};
