# Automation Examples

These files mirror the local Codex app automation layout:

```text
~/.codex/automations/<automation-id>/automation.toml
```

They are examples only. Do not copy one into `~/.codex/automations` as active
until the private strategy file at `.agent-actions/strategy.md` has concrete
risk limits and the prompt has passed manual dry runs.

For the dev-wallet trading loop, start with
[`dev-wallet-manager/automation.toml.example`](./dev-wallet-manager/automation.toml.example).

For read-only long-term portfolio recommendations, use
[`portfolio-advisor`](./portfolio-advisor). Its active weekly heartbeat must be
created through Codex automation tooling; it is intentionally isolated from the
dev-wallet execution loop.
