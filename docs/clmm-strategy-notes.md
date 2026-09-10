# CLMM Strategy Notes

These notes are prompt context for a Codex trading agent. They are not a
complete strategy.

## Position State

Track these values before deciding on a trade:

- current pool price
- lower and upper range price
- distance to lower and upper barriers
- in-range versus out-of-range state
- token composition of the position
- uncollected fees and rewards
- wallet balances outside the position
- expected transaction fee and rent returned or required

## Range Logic

A Whirlpool position earns swap fees only while the current price is inside its
tick range. When price leaves the range, liquidity becomes one-sided:

- below the lower tick: the position is effectively held in token A
- above the upper tick: the position is effectively held in token B

Token labels depend on the pool ordering. Always inspect token mints before
making a directional statement.

## Rebalance Triggers

A monitor can wake the agent when one of these thresholds is crossed:

- price is within a configured percentage of either range edge
- price is already out of range
- unclaimed fees exceed a harvest threshold
- drift or divergence loss exceeds expected fee yield
- wallet balance is too low for rent and transaction fees
- an external risk condition asks for de-risking

The first action should usually be analysis, not a trade. Compare fee yield,
expected slippage, transaction costs, and whether a new range has better
expected utilization.

## Accounting

For a close, report:

- pre/post SOL and token balances
- position quote amounts
- fees and rewards owed
- network fee
- rent returned from closed accounts when inferable
- whether the position was in range at close

Pure LP profit/loss needs the opening token amounts, entry price, fee harvest
history, and current token prices. A close transaction alone is not enough.
