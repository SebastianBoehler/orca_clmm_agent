# Solana Sponsored Fee Payer

Solana does not use ERC-4337. Its gasless pattern is fee sponsorship: a
transaction can name a fee payer that is different from the account authorizing
the asset movement.

This is optional infrastructure coverage. For this bot, the simplest default is
usually to keep enough SOL in the trading wallet and pay Solana fees directly.
Sponsored fee payer support is useful for relayer-style products, wallet UX, or
setups that want to separate fee accounting from strategy PnL.

## Runtime Model

- `KEYPAIR_PATH` remains the trading wallet and signs protocol instructions.
- `SOLANA_FEE_PAYER_KEYPAIR_PATH` points to a separate SOL-funded sponsor.
- The transaction fee payer is set to the sponsor.
- Both the trading wallet and sponsor sign before simulation and submission.

This makes the trading wallet feel gasless, while the sponsor wallet still pays
the real SOL fee. If `SOLANA_FEE_PAYER_KEYPAIR_PATH` is unset, the runtime uses
the normal trading wallet fee-payer path.

## When It Helps

- The trading wallet does not need to keep SOL dust for fees.
- Failed or repeated transactions can be accounted to the sponsor.
- Cross-chain flows can keep SOL-side fees separate from strategy PnL.

## Requirements

- The sponsor wallet must hold enough SOL.
- Policy must cap base fees, priority fees, and daily sponsor spend.
- The executor should log `sponsorFeeLamports` and post-submit balance deltas.
- The sponsor should not authorize asset transfers; it should only pay fees.

## Example

```bash
SOLANA_FEE_PAYER_KEYPAIR_PATH=/workspace/.secrets/fee-payer.json \
node --import tsx agent-runtime/examples/solana-sponsored-fee-payer.ts
```

Live self-test:

```bash
EXECUTE_LIVE=1 SOLANA_SPONSORED_SELF_TEST=1 \
SOLANA_FEE_PAYER_KEYPAIR_PATH=/workspace/.secrets/fee-payer.json \
node --import tsx agent-runtime/examples/solana-sponsored-fee-payer.ts
```

For production, a service such as Kora or a custom relayer can replace the local
sponsor keypair and enforce policy before co-signing as fee payer.
