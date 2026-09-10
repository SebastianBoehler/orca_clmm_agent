# Autonomous Trading Strategy Template

Use this as the strategy file for the Codex trading runtime. Copy it to
`${AGENT_STRATEGY_PATH:-/workspace/.agent-actions/strategy.md}` inside the
container. Docker Compose maps that default path to the gitignored local
`.agent-actions/strategy.md`.

## Objective

- Primary objective:
- Secondary objective:
- Stop condition:
- Review cadence:

## Wallet Scope

- Wallet public key:
- EVM owner / smart-account addresses:
- Solana sponsored fee payer:
- Max live transaction size:
- Max daily notional:
- Max daily realized loss:
- Minimum SOL reserve:
- Native gas token reserve per chain:
- Sponsored gas / paymaster readiness:
- Tokens that may be spent:
- Tokens that must not be spent:
- Max allocation per chain:
- Max allocation per vault or product:

## Protocol Scope

Allowed protocols:

- Orca Whirlpools:
- LI.FI:
- EVM account abstraction / Pimlico:
- Solana sponsored fee payer:
- Jupiter Lend:
- Kamino:
- Drift:
- Tokenized equities / ETFs / RWAs:
- Cross-chain EVM DeFi:
- Other:

Disallowed actions:

- 

## Decision Loop

On each run:

1. Read this strategy file, `AGENTS.md`, and recent `.agent-actions/*.md` logs.
2. Read wallet balances and recent wallet history.
3. Identify the chain and gas model for each candidate action: native gas token,
   current gas-token balance, estimated fee/rent/bundler cost, sponsor or
   paymaster status, and the reserve needed for at least one exit or management
   transaction.
4. Read open positions, obligations, deposits, and pending risk across allowed
   protocols.
5. Run risk checks before scanning new opportunities: depegs, TVL/liquidity
   drops, concentration, liquidation risk, route status, and exit availability.
6. Exit or reduce critical-risk positions before considering new deposits.
7. Identify whether action is needed. Prefer no action when evidence is weak.
8. If action is needed, build the bounded transaction that satisfies the
   strategy and deploys a meaningful amount after gas reserve. For small
   wallets whose goal is growth, do not leave most capital idle without a
   concrete blocker.
9. Simulate before submitting.
10. For EVM gasless actions, require paymaster sponsorship and bundler readiness.
11. For Solana sponsored actions, require fee-payer balance and fee budget
   checks.
12. Append a pre-submit action log entry with rationale, quote, simulation, and
   policy checks.
13. Submit only if all policy checks pass.
14. Append a post-submit action log entry with signature, status, and balance or
   position deltas.

## Opportunity Criteria

- Yield / fee threshold:
- Range or volatility criteria:
- Rebalance criteria:
- Exit criteria:
- Re-entry criteria:
- Maximum slippage:
- Maximum price impact:
- Minimum net APY improvement after route cost:
- Rebalance breakeven horizon:
- Tokenized asset eligibility and issuer/backing checks:
- Cross-chain route, bridge, and gas/paymaster checks:

## Pause Criteria

Pause and report instead of trading when:

- RPC is unreliable or returns repeated rate limits.
- Wallet-history reconstruction fails for recent live actions.
- A protocol SDK reports account state that cannot be interpreted.
- Simulation fails.
- Expected and simulated balance deltas disagree materially.
- The action would exceed any wallet, protocol, or daily risk limit.
- The strategy file is ambiguous for the current action.

## Output Format

Every run should report:

- timestamp
- wallet summary
- current positions / deposits / obligations
- candidate actions considered
- chosen action or no-action decision
- policy checks
- submitted signatures, if any
- action-log file path
