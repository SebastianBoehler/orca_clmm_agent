# EVM Account Abstraction Examples

These examples add an EVM execution path to the runtime without changing the
Orca package. They are safe by default and only submit when `EXECUTE_LIVE=1`
plus a second action-specific flag is set.

## Model

- The owner key is an EVM private key from `EVM_PRIVATE_KEY`.
- The runtime derives an ERC-4337 `SimpleAccount` for the selected chain.
- Pimlico is used as bundler and paymaster when `PIMLICO_API_KEY` or
  `PIMLICO_RPC_URL` is configured.
- The trading wallet does not need native gas on that EVM chain when the
  paymaster sponsors the UserOperation.

This is platform independent. AWS, GCP, local Docker, or another runner can all
use the same flow as long as the key, RPC, bundler, and paymaster are available.

## Smart Account Check

```bash
EVM_PRIVATE_KEY=0x... EVM_CHAIN=base \
  npx tsx examples/evm-aa/gasless-smart-account.ts
```

Live self-test:

```bash
EVM_PRIVATE_KEY=0x... EVM_CHAIN=base PIMLICO_API_KEY=... \
  EXECUTE_LIVE=1 EVM_SELF_TEST=1 \
  npx tsx examples/evm-aa/gasless-smart-account.ts
```

## LI.FI Gasless Route

The LI.FI quote returns an EVM transaction request for the source chain. The
example submits that request through the smart account when explicitly enabled.

```bash
EVM_PRIVATE_KEY=0x... EVM_CHAIN=base PIMLICO_API_KEY=... \
  LIFI_TO_CHAIN=10 \
  LIFI_FROM_TOKEN=0x... \
  LIFI_TO_TOKEN=0x... \
  LIFI_FROM_AMOUNT_RAW=1000000 \
  npx tsx examples/evm-aa/lifi-gasless-route.ts
```

Live execution:

```bash
EXECUTE_LIVE=1 EVM_LIFI_EXECUTE=1 \
  EVM_PRIVATE_KEY=0x... EVM_CHAIN=base PIMLICO_API_KEY=... \
  LIFI_TO_CHAIN=10 \
  LIFI_FROM_TOKEN=0x... \
  LIFI_TO_TOKEN=0x... \
  LIFI_FROM_AMOUNT_RAW=1000000 \
  npx tsx examples/evm-aa/lifi-gasless-route.ts
```

ERC-20 routes may still require allowance handling. Prefer quote-only checks
until the route, approval path, paymaster policy, and expected balance deltas
are logged and understood.
