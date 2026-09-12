param(
    [string]$ProjectId = "pilot_short_roman_ix",
    [switch]$ApproveForImageGeneration
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$ProjectRoot = Join-Path $RepoRoot "workspace\projects\$ProjectId"
$ProjectDb = Join-Path $ProjectRoot "project.db"
$InputDir = Join-Path $ProjectRoot "02_script"
$TemplateRoot = Join-Path $RepoRoot "scripts\pilot\roman-ix"
$SourceScript = Join-Path $TemplateRoot "script.txt"
$SourcePlan = Join-Path $TemplateRoot "story-plan.json"
$TargetScript = Join-Path $InputDir "roman-ix-final-script.txt"
$TargetPlan = Join-Path $InputDir "story-plan.json"
$Cli = Join-Path $RepoRoot "cli\vpf\dist\index.js"

if (-not (Test-Path $ProjectDb)) {
    throw "Project does not exist or project.db is missing: $ProjectId"
}
if (-not (Test-Path $SourceScript)) {
    throw "Roman IX script template is missing: $SourceScript"
}
if (-not (Test-Path $SourcePlan)) {
    throw "Roman IX story plan template is missing: $SourcePlan"
}

New-Item -ItemType Directory -Force $InputDir | Out-Null
Copy-Item $SourceScript $TargetScript -Force
Copy-Item $SourcePlan $TargetPlan -Force
Get-Content $TargetPlan -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null

Write-Host "=== Roman IX WF-07 input prepared ==="
Write-Host "Script: $TargetScript"
Write-Host "Plan:   $TargetPlan"

Write-Host "`n=== Build unified CLI ==="
& npm run build --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) { throw "@vpf/cli build failed." }

Write-Host "`n=== Create FINAL script ==="
$scriptJson = (& node $Cli script create $ProjectId --file $TargetScript --kind FINAL | Out-String)
if ($LASTEXITCODE -ne 0) { throw "Roman IX FINAL script creation failed." }
$script = $scriptJson | ConvertFrom-Json
if (-not $script.id) { throw "Created script did not return an id." }
Write-Host "Script ID: $($script.id)"

Write-Host "`n=== Approve known FINAL script ==="
& node $Cli script approve $ProjectId $script.id --approved-by "operator"
if ($LASTEXITCODE -ne 0) { throw "Roman IX FINAL script approval failed." }

Write-Host "`n=== Generate story graph / scenes ==="
& node $Cli story generate $ProjectId --plan $TargetPlan
if ($LASTEXITCODE -ne 0) { throw "Roman IX story generation failed." }

if ($ApproveForImageGeneration) {
    Write-Host "`n=== Approve story structure ==="
    & node $Cli story approve-structure $ProjectId --approved-by "operator"
    if ($LASTEXITCODE -ne 0) { throw "Story structure approval failed." }

    Write-Host "`n=== Approve all scenes ==="
    & node $Cli story approve-scenes $ProjectId --all --approved-by "operator"
    if ($LASTEXITCODE -ne 0) { throw "Scene approval failed." }
}

Write-Host "`n=== Roman IX WF-07 status ==="
& node $Cli story status $ProjectId
if ($LASTEXITCODE -ne 0) { throw "Story status failed." }

Write-Host "`nRoman IX WF-07 preparation complete."
if ($ApproveForImageGeneration) {
    Write-Host "Structure and scenes are approved for the next image-production stage."
} else {
    Write-Host "Scenes were generated but not auto-approved. Re-run with -ApproveForImageGeneration when approval is intended."
}
