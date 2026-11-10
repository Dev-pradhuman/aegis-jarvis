#!/usr/bin/env bash
# Aegis-JARVIS Hyprland Dynamic Island HUD Toggle Script
# Sends SIGUSR1 to jarvis_hud.py to toggle the bottom Dynamic Island,
# or launches jarvis_hud.py if it is not currently running.

set -euo pipefail

HUD_SCRIPT="/home/pradhuman/projects/aegis-jarvis/jarvis_hud.py"
ACTION="${1:-toggle}"

find_hud_pid() {
  pgrep -f "python3.*jarvis_hud.py" 2>/dev/null | head -n 1 || \
  pgrep -f "jarvis_hud.py" 2>/dev/null | head -n 1 || echo ""
}

launch_hud() {
  # Clean up any stale legacy popups
  pkill -f "chromium.*jarvis-mini" 2>/dev/null || true
  
  if [[ -x "$HUD_SCRIPT" ]]; then
    nohup "$HUD_SCRIPT" >/dev/null 2>&1 &
  else
    nohup python3 "$HUD_SCRIPT" >/dev/null 2>&1 &
  fi
}

toggle_hud() {
  local pid
  pid="$(find_hud_pid)"
  if [[ -n "$pid" ]]; then
    kill -USR1 "$pid" 2>/dev/null || true
    echo "Toggled Aegis-JARVIS Dynamic Island (PID $pid via SIGUSR1)"
  else
    launch_hud
    echo "Launched Aegis-JARVIS Dynamic Island ($HUD_SCRIPT)"
  fi
}

voice_hud() {
  local pid
  pid="$(find_hud_pid)"
  if [[ -n "$pid" ]]; then
    kill -USR2 "$pid" 2>/dev/null || true
    echo "Triggered Aegis-JARVIS Voice Recording (PID $pid via SIGUSR2)"
  else
    launch_hud
    sleep 0.3
    pid="$(find_hud_pid)"
    if [[ -n "$pid" ]]; then
      kill -USR2 "$pid" 2>/dev/null || true
    fi
  fi
}

close_hud() {
  local pid
  pid="$(find_hud_pid)"
  if [[ -n "$pid" ]]; then
    kill -USR1 "$pid" 2>/dev/null || true
    echo "Collapsed Aegis-JARVIS Dynamic Island (PID $pid)"
  fi
  pkill -f "chromium.*jarvis-mini" 2>/dev/null || true
}

case "$ACTION" in
  voice|mic|ptt)
    voice_hud
    ;;
  hide|close|collapse)
    close_hud
    ;;
  launch)
    launch_hud
    ;;
  toggle|show|*)
    toggle_hud
    ;;
esac
