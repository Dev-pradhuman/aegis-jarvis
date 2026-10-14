#!/usr/bin/env bash
# JARVIS Push-to-Talk (PTT) Trigger Script for Arch Linux / Hyprland
#
# Hyprland Config Integration:
# Add this exact 1-line keybind to ~/.config/hypr/hyprland.conf:
# bind = $mainMod, J, exec, /home/pradhuman/projects/aegis-jarvis/scripts/jarvis-ptt.sh toggle
# (or press Super+J to start talking, and Super+J again to finish and think)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/jarvis-ptt.sh"
JARVIS_URL="${JARVIS_URL:-http://127.0.0.1:8787}"
ACTION="${1:-toggle}"

notify() {
  local title="$1"
  local msg="$2"
  local timeout="${3:-2000}"
  local urgency="${4:-normal}"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -t "$timeout" -u "$urgency" -a "JARVIS" "$title" "$msg"
  fi
}

show_config() {
  echo ""
  echo "================================================================="
  echo "  JARVIS Hyprland Push-to-Talk (PTT) Keybind Setup"
  echo "================================================================="
  echo ""
  echo "Add the following line to your ~/.config/hypr/hyprland.conf:"
  echo ""
  echo "  bind = \$mainMod, J, exec, ${SCRIPT_PATH} toggle"
  echo ""
  echo "Tip: Replace \$mainMod, J with your preferred shortcut (e.g., \$mainMod, V or Ctrl, Space)."
  echo "================================================================="
  echo ""
}

if [[ "$ACTION" == "--help" || "$ACTION" == "-h" || "$ACTION" == "help" ]]; then
  echo "Usage: $0 [toggle|start|stop|status|config]"
  show_config
  exit 0
fi

if [[ "$ACTION" == "config" ]]; then
  show_config
  exit 0
fi

# Check if JARVIS service is reachable
if ! curl -s --max-time 2 "${JARVIS_URL}/api/voice/status" >/dev/null 2>&1; then
  notify "⚠️ JARVIS Offline" "Cannot reach ${JARVIS_URL}. Please start JARVIS first." 3000 "critical"
  echo "Error: JARVIS is not reachable at ${JARVIS_URL}."
  show_config
  exit 1
fi

case "$ACTION" in
  start)
    RES=$(curl -s -X POST "${JARVIS_URL}/api/voice/ptt" \
      -H "Content-Type: application/json" \
      -d '{"action":"start"}')
    notify "🎙️ JARVIS Listening..." "Push-to-Talk active. Speak now." 2500
    echo "$RES"
    ;;
  stop)
    RES=$(curl -s -X POST "${JARVIS_URL}/api/voice/ptt" \
      -H "Content-Type: application/json" \
      -d '{"action":"stop"}')
    notify "🧠 JARVIS Processing..." "Transcribing audio and thinking..." 2500
    echo "$RES"
    ;;
  status)
    RES=$(curl -s "${JARVIS_URL}/api/voice/status")
    echo "$RES"
    ;;
  toggle|*)
    RES=$(curl -s -X POST "${JARVIS_URL}/api/voice/ptt" \
      -H "Content-Type: application/json" \
      -d '{"action":"toggle"}')
    STATE=$(echo "$RES" | grep -o '"state":"[^"]*' | cut -d'"' -f4 || echo "")
    if [[ "$STATE" == "capturing" ]]; then
      notify "🎙️ JARVIS Listening..." "Push-to-Talk active. Speak your command." 2500
    elif [[ "$STATE" == "transcribing" || "$STATE" == "thinking" ]]; then
      notify "🧠 JARVIS Processing..." "Transcribing audio and thinking..." 2500
    else
      notify "🤖 JARVIS Voice" "State: ${STATE:-idle}" 1500
    fi
    echo "$RES"
    ;;
esac
