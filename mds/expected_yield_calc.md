Orca discord mod:
To compute expected yield, you need some off-chain metrics, which you can get from our API:
24h volume in USD
token prices in USD for tokens A and B and any tokens that were emitted as rewards.

the estimated yield of an opened position = (24h pool fee value + 24h pool rewards value) \* liquidity share / position deposit value

q: what is liquidity share? TVL?
a: calintje | Orca DA — 16.03.25, 02:52
position.liquidity / pool.liquidity

in words: how much the liquidity of the position contributes to the total liquidity

q: one last question: what does liquidity delta in the quote reponse mean?
a: calintje | Orca DA — 16.03.25, 02:52
That's the amount of liquidity of the position. It's termed delta, because it could be related to both increasing and decreasing liquidity to/from the pool.

So your liquidity share is positionLiquidity / poolLiquidity. poolLiquidity is the value of the liquidity property of the pool.

In the context of the closePositionInstruction quote, tokenEstA refers to the estimated amount of token A that you might receive when closing a position. On the other hand, tokenMinA represents the minimum amount of token A that you are willing to accept. This ensures that the transaction will only proceed if you receive at least tokenMinA, protecting you from unfavorable price movements.
