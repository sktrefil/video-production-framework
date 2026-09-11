param(
  [string]$Project = "pilot_short_roman_ix",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Keep JSON parsing stable under Windows PowerShell 5.1.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
Set-Location $repoRoot

$projectRoot = Join-Path $repoRoot "workspace\projects\$Project"
$projectDb = Join-Path $projectRoot "project.db"
$sourcePlan = Join-Path $repoRoot "scripts\pilot\wf09-roman-ix\scene-assets.json"
$targetDir = Join-Path $projectRoot "05_images"
$targetPlan = Join-Path $targetDir "scene-assets.json"
$cli = Join-Path $repoRoot "cli\vpf\dist\main.js"

if (-not (Test-Path $projectDb)) {
  throw "Project database not found: $projectDb"
}
if (-not (Test-Path $sourcePlan)) {
  throw "WF-09A pilot plan not found: $sourcePlan"
}

if (-not $SkipBuild) {
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }
}

if (-not (Test-Path $cli)) {
  throw "Unified CLI build output not found: $cli"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Force $sourcePlan $targetPlan
Get-Content -Raw -Encoding UTF8 $targetPlan | ConvertFrom-Json | Out-Null

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

$story = Invoke-VpfJson @("story", "status", $Project)
if ($null -eq $story.scenes -or $story.scenes.Count -ne 11) {
  throw "Expected 11 active pilot scenes before WF-09A; found $($story.scenes.Count)."
}
$staleScenes = @($story.scenes | Where-Object { $_.stale -eq $true })
$unapprovedScenes = @($story.scenes | Where-Object { $_.sceneStatus -ne "APPROVED" })
if ($staleScenes.Count -ne 0 -or $unapprovedScenes.Count -ne 0) {
  throw "WF-09A requires all 11 scenes to be APPROVED and non-stale."
}

$visual = Invoke-VpfJson @("visual", "status", $Project)
if ($visual.readiness.ready -ne $true) {
  throw "WF-08 visual readiness is not PASS."
}

$readiness = Invoke-VpfJson @("asset", "readiness", $Project, "--file", $targetPlan)
if (
  $readiness.ready -ne $true -or
  $readiness.sceneCount -ne 11 -or
  $readiness.readyCount -ne 11
) {
  throw "WF-09A readiness did not pass for all 11 scenes."
}

$design = Invoke-VpfJson @("asset", "design", "apply", $Project, "--file", $targetPlan)
if ($design.designedCount -ne 11) {
  throw "Expected 11 designed PRIMARY_SCENE assets; found $($design.designedCount)."
}

$materialized = Invoke-VpfJson @("asset", "prompt", "materialize", $Project, "--file", $targetPlan)
if (
  $materialized.generateAssetCount -ne 11 -or
  $materialized.promptMaterializedCount -ne 11 -or
  $materialized.providerJobsCreated -ne 0
) {
  throw "WF-09A prompt materialization did not produce exactly 11 prompts with zero Provider Jobs."
}

$status = Invoke-VpfJson @("asset", "status", $Project)
if ($status.assetCount -ne 11) {
  throw "Expected 11 active PRIMARY_SCENE assets; found $($status.assetCount)."
}
if ($status.promptMaterializedCount -ne 11) {
  throw "Expected 11 materialized IMAGE_PROMPT values; found $($status.promptMaterializedCount)."
}
if ($status.providerJobCount -ne 0) {
  throw "WF-09A must not create Provider Jobs; found $($status.providerJobCount)."
}
if ($status.wf09aReady -ne $true) {
  throw "WF-09A status is not ready."
}

$invalidAssets = @($status.assets | Where-Object {
  $_.stale -eq $true -or
  $_.assetStatus -ne "DESIGNED" -or
  $_.sourceStrategy -ne "GENERATE" -or
  [string]::IsNullOrWhiteSpace($_.design.imagePrompt) -or
  $_.candidateMediaIds.Count -ne 0 -or
  $null -ne $_.approvedMediaId
})
if ($invalidAssets.Count -ne 0) {
  throw "One or more WF-09A assets entered an unexpected production state."
}

Write-Host "WF-09A PROJECT DB APPLY: PASS"
Write-Host "Project: $Project"
Write-Host "Scenes: 11"
Write-Host "PRIMARY_SCENE Assets: 11"
Write-Host "IMAGE_PROMPT Materialized: 11"
Write-Host "Provider Jobs: 0"
Write-Host "Database: $projectDb"
