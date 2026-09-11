param(
  [string]$Project = "pilot_short_roman_ix",
  [switch]$SkipBuild,
  [switch]$RetryFailed
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
Set-Location $repoRoot

$projectRoot = Join-Path $repoRoot "workspace\projects\$Project"
$projectDb = Join-Path $projectRoot "project.db"
$cli = Join-Path $repoRoot "cli\vpf\dist\main.js"

if (-not (Test-Path $projectDb)) {
  throw "Project database not found: $projectDb"
}
if ([string]::IsNullOrWhiteSpace($env:VPF_IMAGE_ADAPTER_MODULE)) {
  throw "VPF_IMAGE_ADAPTER_MODULE is required. Point it to the real image provider adapter module before WF-09B execution."
}
if ([string]::IsNullOrWhiteSpace($env:IMAGE_PROVIDER_API_KEY)) {
  throw "IMAGE_PROVIDER_API_KEY is required by the pinned IMAGE_PROVIDER_EXECUTION_V1 profile."
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

$wf09a = Invoke-VpfJson @("asset", "status", $Project)
if ($wf09a.assetCount -ne 11 -or $wf09a.promptMaterializedCount -ne 11) {
  throw "WF-09B requires the completed WF-09A pilot state: 11 Assets and 11 materialized prompts."
}

$statusBefore = Invoke-VpfJson @("asset", "runtime", "status", $Project)
if ($statusBefore.assetCount -ne 11) {
  throw "Expected 11 GENERATE PRIMARY_SCENE Assets before WF-09B; found $($statusBefore.assetCount)."
}

$alreadyCandidateOrLater = @($statusBefore.assets | Where-Object {
  $_.assetStatus -in @("CANDIDATE_AVAILABLE", "NEEDS_REVIEW", "APPROVED")
})
$regenerateRequired = @($statusBefore.assets | Where-Object { $_.assetStatus -eq "REGENERATE_REQUIRED" })
$blockedAssets = @($statusBefore.assets | Where-Object { $_.assetStatus -eq "BLOCKED" })
$designed = @($statusBefore.assets | Where-Object { $_.assetStatus -eq "DESIGNED" })

if ($blockedAssets.Count -ne 0) {
  throw "WF-09B has BLOCKED Assets that require configuration/reference repair before retry."
}

if ($RetryFailed -or $regenerateRequired.Count -gt 0) {
  if ($statusBefore.failedJobCount -eq 0) {
    throw "Retry was requested but no active FAILED image Provider Jobs exist."
  }
  $retry = Invoke-VpfJson @("asset", "runtime", "retry-failed", $Project, "--all")
  if ($retry.failed -ne 0) {
    throw "WF-09B retry did not complete all failed image jobs."
  }
} elseif ($designed.Count -gt 0) {
  $preflight = Invoke-VpfJson @("asset", "runtime", "preflight", $Project)
  if ($preflight.ready -ne $true) {
    throw "WF-09B runtime preflight is not ready."
  }
  $execution = Invoke-VpfJson @("asset", "runtime", "execute", $Project, "--all")
  if ($execution.failed -ne 0) {
    throw "WF-09B image runtime did not complete every selected Asset. Use -RetryFailed after resolving transient provider failures."
  }
} elseif ($alreadyCandidateOrLater.Count -ne 11) {
  throw "WF-09B pilot contains an unsupported mixed Asset state."
}

$status = Invoke-VpfJson @("asset", "runtime", "status", $Project)
$readyForQc = @($status.assets | Where-Object {
  $_.assetStatus -in @("CANDIDATE_AVAILABLE", "NEEDS_REVIEW", "APPROVED") -and
  $_.candidateMediaIds.Count -ge 1
})
if ($status.assetCount -ne 11 -or $readyForQc.Count -ne 11) {
  throw "Expected all 11 Scene Assets to have generated candidate images; ready=$($readyForQc.Count)."
}
if ($status.failedJobCount -ne 0 -or $status.blockedJobCount -ne 0) {
  throw "WF-09B still has failed or blocked active image Provider Jobs."
}
if ($status.completeJobCount -lt 11) {
  throw "Expected at least 11 COMPLETE image Provider Jobs; found $($status.completeJobCount)."
}

Write-Host "WF-09B IMAGE RUNTIME APPLY: PASS"
Write-Host "Project: $Project"
Write-Host "Scene Assets: 11"
Write-Host "Generated Candidate Images: 11"
Write-Host "Complete Provider Jobs: $($status.completeJobCount)"
Write-Host "IMAGE_QC: PENDING"
Write-Host "Human Asset Approval: PENDING"
Write-Host "Database: $projectDb"
Write-Host "Generated files: $projectRoot\05_images\generated"
