param(
  [string]$ProjectId = "pilot_short_roman_ix",
  [int]$ApiPort = 4318,
  [int]$StudioPort = 3000
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$RuntimeLogDir = Join-Path $RepoRoot "workspace\projects\$ProjectId\08_editor\studio_runtime"
$ApiStdout = Join-Path $RuntimeLogDir "api.stdout.log"
$ApiStderr = Join-Path $RuntimeLogDir "api.stderr.log"
$StudioStdout = Join-Path $RuntimeLogDir "studio.stdout.log"
$StudioStderr = Join-Path $RuntimeLogDir "studio.stderr.log"

function Get-ListeningProcesses([int]$Port) {
  $connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  $seen = @{}
  foreach ($connection in $connections) {
    $ownerId = [int]$connection.OwningProcess
    if ($seen.ContainsKey($ownerId)) { continue }
    $seen[$ownerId] = $true
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction SilentlyContinue
    if ($null -ne $process) { $process }
  }
}

function Stop-KnownListener([int]$Port, [string]$AllowedPattern, [string]$Label) {
  $processes = @(Get-ListeningProcesses $Port)
  foreach ($process in $processes) {
    $commandLine = [string]$process.CommandLine
    if ($commandLine -notmatch $AllowedPattern) {
      throw "$Label port $Port is occupied by an unrelated process. PID=$($process.ProcessId) Name=$($process.Name) CommandLine=$commandLine"
    }
    Write-Host "Stopping stale $Label listener on port $Port (PID $($process.ProcessId))..." -ForegroundColor Yellow
    Stop-Process -Id $process.ProcessId -Force
  }

  $deadline = (Get-Date).AddSeconds(10)
  do {
    if (@(Get-ListeningProcesses $Port).Count -eq 0) { return }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  throw "$Label port $Port did not become free after stopping the stale process."
}

function Read-LogTail([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { return "<no log>" }
  return ((Get-Content -LiteralPath $Path -Tail 80 -ErrorAction SilentlyContinue) -join [Environment]::NewLine)
}

function Throw-ProcessFailure(
  [System.Diagnostics.Process]$Process,
  [string]$Label,
  [string]$StdoutPath,
  [string]$StderrPath
) {
  $Process.Refresh()
  if (!$Process.HasExited) { return }
  $stdout = Read-LogTail $StdoutPath
  $stderr = Read-LogTail $StderrPath
  throw "$Label exited before becoming ready. ExitCode=$($Process.ExitCode)`n--- STDOUT ---`n$stdout`n--- STDERR ---`n$stderr"
}

function Wait-ForApi(
  [string]$Url,
  [System.Diagnostics.Process]$Process,
  [string]$StdoutPath,
  [string]$StderrPath,
  [int]$TimeoutSeconds = 45
) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Throw-ProcessFailure $Process "Editor API" $StdoutPath $StderrPath
    try {
      $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3
      if ($response.success -eq $true) { return $response }
    } catch {
      # Keep polling while the child process is alive.
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  $stdout = Read-LogTail $StdoutPath
  $stderr = Read-LogTail $StderrPath
  throw "Editor API did not become ready: $Url`n--- STDOUT ---`n$stdout`n--- STDERR ---`n$stderr"
}

function Wait-ForStudio(
  [int]$Port,
  [System.Diagnostics.Process]$Process,
  [string]$StdoutPath,
  [string]$StderrPath,
  [int]$TimeoutSeconds = 90
) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Throw-ProcessFailure $Process "Remotion Studio" $StdoutPath $StderrPath
    if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count -gt 0) { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  $stdout = Read-LogTail $StdoutPath
  $stderr = Read-LogTail $StderrPath
  throw "Remotion Studio did not become ready on port $Port.`n--- STDOUT ---`n$stdout`n--- STDERR ---`n$stderr"
}

Write-Host "Roman IX Studio clean launch" -ForegroundColor Cyan
Write-Host "Repository: $RepoRoot"
Write-Host "Project:    $ProjectId"

if (!(Test-Path -LiteralPath (Join-Path $RepoRoot "package.json"))) {
  throw "Repository root is invalid: $RepoRoot"
}
if (!(Test-Path -LiteralPath (Join-Path $RepoRoot "workspace\projects\$ProjectId\project.db"))) {
  throw "project.db is missing for $ProjectId"
}

$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$npmCmd = $npmCommand.Source
if ([string]::IsNullOrWhiteSpace($npmCmd)) { $npmCmd = $npmCommand.Path }
if ([string]::IsNullOrWhiteSpace($npmCmd)) { throw "npm.cmd could not be resolved." }

New-Item -ItemType Directory -Force -Path $RuntimeLogDir | Out-Null
foreach ($log in @($ApiStdout,$ApiStderr,$StudioStdout,$StudioStderr)) {
  Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
}

Stop-KnownListener $ApiPort "editor-studio-server\.mjs" "Editor API"
Stop-KnownListener $StudioPort "remotion.*studio|studio.*src[\\/]index\.ts|@remotion[\\/]cli" "Remotion Studio"

Write-Host "Starting Editor API on 127.0.0.1:$ApiPort..." -ForegroundColor Cyan
$apiProcess = Start-Process -FilePath $npmCmd `
  -ArgumentList @("run","studio-server","--workspace","@vpf/editor-app","--",$ProjectId,"--port",[string]$ApiPort) `
  -WorkingDirectory $RepoRoot `
  -RedirectStandardOutput $ApiStdout `
  -RedirectStandardError $ApiStderr `
  -WindowStyle Hidden `
  -PassThru

$apiBase = "http://127.0.0.1:$ApiPort"
$apiProjectUrl = "$apiBase/api/editor/project/$ProjectId"
$apiResponse = Wait-ForApi $apiProjectUrl $apiProcess $ApiStdout $ApiStderr
Write-Host "Editor API READY: PID=$($apiProcess.Id) status=$($apiResponse.status)" -ForegroundColor Green

Write-Host "Starting Remotion Studio on localhost:$StudioPort..." -ForegroundColor Cyan
$studioProcess = Start-Process -FilePath $npmCmd `
  -ArgumentList @("run","studio","--workspace","@vpf/editor-app","--","--port=$StudioPort") `
  -WorkingDirectory $RepoRoot `
  -RedirectStandardOutput $StudioStdout `
  -RedirectStandardError $StudioStderr `
  -WindowStyle Hidden `
  -PassThru
Wait-ForStudio $StudioPort $studioProcess $StudioStdout $StudioStderr

$encodedApi = [System.Uri]::EscapeDataString($apiBase)
$frames = [int]$apiResponse.project.project.durationInFrames
$studioUrl = "http://localhost:$StudioPort/GenericVideoEditor?vpfProject=$ProjectId&vpfEditorApi=$encodedApi&vpfFrames=$frames"

Write-Host "Studio READY: PID=$($studioProcess.Id) frames=$frames" -ForegroundColor Green
Write-Host "API log:    $ApiStdout"
Write-Host "Studio log: $StudioStdout"
Write-Host $studioUrl
Start-Process $studioUrl
