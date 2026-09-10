# Portfolio advisor design

## Goal

Run a weekly, read-only advisor over three public Solana wallets. It reports the
combined and per-wallet allocation, verifies position coverage, and proposes at
most three concrete, manually executable portfolio changes when the evidence is
complete. It never accesses a wallet secret, asks a wallet to sign, or calls the
existing dev-wallet trading loop.

Wallet addresses are provided through the gitignored local wallet registry.

One address may be Ledger-controlled. It has the same monitoring and proposal
coverage as the others; proposals for it state that manual Ledger signing is
required.

## Data sources and boundaries

The primary Solana inventory source is Jupiter Portfolio API beta:
`GET https://api.jup.ag/portfolio/v1/positions/{address}`. The response's
`fetcherReports` is part of the data contract. A failed or missing relevant
fetcher makes coverage incomplete; the report names that condition and avoids
recommendations that require the missing state. It does not scrape Jupiter's
web UI or depend on undocumented endpoints.

Jupiter's read-only quoting API supplies swap-route estimates only. It is never
asked to create, sign, execute, or submit a transaction. Orca, Jupiter Lend,
Kamino, and other protocol-specific readers are used only to verify a candidate
proposal's decision-critical state, such as liquidity range, lending health,
withdrawal conditions, or fees.

LI.FI Earn and routing are reserved for optional EVM addresses configured later.
The advisor does not infer EVM addresses from Solana addresses. LI.FI quote and
Earn requests remain read-only.

## Recommendation policy

For each complete inventory, the advisor considers:

- reallocation between supported spot, staking, lending, vault, and LP products;
- claim, exit, or consolidation of materially uneconomic or abandoned positions;
- swaps or cross-product moves only when the expected net improvement remains
  positive after quote cost and an explicit exit path exists.

It ranks candidates on net yield or risk reduction, route cost, liquidity/TVL,
unlock or redemption availability, concentration, depeg, impermanent-loss,
borrow-rate, liquidation, and bridge risk. Headline APY, leverage, or looping
is not sufficient evidence. Any candidate with unclear pricing, coverage,
simulation, exit readiness, or material risk is rejected with a reason.

The report may recommend no action. It may not produce a trade or transaction.
Every proposal includes source wallet, current position, suggested manual move,
estimated benefit and cost, key risks, verification timestamp, and a source
coverage caveat where applicable.

## Automation and persistence

A new weekly `portfolio-advisor` Codex automation is isolated from the
`dev-wallet-manager` automation and uses a recommendation-only prompt. It reads
the wallet registry and writes timestamped reports under a gitignored private
advisor directory. The registry contains public addresses and labels only;
private keys, seed phrases, extension state, or wallet files are forbidden.

The first manual dry run is required before enabling the weekly schedule. The
test is successful when it queries every configured wallet, records Jupiter
coverage status, writes a report, and confirms that no execution-capable command
was called. A source error is a valid test outcome if reported precisely.

## Error handling and tests

Unit tests cover wallet-registry validation, Portfolio API response parsing,
coverage gating, and report rendering. An integration-style dry run uses the
three public addresses with `EXECUTE_LIVE=0`, produces no transaction signatures,
and validates the report shape. Network or beta-source failures are surfaced in
the report; they are never converted into fabricated balances or opportunities.
