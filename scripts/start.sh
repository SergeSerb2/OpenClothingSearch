#!/usr/bin/env bash
# Build the web app, then serve everything from the backend on http://127.0.0.1:8790
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
. "$root/scripts/common.sh"

cd "$root/web"
[ -d node_modules ] || "${PNPM[@]}" install
"${PNPM[@]}" run bundle

cd "$root/server"
uv sync -q
exec uv run finder
