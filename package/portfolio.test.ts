import {
  assertSolanaAddress,
  getJupiterPortfolio,
  portfolioCoverage,
} from "./portfolio";

// Public system-program address used only as an address-shaped test fixture.
const wallet = "11111111111111111111111111111111";

describe("Jupiter Portfolio client", () => {
  it("rejects a non-base58 wallet address before making a request", () => {
    expect(() => assertSolanaAddress("not a wallet")).toThrow("Invalid Solana address");
  });

  it("reports incomplete coverage when any platform fetch fails", () => {
    expect(portfolioCoverage({
      owner: wallet,
      date: 1,
      duration: 5,
      fetcherReports: [
        { id: "kamino", status: "ok" },
        { id: "jupiter-exchange-perpetual", status: "failed", error: "decoder error" },
      ],
      elements: [],
    })).toEqual({
      complete: false,
      failures: ["jupiter-exchange-perpetual"],
    });
  });

  it("identifies a response without fetcher reports as an unavailable coverage source", () => {
    expect(portfolioCoverage({
      owner: wallet,
      date: 1,
      duration: 5,
      fetcherReports: [],
      elements: [],
    })).toEqual({
      complete: false,
      failures: ["no fetcher reports"],
    });
  });

  it("keeps the documented elements and fetcher reports from a successful response", async () => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({
      owner: wallet,
      date: 1,
      duration: 5,
      fetcherReports: [{ id: "kamino", status: "ok" }],
      elements: [{ type: "borrowLend", platformId: "kamino", data: { value: 42 } }],
    }), { status: 200 }));

    await expect(getJupiterPortfolio(wallet, fetcher)).resolves.toEqual({
      owner: wallet,
      date: 1,
      duration: 5,
      fetcherReports: [{ id: "kamino", status: "ok" }],
      elements: [{ type: "borrowLend", platformId: "kamino", data: { value: 42 } }],
    });
  });
});
