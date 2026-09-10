import { SolanaError } from "@solana/kit";
import { sleep, writeLog } from "./utils";
import { runAgent } from "./agent";

(async () => {
  while (true) {
    try {
      await runAgent();
    } catch (error) {
      console.error(`[main] Error: ${error}`);
      if (error instanceof SolanaError) {
        if (error.cause === "Service Unavailable") {
          await sleep(1000 * 30);
          continue;
        }
        if (error.message.includes("Too Many Requests") || error.context?.statusCode === 429) {
          console.log("Too many requests");
          await sleep(1000 * 60);
          continue;
        }
        console.error("[main] SolanaError cause: ", error.cause);
      }
      if (error instanceof TypeError) {
        if (error.cause instanceof Error && error.cause.name === "SocketError") {
          await sleep(1000 * 30);
          continue;
        }
      }
      writeLog(`[${new Date().toLocaleString()}] [main] Error: ${error}`);
    }
    await sleep(1000 * 25);
  }
})();
