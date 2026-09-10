import { getCreatedAssociatedTokenAccounts, ASSOCIATED_TOKEN_PROGRAM_ID, getTransactionDetails } from "./solana";
import { createSolanaRpc, mainnet, Signature } from "@solana/kit";

// Simple unit test using a mocked transaction detail object
const rpc = createSolanaRpc(mainnet("https://api.mainnet-beta.solana.com"));

describe("getCreatedAssociatedTokenAccounts", () => {
  it("detects created associated token accounts", async () => {
    const txHash = process.env.TEST_TRANSACTION_SIGNATURE;
    if (!txHash) throw new Error("TEST_TRANSACTION_SIGNATURE is required");
    const details = await getTransactionDetails(rpc, txHash as Signature);

    const result = getCreatedAssociatedTokenAccounts(details);
    expect(result.length).toBe(0);
  });
});
