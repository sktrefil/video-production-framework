param([switch]$Check)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\output\db-cooper-v3\storyboard-lock-v1'
$planPath = Join-Path $root 'chain-plan.json'
$sourceVideo = Join-Path $root 'clips\CL03.mp4'
$exitImage = Join-Path $root 'exits\CL03_USED_EXIT.png'
$exitEvidence = Join-Path $root 'evidence\CL03_USED_EXIT.json'
$startImage = Join-Path $root 'assets\CL04_START.png'
$startEvidence = Join-Path $root 'evidence\CL04_START_BINDING.json'
$temporaryImage = Join-Path $root 'exits\CL03_USED_EXIT.tmp.png'

$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cl03 = $plan.shots | Where-Object id -eq 'CL03' | Select-Object -First 1
$cl04 = $plan.shots | Where-Object id -eq 'CL04' | Select-Object -First 1
if ($cl03.keep_seconds -ne 9 -or $cl03.video_asset -ne 'clips/CL03.mp4' -or
    $cl04.start_binding.kind -ne 'PREVIOUS_USED_EXIT' -or
    $cl04.start_binding.source_clip -ne 'CL03' -or
    $cl04.start_asset -ne 'assets/CL04_START.png' -or $plan.editor_fps -ne 30) {
    throw 'CL03/CL04 timing or binding differs from the locked plan.'
}

$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $sourceVideo -PathType Leaf)) {
    if ($Check) { Write-Output "WAITING: create $sourceVideo first"; return }
    throw "CL03 video is missing: $sourceVideo"
}

$lastEditorTime = [double]$cl03.keep_seconds - 1.0 / [double]$plan.editor_fps
$probeJson = (& $ffprobe -v error -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time -of json $sourceVideo) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'ffprobe failed to read CL03.mp4' }
$frames = ($probeJson | ConvertFrom-Json).frames
$selectedIndex = -1
$selectedSeconds = -1.0
for ($index = 0; $index -lt $frames.Count; $index++) {
    $seconds = 0.0
    if ([double]::TryParse([string]$frames[$index].best_effort_timestamp_time,
        [System.Globalization.NumberStyles]::Float,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$seconds) -and $seconds -le $lastEditorTime + 0.000001) {
        $selectedIndex = $index
        $selectedSeconds = $seconds
    }
}
if ($selectedIndex -lt 0 -or $selectedSeconds -lt [double]$cl03.keep_seconds - 0.25) {
    throw "No CL03 frame close to the $($lastEditorTime.ToString('F3')) second edit boundary."
}

$sourceHash = (Get-FileHash -LiteralPath $sourceVideo -Algorithm SHA256).Hash.ToLowerInvariant()
$outputPaths = @($exitImage, $exitEvidence, $startImage, $startEvidence)
$present = @($outputPaths | ForEach-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($present -contains $true) {
    if ($present -contains $false) { throw 'Partial CL03 exit / CL04 START outputs exist. Inspect them before retrying.' }
    $exitHash = (Get-FileHash -LiteralPath $exitImage -Algorithm SHA256).Hash.ToLowerInvariant()
    $startHash = (Get-FileHash -LiteralPath $startImage -Algorithm SHA256).Hash.ToLowerInvariant()
    $priorExit = Get-Content -LiteralPath $exitEvidence -Raw -Encoding UTF8 | ConvertFrom-Json
    $priorStart = Get-Content -LiteralPath $startEvidence -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($priorExit.source_sha256 -ne $sourceHash -or $priorExit.exit_sha256 -ne $exitHash -or
        $priorStart.source_exit_sha256 -ne $exitHash -or $priorStart.start_sha256 -ne $startHash -or
        $exitHash -ne $startHash) {
        throw 'Existing output or provenance does not match CL03.mp4. Preserve it and investigate.'
    }
    Write-Output "VERIFIED existing CL04 START: $startImage"
    return
}

Write-Output "CL03 frame #$selectedIndex at $($selectedSeconds.ToString('F6'))s; final 30 fps edit sample $($lastEditorTime.ToString('F6'))s"
Write-Output "CL04 START: $startImage"
if ($Check) { return }

if (Test-Path -LiteralPath $temporaryImage) { throw "Temporary file already exists: $temporaryImage" }
New-Item -ItemType Directory -Path (Split-Path -Parent $exitImage), (Split-Path -Parent $startImage), (Split-Path -Parent $exitEvidence) -Force | Out-Null
try {
    $filter = "select=eq(n\,$selectedIndex)"
    & $ffmpeg -hide_banner -loglevel error -n -i $sourceVideo -vf $filter -fps_mode vfr -frames:v 1 $temporaryImage
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporaryImage -PathType Leaf)) {
        throw 'ffmpeg frame extraction failed.'
    }
    $imageBytes = [System.IO.File]::ReadAllBytes($temporaryImage)
    $pngSignature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    $validSignature = $imageBytes.Length -ge 1000
    if ($validSignature) {
        for ($byteIndex = 0; $byteIndex -lt $pngSignature.Length; $byteIndex++) {
            if ($imageBytes[$byteIndex] -ne $pngSignature[$byteIndex]) { $validSignature = $false; break }
        }
    }
    if (-not $validSignature) {
        throw 'Extracted file is not a valid PNG.'
    }
    Move-Item -LiteralPath $temporaryImage -Destination $exitImage
    Copy-Item -LiteralPath $exitImage -Destination $startImage
    $exitHash = (Get-FileHash -LiteralPath $exitImage -Algorithm SHA256).Hash.ToLowerInvariant()
    $exitRecord = [ordered]@{
        project_id = $plan.project_id; clip_id = 'CL03'; source_path = 'clips/CL03.mp4'
        source_sha256 = $sourceHash; keep_seconds = 9; edit_fps = 30
        last_editor_frame_time_sec = $lastEditorTime
        selected_source_frame_index = $selectedIndex
        selected_source_frame_time_sec = $selectedSeconds
        exit_path = 'exits/CL03_USED_EXIT.png'; exit_sha256 = $exitHash
        status = 'EXTRACTED_UNREVIEWED'; canonical_approval = $false
    }
    $startRecord = [ordered]@{
        project_id = $plan.project_id; clip_id = 'CL04'; binding_kind = 'PREVIOUS_USED_EXIT'
        source_clip = 'CL03'; source_exit_path = 'exits/CL03_USED_EXIT.png'
        source_exit_sha256 = $exitHash; start_path = 'assets/CL04_START.png'
        start_sha256 = $exitHash; status = 'EXTRACTED_UNREVIEWED'; canonical_approval = $false
    }
    [System.IO.File]::WriteAllText($exitEvidence, ($exitRecord | ConvertTo-Json -Depth 4) + "`n", [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($startEvidence, ($startRecord | ConvertTo-Json -Depth 4) + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "EXTRACTED: $exitImage"
    Write-Output "CL04 START CANDIDATE: $startImage"
    Write-Output 'Review the image before using it to generate CL04.'
} finally {
    if (Test-Path -LiteralPath $temporaryImage) { Remove-Item -LiteralPath $temporaryImage }
}
