#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "dev-linux.sh requires Linux." >&2
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ ! -d node_modules ]]; then
  echo "Dependencies are missing. Run ./scripts/setup-linux.sh first." >&2
  exit 1
fi

backend_pid=""
frontend_pid=""
cleanup() {
  [[ -n "$frontend_pid" ]] && kill "$frontend_pid" 2>/dev/null || true
  [[ -n "$backend_pid" ]] && kill "$backend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

JARVIS_SCHEDULER="${JARVIS_SCHEDULER:-1}" npm run dev:server &
backend_pid=$!
npm run dev -- --host 127.0.0.1 &
frontend_pid=$!

for _ in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then break; fi
  sleep 0.25
done

JARVIS_RENDERER_URL=http://127.0.0.1:5173 npm run desktop
