# Windows: build the web app, then serve everything on http://127.0.0.1:8790
# Run from PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host 'uv is missing. Install it with: powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"'
  exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is missing. Install Node 22 or newer from https://nodejs.org"
  exit 1
}

function Invoke-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm @args } else { & npx --yes pnpm@12 @args }
  if ($LASTEXITCODE -ne 0) { throw "pnpm $args failed" }
}

if (-not (Test-Path "$root\.env")) {
  Copy-Item "$root\.env.example" "$root\.env"
  Write-Host "Created .env. Open the app and go to Settings -> AI provider to connect an AI."
}

Set-Location "$root\web"
if (-not (Test-Path node_modules)) { Invoke-Pnpm install }
Invoke-Pnpm run bundle

Set-Location "$root\server"
uv sync -q
uv run finder
