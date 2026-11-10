#!/usr/bin/env bash
# Aegis-JARVIS Hyprland Mini Popup Launcher Toggle Script
# Toggles a floating frameless Mini Launcher popup (?mode=mini) over the active desktop

set -euo pipefail

MINI_URL="http://127.0.0.1:8787/?mode=mini"

# Find existing jarvis-mini window PID
find_mini_pid() {
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    hyprctl clients -j 2>/dev/null | jq -r '
      .[] | select(
        ((.class // "") == "jarvis-mini") or
        ((.initialClass // "") == "jarvis-mini") or
        (((.title // "") | test("JARVIS-MINI"; "i"))) or
        (((.initialTitle // "") | test("JARVIS-MINI"; "i"))) or
        (((.title // "") | test("127\\.0\\.0\\.1:8787/\\?mode=mini"; "i")))
      ) | .pid
    ' 2>/dev/null | head -n 1 || echo ""
  fi
}

# Find existing jarvis-mini window address
find_mini_address() {
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    hyprctl clients -j 2>/dev/null | jq -r '
      .[] | select(
        ((.class // "") == "jarvis-mini") or
        ((.initialClass // "") == "jarvis-mini") or
        (((.title // "") | test("JARVIS-MINI"; "i"))) or
        (((.initialTitle // "") | test("JARVIS-MINI"; "i"))) or
        (((.title // "") | test("127\\.0\\.0\\.1:8787/\\?mode=mini"; "i")))
      ) | .address
    ' 2>/dev/null | head -n 1 || echo ""
  fi
}

# Find existing jarvis-mini workspace
find_mini_workspace() {
  if command -v hyprctl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    hyprctl clients -j 2>/dev/null | jq -r '
      .[] | select(
        ((.class // "") == "jarvis-mini") or
        ((.initialClass // "") == "jarvis-mini") or
        (((.title // "") | test("JARVIS-MINI"; "i"))) or
        (((.initialTitle // "") | test("JARVIS-MINI"; "i"))) or
        (((.title // "") | test("127\\.0\\.0\\.1:8787/\\?mode=mini"; "i")))
      ) | .workspace.name // .workspace.id
    ' 2>/dev/null | head -n 1 || echo ""
  fi
}

cleanup_stale_locks() {
  local cache_dir="/home/pradhuman/.cache/jarvis-mini"
  if [[ -f "$cache_dir/SingletonLock" || -L "$cache_dir/SingletonLock" ]]; then
    local lock_target
    lock_target=$(readlink "$cache_dir/SingletonLock" 2>/dev/null || echo "")
    local lock_pid="${lock_target##*-}"
    if [[ -z "$lock_pid" ]] || ! kill -0 "$lock_pid" 2>/dev/null; then
      rm -f "$cache_dir/Singleton"*
    fi
  fi
}

launch_mini() {
  cleanup_stale_locks
  local chrome_bin="chromium"
  if command -v chromium >/dev/null 2>&1; then
    chrome_bin="chromium"
  elif [[ -x "/usr/lib/chromium/chromium" ]]; then
    chrome_bin="/usr/lib/chromium/chromium"
  elif command -v google-chrome >/dev/null 2>&1; then
    chrome_bin="google-chrome"
  elif command -v brave >/dev/null 2>&1; then
    chrome_bin="brave"
  fi

  setsid "$chrome_bin" \
    --user-data-dir="/home/pradhuman/.cache/jarvis-mini" \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=Vulkan \
    --app="$MINI_URL" \
    --class="jarvis-mini" \
    --ozone-platform=x11 \
    >/dev/null 2>&1 &
}

close_mini() {
  local pid
  pid="$(find_mini_pid)"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
  fi
  if command -v hyprctl >/dev/null 2>&1; then
    hyprctl dispatch "hl.dsp.window.close({ match = { class = \"jarvis-mini\" } })" >/dev/null 2>&1 || \
    hyprctl dispatch closewindow "class:jarvis-mini" >/dev/null 2>&1 || true
  fi
  rm -f "/home/pradhuman/.cache/jarvis-mini/Singleton"*
}

toggle_mini() {
  local pid addr ws active_ws active_win_addr
  pid="$(find_mini_pid)"
  addr="$(find_mini_address)"

  if [[ -n "$pid" && -n "$addr" ]] && command -v hyprctl >/dev/null 2>&1; then
    ws="$(find_mini_workspace)"
    active_ws="$(hyprctl activeworkspace -j 2>/dev/null | jq -r '.name // .id // "1"' 2>/dev/null || echo "1")"
    active_win_addr="$(hyprctl activewindow -j 2>/dev/null | jq -r '.address // ""' 2>/dev/null || echo "")"

    # If already open and focused on the active workspace -> hide/close it
    if [[ "$active_win_addr" == "$addr" ]] || [[ "$ws" == "$active_ws" && -n "$active_win_addr" && "$active_win_addr" == "$addr" ]]; then
      close_mini
      echo "Closed Aegis-JARVIS Mini Launcher (PID $pid)"
    else
      # Move to current workspace and focus
      hyprctl dispatch "hl.dsp.focus({ workspace = \"${active_ws}\" })" >/dev/null 2>&1 || \
      hyprctl dispatch "hl.dsp.focus({ workspace = ${active_ws} })" >/dev/null 2>&1 || \
      hyprctl dispatch workspace "${active_ws}" >/dev/null 2>&1 || true

      hyprctl dispatch movetoworkspacesilent "${active_ws},address:${addr}" >/dev/null 2>&1 || true
      hyprctl dispatch "hl.dsp.focus({ window = \"address:${addr}\" })" >/dev/null 2>&1 || \
      hyprctl dispatch focuswindow "address:${addr}" >/dev/null 2>&1 || true
      echo "Focused Aegis-JARVIS Mini Launcher on workspace ${active_ws}"
    fi
  else
    launch_mini
    echo "Launched Aegis-JARVIS Mini Launcher ($MINI_URL)"
  fi
}

ACTION="${1:-toggle}"
case "$ACTION" in
  show)
    toggle_mini
    ;;
  hide|close)
    close_mini
    ;;
  launch)
    launch_mini
    ;;
  toggle|*)
    toggle_mini
    ;;
esac
