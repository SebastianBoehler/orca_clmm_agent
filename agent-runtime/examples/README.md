# Runtime Examples

These examples are templates for the Codex trading runtime. They are safe by
default: live actions require `EXECUTE_LIVE=1`.

`lifi-quote-swap.ts` remains quote-only when live authorization is ambient. A
LI.FI submission requires both `EXECUTE_LIVE=1` and the action-specific
`SUBMIT_LIFI_SWAP=1` flag.

Run from the container with the repo mounted at `/workspace`:

```bash
cd /workspace
node --import tsx agent-runtime/examples/orca-read-positions.ts
```

For live examples, set the required env vars explicitly:

```bash
EXECUTE_LIVE=1 ORCA_POOL=... LOWER_PRICE=... UPPER_PRICE=... \
TOKEN_MAX_A_RAW=... TOKEN_MAX_B_RAW=... \
node --import tsx agent-runtime/examples/orca-open-bounded-position.ts
```

For SOL-heavy Orca entries, quote and simulate the rebalance before opening.
Run the swap and open as separate logged steps:

```bash
FLOW_STEP=swap FROM_AMOUNT_RAW=... \
node --import tsx agent-runtime/examples/orca-composed-open-step.ts
```

Then, after the swap is logged/submitted and balances are checked:

```bash
FLOW_STEP=open ORCA_POOL=... LOWER_PRICE=... UPPER_PRICE=... \
TOKEN_MAX_A_RAW=... TOKEN_MAX_B_RAW=... \
node --import tsx agent-runtime/examples/orca-composed-open-step.ts
```

Wallet material should be mounted at runtime and referenced with
`KEYPAIR_PATH`. The default path is `/workspace/package/examples/keypair.json`,
which is gitignored.

LI.FI Earn discovery is read-only and does not require the CLI:

```bash
LIFI_API_KEY=... EARN_CHAIN_ID=8453 EARN_ASSET=USDC \
node --import tsx agent-runtime/examples/lifi-earn-vaults.ts
```

Kamino market discovery is read-only and does not require `KAMINO_MARKET`:

```bash
node --import tsx agent-runtime/examples/kamino-markets.ts
```

EVM gasless examples use ERC-4337 smart accounts and Pimlico:

```bash
EVM_PRIVATE_KEY=0x... EVM_CHAIN=base \
node --import tsx agent-runtime/examples/evm-aa/gasless-smart-account.ts
```

Solana sponsored fee payer examples use a separate SOL-funded sponsor keypair:

```bash
SOLANA_FEE_PAYER_KEYPAIR_PATH=/workspace/.secrets/fee-payer.json \
node --import tsx agent-runtime/examples/solana-sponsored-fee-payer.ts
```

Protocol examples:

- `position-details.ts`: read decision-grade position details such as Jupiter
  Lend receipt-token shares, redeemable underlying, rates, and optional
  principal-based accrued yield. Use `JUP_LEND_TOKENS` for additional lending
  token mints beyond the default USDC receipt token.
- `orca-composed-open-step.ts`: range-aware Orca composition flow. Quote and
  simulate SOL-to-USDC rebalance first, then open with explicit Orca token maxes
  in a separate logged step.
- `drift-read-user.ts`: read Drift account and perp positions.
- `drift-place-perp-order.ts`: submit a guarded Drift market order after the
  wallet has an initialized Drift user and collateral.
- `jupiter-lend-read.ts`: read Jupiter Lend token and user state.
- `jupiter-lend-deposit.ts`: build and optionally submit Earn deposit/withdraw.
- `kamino-markets.ts`: discover official Kamino lending markets.
- `kamino-read-position.ts`: read Kamino obligation health. If `KAMINO_MARKET`
  is unset, it discovers and uses the primary market.
- `kamino-vault-deposit.ts`: build and optionally submit vault deposit/withdraw.
- `wallet-history.ts`: reconstruct recent wallet actions from signatures,
  parsed transactions, program IDs, and wallet balance deltas.
- `solana-sponsored-fee-payer.ts`: inspect and optionally submit a self-test
  where a sponsor keypair pays Solana transaction fees.
- `evm-aa/gasless-smart-account.ts`: derive and inspect an EVM smart account.
- `evm-aa/lifi-gasless-route.ts`: quote a LI.FI EVM route and optionally send
  the transaction request through a gas-sponsored smart account.

Jupiter Lend withdraws may require receipt-token amount semantics instead of the
underlying deposit amount. Simulate withdraws before submitting them live.
For exact lending PnL, pass principal from action logs with
`JUP_LEND_PRINCIPAL_RAW_BY_ASSET=mint:raw` or the USDC-specific
`JUP_LEND_USDC_PRINCIPAL_RAW`.

Examples that submit transactions directly use the mounted wallet and require
`EXECUTE_LIVE=1`.
