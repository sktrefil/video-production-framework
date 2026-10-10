param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^CL\d{2}$')]
    [string]$Clip,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\output\db-cooper-v3\storyboard-lock-v1'
$plan = Get-Content -LiteralPath (Join-Path $root 'chain-plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$shot = $plan.shots | Where-Object id -eq $Clip | Select-Object -First 1
$next = $plan.shots | Where-Object ordinal -eq ($shot.ordinal + 1) | Select-Object -First 1
if (-not $shot -or -not $next -or $next.start_binding.kind -ne 'PREVIOUS_USED_EXIT' -or
    $next.start_binding.source_clip -ne $Clip -or $plan.editor_fps -ne 30) {
    throw "$Clip does not have a following shot bound to its actual used exit."
}
if ($shot.keep_seconds -le 0 -or $shot.keep_seconds -gt $shot.source_seconds) {
    throw "Invalid used duration for $Clip."
}

$video = Join-Path $root "clips\$Clip.mp4"
$exit = Join-Path $root "exits\${Clip}_USED_EXIT.png"
$exitEvidence = Join-Path $root "evidence\${Clip}_USED_EXIT.json"
$start = Join-Path $root $next.start_asset.Replace('/', '\')
$startEvidence = Join-Path $root "evidence\$($next.id)_START_BINDING.json"
$temporary = Join-Path $root "exits\${Clip}_USED_EXIT.tmp.png"
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $video -PathType Leaf)) {
    if ($Check) { Write-Output "WAITING: create $video first"; return }
    throw "Source video is missing: $video"
}

# The edit keeps [0, keep_seconds). Its last sample at 30 fps is keep_seconds - 1/30.
$lastEditorTime = [double]$shot.keep_seconds - 1.0 / [double]$plan.editor_fps
$probeJson = (& $ffprobe -v error -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time -of json $video) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "ffprobe failed to read $video" }
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
if ($selectedIndex -lt 0 -or $selectedSeconds -lt [double]$shot.keep_seconds - 0.25) {
    throw "No source frame near the $($lastEditorTime.ToString('F3'))s edit boundary."
}

$videoHash = (Get-FileHash -LiteralPath $video -Algorithm SHA256).Hash.ToLowerInvariant()
$outputPaths = @($exit, $exitEvidence, $start, $startEvidence)
$present = @($outputPaths | ForEach-Object { Test-Path -LiteralPath $_ -PathType Leaf })
if ($present -contains $true) {
    if ($present -contains $false) { throw "Partial $Clip exit / $($next.id) START output exists. Inspect it before retrying." }
    $exitHash = (Get-FileHash -LiteralPath $exit -Algorithm SHA256).Hash.ToLowerInvariant()
    $startHash = (Get-FileHash -LiteralPath $start -Algorithm SHA256).Hash.ToLowerInvariant()
    $priorExit = Get-Content -LiteralPath $exitEvidence -Raw -Encoding UTF8 | ConvertFrom-Json
    $priorStart = Get-Content -LiteralPath $startEvidence -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($priorExit.source_sha256 -ne $videoHash -or $priorExit.exit_sha256 -ne $exitHash -or
        $priorStart.source_exit_sha256 -ne $exitHash -or $priorStart.start_sha256 -ne $startHash -or
        $priorExit.selected_source_frame_index -ne $selectedIndex -or $exitHash -ne $startHash) {
        throw 'Existing output or provenance does not match this video. Preserve it and investigate.'
    }
    Write-Output "VERIFIED existing $($next.id) START: $start"
    return
}

Write-Output "$Clip frame #$selectedIndex at $($selectedSeconds.ToString('F6'))s; last 30 fps edit sample $($lastEditorTime.ToString('F6'))s"
Write-Output "$($next.id) START: $start"
if ($Check) { return }

if (Test-Path -LiteralPath $temporary) { throw "Temporary image already exists: $temporary" }
New-Item -ItemType Directory -Path (Split-Path -Parent $exit), (Split-Path -Parent $start), (Split-Path -Parent $exitEvidence) -Force | Out-Null
try {
    $filter = "select=eq(n\,$selectedIndex)"
    & $ffmpeg -hide_banner -loglevel error -n -i $video -vf $filter -fps_mode vfr -frames:v 1 $temporary
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporary -PathType Leaf)) {
        throw 'ffmpeg frame extraction failed.'
    }
    $imageBytes = [System.IO.File]::ReadAllBytes($temporary)
    $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    $validPng = $imageBytes.Length -ge 1000
    if ($validPng) {
        for ($byteIndex = 0; $byteIndex -lt $signature.Length; $byteIndex++) {
            if ($imageBytes[$byteIndex] -ne $signature[$byteIndex]) { $validPng = $false; break }
        }
    }
    if (-not $validPng) { throw 'Extracted frame is not a valid PNG.' }
    Move-Item -LiteralPath $temporary -Destination $exit
    Copy-Item -LiteralPath $exit -Destination $start
    $exitHash = (Get-FileHash -LiteralPath $exit -Algorithm SHA256).Hash.ToLowerInvariant()
    $exitRecord = [ordered]@{
        project_id = $plan.project_id; clip_id = $Clip; source_path = $shot.video_asset
        source_sha256 = $videoHash; keep_seconds = $shot.keep_seconds; edit_fps = $plan.editor_fps
        last_editor_frame_time_sec = $lastEditorTime
        selected_source_frame_index = $selectedIndex; selected_source_frame_time_sec = $selectedSeconds
        exit_path = "exits/${Clip}_USED_EXIT.png"; exit_sha256 = $exitHash
        status = 'EXTRACTED_UNREVIEWED'; canonical_approval = $false
    }
    $startRecord = [ordered]@{
        project_id = $plan.project_id; clip_id = $next.id; binding_kind = 'PREVIOUS_USED_EXIT'
        source_clip = $Clip; source_exit_path = "exits/${Clip}_USED_EXIT.png"
        source_exit_sha256 = $exitHash; start_path = $next.start_asset; start_sha256 = $exitHash
        status = 'EXTRACTED_UNREVIEWED'; canonical_approval = $false
    }
    [System.IO.File]::WriteAllText($exitEvidence, ($exitRecord | ConvertTo-Json -Depth 4) + "`n", [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($startEvidence, ($startRecord | ConvertTo-Json -Depth 4) + "`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "EXTRACTED: $exit"
    Write-Output "$($next.id) START CANDIDATE: $start"
    Write-Output 'Review the extracted frame visually before using it.'
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
}
