param(
  [string]$ProjectId = "pilot_short_roman_ix",
  [int]$ApiPort = 4318,
  [int]$StudioPort = 3000
)

$ErrorActionPreference = "Stop"
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))

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

function Wait-ForApi([string]$Url, [int]$TimeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3
      if ($response.success -eq $true) { return $response }
    } catch {
      Start-Sleep -Milliseconds 500
      continue
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Editor API did not become ready: $Url"
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count -gt 0) { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Port $Port did not become ready within $TimeoutSeconds seconds."
}

Write-Host "Roman IX Studio clean launch" -ForegroundColor Cyan
Write-Host "Repository: $RepoRoot"
Write-Host "Project:    $ProjectId"

Stop-KnownListener $ApiPort "editor-studio-server\.mjs" "Editor API"
Stop-KnownListener $StudioPort "remotion.*studio|studio.*src[\\/]index\.ts" "Remotion Studio"

$apiCommand = "Set-Location -LiteralPath '$RepoRoot'; npm run studio-server --workspace @vpf/editor-app -- $ProjectId"
$studioCommand = "Set-Location -LiteralPath '$RepoRoot'; npm run editor:studio"

Write-Host "Starting Editor API on 127.0.0.1:$ApiPort..." -ForegroundColor Cyan
Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $apiCommand) | Out-Null

$apiBase = "http://127.0.0.1:$ApiPort"
$apiProjectUrl = "$apiBase/api/editor/project/$ProjectId"
$apiResponse = Wait-ForApi $apiProjectUrl
Write-Host "Editor API READY: status=$($apiResponse.status) path=$($apiResponse.path)" -ForegroundColor Green

Write-Host "Starting Remotion Studio on localhost:$StudioPort..." -ForegroundColor Cyan
Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $studioCommand) | Out-Null
Wait-ForPort $StudioPort

$encodedApi = [System.Uri]::EscapeDataString($apiBase)
$frames = [int]$apiResponse.project.project.durationInFrames
$studioUrl = "http://localhost:$StudioPort/GenericVideoEditor?vpfProject=$ProjectId&vpfEditorApi=$encodedApi&vpfFrames=$frames"

Write-Host "Studio READY" -ForegroundColor Green
Write-Host $studioUrl
Start-Process $studioUrl
