param(
  [string]$Project = "pilot_short_roman_ix",
  [switch]$SkipBuild,
  [switch]$Resume
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
Set-Location $repoRoot

$projectRoot = Join-Path $repoRoot "workspace\projects\$Project"
$projectDb = Join-Path $projectRoot "project.db"
$planFile = Join-Path $projectRoot "05_images\scene-assets.json"
$cli = Join-Path $repoRoot "cli\vpf\dist\main.js"
$defaultAdapter = Join-Path $repoRoot "runtimes\image\adapters\chatgpt-browser-adapter.mjs"

if (-not (Test-Path $projectDb)) {
  throw "Project database not found: $projectDb"
}
if (-not (Test-Path $planFile)) {
  throw "WF-09 AUTO Scene Asset plan not found: $planFile"
}
if (-not (Test-Path $defaultAdapter)) {
  throw "ChatGPT Browser adapter not found: $defaultAdapter"
}

if ([string]::IsNullOrWhiteSpace($env:VPF_IMAGE_ADAPTER_MODULE)) {
  $env:VPF_IMAGE_ADAPTER_MODULE = $defaultAdapter
}
if ([string]::IsNullOrWhiteSpace($env:CHATGPT_CDP_URL)) {
  $env:CHATGPT_CDP_URL = "http://127.0.0.1:9222"
}
if ([string]::IsNullOrWhiteSpace($env:CHATGPT_IMAGE_TIMEOUT_SECONDS)) {
  $env:CHATGPT_IMAGE_TIMEOUT_SECONDS = "180"
}
if ([string]::IsNullOrWhiteSpace($env:VPF_PYTHON_EXECUTABLE)) {
  $env:VPF_PYTHON_EXECUTABLE = "python"
}

try {
  $cdpVersionUrl = $env:CHATGPT_CDP_URL.TrimEnd('/') + "/json/version"
  $null = Invoke-RestMethod -Uri $cdpVersionUrl -TimeoutSec 5
} catch {
  throw "Chrome CDP is not reachable at $env:CHATGPT_CDP_URL. Start the logged-in Chrome debugging session before WF-09 AUTO."
}

& $env:VPF_PYTHON_EXECUTABLE -c "import playwright; from PIL import Image; print('WF-09 AUTO Python dependencies: PASS')"
if ($LASTEXITCODE -ne 0) {
  throw "The selected Python environment requires Playwright and Pillow before real ChatGPT Browser image generation."
}

function Invoke-RepositoryBuild {
  Write-Host "Building WF-09 AUTO CLI and repository workspaces..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }
}

function Test-Wf09AutoCli {
  if (-not (Test-Path $cli)) {
    return $false
  }

  $helpRaw = & node $cli --help 2>&1
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  $helpText = ($helpRaw -join [Environment]::NewLine)
  return $helpText.Contains("vpf asset auto run")
}

if (-not $SkipBuild) {
  Invoke-RepositoryBuild
} elseif (-not (Test-Wf09AutoCli)) {
  Write-Host "WF-09 AUTO CLI build is missing or stale; rebuilding automatically."
  Invoke-RepositoryBuild
}

if (-not (Test-Path $cli)) {
  throw "Unified CLI build output not found: $cli"
}
if (-not (Test-Wf09AutoCli)) {
  throw "Unified CLI build does not contain WF-09 AUTO commands after rebuild: $cli"
}

function Invoke-VpfJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $raw = & node $cli @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "VPF command failed: vpf $($Arguments -join ' ')`n$($raw -join [Environment]::NewLine)"
  }
  $text = ($raw -join [Environment]::NewLine).Trim()
  if (-not $text) {
    throw "VPF command returned no JSON: vpf $($Arguments -join ' ')"
  }
  return $text | ConvertFrom-Json
}

$before = Invoke-VpfJson @("asset", "auto", "status", $Project)
$approvedBefore = [int]$before.runtime.approvedCount

if ($Resume) {
  $result = Invoke-VpfJson @("asset", "auto", "resume", $Project)
} else {
  $result = Invoke-VpfJson @("asset", "auto", "run", $Project, "--all", "--file", $planFile)
}

$status = Invoke-VpfJson @("asset", "auto", "status", $Project)
if ($status.channelProfileVersion -ne "1.2.0") {
  throw "WF-09 AUTO did not pin HISTORY_MYSTERY_V1@1.2.0."
}
if ($status.imageProviderProfileVersion -ne "1.1.0") {
  throw "WF-09 AUTO did not pin IMAGE_PROVIDER_EXECUTION_V1@1.1.0."
}
if ($status.runtime.assetCount -ne 11) {
  throw "Expected 11 image Assets; found $($status.runtime.assetCount)."
}
$readyForQc = @($status.runtime.assets | Where-Object {
  $_.assetStatus -in @("CANDIDATE_AVAILABLE", "NEEDS_REVIEW", "APPROVED") -and
  $_.candidateMediaIds.Count -ge 1
})
if ($readyForQc.Count -ne 11) {
  throw "Expected all 11 cuts to have Candidate Media; ready=$($readyForQc.Count)."
}
if ($status.runtime.failedJobCount -ne 0 -or $status.runtime.blockedJobCount -ne 0) {
  throw "WF-09 AUTO still has failed or blocked image Provider Jobs."
}
if ([int]$status.runtime.approvedCount -ne $approvedBefore) {
  throw "WF-09 AUTO must not auto-approve generated images."
}

$manifestPath = Join-Path $projectRoot "05_images\prompts\manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "WF-09 AUTO prompt manifest not found: $manifestPath"
}
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
if ($manifest.entries.Count -ne 11) {
  throw "Expected 11 cut prompt MD entries; found $($manifest.entries.Count)."
}
if ($manifest.candidates.Count -lt 11) {
  throw "Expected at least 11 cut-named Candidate mirrors; found $($manifest.candidates.Count)."
}
foreach ($entry in $manifest.entries) {
  $md = Join-Path $projectRoot $entry.promptFile
  if (-not (Test-Path $md)) {
    throw "Prompt MD missing: $md"
  }
}
foreach ($candidate in $manifest.candidates) {
  $image = Join-Path $projectRoot $candidate.relativePath
  if (-not (Test-Path $image)) {
    throw "Cut-named Candidate image missing: $image"
  }
}

Write-Host "WF-09 AUTO PROJECT APPLY: PASS"
Write-Host "Project: $Project"
Write-Host "Cuts: 11"
Write-Host "Prompt MD: 11"
Write-Host "Candidate Images: 11"
Write-Host "Provider: CHATGPT_BROWSER"
Write-Host "Provider Profile: IMAGE_PROVIDER_EXECUTION_V1@1.1.0"
Write-Host "IMAGE_QC: PENDING"
Write-Host "Human Approval: PENDING"
Write-Host "Database: $projectDb"
Write-Host "Prompt manifest: $manifestPath"
Write-Host "Generated cut mirrors: $projectRoot\05_images\generated\cut_*"