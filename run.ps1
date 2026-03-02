param(
  [ValidateSet("dev", "start")]
  [string]$Mode = "dev",

  [int]$Port = 8001,

  [switch]$SkipInstall,

  [switch]$Open
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Assert-CommandExists {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$Name'. Install Node.js (includes npm) and try again."
  }
}

Assert-CommandExists -Name "node"
Assert-CommandExists -Name "npm"

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Add your Elastic settings to .env before using the app." -ForegroundColor Yellow
}

if (-not $SkipInstall) {
  if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
  }
}

$env:PORT = "$Port"

if ($Open) {
  Start-Process "http://localhost:$Port/"
}

Write-Host "Starting One More Job ($Mode) on http://localhost:$Port/ ..." -ForegroundColor Green

if ($Mode -eq "dev") {
  npm run dev
} else {
  npm start
}

