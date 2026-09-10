# Solana Protocol Capabilities

This runtime may inspect and use major, official Solana DeFi protocols when a
candidate is liquid, reversible, simulatable, and economically meaningful after
fees, rent, slippage, and exit costs. Keep protocol adapters in
`agent-runtime/`; keep the core package focused on Orca Whirlpool CLMM logic.

## Installed Runtime Clients

The runtime currently installs clients for:

- Orca Whirlpools: CLMM position open, close, and position reads.
- LI.FI: swaps, routes, bridges, Earn discovery, and eligible tokenized asset
  access where supported by official APIs/SDKs.
- Jupiter: Solana swap routing through APIs plus Jupiter Lend examples.
- Kamino: Lend, vault, and market discovery through the official SDK/API.
- Drift: account and perp readiness reads, guarded order template.
- Meteora: DLMM SDK is available for liquidity adapter work.
- Raydium: SDK v2 is available for direct pool and liquidity adapter work.
- marginfi: lending client is available for deposits, borrows, and health reads.

The agent may install another official SDK during a live research cycle only
when the platform is large, reputable, relevant to the wallet objective, and the
action remains bounded, simulated, logged, and exit-ready. Do not use unknown or
thin no-name dApps for live funds.

## Routing

For swaps and bridges, compare routes before execution:

- Prefer LI.FI when the action involves bridging, cross-chain routing, or broad
  route aggregation across venues.
- Prefer Jupiter for Solana-only swap routing when it is cheaper or more
  reliable for the token pair.
- Use Raydium, Orca, or Meteora directly only when the direct pool action is the
  product being entered or when a direct route is demonstrably better.

Record quoted output, price impact, fees, slippage, gas/rent, and fallback route
before submitting.

## Product Surface

Use these categories when generating candidates:

- Lending and vault yield: Jupiter Lend, Kamino Lend/Earn, and marginfi.
- Concentrated or dynamic liquidity: Orca, Raydium CLMM, and Meteora DLMM/DAMM.
- Perps or margin: Drift and Jupiter Perps, only with explicit collateral,
  liquidation, funding, and reduce-only exit checks.
- Route-assisted rebalancing: LI.FI, Jupiter, or direct DEX SDKs.
- Tokenized real-world assets: xStocks equities/ETFs or comparable reputable
  RWA products exposed through LI.FI or official venues, only when eligibility,
  issuer/backing model, token address, liquidity, market status, route fees,
  and exact exit mechanics are verified.
- Cross-chain EVM DeFi: lending, vaults, swaps, and eligible RWA products when
  LI.FI or an official protocol SDK can build the complete route and the native
  gas/paymaster model is ready.

Perps and borrowing must stay tiny or read-only unless the strategy explicitly
allows leverage. A high headline APY is not sufficient; include liquidity,
utilization, borrow/funding costs, liquidation risk, and exit readiness.

Tokenized equities and ETFs are not the same risk class as USDC lending or a
SOL/USDC CLMM. Include issuer, backing, eligibility, trading-hour, oracle,
liquidity, corporate-action, and redemption/exit risks before treating them as
valid candidates.

## Kamino Markets

`KAMINO_MARKET` is a Kamino Lend market account address, not a trading signal.
If it is unset, discover markets from the official Kamino API:

```bash
node --import tsx agent-runtime/examples/kamino-markets.ts
```

For generic lending reads, default to the discovered primary market. For
isolated markets, pick the market that matches the candidate asset and risk
profile, then log the selected market name and `lendingMarket` address.

## Candidate Rules

For every protocol candidate:

- Use official docs, public APIs, or official SDKs.
- Read current position state and wallet balances first.
- Build and simulate the exact transaction path before live mode.
- Verify the exit path, not just the entry path.
- Compare against holding the current position and against simple lending.
- Log why any unsupported or unconfigured adapter was skipped.
- For cross-chain or RWA candidates, record destination chain, gas token,
  sponsor/paymaster status when applicable, bridge or intent settlement risk,
  eligibility checks, token contract, issuer/backing source, and the tested exit
  route.
