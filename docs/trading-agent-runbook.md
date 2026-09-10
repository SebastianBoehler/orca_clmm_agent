# Trading Agent Runbook

This runbook captures the runtime workflow that worked during the live Orca
verification on mainnet.

## Runtime Envelope

- Keep the core package focused on Orca Whirlpool CLMM operations.
- Use the Codex container as the flexible runtime for other clients and one-off
  strategy code.
- Keep signing material mounted at runtime. Do not add keys to the image or git.
- Start every live action by reading wallet balances and current positions.
- Build the smallest transaction that satisfies the action, simulate it, then
  submit once unless the prompt authorizes more.
- Treat percentage limits as allocation caps. For example, a 50% cap means no
  single product should receive more than half the wallet; it does not mean the
  agent should open a dust-sized position.
- Before every candidate action, identify the execution chain and gas model:
  native gas token, current gas-token balance, estimated fee/rent/bundler cost,
  sponsored fee-payer or paymaster status, and reserve needed for at least one
  exit or management transaction.
- Avoid actively managed positions whose expected yield is dominated by fees,
  rent, slippage, or monitoring overhead. For small wallets, prefer simple,
  liquid, low-overhead venues and deploy most usable non-reserved capital when
  the stated goal is wallet growth.
- Treat active positions as dust when their expected yield cannot clearly
  justify fees, rent, slippage, and monitoring overhead relative to the wallet
  size, stated goal, and risk profile. Close dust positions after simulation
  unless closing costs outweigh the cleanup benefit.
- After finalization, read balances and positions again and print deltas.

## Gas Reserve And Sizing

Gas reserve is chain-specific and must be checked explicitly. On Solana, SOL is
needed for fees and rent effects unless a sponsored fee payer is configured and
verified. On EVM chains, the native gas token is needed unless a smart-account
paymaster sponsors the UserOperation. For bridges and routed actions, check gas
requirements on both source and destination chains before submitting.

For small wallets, avoid fixed notional habits such as deploying only 5 or 10
USDC when the goal is to grow the whole wallet. Preserve enough gas token for at
least one safe exit, then deploy the largest sensible amount into the selected
simple, liquid, reversible strategy. Leave most capital idle only when the
candidate fails simulation, exit readiness, risk, or expected-value checks.

## Position Detail Requirements

Before holding, closing, rebalancing, or adding to any position, collect the
position details needed to make the decision. A balance-only read is not enough.

- Lending and vaults: read receipt shares, redeemable underlying, deposited
  principal from action logs, accrued yield, current APY or reward rate, TVL,
  withdrawal limits, fees, cooldowns, and the exact withdraw/redeem instruction
  semantics. Simulate the exit path before relying on it.
- Perps: read base size, entry price, mark or oracle price, notional, collateral,
  margin, leverage, liquidation price, unrealized and realized PnL, funding,
  open orders, oracle confidence, and whether a reduce-only close can be built.
- Orca CLMM: read position mint, pool, current price, tick range, in-range
  status, liquidity, token amounts, uncollected fees and rewards, estimated
  close value, rent effects, and any drift or impermanent-loss estimate the
  strategy uses.
- Bridges, swaps, and routed products: read current route status, received
  tokens, fees, price impact, pending transfers, and destination balances before
  assuming funds are available.

Use `agent-runtime/examples/position-details.ts` as the first read for current
Jupiter Lend exposure. Provide principal from action logs through
`JUP_LEND_PRINCIPAL_RAW_BY_ASSET=mint:raw` when exact accrued-yield or PnL
numbers are needed.

## Orca Position Open

Use `openPositionInstructions` for bounded tests. It lets the agent set explicit
token caps and inspect the quote before signing.

Important details:

- Current Orca SDK inputs for bounded opens are `tokenMaxA` and `tokenMaxB`.
- Use those fields as the hard spend limits.
- Do not treat `tokenEstA` or `tokenEstB` as spend caps.
- For small SOL/USDC checks, choose a tight explicit pool and range instead of
  searching all pools.
- For actual strategy deployments, size the position so the expected fees and
  yield can matter. If the wallet lacks the right token mix, evaluate the
  rebalance cost explicitly rather than silently shrinking the position.
- For live Orca entries that need token composition, use
  `agent-runtime/examples/orca-composed-open-step.ts`. Run `FLOW_STEP=swap`
  first to quote and simulate a SOL-to-USDC rebalance, append the action-log
  decision record, submit only with `EXECUTE_LIVE=1`, then re-check balances and
  run `FLOW_STEP=open` with explicit Orca `TOKEN_MAX_A_RAW` and
  `TOKEN_MAX_B_RAW` caps.
- Multi-step Orca entries are allowed when expected reward justifies the extra
  swap, gas, priority, network, slippage, rent, and exit costs. Log those costs
  before submission, and simulate each transaction path that will be submitted.
- Avoid helper flows that automatically swap full wallet balances unless the
  prompt asks for that behavior.

The latest verified open transaction used the SOL/USDC Whirlpool
`Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`, simulated successfully, and
opened one position with small explicit token caps.

## Orca Position Close

Use `closePositionInstructions` for close verification. The SDK builds the
withdraw-liquidity, fee collection, reward collection, and close-account
instructions when applicable.

Close active dust positions when the quote and simulation are clean. The dust
judgment should be contextual rather than a hard notional threshold. A dust
close should still log the position mint, expected returned tokens, fees owed,
simulation result, signature, and post-close wallet deltas.

Wallet-specific transaction records and balance deltas belong in private action logs.

## RPC And Execution Lessons

- Public RPC may rate-limit broad DeFi SDK reads; add exponential backoff and
  prefer a higher-quota private RPC for agent automations.
- Treat HTTP `421` and `429` from Solana RPC as transient operational limits,
  not as a final reason to hold or skip action discovery. A candidate should
  only be abandoned for RPC reasons after slower retries, serial/narrow reads,
  and any configured alternate RPC endpoint have failed to produce decision-grade
  state.
- If an alternate RPC endpoint is available, keep it out of git and pass it at
  runtime as an environment override such as `RPC_URL=<alternate> ...` for the
  same read/build script. Switch endpoints for reads, quotes, and simulations
  only; never resubmit a live transaction just because confirmation reads are
  delayed.
- Avoid concurrent broad reads during live actions.
- Prefer known pool and position mint inputs over discovery scans.
- If a live script must import local package files from `/tmp`, set `NODE_PATH`
  and use the `ts-node` compiler options from `AGENTS.md`.
- `codex exec` does not use the same short approval flag as interactive Codex.
  Use `--dangerously-bypass-approvals-and-sandbox` only inside the isolated
  runtime container.
- `codex exec` was verified inside the container with the mounted workspace and
  Codex auth volume.

## Wallet History

Use `agent-runtime/examples/wallet-history.ts` to reconstruct recent signed
wallet actions from chain data. It reads signatures, parsed transaction details,
program IDs, SOL deltas, and token deltas. This is enough to verify what landed
and which on-chain programs were invoked.

Keep a separate agent action log for off-chain context: prompt, intended action,
quote, simulation result, policy checks, selected route, submitted signature,
and post-trade balance deltas. On-chain history cannot reconstruct that intent
reliably, especially for aggregator-routed swaps.

Write action logs as dated markdown files under
`${AGENT_ACTION_LOG_DIR:-/workspace/.agent-actions}` from inside the container.
Docker Compose bind-mounts that path to `./.agent-actions` for persistence
across runs. The directory is gitignored by design; it is operational memory,
not public package documentation. Use `agent-runtime/action-log.template.md` as
the entry shape.

Action logs must include cost basis for every opened or increased position:
principal, received shares or position size, entry price, fees, rent, route
costs, and signature. Without this, later agents can still read current
protocol state but cannot compute exact yield or PnL.

## Automation Shape

Use Codex app automations as the outer scheduler and the Docker runtime as the
trading execution environment. The automation prompt should wake on a schedule,
read the private strategy file and recent action logs, then invoke the container
runtime for wallet-aware reads or transactions.

For active live positions, the Docker runtime should be continuous by default:
run a decision cycle, sleep for the configured cadence, and repeat until the
user manually stops the container or a safety blocker requires intervention.
Do not encode fixed stop times into the active trading container. A fixed stop
leaves open positions unmanaged after the window expires.

Start that managed mode through `docker-compose.codex-agent.live.yml`. The live
overlay runs the continuous wrapper with `restart: unless-stopped`; the base
Compose file remains suitable for interactive and one-off commands.

Once Codex is already executing inside the Docker runtime at `/workspace`, it is
inside the trading execution environment. It must not attempt to launch Docker,
start another Codex automation, or create a recursive `codex exec` container.
The inner runtime should make decisions, run local SDK/scripts, submit only
logged and simulated transactions, append action logs, and then return control
to the outer scheduler or wrapper loop.

Prefer standalone `cron` automations for independent monitoring runs. Use
thread-attached heartbeat automations only when the same conversation context is
part of the workflow. Start with manual dry runs, then a paused automation, then
small live runs after the first outputs are reviewable.

Do not start an unattended profit-seeking automation without explicit wallet
limits, allowed protocols, maximum trade size, maximum daily loss, minimum SOL
reserve, and pause criteria.

## LI.FI And Other Platforms

LI.FI belongs in the runtime action layer. Use it for quotes and swaps when an
Orca action needs rebalancing, but keep a quote-only step before execution and
enforce max price impact, slippage, and spend limits.

For the broader Solana protocol toolbox, use
[`solana-protocol-capabilities.md`](./solana-protocol-capabilities.md). The
runtime can inspect or build candidates for major official venues such as
Jupiter, Raydium, Meteora, Drift, marginfi, and Kamino when their SDK/API path
is available, the candidate is simulatable, and the exit path is clear.

LI.FI Earn discovery is an API surface at `https://earn.li.fi`, not a reason to
switch to the CLI. The runtime can query vaults directly, filter for Composer
support, then use the normal quote route with the vault token as `toToken` where
LI.FI Composer supports execution. Current Composer protocol deposits are
documented as EVM-only, so Solana-native yield still needs native Solana
clients.

Drift/Jupiter perpetuals should be added as runtime adapters when there is a
specific monitored strategy. Until then, document their state and avoid putting
perps code into the core Orca package.
