#!/bin/sh
set -eu

prompt_path="${AGENT_RUN_PROMPT_PATH:-/workspace/.agent-actions/active-run-prompt.md}"
observer_path="/workspace/.codex/hooks/observer.py"
cycle_interval="${AGENT_CYCLE_INTERVAL_SECONDS:-14400}"

if [ ! -f "$prompt_path" ]; then
  echo "Missing agent run prompt: $prompt_path" >&2
  exit 1
fi
if [ ! -f "$observer_path" ]; then
  echo "Missing Codex observer: $observer_path" >&2
  exit 1
fi

if [ -f /workspace/package/.env ]; then
  set -a
  . /workspace/package/.env
  set +a
fi

trap 'exit 0' INT TERM

while true; do
  codex exec \
    --cd /workspace \
    --dangerously-bypass-approvals-and-sandbox \
    --dangerously-bypass-hook-trust \
    --json - < "$prompt_path" \
    | /usr/bin/python3 "$observer_path" --event CodexExecJson --stream-jsonl \
    || true
  echo "Codex cycle finished at $(date -u +%Y-%m-%dT%H:%M:%SZ); sleeping ${cycle_interval}s"
  sleep "$cycle_interval"
done
