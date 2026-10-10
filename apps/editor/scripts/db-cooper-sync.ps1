param(
    [string]$OutputDir = 'output/db-cooper-v3'
)

$ErrorActionPreference = 'Stop'
$editorRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir = Join-Path $editorRoot $OutputDir
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
$planPath = Join-Path $OutputDir 'chain-plan.json'
if (-not (Test-Path -LiteralPath $planPath -PathType Leaf)) {
    throw "Missing chain plan. Run node scripts/db-cooper-chain.mjs prepare first: $planPath"
}
$plan = Get-Content -LiteralPath $planPath -Raw -Encoding utf8 | ConvertFrom-Json
$inputNames = @{
    manifest = 'DB_Cooper_v3_Codex_Shot_Manifest.json'
    script = 'DB_Cooper_4min30_script_v3.txt'
    tts = 'DB_Cooper_4min30_script_v3_TTS.txt'
    bible = (Get-ChildItem -LiteralPath (Join-Path $OutputDir 'inputs') -File -Filter '*_VISUAL_BIBLE_LOCK.md' | Select-Object -First 1 -ExpandProperty Name)
}
$editFps = [int]$plan.editor_fps
if ($editFps -le 0) { throw 'Invalid editor FPS in chain plan' }
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$extracted = 0
$bound = 0

function Get-Sha256([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing hash input: $Path" }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
}

function Write-NewJson([string]$Path, $Value) {
    if (Test-Path -LiteralPath $Path) { throw "Evidence already exists: $Path" }
    $json = $Value | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

foreach ($key in $inputNames.Keys) {
    $inputPath = Join-Path $OutputDir "inputs/$($inputNames[$key])"
    if ((Get-Sha256 $inputPath) -ne $plan.input_hashes.$key) { throw "Input changed after prepare: $key" }
}
foreach ($board in $plan.boards.PSObject.Properties) {
    if ((Get-Sha256 (Join-Path $OutputDir $board.Value.path)) -ne $board.Value.sha256) {
        throw "Board changed after prepare: $($board.Name)"
    }
}

foreach ($shot in $plan.shots) {
    $videoPath = Join-Path $OutputDir $shot.video_asset
    if (-not (Test-Path -LiteralPath $videoPath -PathType Leaf)) { continue }
    $videoHash = Get-Sha256 $videoPath
    $exitRel = "exits/$($shot.id)_USED_EXIT.png"
    $exitPath = Join-Path $OutputDir $exitRel
    $evidencePath = Join-Path $OutputDir "evidence/$($shot.id)_USED_EXIT.json"
    if ((Test-Path -LiteralPath $exitPath) -or (Test-Path -LiteralPath $evidencePath)) {
        if (-not ((Test-Path -LiteralPath $exitPath) -and (Test-Path -LiteralPath $evidencePath))) {
            throw "Incomplete exit/evidence pair for $($shot.id)"
        }
        $existing = Get-Content -LiteralPath $evidencePath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($existing.source_sha256 -ne $videoHash -or $existing.exit_sha256 -ne (Get-Sha256 $exitPath)) {
            throw "Stale or modified exit/evidence pair for $($shot.id)"
        }
        continue
    }
    $frameJson = & $ffprobe -v error -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time -of json $videoPath
    if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for $($shot.id)" }
    $frames = @((($frameJson -join "`n") | ConvertFrom-Json).frames)
    if ($frames.Count -eq 0) { throw "No video frames for $($shot.id)" }
    $lastEditorTime = [double]$shot.keep_seconds - 1.0 / $editFps
    $frameIndex = -1
    $sourceTime = $null
    for ($i = 0; $i -lt $frames.Count; $i++) {
        $time = [double]::Parse([string]$frames[$i].best_effort_timestamp_time, [System.Globalization.CultureInfo]::InvariantCulture)
        if ($time -le ($lastEditorTime + 0.000001)) {
            $frameIndex = $i
            $sourceTime = $time
        }
    }
    if ($frameIndex -lt 0) { throw "No source frame in used window for $($shot.id)" }
    $filter = "select=eq(n\,$frameIndex)"
    & $ffmpeg -hide_banner -loglevel error -n -i $videoPath -vf $filter -fps_mode vfr -frames:v 1 $exitPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exitPath -PathType Leaf)) {
        throw "ffmpeg exit extraction failed for $($shot.id)"
    }
    Write-NewJson $evidencePath ([ordered]@{
        project_id = $plan.project_id
        clip_id = $shot.id
        source_path = $shot.video_asset
        source_sha256 = $videoHash
        keep_seconds = $shot.keep_seconds
        edit_fps = $editFps
        last_editor_frame_time_sec = $lastEditorTime
        selected_source_frame_index = $frameIndex
        selected_source_frame_time_sec = $sourceTime
        source_frame_count = $frames.Count
        exit_path = $exitRel
        exit_sha256 = Get-Sha256 $exitPath
        status = 'EXTRACTED_UNREVIEWED'
        canonical_approval = $false
    })
    $extracted++
}

foreach ($shot in $plan.shots) {
    if ($shot.start_binding.kind -eq 'GENERATE_START') { continue }
    $sourceClip = $shot.start_binding.source_clip
    $sourceExit = Join-Path $OutputDir "exits/$($sourceClip)_USED_EXIT.png"
    $sourceEvidence = Join-Path $OutputDir "evidence/$($sourceClip)_USED_EXIT.json"
    if (-not ((Test-Path -LiteralPath $sourceExit) -and (Test-Path -LiteralPath $sourceEvidence))) { continue }
    $startPath = Join-Path $OutputDir $shot.start_asset
    $bindingEvidence = Join-Path $OutputDir "evidence/$($shot.id)_START_BINDING.json"
    $sourceHash = Get-Sha256 $sourceExit
    if ((Test-Path -LiteralPath $startPath) -or (Test-Path -LiteralPath $bindingEvidence)) {
        if (-not ((Test-Path -LiteralPath $startPath) -and (Test-Path -LiteralPath $bindingEvidence))) {
            throw "Incomplete START/evidence pair for $($shot.id)"
        }
        $existing = Get-Content -LiteralPath $bindingEvidence -Raw -Encoding utf8 | ConvertFrom-Json
        if ($existing.source_exit_sha256 -ne $sourceHash -or $existing.start_sha256 -ne (Get-Sha256 $startPath)) {
            throw "Stale or modified START/evidence pair for $($shot.id)"
        }
        continue
    }
    Copy-Item -LiteralPath $sourceExit -Destination $startPath
    Write-NewJson $bindingEvidence ([ordered]@{
        project_id = $plan.project_id
        clip_id = $shot.id
        binding_kind = $shot.start_binding.kind
        source_clip = $sourceClip
        source_exit_path = "exits/$($sourceClip)_USED_EXIT.png"
        source_exit_sha256 = $sourceHash
        start_path = $shot.start_asset
        start_sha256 = Get-Sha256 $startPath
        status = 'EXTRACTED_UNREVIEWED'
        canonical_approval = $false
    })
    $bound++
}

Write-Output "SYNC complete: $extracted new used exits, $bound new dependent START images."
Write-Output 'Review each actual exit and START image before submitting the next job.'
