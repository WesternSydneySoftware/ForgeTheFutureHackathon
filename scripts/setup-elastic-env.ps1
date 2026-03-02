param(
  [string]$EnvPath = ".env",
  [string]$CloudId,
  [string]$Node,
  [switch]$Check
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

function Read-DotEnv {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if (-not $line) { continue }
    if ($line -match '^\s*#') { continue }
    if ($line -notmatch '=') { continue }

    $parts = $line -split '=', 2
    $k = $parts[0].Trim()
    $v = $parts[1]
    if ($k) { $map[$k] = $v }
  }

  return $map
}

function Upsert-DotEnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $lines = @()
  if (Test-Path $Path) { $lines = Get-Content -LiteralPath $Path }

  $pattern = "^\s*$([regex]::Escape($Key))\s*="
  $updated = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $pattern) {
      $lines[$i] = "$Key=$Value"
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    if ($lines.Count -gt 0 -and $lines[$lines.Count - 1].Trim()) { $lines += "" }
    $lines += "$Key=$Value"
  }

  Set-Content -LiteralPath $Path -Value $lines -Encoding utf8NoBOM
}

function SecureStringToPlainText {
  param([Security.SecureString]$Secure)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$envFile = Join-Path $repoRoot $EnvPath
if (-not (Test-Path $envFile) -and (Test-Path (Join-Path $repoRoot ".env.example"))) {
  Copy-Item (Join-Path $repoRoot ".env.example") $envFile
  Write-Host "Created $EnvPath from .env.example" -ForegroundColor Yellow
}

$current = Read-DotEnv -Path $envFile
$hasCloud = $current.ContainsKey("ELASTICSEARCH_CLOUD_ID") -and $current["ELASTICSEARCH_CLOUD_ID"].Trim()
$hasNode = $current.ContainsKey("ELASTICSEARCH_NODE") -and $current["ELASTICSEARCH_NODE"].Trim()
$hasApiKey = $current.ContainsKey("ELASTICSEARCH_API_KEY") -and $current["ELASTICSEARCH_API_KEY"].Trim()
$hasUserPass =
  ($current.ContainsKey("ELASTICSEARCH_USERNAME") -and $current["ELASTICSEARCH_USERNAME"].Trim()) -and
  ($current.ContainsKey("ELASTICSEARCH_PASSWORD") -and $current["ELASTICSEARCH_PASSWORD"].Trim())

if (($hasCloud -or $hasNode) -and ($hasApiKey -or $hasUserPass)) {
  Write-Host "ELASTICSEARCH env vars already present in $EnvPath." -ForegroundColor Green
  if ($Check) { node scripts/check-elasticsearch.js }
  exit 0
}

if (-not $CloudId) { $CloudId = Read-Host "Elastic Cloud ID (leave blank to use ELASTICSEARCH_NODE)" }

if ($CloudId) {
  $apiKeySecure = Read-Host "Elastic API key (Encoded)" -AsSecureString
  $apiKeyPlain = SecureStringToPlainText -Secure $apiKeySecure

  if (-not $apiKeyPlain.Trim()) { throw "API key is required." }

  Upsert-DotEnvValue -Path $envFile -Key "ELASTICSEARCH_CLOUD_ID" -Value $CloudId.Trim()
  Upsert-DotEnvValue -Path $envFile -Key "ELASTICSEARCH_API_KEY" -Value $apiKeyPlain.Trim()

  Write-Host "Wrote ELASTICSEARCH_CLOUD_ID and ELASTICSEARCH_API_KEY to $EnvPath." -ForegroundColor Green
} else {
  if (-not $Node) { $Node = Read-Host "Elasticsearch node URL (e.g. https://...:443)" }
  if (-not $Node.Trim()) { throw "ELASTICSEARCH_NODE is required." }

  $apiKeySecure = Read-Host "Elastic API key (Encoded)" -AsSecureString
  $apiKeyPlain = SecureStringToPlainText -Secure $apiKeySecure
  if (-not $apiKeyPlain.Trim()) { throw "API key is required." }

  Upsert-DotEnvValue -Path $envFile -Key "ELASTICSEARCH_NODE" -Value $Node.Trim()
  Upsert-DotEnvValue -Path $envFile -Key "ELASTICSEARCH_API_KEY" -Value $apiKeyPlain.Trim()

  Write-Host "Wrote ELASTICSEARCH_NODE and ELASTICSEARCH_API_KEY to $EnvPath." -ForegroundColor Green
}

if ($Check) {
  node scripts/check-elasticsearch.js
}
