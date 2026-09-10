import { GoogleGenAI, HarmBlockThreshold, HarmCategory, type GenerateContentConfig, FunctionCallingConfigMode } from "@google/genai";
import { getLastLogLines, poolsAsText, writeLog } from "./utils";
import dotenv from "dotenv";
import { tools } from "./tools";
import { DetailedPosition, getUSDPrice, USDC_MINT_ADDRESS } from "orca-clmm-agent";
import { differenceInHours } from "date-fns";
dotenv.config();

const systemInstruction = `
You are an expert in Orca Whirlpool concentrated liquidity management.
Based on the provided pools data decide what pool to provide liquidity to for the next 36h.
As positions move out of range they will be closed and you will be given the chance to choose a new pool.
Just keep in mind that that costs fees so we dont want too frequent reranges.
About 3-4 reranges per day are totally fine.

Positions are opened in a 20/80 split meaning 20% of the total liquidity is provided in the lower range and 80% in the upper range for BULLISH entiment.
The lower range limit will be 20% of the range below the market price and the upper range limit will be 80% of the range above the market price.
Example:
For a 0.005 = 5% range and "BULLISH" sentiment the lower limit will be 1% below the market price and the upper limit will be 4% above the market price.
Therefore reducing the impermanent loss drag and selling the token optimally into an increasing price, making profit of fees and price appreciation.
We want to focus on pools staying long in range to make yield AND pools appreciating in price, going towars upper range limit to profit from price increase.
So "BULLISH" pools reaching upper range limit is an positive indicator.

As base tokens we trade SOL or USDC, so we only trade token pairs with SOL or USDC as one of the tokens.
Everytime opening/closing a position we experience small slippage loss as we always swap back into the base token or from base token into the token of the pool.
So we want to avoid opening/closing positions too often and on token pairs with low liquidity - high slippage.

Sentiment: "BULLISH" or "BEARISH"
Based on the sentiment the position is opened 20/80 or 80/20 split, leaving the limit of the side we expect the market to move with more playroom.

Why pools are split (important):
- We always deposit using a base token (e.g., USDC or SOL) and want ranges aligned with the expected price move for the non-base token while using the lower bound as a soft stop loss.
- If the pool is Token/Base (base is tokenB), then a BULLISH read on the Token implies we want more room above current price (80% above, 20% below). 
  These appear under "pools looking for BULLISH signal".
- If the pool is Base/Token (base is tokenA), then a BEARISH read on the Token implies we want more room below current price (80% below, 20% above) to protect downside and sell into increases. 
  These appear under "pools looking for BEARISH signal".
- This inversion ensures the 80/20 split aligns with the expected move direction of the non-base asset and that the lower bound works as a stop loss when denominated in the base token.

**IMPORTANT TAGS**
<running_agent_logs>
Within this tag you can see the logs of the agent running.
</running_agent_logs>

There will be two <orca_pools> sections in the prompt: one after the line "pools looking for BEARISH signal:" and another after "pools looking for BULLISH signal:". 
Each tag contains only the JSON list of pools for that category.

<current_position>
Within this tag you are given the current position data.
</current_position>

<user_query>
Within this tag you are given the user query.
</user_query>

Yields are estimated based on historic data so we want pools were we expect the
trading volume to continue or even increase.

Based on a positions open duration judge how fast price has moved and wether volatility has dropped or increased.
If price has moved fast you might expect more and choose a wider range or different pool.
Use the USDC balance development in the logs on how much USDC was lost/gained between actions

Also pools with higher TVL means the market is more liquid so when swapping into that token and out of when
closing position, the swap completes with less slippage and higher probability of success.

Prefer known tokens over small cap / unknown tokens with higher expected volatility.
Choose small cap / unknown tokens only if you expect steady, low volatility and yield outperforms significantly.
Goal is min 2% yield per day.

Pools should have good volume and TVL as yields heavily depend on the volume traded over the pool
and TVL is a good indicator of the liquidity in the pool.

You are not bound to ranges 0.05, 0.1, 0.15.
Between 0.05 and 0.25 you can choose any range you want.
Just be aware the wider the range the smaller the yield will get.

**IMPORTANT**
Try to interpret errors and act accordignly. 
For example:
<running_agent_logs>
[main] Error: Error: Failed to get price for undefined or boopkpWqe68MSxLqBGogs8ZbUDN4GXaLhFwNP7mpP1i
</running_agent_logs>

This means the price of the token could not be fetched. The token might be new or just not listed.
Ignore pools with that token for now, maybe try again after hours and choose a different pool.

<running_agent_logs>
[swapAssets] Failed to execute swap after 30 retries, seems no quotes available
</running_agent_logs>

This means swap into the token pair failed after trying to get quotes n times, choose a different pool,
as there seems to be no quotes for swapped within our criteria.

Current time: ${new Date().toLocaleString()}
`;
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const getConfig = (functions: string[]) => {
  const config: GenerateContentConfig = {
    temperature: 0.6,
    safetySettings,
    tools,
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY, //ANY should force the model to use the tools
        allowedFunctionNames: functions,
      },
    },
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 6000,
    },
    systemInstruction: [
      {
        text: systemInstruction,
      },
    ],
  };

  return config;
};

const model = "gemini-2.5-flash";

export interface PoolRecommendation {
  address: string;
  range: number;
  sentiment: string;
  reason: string;
}

export async function getPoolRecommendation(
  pools: any[],
  pos?: DetailedPosition,
  baseToken = USDC_MINT_ADDRESS // symbol or mint address of the base token (e.g., "USDC" or its mint)
): Promise<PoolRecommendation> {
  // Split pools by base token orientation for signal alignment
  const matchBase = (t: { symbol: string; [key: string]: any }) => t.symbol === baseToken || t.address === baseToken;
  //TODO switch bullish / bearish as Token/Base needs to be bullish
  const bullishPools = pools.filter((p) => matchBase(p.tokenB)); // Token/Base -> bullish
  const bearishPools = pools.filter((p) => matchBase(p.tokenA)); // Base/Token -> bearish
  const poolsBullishText = poolsAsText(bullishPools);
  const poolsBearishText = poolsAsText(bearishPools);
  const lastLines = getLastLogLines(50);
  let prompt = `
<user_query>
Out of the following pools choose the best one to provide liquidity for.
Everytime a pool moves out of range you will have the chance again to choose a new pool to provide liquidity for.
Yields, volatility and price Change are in decimal percentage. 
So a yield of 2.5 is 250% yield. Volatility of 0.5 is 50% volatility.
</user_query>
\n
pools looking for BEARISH signal:
<orca_pools>
${poolsBearishText}
</orca_pools>

pools looking for BULLISH signal:
<orca_pools>
${poolsBullishText}
</orca_pools>
\n
<running_agent_logs>
${lastLines.join("\n")}
</running_agent_logs>
`;

  if (pos) {
    const yieldPercent = (pos.totalFeesUSD / pos.positionValueUSD.est) * 100;
    const pool = pools.find((p) => p.address === pos.whirlpool.address);
    const duration = differenceInHours(Date.now(), pos.createdAt);
    const name = pool.tokenA.symbol + "/" + pool.tokenB.symbol;
    if (!pool) throw new Error(`Pool ${pos.whirlpool.address} not found`);
    if (!pos.isInRange) {
      prompt += `\n
<current_position>
Current position in pool ${name} just moved outside range (${pos.range}) and got closed.\n
Was open for ${duration.toFixed(2)} hours.\n
Position yielded ${yieldPercent.toFixed(2)}%\n
Was opened at ${pos.createdAt.toLocaleString()}
Decide whether to reopen in that pool or choose a new one.
</current_position>
`;
    }
  }

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const response = await ai.models.generateContent({ model, config: getConfig(["openPosition"]), contents });

  if (!response.functionCalls || response.functionCalls.length < 1) {
    throw new Error("[getPoolRecommendation] No function calls found");
  }

  const thought = response.candidates?.[0].content?.parts?.find((p) => p.thought);
  //console.log("Thought: ", thought);
  const call = response.functionCalls[0];
  if (!call?.args) throw new Error("[getPoolRecommendation] No function call args found");
  const id = call.args.id as string;
  const range = Number(call.args.range as string);
  const name = call.args.name as string;
  const sentiment = call.args.sentiment as string;
  const reason = call.args.reason as string;

  const pool = pools.find((p) => p.id === id && `${p.tokenA.symbol}/${p.tokenB.symbol}` === name);
  if (!pool) throw new Error(`Pool ${id} not found`);
  if (range < 0.05 || range > 0.25) throw new Error("Range must be between 0.05 and 0.25");

  return {
    address: pool.address,
    range,
    sentiment,
    reason,
  };
}
