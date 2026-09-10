import { address } from "@solana/kit";
import { KaminoVault } from "@kamino-finance/klend-sdk";
import { Decimal } from "decimal.js";
import {
  executeAfterSimulation,
  liveEnabled,
  loadRuntime,
  requireEnv,
} from "./common.ts";

const { rpc, wallet } = await loadRuntime();
const vaultAddress = address(requireEnv("KAMINO_VAULT"));
const amount = new Decimal(requireEnv("KAMINO_AMOUNT_DECIMAL"));
const action = (process.env.KAMINO_ACTION || "deposit").toLowerCase();
const vault = new KaminoVault(rpc as any, vaultAddress);

const ixGroups = action === "withdraw"
  ? await vault.withdrawIxs(wallet, amount)
  : await vault.depositIxs(wallet, amount);
const instructions = action === "withdraw"
  ? [
      ...(ixGroups as Awaited<ReturnType<typeof vault.withdrawIxs>>).unstakeFromFarmIfNeededIxs,
      ...(ixGroups as Awaited<ReturnType<typeof vault.withdrawIxs>>).withdrawIxs,
      ...(ixGroups as Awaited<ReturnType<typeof vault.withdrawIxs>>).postWithdrawIxs,
    ]
  : [
      ...(ixGroups as Awaited<ReturnType<typeof vault.depositIxs>>).depositIxs,
      ...(ixGroups as Awaited<ReturnType<typeof vault.depositIxs>>).stakeInFarmIfNeededIxs,
      ...(ixGroups as Awaited<ReturnType<typeof vault.depositIxs>>).stakeInFlcFarmIfNeededIxs,
    ];

console.log(JSON.stringify({
  wallet: wallet.address,
  vault: vaultAddress,
  action,
  amount: amount.toString(),
  instructionCount: instructions.length,
  live: liveEnabled(),
}, null, 2));

if (!liveEnabled()) {
  console.log("Set EXECUTE_LIVE=1 to submit this Kamino vault transaction.");
  process.exit(0);
}

const signature = await executeAfterSimulation(rpc, wallet, instructions as any);
console.log(`Submitted Kamino vault transaction: ${signature}`);
