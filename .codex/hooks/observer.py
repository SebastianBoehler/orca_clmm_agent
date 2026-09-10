#!/usr/bin/env python3
"""Sanitized Codex hook recorder for trading-runtime observability."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

MAX_TEXT = 4000
SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|bearer|private[_-]?key|secret|token|seed|mnemonic)(['\"\s:=]+)[^\s'\",}]+"),
    re.compile(r"\b[1-9A-HJ-NP-Za-km-z]{80,}\b"),
]
SENSITIVE_KEYS = re.compile(r"(?i)(api[_-]?key|auth|bearer|mnemonic|private|secret|seed|token)")
SIGNATURE_RE = re.compile(r"\b[1-9A-HJ-NP-Za-km-z]{64,88}\b")


def now_utc() -> str:
    return dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")


def read_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {"raw_stdin": redact_text(raw)}
    return value if isinstance(value, dict) else {"value": value}


def redact_text(value: str) -> str:
    value = value[:MAX_TEXT]
    for pattern in SECRET_PATTERNS:
        value = pattern.sub(redact_match, value)
    return value


def redact_match(match: re.Match[str]) -> str:
    if match.lastindex and match.lastindex >= 2:
        return f"{match.group(1)}{match.group(2)}[REDACTED]"
    return "[REDACTED_LONG_BASE58]"


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if SENSITIVE_KEYS.search(str(key)) else sanitize(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize(item) for item in value[:50]]
    if isinstance(value, str):
        return redact_text(value)
    return value


def event_summary(event: str, payload: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {"event": event}
    for key in ("session_id", "turn_id", "cwd", "hook_event_name", "source"):
        if payload.get(key):
            summary[key] = payload[key]
    if prompt := payload.get("prompt"):
        summary["prompt_sha256"] = hashlib.sha256(str(prompt).encode()).hexdigest()
        summary["prompt_chars"] = len(str(prompt))
    if tool_name := payload.get("tool_name"):
        summary["tool_name"] = tool_name
    if tool_input := payload.get("tool_input"):
        command = tool_input.get("command") if isinstance(tool_input, dict) else None
        if command:
            summary["command"] = redact_text(str(command))
    tool_response = payload.get("tool_response")
    if isinstance(tool_response, dict):
        output = json.dumps(tool_response, sort_keys=True, default=str)
        signatures = sorted(set(SIGNATURE_RE.findall(output)))
        if signatures:
            summary["signatures"] = signatures[:10]
        summary["tool_response_chars"] = len(output)
    return summary


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True) + "\n")


def append_markdown(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    summary = row["summary"]
    parts = [f"- `{row['timestamp']}` `{row['event']}`"]
    if summary.get("tool_name"):
        parts.append(f"tool `{summary['tool_name']}`")
    if summary.get("prompt_chars") is not None:
        parts.append(f"prompt chars `{summary['prompt_chars']}`")
    if summary.get("signatures"):
        parts.append("signatures `" + "`, `".join(summary["signatures"]) + "`")
    with path.open("a", encoding="utf-8") as handle:
        handle.write(" ".join(parts) + "\n")


def codex_json_summary(payload: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {"event": "CodexExecJson"}
    if event_type := payload.get("type"):
        summary["codex_event_type"] = event_type
    item = payload.get("item")
    if isinstance(item, dict):
        summary["item_type"] = item.get("type")
        if text := item.get("text"):
            summary["text_sha256"] = hashlib.sha256(str(text).encode()).hexdigest()
            summary["text_chars"] = len(str(text))
    if usage := payload.get("usage"):
        summary["usage"] = usage
    return summary


def stream_codex_jsonl(root: Path) -> int:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            raw_payload = json.loads(line)
        except json.JSONDecodeError:
            raw_payload = {"raw_line": line}
        payload = sanitize(raw_payload)
        timestamp = now_utc()
        row = {
            "timestamp": timestamp,
            "event": "CodexExecJson",
            "summary": codex_json_summary(raw_payload),
            "payload": payload,
        }
        append_jsonl(root / "codex-exec-events.jsonl", row)
        append_markdown(root / f"{timestamp[:10]}.md", row)
        print(json.dumps(payload, sort_keys=True), flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", required=True)
    parser.add_argument("--stream-jsonl", action="store_true")
    args = parser.parse_args()

    root = Path(os.environ.get("CODEX_OBSERVABILITY_DIR", ".agent-observability"))
    if args.stream_jsonl:
        return stream_codex_jsonl(root)

    raw_payload = read_input()
    payload = sanitize(raw_payload)
    timestamp = now_utc()
    row = {
        "timestamp": timestamp,
        "event": args.event,
        "summary": event_summary(args.event, raw_payload),
        "payload": payload,
    }
    append_jsonl(root / "events.jsonl", row)
    append_markdown(root / f"{timestamp[:10]}.md", row)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
