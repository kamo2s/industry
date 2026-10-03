param([switch]$Production)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 before running INDUSTRY.' }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'Install pnpm 11 before running INDUSTRY.' }
    if (-not (Test-Path -LiteralPath 'node_modules/.pnpm/lock.yaml')) {
        pnpm install --frozen-lockfile --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    if ($Production) {
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
        pnpm start
    } else {
        pnpm dev
    }
} finally {
    Pop-Location
}
