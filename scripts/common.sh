# Shared checks for start.sh and dev.sh. Sets PNPM (an array) and creates .env on first run.

has() { command -v "$1" >/dev/null 2>&1; }

if ! has uv; then
  echo "uv is missing. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi
if ! has node; then
  echo "Node.js is missing. Install Node 22 or newer from https://nodejs.org" >&2
  exit 1
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ]; then
  echo "Node.js $(node -v) is too old. Install Node 22 or newer from https://nodejs.org" >&2
  exit 1
fi
if has pnpm; then
  PNPM=(pnpm)
else
  PNPM=(npx --yes pnpm@12)
fi

chrome=""
if [ "$(uname -s)" = Darwin ]; then
  if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then chrome=1; fi
elif has google-chrome || has google-chrome-stable || has chrome; then
  chrome=1
fi
if [ -z "$chrome" ]; then
  echo "Note: Google Chrome was not found. Taobao and 1688 searches need it." >&2
  echo "      Install Chrome, or run: (cd server && uv run patchright install chromium)" >&2
fi

if [ ! -f "$root/.env" ]; then
  cp "$root/.env.example" "$root/.env"
  chmod 600 "$root/.env"
  echo "Created .env. Open the app and go to Settings -> AI provider to connect an AI."
fi
