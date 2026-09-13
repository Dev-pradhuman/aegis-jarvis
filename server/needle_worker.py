"""Persistent JSON-lines bridge for the official cactus-needle runtime.

The worker performs inference only. It never executes JARVIS tools.
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import sys
import traceback

os.environ.setdefault("NEEDLE_TELEMETRY", "0")

try:
    import needle
except Exception as exc:  # reported to the Node supervisor
    needle = None
    IMPORT_ERROR = str(exc)
else:
    IMPORT_ERROR = None

AGENTS: dict[str, object] = {}
MAX_CACHED_AGENTS = 12
CACHE_DIR = os.environ.get("JARVIS_NEEDLE_CACHE_DIR") or os.path.join(os.path.dirname(__file__), "data", "needle")


def write(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def tool_key(tools: list[dict]) -> str:
    encoded = json.dumps(tools, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def agent_for(tools: list[dict]):
    if needle is None:
        raise RuntimeError(f"cactus-needle is unavailable: {IMPORT_ERROR}")
    key = tool_key(tools)
    agent = AGENTS.get(key)
    if agent is not None:
        return agent, key
    if len(AGENTS) >= MAX_CACHED_AGENTS:
        AGENTS.pop(next(iter(AGENTS)))
    os.makedirs(CACHE_DIR, exist_ok=True)
    index_path = os.path.join(CACHE_DIR, f"tools-{key}.idx")
    with contextlib.redirect_stdout(sys.stderr):
        agent = needle.Needle(tools=tools, tool_index_path=index_path)
    AGENTS[key] = agent
    return agent, key


def handle(message: dict) -> dict:
    request_id = message.get("id")
    operation = message.get("operation")
    if operation == "health":
        return {"id": request_id, "ok": needle is not None, "version": "2", "loadedAgents": len(AGENTS), "error": IMPORT_ERROR}
    if operation not in {"initialize", "classify"}:
        raise ValueError(f"Unsupported operation: {operation}")
    tools = message.get("tools") or []
    if not isinstance(tools, list) or not tools:
        raise ValueError("Needle requires at least one tool schema")
    agent, key = agent_for(tools)
    if operation == "initialize":
        return {"id": request_id, "ok": True, "loaded": True, "toolset": key, "toolCount": len(tools)}
    with contextlib.redirect_stdout(sys.stderr):
        agent.reset()
        result = agent.complete(str(message.get("request") or ""), max_new_tokens=int(message.get("maxNewTokens") or 256))
    return {"id": request_id, "ok": True, "result": result, "toolset": key}


for line in sys.stdin:
    try:
        value = json.loads(line)
        write(handle(value))
    except Exception as exc:
        write({"id": value.get("id") if isinstance(locals().get("value"), dict) else None, "ok": False, "error": str(exc), "errorType": type(exc).__name__, "trace": traceback.format_exc(limit=2)})
