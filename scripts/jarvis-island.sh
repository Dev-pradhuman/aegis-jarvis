#!/usr/bin/env bash
# JARVIS Dynamic Island Toggle & Management Script for Arch Linux / Hyprland
#
# Keybind Integration (Hyprland 0.56.2 + Caelestia):
# Super + Alt + J
#
# Usage:
#   scripts/jarvis-island.sh toggle
#   scripts/jarvis-island.sh show
#   scripts/jarvis-island.sh hide
#   scripts/jarvis-island.sh status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-toggle}"

find_island_pid() {
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    local pid
    pid=$(hyprctl clients -j 2>/dev/null | jq -r '.[] | select((.title | test("JARVIS-ISLAND"; "i")) or (.class | test("jarvis-island"; "i")) or (.class == "chrome-127.0.0.1__-Default")) | .pid' 2>/dev/null | head -n 1 || echo "")
    if [[ -n "$pid" && "$pid" != "null" && "$pid" != "0" ]]; then
      echo "$pid"
      return 0
    fi
  fi
  echo ""
}

find_island_address() {
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    local addr
    addr=$(hyprctl clients -j 2>/dev/null | jq -r '.[] | select((.title | test("JARVIS-ISLAND"; "i")) or (.class | test("jarvis-island"; "i")) or (.class == "chrome-127.0.0.1__-Default")) | .address' 2>/dev/null | head -n 1 || echo "")
    if [[ -n "$addr" && "$addr" != "null" ]]; then
      echo "$addr"
      return 0
    fi
  fi
  echo ""
}

find_island_workspace() {
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    local ws
    ws=$(hyprctl clients -j 2>/dev/null | jq -r '.[] | select((.title | test("JARVIS-ISLAND"; "i")) or (.class | test("jarvis-island"; "i")) or (.class == "chrome-127.0.0.1__-Default")) | .workspace.name' 2>/dev/null | head -n 1 || echo "")
    if [[ -n "$ws" && "$ws" != "null" ]]; then
      echo "$ws"
      return 0
    fi
  fi
  echo ""
}

cleanup_stale_locks() {
  local cache_dir="/home/pradhuman/.cache/jarvis-island"
  if [[ -f "$cache_dir/SingletonLock" || -L "$cache_dir/SingletonLock" ]]; then
    local lock_target
    lock_target=$(readlink "$cache_dir/SingletonLock" 2>/dev/null || echo "")
    local lock_pid="${lock_target##*-}"
    if [[ -z "$lock_pid" ]] || ! kill -0 "$lock_pid" 2>/dev/null; then
      rm -f "$cache_dir/Singleton"*
    fi
  fi
}

get_island_url() {
  if curl -s --max-time 1 "http://127.0.0.1:5173/?mode=island" >/dev/null 2>&1; then
    echo "http://127.0.0.1:5173/?mode=island"
  else
    echo "http://127.0.0.1:8787/?mode=island"
  fi
}

launch_island() {
  cleanup_stale_locks
  local url
  url="$(get_island_url)"
  local chrome_bin="chromium"
  if [[ -x "/usr/lib/chromium/chromium" ]]; then
    chrome_bin="/usr/lib/chromium/chromium"
  fi
  nohup "$chrome_bin" \
    --user-data-dir="/home/pradhuman/.cache/jarvis-island" \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=Vulkan \
    --app="$url" \
    --class="jarvis-island" \
    --ozone-platform-hint=auto \
    --ozone-platform=wayland \
    --enable-features=UseOzonePlatform \
    >/dev/null 2>&1 &
}

close_island() {
  local pid
  pid="$(find_island_pid)"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    echo "Closed island process $pid"
  else
    echo "Island was not running"
  fi
  if command -v hyprctl >/dev/null 2>&1; then
    hyprctl dispatch 'hl.dsp.window.close({ match = { class = "chrome-127.0.0.1__-Default" } })' >/dev/null 2>&1 || true
    hyprctl dispatch 'hl.dsp.window.close({ match = { title = ".*JARVIS-ISLAND.*" } })' >/dev/null 2>&1 || true
  fi
  rm -f "/home/pradhuman/.cache/jarvis-island/Singleton"*
}

case "$ACTION" in
  show)
    PID="$(find_island_pid)"
    ADDR="$(find_island_address)"
    if [[ -n "$PID" && -n "$ADDR" ]] && command -v hyprctl >/dev/null 2>&1; then
      ACTIVE_WS=$(hyprctl activeworkspace -j 2>/dev/null | jq -r '.name // .id // "1"' 2>/dev/null || echo "1")
      hyprctl dispatch movetoworkspacesilent "${ACTIVE_WS},address:${ADDR}" >/dev/null 2>&1 || true
      hyprctl dispatch focuswindow "address:${ADDR}" >/dev/null 2>&1 || true
      echo "Brought JARVIS Dynamic Island to workspace ${ACTIVE_WS} (PID $PID)"
    elif [[ -z "$PID" ]]; then
      launch_island
      echo "Launched JARVIS Dynamic Island"
    else
      echo "JARVIS Dynamic Island already open (PID $PID)"
    fi
    ;;

  hide)
    PID="$(find_island_pid)"
    ADDR="$(find_island_address)"
    if [[ -n "$PID" && -n "$ADDR" ]] && command -v hyprctl >/dev/null 2>&1; then
      hyprctl dispatch movetoworkspacesilent "special:jarvis_island,address:${ADDR}" >/dev/null 2>&1 || true
      echo "Moved JARVIS Dynamic Island to special scratchpad (PID $PID)"
    else
      close_island
    fi
    ;;

  close|kill)
    close_island
    ;;

  status)
    PID="$(find_island_pid)"
    ADDR="$(find_island_address)"
    WS="$(find_island_workspace)"
    if [[ -n "$PID" ]]; then
      echo "JARVIS Dynamic Island is ACTIVE (PID $PID, ADDR ${ADDR:-unknown}, WORKSPACE ${WS:-unknown})"
    else
      echo "JARVIS Dynamic Island is INACTIVE"
    fi
    ;;

  toggle|*)
    PID="$(find_island_pid)"
    ADDR="$(find_island_address)"
    if [[ -n "$PID" && -n "$ADDR" ]] && command -v hyprctl >/dev/null 2>&1; then
      WS="$(find_island_workspace)"
      if [[ "$WS" == *"special:jarvis_island"* ]]; then
        ACTIVE_WS=$(hyprctl activeworkspace -j 2>/dev/null | jq -r '.name // .id // "1"' 2>/dev/null || echo "1")
        hyprctl dispatch movetoworkspacesilent "${ACTIVE_WS},address:${ADDR}" >/dev/null 2>&1 || true
        hyprctl dispatch focuswindow "address:${ADDR}" >/dev/null 2>&1 || true
        echo "Showed JARVIS Dynamic Island on workspace ${ACTIVE_WS}"
      else
        hyprctl dispatch movetoworkspacesilent "special:jarvis_island,address:${ADDR}" >/dev/null 2>&1 || true
        echo "Parked JARVIS Dynamic Island in special scratchpad"
      fi
    elif [[ -n "$PID" ]]; then
      close_island
    else
      launch_island
      echo "Launched JARVIS Dynamic Island"
    fi
    ;;
esac
