param(
    [string]$Project = "pilot_short_roman_ix",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 can otherwise corrupt Korean JSON/output through the
# active ANSI/OEM code page. Keep the pilot path explicitly UTF-8.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

$projectRoot = Join-Path $repoRoot "workspace\projects\$Project"
$projectDb = Join-Path $projectRoot "project.db"
$visualDir = Join-Path $projectRoot "04_visual_identity"
$sourceDir = Join-Path $PSScriptRoot "wf08-roman-ix"
$styleSource = Join-Path $sourceDir "project-style.json"
$anchorsSource = Join-Path $sourceDir "identity-anchors.json"
$styleTarget = Join-Path $visualDir "project-style.json"
$anchorsTarget = Join-Path $visualDir "identity-anchors.json"
$cli = Join-Path $repoRoot "cli\vpf\dist\index.js"

if (-not (Test-Path $projectDb)) {
    throw "Project DB not found: $projectDb"
}
if (-not (Test-Path $styleSource)) {
    throw "Project Style source not found: $styleSource"
}
if (-not (Test-Path $anchorsSource)) {
    throw "Identity Anchors source not found: $anchorsSource"
}

if (-not $SkipBuild) {
    Write-Host "=== BUILD ==="
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Repository build failed." }
}
if (-not (Test-Path $cli)) {
    throw "Built VPF CLI not found: $cli"
}

New-Item -ItemType Directory -Force -Path $visualDir | Out-Null
Copy-Item $styleSource $styleTarget -Force
Copy-Item $anchorsSource $anchorsTarget -Force

# Validate copied UTF-8 JSON before any database mutation.
[System.IO.File]::ReadAllText($styleTarget, [System.Text.Encoding]::UTF8) | ConvertFrom-Json | Out-Null
[System.IO.File]::ReadAllText($anchorsTarget, [System.Text.Encoding]::UTF8) | ConvertFrom-Json | Out-Null
Write-Host "WF-08 JSON validation: PASS"

Write-Host "`n=== WF-07 PRECONDITION ==="
$storyJson = (& node $cli story status $Project) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "Unable to read WF-07 story status." }
$story = $storyJson | ConvertFrom-Json
$final = $story.scripts |
    Where-Object { $_.kind -eq "FINAL" -and $_.lifecycleStatus -eq "ACTIVE" } |
    Sort-Object revision -Descending |
    Select-Object -First 1
if ($null -eq $final) {
    throw "No active FINAL Script exists for $Project."
}
if ($story.scenes.Count -eq 0) {
    throw "No active Story Scenes exist for $Project."
}
$staleScenes = @($story.scenes | Where-Object { $_.stale -eq $true })
if ($staleScenes.Count -gt 0) {
    throw "WF-08 cannot proceed with stale Story Scenes."
}
Write-Host "FINAL Script: $($final.id) rev $($final.revision)"
Write-Host "Active Scenes: $($story.scenes.Count)"

Write-Host "`n=== APPLY PROJECT STYLE ==="
& node $cli visual style apply $Project --file $styleTarget
if ($LASTEXITCODE -ne 0) { throw "Project Style apply failed." }

Write-Host "`n=== APPROVE PROJECT STYLE (V1) ==="
& node $cli visual style approve $Project --approved-by "operator"
if ($LASTEXITCODE -ne 0) { throw "Project Style approval failed." }

Write-Host "`n=== APPLY IDENTITY ANCHORS ==="
& node $cli visual anchors apply $Project --file $anchorsTarget
if ($LASTEXITCODE -ne 0) { throw "Identity Anchor apply failed." }

Write-Host "`n=== APPROVE IDENTITY ANCHORS (V2) ==="
& node $cli visual anchors approve $Project --all --approved-by "operator"
if ($LASTEXITCODE -ne 0) { throw "Identity Anchor approval failed." }

Write-Host "`n=== FINAL WF-08 STATUS ==="
$visualJson = (& node $cli visual status $Project) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "Unable to read final WF-08 status." }
$visual = $visualJson | ConvertFrom-Json
$visualJson | Write-Host

if ($visual.readiness.projectStyleApproved -ne $true) {
    throw "WF-08 verification failed: Project Style is not approved."
}
if ($visual.readiness.missingApprovalAnchorIds.Count -gt 0) {
    throw "WF-08 verification failed: one or more Identity Anchors are not approved."
}
if ($visual.readiness.staleAnchorIds.Count -gt 0) {
    throw "WF-08 verification failed: one or more Identity Anchors are stale."
}
if ($visual.readiness.ready -ne $true) {
    throw "WF-08 verification failed: readiness is false."
}

Write-Host "`nWF-08 PROJECT DB APPLY: PASS"
Write-Host "Database: $projectDb"
