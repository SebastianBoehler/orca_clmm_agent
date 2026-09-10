# Contributing

Thanks for helping improve Orca CLMM Agent.

## Development Setup

```bash
cd package
npm ci
npm run build
npm run test:unit
```

The default test lane is intentionally offline and deterministic. Mainnet/RPC
checks live in the integration test lane:

```bash
cd package
RPC_URL=https://your-rpc.example npm run test:integration
```

Integration tests may hit Orca, Solana RPC providers, Jupiter, LI.FI, or other
external APIs. They can fail because of rate limits, network issues, or upstream
changes.

## Pull Requests

- Keep changes small and scoped.
- Add or update tests for behavior changes.
- Do not commit private keys, seed phrases, `.env` files, RPC credentials, API
  keys, wallet files, generated logs, or local agent memory.
- Prefer typed helpers and explicit error handling over fallbacks or mock data.
- Keep modules focused. Large files should be split before they become hard to
  review.

## Transaction Safety

Code that signs, sends, swaps, bridges, stakes, opens positions, or closes
positions must make the risk visible in names, docs, and examples. Examples
should default to read-only behavior unless they are explicitly marked as live
transaction examples.
