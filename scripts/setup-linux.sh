#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This setup script is for Linux. Use the existing Windows launchers on Windows." >&2
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

for command in node npm python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

node_supported="$(node -p 'const [major,minor]=process.versions.node.split(".").map(Number); Number(major>22||(major===22&&minor>=12))')"
if [[ "$node_supported" != "1" ]]; then
  echo "Node.js 22.12 or newer is required by the Electron toolchain; found $(node --version)." >&2
  exit 1
fi

echo "Installing locked Node dependencies..."
npm ci

if [[ ! -x .venv-needle/bin/python ]]; then
  echo "Creating the project-local Needle environment..."
  python3 -m venv .venv-needle
fi
.venv-needle/bin/python -m pip install --disable-pip-version-check -r requirements-needle.txt

config_home="${XDG_CONFIG_HOME:-$HOME/.config}/aegis-jarvis"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}/aegis-jarvis"
cache_home="${XDG_CACHE_HOME:-$HOME/.cache}/aegis-jarvis"
mkdir -p "$config_home" "$data_home" "$cache_home"
chmod 700 "$config_home" "$data_home" "$cache_home"

if [[ ! -f "$config_home/credentials.env" ]]; then
  install -m 600 .env.example "$config_home/credentials.env"
  echo "Created $config_home/credentials.env without credentials."
else
  echo "Keeping existing $config_home/credentials.env unchanged."
fi

echo
echo "Core setup complete. Optional desktop packages provide native controls:"
echo "  xdg-utils wmctrl xdotool playerctl wl-clipboard xclip gnome-screenshot"
echo "On Ubuntu/Zorin you can install them yourself with:"
echo "  sudo apt install xdg-utils wmctrl xdotool playerctl wl-clipboard xclip gnome-screenshot"
echo "Wayland intentionally restricts global window/input automation; browser DOM control still works."
echo "Launch development mode with: npm run dev:linux"
