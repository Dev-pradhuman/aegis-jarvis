#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then echo "Linux only." >&2; exit 1; fi
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$unit_dir"
sed "s|@PROJECT_ROOT@|$project_root|g" "$project_root/packaging/systemd/aegis-jarvis.service.in" > "$unit_dir/aegis-jarvis.service"
systemctl --user daemon-reload
echo "Installed the user-service definition. Enable it explicitly with:"
echo "  systemctl --user enable --now aegis-jarvis.service"
