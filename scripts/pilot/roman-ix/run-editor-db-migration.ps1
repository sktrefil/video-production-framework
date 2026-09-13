param(
  [string]$ProjectId = "pilot_short_roman_ix",
  [string]$Header = "로마 제9군단의 미스터리",
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
Run-Step "EDB-03~06 Canonical assemble" { npm run vpf -- editor assemble $ProjectId --header $Header }
Run-Step "EDB-09 After Diagnose" { npm run vpf -- editor diagnose $ProjectId }
Run-Step "EDB-07 Materialize" { npm run editor:materialize -- $ProjectId }

Write-Host "`nCanonical Studio command:" -ForegroundColor Green
Write-Host "npm run studio-server --workspace @vpf/editor-app -- $ProjectId"

if ($Render) {
  Run-Step "EDB-10 Render" { npm run editor:render -- $ProjectId }
}

Write-Host "`nRoman IX canonical editor DB migration gate completed." -ForegroundColor Green
