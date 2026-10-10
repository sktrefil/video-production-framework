param([switch]$Check)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\output\db-cooper-v3\storyboard-lock-v1'
$planPath = Join-Path $root 'chain-plan.json'
$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$candidate = Get-Content -LiteralPath (Join-Path $root 'CL07-v3-chain-candidate.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$gate = Get-Content -LiteralPath (Join-Path $root 'production-readiness-pass-v1.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$planHash = (Get-FileHash -LiteralPath $planPath -Algorithm SHA256).Hash.ToLowerInvariant()
$cl06 = $plan.shots | Where-Object id -eq 'CL06' | Select-Object -First 1
$cl07 = $plan.shots | Where-Object id -eq 'CL07' | Select-Object -First 1
if ($planHash -ne $candidate.base_plan_sha256 -or $gate.plan_sha256 -ne $planHash -or $gate.status -ne 'PASS' -or
    $candidate.canonical_approval -ne $false -or $candidate.start_binding.kind -ne 'PREVIOUS_USED_EXIT_CANDIDATE' -or
    $cl06.keep_seconds -ne 9 -or $cl07.keep_seconds -ne 8 -or $cl07.timeline_start -ne 54 -or $plan.editor_fps -ne 30) {
    throw 'CL07 chain candidate no longer matches the locked story, timing or readiness record.'
}
$video = Join-Path $root 'clips\CL06.mp4'
$exit = Join-Path $root 'exits\CL06_USED_EXIT.png'
$start = Join-Path $root 'assets\CL07_START.png'
$exitEvidence = Join-Path $root 'evidence\CL06_USED_EXIT.json'
$startEvidence = Join-Path $root 'evidence\CL07_START_BINDING.json'
$temporary = Join-Path $root 'exits\CL06_USED_EXIT.tmp.png'
$videoHash = (Get-FileHash -LiteralPath $video -Algorithm SHA256).Hash.ToLowerInvariant()
if ($videoHash -ne $candidate.start_binding.source_clip_sha256) {
    throw 'CL06.mp4 changed. Review the new exit and revise CL07 before extraction.'
}
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$frameJson = (& $ffprobe -v error -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time -of json $video) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'ffprobe failed.' }
$frames = ($frameJson | ConvertFrom-Json).frames
$boundary = [double]$cl06.keep_seconds - 1.0 / [double]$plan.editor_fps
$index = -1
$seconds = -1.0
for ($i = 0; $i -lt $frames.Count; $i++) {
    $time = 0.0
    if ([double]::TryParse([string]$frames[$i].best_effort_timestamp_time,
        [System.Globalization.NumberStyles]::Float,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$time) -and $time -le $boundary + 0.000001) {
        $index = $i
        $seconds = $time
    }
}
if ($index -ne $candidate.start_binding.source_frame_index -or
    [Math]::Abs($seconds - [double]$candidate.start_binding.source_frame_time_seconds) -gt 0.00001) {
    throw 'Actual used exit frame changed; revise CL07 candidate.'
}
$paths = @($exit, $start, $exitEvidence, $startEvidence)
$present = @($paths | ForEach-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($present -contains $true) {
    if ($present -contains $false) { throw 'Partial CL06 exit / CL07 START output exists.' }
    $exitHash = (Get-FileHash -LiteralPath $exit -Algorithm SHA256).Hash.ToLowerInvariant()
    $startHash = (Get-FileHash -LiteralPath $start -Algorithm SHA256).Hash.ToLowerInvariant()
    $priorExit = Get-Content -LiteralPath $exitEvidence -Raw -Encoding UTF8 | ConvertFrom-Json
    $priorStart = Get-Content -LiteralPath $startEvidence -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($exitHash -ne $startHash -or $priorExit.source_sha256 -ne $videoHash -or
        $priorExit.exit_sha256 -ne $exitHash -or $priorExit.selected_source_frame_index -ne $index -or
        $priorStart.source_exit_sha256 -ne $exitHash -or $priorStart.start_sha256 -ne $startHash -or
        $priorStart.binding_kind -ne 'PREVIOUS_USED_EXIT_CANDIDATE') {
        throw 'Existing CL07 START provenance differs from CL06 actual used exit.'
    }
    Write-Output "VERIFIED existing CL07 START: $start"
    return
}
Write-Output "CL06 actual 9-second used exit: frame $index at $seconds seconds"
Write-Output "CL07 START destination: $start"
if ($Check) { return }
if (Test-Path -LiteralPath $temporary) { throw "Temporary file already exists: $temporary" }
New-Item -ItemType Directory -Path (Split-Path -Parent $exit), (Split-Path -Parent $start), (Split-Path -Parent $exitEvidence) -Force | Out-Null
try {
    $filter = "select=eq(n\,$index)"
    & $ffmpeg -hide_banner -loglevel error -n -i $video -vf $filter -fps_mode vfr -frames:v 1 $temporary
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary -PathType Leaf)) { throw 'ffmpeg frame extraction failed.' }
    $bytes = [System.IO.File]::ReadAllBytes($temporary)
    $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    $validPng = $bytes.Length -ge 1000
    if ($validPng) {
        for ($j = 0; $j -lt $signature.Length; $j++) {
            if ($bytes[$j] -ne $signature[$j]) { $validPng = $false; break }
        }
    }
    if (-not $validPng) {
        throw 'Extracted image is not a valid PNG.'
    }
    Move-Item -LiteralPath $temporary -Destination $exit
    Copy-Item -LiteralPath $exit -Destination $start
    $exitHash = (Get-FileHash -LiteralPath $exit -Algorithm SHA256).Hash.ToLowerInvariant()
    $exitRecord = [ordered]@{
        project_id = $plan.project_id; clip_id = 'CL06'; source_path = $cl06.video_asset
        source_sha256 = $videoHash; keep_seconds = 9; editor_fps = 30
        last_editor_frame_time_sec = $boundary; selected_source_frame_index = $index
        selected_source_frame_time_sec = $seconds; exit_path = 'exits/CL06_USED_EXIT.png'
        exit_sha256 = $exitHash; status = 'EXTRACTED_UNREVIEWED'; canonical_approval = $false
    }
    $startRecord = [ordered]@{
        project_id = $plan.project_id; clip_id = 'CL07'; binding_kind = 'PREVIOUS_USED_EXIT_CANDIDATE'
        source_clip = 'CL06'; source_exit_path = 'exits/CL06_USED_EXIT.png'
        source_exit_sha256 = $exitHash; start_path = 'assets/CL07_START.png'
        start_sha256 = $exitHash; status = 'EXTRACTED_UNREVIEWED'; canonical_approval = $false
    }
    [System.IO.File]::WriteAllText($exitEvidence, ($exitRecord | ConvertTo-Json -Depth 4) + "`n", [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($startEvidence, ($startRecord | ConvertTo-Json -Depth 4) + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "EXTRACTED CL07 START: $start"
    Write-Output 'Review the frame visually. It contains a small four-point source artifact at lower right.'
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
}
