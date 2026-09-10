type Environment = Record<string, string | undefined>;

interface ConfirmationResponse {
  value: { err: unknown };
}

interface SimulationResponse {
  value: { err: unknown; unitsConsumed?: number };
}

interface SimulatingConnection<Transaction, Signature> {
  simulateTransaction(
    transaction: Transaction,
    options: { sigVerify: boolean },
  ): Promise<SimulationResponse>;
  sendTransaction(
    transaction: Transaction,
    options: { skipPreflight: boolean; preflightCommitment: "confirmed" },
  ): Promise<Signature>;
}

export function explicitLiveActionEnabled(
  env: Environment,
  actionFlag: string,
): boolean {
  return env.EXECUTE_LIVE === "1" && env[actionFlag] === "1";
}

export function assertSuccessfulConfirmation(response: ConfirmationResponse): void {
  if (response.value.err) {
    throw new Error(`Transaction confirmation failed: ${JSON.stringify(response.value.err)}`);
  }
}

export function isAmbiguousTransactionTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Transaction timed out");
}

export async function submitSimulatedSolanaTransaction<Transaction, Signature>(
  connection: SimulatingConnection<Transaction, Signature>,
  transaction: Transaction,
): Promise<Signature> {
  const simulation = await connection.simulateTransaction(transaction, { sigVerify: true });
  if (simulation.value.err) {
    throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }

  return connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
}
