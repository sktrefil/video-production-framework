$ErrorActionPreference = "Stop"

$path = "cli\vpf\src\agent2-runtime-adapter-service.ts"

if (-not (Test-Path $path)) {
  throw "File not found: $path. Run this from the repository root."
}

$backup = "$path.bak-fix3-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $path $backup -Force
Write-Host "Backup: $backup"

$text = Get-Content $path -Raw -Encoding UTF8

# Make the 4th argument optional so existing OpenAI calls with 3 args remain valid.
$oldSig = @'
function verifyResearchTrace(
  bundle: Agent2ResearchBundle,
  observedUrls: Iterable<string>,
  providerLabel: string,
  webSearchCount: number
): void {
'@

$newSig = @'
function verifyResearchTrace(
  bundle: Agent2ResearchBundle,
  observedUrls: Iterable<string>,
  providerLabel: string,
  webSearchCount?: number
): void {
'@

if (-not $text.Contains($oldSig)) {
  throw "Expected verifyResearchTrace signature not found. No changes made."
}
$text = $text.Replace($oldSig, $newSig)

# Only enforce native web_search count when the caller provides it (Codex path).
$oldCheck = @'
  if (webSearchCount <= 0) {
    throw new Agent2RuntimeAdapterError(
      "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
      `${providerLabel} T010 completed without a recorded native web_search event.`
    );
  }
'@

$newCheck = @'
  if (webSearchCount !== undefined && webSearchCount <= 0) {
    throw new Agent2RuntimeAdapterError(
      "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
      `${providerLabel} T010 completed without a recorded native web_search event.`
    );
  }
'@

if (-not $text.Contains($oldCheck)) {
  throw "Expected webSearchCount check not found. No changes made."
}
$text = $text.Replace($oldCheck, $newCheck)

Set-Content -Path $path -Value $text -Encoding UTF8
Write-Host "Patched: $path"

Write-Host ""
Write-Host "Building @vpf/cli..."
npm.cmd run build --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. Restoring backup..."
  Copy-Item $backup $path -Force
  throw "Build failed; original restored from $backup"
}

Write-Host ""
Write-Host "Running @vpf/cli tests..."
npm.cmd test --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Tests failed. Keeping patched source for inspection."
  Write-Host "Backup remains at: $backup"
  throw "Tests failed."
}

Write-Host ""
Write-Host "PATCH_OK: build and CLI tests passed."
Write-Host "Codex path uses webSearchCount; OpenAI path remains compatible with 3 arguments."
