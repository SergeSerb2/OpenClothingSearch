#!/usr/bin/env bash
# Run the backend (port 8790) and the Vite dev server (port 5173) together.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
. "$root/scripts/common.sh"

(cd "$root/server" && uv run finder) &
backend=$!
trap 'kill $backend 2>/dev/null' EXIT

cd "$root/web"
[ -d node_modules ] || "${PNPM[@]}" install
"${PNPM[@]}" dev
