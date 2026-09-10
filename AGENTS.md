# Agent Instructions

This repository is the Orca CLMM agent package plus an optional Codex trading
runtime. Treat unrelated local changes as work from another thread unless they
block the current task.

## Repository Rules

- Keep files below 300 LOC. Split helpers, interfaces, examples, and docs when a
  file starts growing.
- Do not add mock data or fallback behavior unless the task explicitly asks for
  it. Fail with a clear error instead.
- Keep wallet files, `.env` files, scratch scripts, logs, and local memories out
  of git. Use `.learnings/` or `.journal/` for private project notes.
- If asked to commit, commit all tracked and untracked work in logical groups
  using conventional prefixes such as `docs:`, `fix:`, `feat:`, and `test:`.
- Do not revert changes you did not make unless the user explicitly asks.

## Live Trading Guardrails

- Never print private keys, seed material, bearer tokens, API keys, or raw env
  dumps.
- Never bake or copy private keys into the Docker image. Mount or bind them at
  runtime and read them only from the mounted path.
- Use `/tmp` for one-off live scripts inside the container.
- Simulate before live submission. Print the signature, quote, fees, position
  mint, and pre/post balance deltas after submission.
- Before submitting a live transaction, append a concise decision record to a
  dated markdown file under `${AGENT_ACTION_LOG_DIR:-/workspace/.agent-actions}`
  inside the container. After the transaction finalizes or fails, append the
  signature/status and observed balance or position deltas. Include enough
  rationale for the next agent to understand why the action was selected, but do
  not include secrets, raw private key material, or full env dumps.
- Prefer one bounded live attempt unless the prompt explicitly allows retries or
  a wider action envelope.
- Use max token amounts from Orca quotes for spend caps. Estimated amounts are
  not spend caps.
- Avoid broad Orca token crawls and large parallel RPC bursts during live runs.
  Serial reads with backoff are more reliable against public RPC rate limits.
- Treat Solana RPC `421` and `429` responses as pacing/failover signals, not
  strategy failures. Slow down, retry the same narrow read with longer backoff,
  and if an alternate RPC endpoint is configured, rerun the same read with that
  endpoint before abandoning a candidate. Do not submit duplicate transactions
  because a read or confirmation was delayed.
- Do not run `package/examples/openPosition.ts` or `package/examples/loadPositions.ts`
  directly against a live wallet. They can consume or swap more balance than a
  bounded verification should.

## Container Runtime Notes

- The Codex image mounts this repo at `/workspace`.
- Auth persists in the `codex-auth` Docker volume after `codex login`.
- Action logs persist at `/workspace/.agent-actions` through the
  `./.agent-actions:/workspace/.agent-actions` bind mount.
- Private runtime strategy, when configured, lives at
  `${AGENT_STRATEGY_PATH:-/workspace/.agent-actions/strategy.md}`.
- The Docker Compose commands in this section are host-side commands. If you
  are already running inside `/workspace` in the `codex-agent` container, do not
  call `docker`, do not start a recursive container, and do not launch another
  `codex exec` loop. Use the installed shell tools and runtime SDKs directly.
- For live managed positions, run the outer Docker wrapper continuously until
  the user manually stops the container or a safety blocker requires
  intervention. Do not hard-code 24h or other fixed stop times for active
  trading containers.
- Use this host-side form to start privileged agent execution inside the
  isolated container:

```bash
docker compose -f docker-compose.codex-agent.yml run --rm --no-deps codex-agent \
  codex exec --cd /workspace --dangerously-bypass-approvals-and-sandbox -
```

- If a TypeScript scratch script under `/tmp` cannot resolve workspace modules,
  run it with:

```bash
NODE_PATH=/workspace/package/node_modules TS_NODE_TRANSPILE_ONLY=true \
  npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' /tmp/script.ts
```

## Strategy Context

- This project is Orca Whirlpool-specific at the package level.
- Cross-platform clients such as LI.FI, Drift, Jupiter, or exchanges belong in
  the runtime or adapter layer, not inside the core Orca package unless they
  support a package feature.
- A scheduled monitor or Codex automation should wake the agent for position
  checks. Codex hooks are guardrails around the agent loop, not market monitors.
