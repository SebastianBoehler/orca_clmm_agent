# Runtime Security Model

The agent runtime is intentionally capable of signing transactions with the
mounted wallet. That is useful for live Solana execution, but it means the
runtime should be treated as a hot-wallet environment.

## Current State

- Wallet material is mounted at runtime and gitignored.
- Optional Solana fee-payer material may be mounted separately through
  `SOLANA_FEE_PAYER_KEYPAIR_PATH`.
- Examples are safe by default and require `EXECUTE_LIVE=1` before submitting.
- The container currently has normal outbound network access.
- Codex can use native web search when `web_search = "live"` or the CLI
  `--search` flag is enabled.
- Codex hooks can add prompt/tool guardrails, but hooks are not a network
  firewall and should not be treated as one.

## Codex Search vs Network Egress

Do not add a separate search API just to let the runtime read protocol docs.
Codex already supports native web search through config or the `--search` CLI
flag. The config can also set `tools.web_search.allowed_domains` or
`tools.web_search.blocked_domains` for native search result filtering.

That only scopes the Codex web search tool. It does not restrict arbitrary
network access from shell commands, Node scripts, SDKs, `fetch`, `curl`, npm, or
Solana RPC clients. Host/domain egress control for a hot-wallet executor needs a
container/network control such as a proxy, firewall, or separate signing
service.

## Recommended Target

Split the system into two containers or processes:

- **Research agent:** no wallet, broad but logged web access, can read docs,
  quote APIs, market APIs, and write proposed actions.
- **Executor:** has the mounted wallet, narrow egress allowlist, validates
  policy, simulates transactions, and submits only approved actions.

This split reduces prompt-injection risk because arbitrary web content never
shares a process with wallet signing unless an explicit action crosses the
policy boundary.

## Egress Allowlist

The executor should only reach:

- configured Solana RPC and websocket hosts from `RPC_URL`
- Jupiter APIs: `api.jup.ag`, `lite-api.jup.ag`, `developers.jup.ag`
- LI.FI APIs: `li.quest`, `earn.li.fi`
- EVM account-abstraction APIs: `api.pimlico.io` and configured EVM RPC hosts
- Kamino APIs: `api.kamino.finance`, `kamino.com`
- Orca APIs: `api.orca.so`
- Pyth/Hermes APIs used by price reads
- Drift endpoints required by the SDK and configured RPC
- OpenAI/Codex endpoints only if Codex itself runs in the executor

Build-time package hosts such as npm and GitHub should not be reachable from a
live executor. Install dependencies in the image before the wallet is mounted.

Native Codex web search can be limited to documentation hosts with
`agent-runtime/codex-config.example.toml`, but that limit should be considered a
research-tool boundary, not an executor egress policy.

## Practical Implementation Options

Docker Compose alone does not provide host-name egress controls. Use one of
these approaches:

- Run the executor behind an HTTP(S) proxy with domain allowlists and force
  `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY`.
- Use a local firewall such as `pf` on macOS or `iptables/nftables` on Linux for
  IP-level egress rules, accepting that cloud API IPs can change.
- Put the executor on a restricted Docker network that can only reach a proxy.
- Keep signing in a local policy service and run Codex without direct wallet
  access.

## Transaction Policy

Before sending any transaction, enforce:

- allowed protocols/program IDs
- max notional per action
- max daily spend/loss
- max per-chain and per-vault allocation
- max leverage for perps
- max slippage and price impact
- allowed mints and denylisted tokens
- simulation success
- expected balance deltas
- paymaster sponsorship policy success for EVM UserOperations
- sponsored fee-payer balance and maximum fee budget for Solana transactions
- one live attempt unless explicitly authorized

The examples in `agent-runtime/examples` are templates, not a complete policy
engine.
