export interface JupiterPriceResponse {
  [key: string]: {
    usdPrice: string;
    blockId: number;
    decimals: number;
    priceChange24h: number;
  };
}

export const getJupiterUSDPrice = async (mints: string[]) => {
  if (mints.length === 0) return {};
  if (mints.length > 100) throw new Error("[getJupiterUSDPrice] Too many mints");
  const resp = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`, {
    headers: {
      "Content-Type": "application/json",
      // no cache
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
    method: "GET",
  });
  if (!resp.ok) {
    if (resp.status === 429) console.error(`[getJupiterUSDPrice] Rate limit hit`);
    else console.error(`[getJupiterUSDPrice] Failed to get price`);
    return {};
  }
  const data = (await resp.json()) as JupiterPriceResponse;
  // delete where value is null
  for (const [key, value] of Object.entries(data)) {
    if (!value) delete data[key];
  }
  return data;
};

export const getJupiterSwapQuote = async ({
  fromTokenAddress,
  toTokenAddress,
  fromAmount,
}: {
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
}) => {
  //https://lite-api.jup.ag/swap/v1/quote
  const resp = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${fromTokenAddress}&outputMint=${toTokenAddress}&amount=${fromAmount}`);
  const json = await resp.json();
  return json as Record<string, any>;
};
