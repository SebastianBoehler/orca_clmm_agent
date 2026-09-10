const modulePath = "./transaction-safety";

describe("transaction safety", () => {
  let safety: any;

  beforeAll(async () => {
    safety = await import(modulePath).catch(() => ({}));
  });

  it("requires an explicit action flag in addition to live authorization", () => {
    expect(safety.explicitLiveActionEnabled?.(
      { EXECUTE_LIVE: "1" },
      "SUBMIT_LIFI_SWAP",
    )).toBe(false);
    expect(safety.explicitLiveActionEnabled?.(
      { EXECUTE_LIVE: "1", SUBMIT_LIFI_SWAP: "1" },
      "SUBMIT_LIFI_SWAP",
    )).toBe(true);
  });

  it("rejects a confirmation response containing an on-chain error", () => {
    expect(() => safety.assertSuccessfulConfirmation?.({
      value: { err: { InstructionError: [0, "InvalidArgument"] } },
    })).toThrow("Transaction confirmation failed");
  });

  it("classifies a confirmation timeout as ambiguous", () => {
    expect(safety.isAmbiguousTransactionTimeout?.(
      new Error("[awaitTransactionStatus] Transaction timed out: signature"),
    )).toBe(true);
  });

  it("simulates before sending and retains RPC preflight", async () => {
    const sentOptions: unknown[] = [];
    const connection = {
      simulateTransaction: async () => ({ value: { err: null, unitsConsumed: 42 } }),
      sendTransaction: async (_transaction: unknown, options: unknown) => {
        sentOptions.push(options);
        return "signature";
      },
    };

    const signature = await safety.submitSimulatedSolanaTransaction?.(
      connection,
      { serialized: true },
    );

    expect(signature).toBe("signature");
    expect(sentOptions).toEqual([{
      skipPreflight: false,
      preflightCommitment: "confirmed",
    }]);
  });

  it("does not send a transaction that fails simulation", async () => {
    let sendCount = 0;
    const connection = {
      simulateTransaction: async () => ({
        value: { err: { InstructionError: [0, "InvalidArgument"] } },
      }),
      sendTransaction: async () => {
        sendCount += 1;
        return "signature";
      },
    };

    await expect(safety.submitSimulatedSolanaTransaction?.(
      connection,
      { serialized: true },
    )).rejects.toThrow("Transaction simulation failed");
    expect(sendCount).toBe(0);
  });
});
