<div align="center">

# Orca CLMM Agent

[![CI](https://github.com/SebastianBoehler/orca_clmm_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/SebastianBoehler/orca_clmm_agent/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/orca-clmm-agent.svg)](https://www.npmjs.com/package/orca-clmm-agent)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-mainnet-14F195?logo=solana&logoColor=black)
![Orca](https://img.shields.io/badge/Orca-Whirlpools-7C5CFF)
![License](https://img.shields.io/badge/license-MIT-D22128.svg)

An Orca Whirlpool concentrated-liquidity module and agent runtime for reading,
analyzing, opening, monitoring, and closing CLMM positions on Solana.

[Install](#package) | [Runtime](#agent-runtime) | [Monitoring](./docs/agentic-monitoring.md) | [Safety](#safety) | [Development](#development) | [Contributing](./CONTRIBUTING.md)

</div>

This repository contains:

- [package](./package): the published `orca-clmm-agent` npm package.
- [agent](./agent): an operational trading agent example that consumes the
  package.
- [functions](./functions): cloud functions that consume the package for pool,
  yield, and wallet-value jobs.
- [agent-runtime](./agent-runtime): an experimental Codex CLI container that
  consumes this Orca module and can also carry broader trading clients.

## Package

```bash
npm install orca-clmm-agent
```

```ts
import { getOrcaPositions } from "orca-clmm-agent";
import { createSolanaRpc, mainnet } from "@solana/kit";

const rpc = createSolanaRpc(mainnet(process.env.RPC_URL!));
const positions = await getOrcaPositions("wallet-address", rpc);
```

See the package README for the full API-oriented usage notes.

## Agent Runtime

The optional [agent-runtime](./agent-runtime) image provides a Codex CLI
container with this Orca CLMM package, Solana, Orca, LI.FI, SPL Token, CCXT,
TypeScript, and Python tooling preinstalled. The repository stays Orca-specific;
the runtime is where broader trading and routing clients belong.

The runtime image does not bake in credentials. For unattended trading, keep
private keys in a separate executor service that enforces policy before signing.

See [agentic monitoring](./docs/agentic-monitoring.md) for the current position
monitoring and Codex hook architecture. See
[runtime verification](./docs/runtime-verification.md) for the latest live
container checks.

## Safety

Some examples can send real mainnet transactions. Treat scripts that load a
wallet keypair as live unless they explicitly say otherwise.

Never commit wallet files, `.env` files, seed phrases, API keys, RPC
credentials, or exchange credentials. See [SECURITY.md](./SECURITY.md) before
changing repository visibility.

## Development

```bash
cd package
npm ci
npm run build
npm run test:unit
```

Live RPC integration tests are separate:

```bash
cd package
RPC_URL=https://your-rpc.example npm run test:integration
```
