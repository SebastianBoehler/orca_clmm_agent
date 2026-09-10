# Codex Automation Prompt Template

Use this prompt for a standalone Codex automation after the strategy file has
been filled in and tested manually.

```text
Manage the development Solana trading wallet using the Orca CLMM agent runtime.

Scope:
- Work in /absolute/path/to/orca_clmm_agent
- Treat this as a live-money dev-wallet workflow.
- Use the Docker runtime, not host ad hoc scripts, for wallet-aware operations.
- Read AGENTS.md, agent-runtime/README.md, docs/trading-agent-runbook.md,
  $AGENT_STRATEGY_PATH, and recent .agent-actions/*.md logs before deciding.

Runtime command shape:
docker compose -f docker-compose.codex-agent.yml run --rm --no-deps codex-agent \
  codex exec --cd /workspace --dangerously-bypass-approvals-and-sandbox -

Each run:
1. Inspect wallet balances, recent wallet history, current positions, deposits,
   obligations, and protocol readiness across Solana and any strategy-approved
   EVM routes.
2. Identify the chain and gas model for each candidate: native gas token,
   current gas-token balance, estimated fee/rent/bundler cost, sponsor or
   paymaster status, and reserve needed for one exit or management transaction.
3. Decide whether any action is justified under the strategy. Prefer no action
   when expected edge is unclear or required state is ambiguous.
   Include LI.FI-accessible opportunities when relevant: swaps, bridges,
   lending/vaults, eligible tokenized assets such as xStocks equities/ETFs, and
   other reputable on-chain products. Require eligibility, token contract,
   issuer/backing, liquidity, route cost, gas/reserve, bridge or settlement
   risk, and exit readiness before treating them as live candidates.
4. Before any live transaction, append a decision record under
   $AGENT_ACTION_LOG_DIR with prompt summary, candidate actions, chosen action,
   quote, simulation, policy checks, and rationale.
5. Simulate every transaction before submission.
6. Submit only a bounded transaction that satisfies the strategy and stays
   within risk limits. For small wallets whose goal is growth, deploy most
   usable non-reserved capital into the selected simple/liquid venue instead of
   leaving most value idle by habit.
7. After finalization or failure, append signature/status and balance or
   position deltas to the same action log.
8. Run wallet-history reconstruction after a live transaction and compare it to
   the action log.

Pause and report instead of trading if:
- strategy instructions are missing or ambiguous
- RPC is rate-limited or inconsistent
- wallet-history reconstruction fails
- simulation fails
- protocol account state is unclear
- expected and observed deltas differ materially
- the action would exceed any configured risk limit

Final response:
- Report no-action, submitted action, or pause reason.
- Include action-log path and signatures when present.
- Do not print secrets or raw environment dumps.
```

Suggested schedule after manual dry runs pass:

- every 30 minutes for conservative monitoring
- every 10 minutes only when actively managing a short-lived position
- pause the automation when the strategy file is under revision
