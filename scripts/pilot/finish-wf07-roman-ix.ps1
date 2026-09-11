$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 defaults to the active ANSI/OEM code page for some
# text operations. This pilot contains Korean UTF-8 JSON, so force UTF-8
# explicitly for file reads and external-process output.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

$cli = Join-Path $repoRoot "cli\vpf\dist\index.js"
$project = "pilot_short_roman_ix"
$projectRoot = Join-Path $repoRoot "workspace\projects\$project"
$projectDb = Join-Path $projectRoot "project.db"
$planSource = Join-Path $PSScriptRoot "story-plan-roman-ix.json"
$targetPlan = Join-Path $projectRoot "02_script\story-plan.json"

if (-not (Test-Path $projectDb)) {
    throw "Project DB not found: $projectDb"
}
if (-not (Test-Path $planSource)) {
    throw "Story plan not found: $planSource"
}
if (-not (Test-Path $cli)) {
    throw "Built VPF CLI not found: $cli. Run npm run build first."
}

Copy-Item $planSource $targetPlan -Force

# Read UTF-8 explicitly. Do not rely on Windows PowerShell 5.1 defaults.
$planText = [System.IO.File]::ReadAllText($targetPlan, [System.Text.Encoding]::UTF8)
$planText | ConvertFrom-Json | Out-Null
Write-Host "story-plan.json JSON validation: PASS"

$generateOutput = @(& node $cli story generate $project --plan $targetPlan 2>&1)
$generateExit = $LASTEXITCODE
$generateOutput | ForEach-Object { Write-Host $_ }

if ($generateExit -ne 0) {
    $generateText = $generateOutput | Out-String
    if ($generateText -notmatch "FINAL_SCRIPT_APPROVAL_REQUIRED") {
        throw "Story generation failed for a reason other than missing FINAL approval."
    }

    $statusJson = (& node $cli story status $project) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "Unable to read WF-07 status." }
    $status = $statusJson | ConvertFrom-Json
    $final = $status.scripts |
        Where-Object { $_.kind -eq "FINAL" -and $_.lifecycleStatus -eq "ACTIVE" } |
        Sort-Object revision -Descending |
        Select-Object -First 1

    if ($null -eq $final) {
        throw "No active FINAL Script exists for $project."
    }

    Write-Host "Approving FINAL Script: $($final.id), revision $($final.revision)"
    & node $cli script approve $project $final.id --approved-by "operator"
    if ($LASTEXITCODE -ne 0) { throw "FINAL Script approval failed." }

    & node $cli story generate $project --plan $targetPlan
    if ($LASTEXITCODE -ne 0) { throw "Story generation failed after FINAL approval." }
}

& node $cli story approve-structure $project --approved-by "operator"
if ($LASTEXITCODE -ne 0) { throw "Structure approval failed." }

& node $cli story approve-scenes $project --all --approved-by "operator"
if ($LASTEXITCODE -ne 0) { throw "Scene approval failed." }

Write-Host "`n=== FINAL WF-07 STATUS ==="
& node $cli story status $project
if ($LASTEXITCODE -ne 0) { throw "Unable to read final WF-07 status." }
