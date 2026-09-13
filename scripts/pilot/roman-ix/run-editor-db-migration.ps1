param(
  [string]$ProjectId = "pilot_short_roman_ix",
  [string]$Header = "로마 제9군단의 미스터리",
  [string]$ApprovedBy = "roman-ix-operator",
  [switch]$ApproveProviderMedia,
  [switch]$Render
)

$ErrorActionPreference = "Stop"

function Run-Step([string]$Name, [scriptblock]$Command) {
  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Run-Step "Build" { npm run build }
Run-Step "EDB-01 Before Diagnose" { npm run vpf -- editor diagnose $ProjectId }
Run-Step "EDB-02 Media metadata import/refresh" { npm run vpf -- editor media import $ProjectId }
Run-Step "EDB-02 Provider media mapping status" { npm run vpf -- editor media provider-status $ProjectId }

if ($ApproveProviderMedia) {
  Write-Host "`nThe -ApproveProviderMedia switch is an explicit operator attestation that the existing provider videos have been reviewed and accepted for WF-12 migration." -ForegroundColor Yellow
  Run-Step "EDB-02 WF-12 existing provider media approval" {
    npm run vpf -- editor media approve-existing-provider $ProjectId --approved-by $ApprovedBy --confirm-reviewed
  }
  Run-Step "EDB-02 Provider media status after approval" { npm run vpf -- editor media provider-status $ProjectId }
}

Run-Step "EDB-03~06 Canonical assemble" { npm run vpf -- editor assemble $ProjectId --header $Header }
Run-Step "EDB-09 After Diagnose" { npm run vpf -- editor diagnose $ProjectId }
Run-Step "EDB-07 Materialize" { npm run editor:materialize -- $ProjectId }

Write-Host "`nCanonical Studio command:" -ForegroundColor Green
Write-Host "npm run studio-server --workspace @vpf/editor-app -- $ProjectId"

if ($Render) {
  Run-Step "EDB-10 Render" { npm run editor:render -- $ProjectId }
}

Write-Host "`nRoman IX canonical editor DB migration gate completed." -ForegroundColor Green
