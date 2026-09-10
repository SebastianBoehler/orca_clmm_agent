# Codex Trading Runtime

This directory contains an optional Codex CLI container for agentic trading
research and controlled execution workflows.

The repository remains centered on Orca Whirlpool concentrated liquidity. This
runtime consumes the local `orca-clmm-agent` module and can also install broader
trading clients for routing, bridge, exchange, or portfolio research.

The image includes:

- Codex CLI
- Node.js 22
- Python 3
- ripgrep, git, jq, curl, and OpenSSH client tools
- TypeScript and `tsx`
- Solana, Orca, LI.FI, Jupiter, Kamino, Drift, Meteora, Raydium, marginfi, SPL
  Token, Anchor, CCXT, viem, and permissionless.js libraries

## Solana SDK Notes

Prefer `@solana/kit` for new generic Solana code in this repo. Solana's
official docs describe `@solana/kit` as the recommended TypeScript SDK and
`@solana/web3.js` as the legacy TypeScript SDK. The runtime still installs
`@solana/web3.js` because Drift, Jupiter Lend, Raydium, Meteora, and other DeFi
SDKs commonly expose web3.js-typed APIs.

Keep protocol examples honest about that boundary:

- use `@solana/kit` for local transaction helpers when the SDK supports it
- use `@solana/web3.js` at SDK boundaries that require `Connection`,
  `PublicKey`, `Keypair`, or `TransactionInstruction`
- avoid sharing web3.js objects across SDKs that vendor different web3.js
  versions unless the boundary is explicitly cast and documented

## Build

```bash
docker compose -f docker-compose.codex-agent.yml build
```

The Dockerfile builds the local package from `../package` and installs it into
the runtime through a `file:../package` dependency, so container tests exercise
the working tree version instead of the last npm release.

## Authenticate Codex

```bash
docker compose -f docker-compose.codex-agent.yml run --rm codex-agent codex login
```

Codex auth is stored in the `codex-auth` Docker volume.

## Run

```bash
docker compose -f docker-compose.codex-agent.yml run --rm codex-agent \
  codex exec --json --cd /workspace -
```

The repository is mounted at `/workspace`.

For a continuously managed live session with automatic restart after a process
or Docker daemon interruption, use the live overlay:

```bash
EXECUTE_LIVE=1 docker compose \
  -f docker-compose.codex-agent.yml \
  -f docker-compose.codex-agent.live.yml \
  up -d codex-agent
```

`EXECUTE_LIVE=1` authorizes live actions. Read and quote commands still stop
without broadcasting; action-specific helpers may require an additional submit
flag such as `SUBMIT_LIFI_SWAP=1`.

On startup, the container exposes preinstalled runtime dependencies to the
mounted repository through a gitignored `/workspace/node_modules` symlink.

## Web Search

Codex can use its native web search in the runtime. Either pass the CLI flag:

```bash
docker compose -f docker-compose.codex-agent.yml run --rm codex-agent \
  codex --search exec --json --cd /workspace -
```

For non-interactive jobs you can also pass a config override:

```bash
docker compose -f docker-compose.codex-agent.yml run --rm codex-agent \
  codex exec -c web_search='"live"' --json --cd /workspace -
```

Or copy the shape from [`codex-config.example.toml`](./codex-config.example.toml)
into the Codex config mounted in the `codex-auth` volume.

`tools.web_search.allowed_domains` only filters Codex native search results. It
does not constrain shell command egress, SDK HTTP calls, Solana RPC calls, npm,
`curl`, or `fetch`. Use a proxy/firewall or separate executor for container-wide
network policy.

## Action Examples

See [`examples`](./examples) for safe-by-default TypeScript templates that read
positions, build bounded Orca open/close instructions, and request LI.FI swap
quotes. `position-details.ts` is the preferred pre-decision read: it captures
decision-grade position metrics such as receipt shares, redeemable underlying,
rates, and principal-based yield when action-log cost basis is provided. The
runtime also includes examples for Drift perps, Jupiter Lend, and Kamino.
`wallet-history.ts` reconstructs recent wallet actions from parsed on-chain
transactions. Live examples require `EXECUTE_LIVE=1`.

EVM account-abstraction examples live in
[`examples/evm-aa`](./examples/evm-aa). They derive ERC-4337 smart accounts,
configure Pimlico bundler/paymaster endpoints, and can submit LI.FI EVM
transaction requests through a gas-sponsored smart account when explicitly
enabled. This is platform independent: AWS, GCP, or local Docker can run the
same flow if secrets, RPC, bundler, and paymaster config are provided.

Solana examples also support an optional sponsored fee payer for open-source
coverage and relayer-style deployments. The default is still simpler: keep
enough SOL in the trading wallet and let it pay its own Solana fees. If
`SOLANA_FEE_PAYER_KEYPAIR_PATH` points to a separate SOL-funded sponsor keypair,
the shared Solana helpers will use that signer as the transaction fee payer
while the trading wallet remains the asset authority. See
[`examples/solana-sponsored-fee-payer.ts`](./examples/solana-sponsored-fee-payer.ts)
for a guarded self-test.

## Verified Capabilities

See [`../docs/runtime-verification.md`](../docs/runtime-verification.md) for
the latest mainnet smoke test results. The current branch verified live Orca
open/close, LI.FI quote and swap, Jupiter Lend deposit submission, Drift account
readiness checks, Kamino market reads, and `codex exec` inside the container.

## Security Model

See [`../docs/runtime-security.md`](../docs/runtime-security.md) for the current
hot-wallet risk model, recommended executor split, egress allowlist, and
transaction policy checks.

## Codex Hooks

Codex hooks are useful for guardrails around the agent loop, not for continuous
market monitoring. Use them to inspect prompts, block unsafe tool calls, log
decisions, validate final responses, or require another pass before a turn ends.

The runtime exposes the standard Codex lifecycle events through Codex config:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `Stop`

Position monitoring should live outside hooks as a scheduled monitor or Codex
automation. The monitor should query positions, compute risk thresholds, and
invoke Codex only when a decision is needed.

## Signing Model

Do not bake private keys into this image.

For serious unattended trading, keep signing in a separate executor service that
owns the hot wallet and enforces policy before submitting transactions. Codex
should generate code, inspect markets, request quotes, simulate transactions,
and submit bounded intents or unsigned transactions to that executor.

Recommended executor checks:

- max notional per trade
- max daily spend or loss
- allowlisted programs, exchanges, bridges, and tokens
- max slippage and price impact
- successful simulation
- expected balance deltas
- sponsored fee-payer balance and max fee policy when configured
- human approval above configured thresholds
- emergency kill switch

## Action Logs

For live actions, keep a markdown action log under
`${AGENT_ACTION_LOG_DIR:-/workspace/.agent-actions}` inside the container.
Docker Compose bind-mounts `./.agent-actions` to that path so Codex can read its
own prior decisions across runs.

Append a short record before submission with the prompt summary, intended
action, rationale, quote, simulation result, and policy checks. Append again
after finalization or failure with the signature, status, wallet-history
cross-check, and balance or position deltas.

When a live action opens or adds to a position, log enough cost basis for later
PnL reads: deposited principal, spent tokens, received shares, entry price,
fees, rent, and route costs. On later cycles, the agent should combine action
logs with protocol state so it can estimate yield, unrealized PnL, liquidation
distance, and exit readiness before deciding.

`.agent-actions/` is gitignored because it may contain strategy notes and
wallet-specific operational history. Use
[`action-log.template.md`](./action-log.template.md) as the record shape.

## Autonomous Runs

Use [`autonomous-strategy.template.md`](./autonomous-strategy.template.md) to
define the wallet policy, allowed protocols, risk limits, opportunity criteria,
and pause conditions. Use
[`codex-automation-prompt.template.md`](./codex-automation-prompt.template.md)
as the starting prompt for a scheduled Codex automation after a manual run has
proved the loop.

Keep the actual strategy file private if it contains wallet-specific sizing,
risk, or edge assumptions. A Codex automation should invoke the Docker runtime
so the mounted wallet, SDK dependencies, and persistent action logs are all
available at the same in-container paths.

The runtime strategy may use the broader on-chain product surface when the
strategy permits it: Orca CLMMs, Jupiter/Kamino/marginfi lending, Drift or
Jupiter perps with explicit leverage limits, LI.FI routing, LI.FI-accessible
cross-chain EVM routes, and eligible tokenized assets such as xStocks
equities/ETFs. Treat these as candidate sources, not automatic trades. Before a
live action, verify wallet eligibility, token contract, issuer/backing model,
liquidity, route cost, gas or paymaster readiness, settlement/bridge risk, and
exit readiness, then log the full decision record.

See [`automations`](./automations) for example `automation.toml` files that
mirror the local Codex app automation layout.
