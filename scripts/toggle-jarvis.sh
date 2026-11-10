#!/usr/bin/env bash
# Aegis-JARVIS Hyprland Client Toggle Script
# Checks if an Aegis-JARVIS browser window is active; focuses it if found, else launches http://127.0.0.1:8787

set -euo pipefail

JARVIS_URL="http://127.0.0.1:8787"

# Fallback if hyprctl or jq are not installed
if ! command -v hyprctl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  xdg-open "$JARVIS_URL" >/dev/null 2>&1 &
  exit 0
fi

CLIENTS="$(hyprctl clients -j 2>/dev/null || echo "[]")"

# Locate active JARVIS browser client window, excluding the dynamic island popup
JARVIS_ADDR="$(echo "$CLIENTS" | jq -r '
  .[] | select(
    (
      ((.title // "") | test("(^|[[:space:]])JARVIS[[:space:]]*(//|$)|127\\.0\\.0\\.1:8787|localhost:8787"; "i")) or
      ((.initialTitle // "") | test("(^|[[:space:]])JARVIS[[:space:]]*(//|$)|127\\.0\\.0\\.1:8787"; "i"))
    ) and
    (((.title // "") | test("JARVIS-ISLAND"; "i")) | not) and
    (((.class // "") | test("jarvis-island"; "i")) | not)
  ) | .address
' 2>/dev/null | head -n 1 || echo "")"

if [[ -n "$JARVIS_ADDR" && "$JARVIS_ADDR" != "null" ]]; then
  # Find workspace name/id for the window
  WS="$(echo "$CLIENTS" | jq -r ".[] | select(.address == \"${JARVIS_ADDR}\") | .workspace.name // .workspace.id" 2>/dev/null | head -n 1 || echo "")"
  if [[ -n "$WS" && "$WS" != "null" ]]; then
    hyprctl dispatch "hl.dsp.focus({ workspace = \"${WS}\" })" >/dev/null 2>&1 || \
    hyprctl dispatch "hl.dsp.focus({ workspace = ${WS} })" >/dev/null 2>&1 || \
    hyprctl dispatch workspace "$WS" >/dev/null 2>&1 || true
  fi

  hyprctl dispatch "hl.dsp.focus({ window = \"address:${JARVIS_ADDR}\" })" >/dev/null 2>&1 || \
  hyprctl dispatch focuswindow "address:${JARVIS_ADDR}" >/dev/null 2>&1 || \
  hyprctl dispatch focuswindow "${JARVIS_ADDR}" >/dev/null 2>&1 || true

  echo "Focused JARVIS window ${JARVIS_ADDR} on workspace ${WS:-unknown}"
else
  xdg-open "$JARVIS_URL" >/dev/null 2>&1 &
  echo "Launched Aegis-JARVIS at ${JARVIS_URL}"
fi
