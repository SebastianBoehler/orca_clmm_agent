# Codex Observability Hooks

This repository includes optional Codex hooks that record sanitized lifecycle
events to `.agent-observability/`. The directory is gitignored because hook
events can contain prompts, commands, paths, and protocol output.

## What They Capture

- session start and turn stop events
- user-prompt metadata, including prompt length and hash
- tool names, shell commands, and tool-result sizes
- Solana-like transaction signatures found in tool output
- sanitized hook payloads for later debugging

The hooks do not expose private model reasoning. Codex only provides
model-visible prompts, tool calls, tool results, and final responses. For
trading decisions, the agent must still write explicit rationale records to the
dated action log before submitting live transactions.

## Files

- `.codex/hooks.json` wires Codex lifecycle events to the recorder.
- `.codex/hooks/observer.py` redacts sensitive fields and appends JSONL plus a
  compact Markdown timeline.
- `.agent-observability/events.jsonl` stores machine-readable events.
- `.agent-observability/YYYY-MM-DD.md` stores a skim-friendly event timeline.

## Activation

Project-local hooks load only when Codex trusts the repository's `.codex/`
layer. In the CLI, use `/hooks` to review and trust changed hook definitions.
For vetted non-interactive runs, `codex exec` can be launched with
`--dangerously-bypass-hook-trust`.

Set `CODEX_OBSERVABILITY_DIR` to write logs somewhere else:

```bash
CODEX_OBSERVABILITY_DIR=/workspace/.agent-observability codex exec ...
```

## Trading Runtime Use

Use hooks as an observer and guardrail around Codex, not as the market monitor.
The blockchain remains the source of truth for balances, positions, and
submitted transactions. The action log remains the source of truth for why a
live action was selected.
