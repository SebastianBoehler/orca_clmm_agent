import { address, createSolanaRpc, mainnet } from "@solana/kit";
import { getLiquidityInTicks } from "./orca";

const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
if (!rpcUrl) throw new Error("RPC_URL must be set in .env");
const rpc = createSolanaRpc(mainnet(rpcUrl));

describe("orca", () => {
  it("loading liquidity in ticks", async () => {
    const liquidity = await getLiquidityInTicks({
      poolAddress: address("Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"), //SOL/USDC
      rpc,
    });
    expect(Array.isArray(liquidity.data)).toBe(true);
    expect(liquidity.data.length).toBeGreaterThan(0);
    expect(typeof liquidity.currentPrice).toBe("number");
    expect(liquidity.currentPrice).toBeGreaterThan(0);
  });
});
