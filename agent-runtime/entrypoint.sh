#!/bin/sh
set -eu

if [ -d /workspace ] && [ ! -e /workspace/node_modules ]; then
  ln -s /opt/trading-tools/node_modules /workspace/node_modules 2>/dev/null || true
fi

if [ -n "${AGENT_ACTION_LOG_DIR:-}" ]; then
  mkdir -p "$AGENT_ACTION_LOG_DIR"
fi

exec "$@"
