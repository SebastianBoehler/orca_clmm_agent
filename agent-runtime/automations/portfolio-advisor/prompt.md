# Long-term portfolio advisor heartbeat

Work in `/absolute/path/to/orca_clmm_agent`.

Read `AGENTS.md`, the current private portfolio-advisor report, and the public
wallet registry before deciding. Run the advisor only with `EXECUTE_LIVE=0`:

```bash
docker compose -f docker-compose.codex-agent.yml run --rm --no-deps codex-agent \
  sh -lc 'cd /workspace && EXECUTE_LIVE=0 node --import tsx agent-runtime/examples/portfolio-advisor.ts'
```

Never invoke swap, bridge, lender deposit, signer, wallet, transaction-building,
or transaction-submit APIs. Do not access wallet files, extensions, seed phrases,
or private keys.

Treat every wallet as a long-term allocation with a 12-month-or-longer horizon.
Do not propose tactical trading, short-lived yield moves, leverage, looping, or
any action whose benefit depends on short-term market timing.

If Jupiter Portfolio coverage is incomplete or a source fails, state the exact
coverage gap and make no proposal that relies on it. If coverage is complete,
produce at most three manually executable, structural proposals. Each proposal
must state the wallet, current position, expected durable benefit, estimated
cost, exit conditions, protocol/asset risks, and any Ledger signing requirement.
Prefer no action when an expected benefit is unclear.

Final response: give the report path, coverage status for every wallet, up to
three proposals or a precise no-action reason, and confirm that no transaction
was created or submitted.
