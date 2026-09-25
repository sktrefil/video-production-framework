$ErrorActionPreference = "Stop"

$path = "cli\vpf\src\codex-process-runner.ts"

if (-not (Test-Path $path)) {
  throw "File not found: $path. Run this from D:\git\video-production-framework-migrated"
}

$backup = "$path.bak-utf8-v6-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $path $backup -Force
Write-Host "Backup: $backup"

$text = Get-Content $path -Raw -Encoding UTF8

# Locate the variable that points to request.json.
$requestVarMatch = [regex]::Match(
  $text,
  '(?ms)(?:const|let)\s+(?<var>[A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*[^;]*?["'']request\.json["''][^;]*?;'
)

if (-not $requestVarMatch.Success) {
  Write-Host "Could not locate request.json path variable. Relevant source context:"
  Select-String -Path $path -Pattern 'request\.json|writeFile' -Context 4,8 | Out-Host
  throw "Patch aborted safely: request.json path variable not found."
}

$requestVar = $requestVarMatch.Groups["var"].Value
Write-Host "request.json path variable: $requestVar"

# Find the writeFile(requestVar, JSON.stringify(...), "utf8") call.
$escapedVar = [regex]::Escape($requestVar)
$writePattern = '(?ms)writeFile\(\s*' + $escapedVar + '\s*,\s*(?<payload>JSON\.stringify\([\s\S]*?\))\s*,\s*["'']utf8["'']\s*\)'

$writeMatch = [regex]::Match($text, $writePattern)

if (-not $writeMatch.Success) {
  Write-Host "Could not locate UTF-8 request write call. Relevant source context:"
  Select-String -Path $path -Pattern ([regex]::Escape($requestVar) + '|writeFile') -Context 4,10 | Out-Host
  throw "Patch aborted safely: request write call not found."
}

$payload = $writeMatch.Groups["payload"].Value

if ($payload -match 'FEFF') {
  Write-Host "request.json already appears to include a UTF-8 BOM; no source rewrite needed."
} else {
  $replacement = 'writeFile(' + $requestVar + ', "\uFEFF" + ' + $payload + ', "utf8")'
  $patched = $text.Substring(0, $writeMatch.Index) + $replacement + $text.Substring($writeMatch.Index + $writeMatch.Length)
  Set-Content -Path $path -Value $patched -Encoding UTF8
  Write-Host "Patched request.json writer to prepend UTF-8 BOM."
}

Write-Host ""
Write-Host "Building @vpf/cli..."
npm.cmd run build --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. Restoring backup..."
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Build failed; source restored from $backup"
}

Write-Host ""
Write-Host "Running @vpf/cli tests..."
npm.cmd test --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Tests failed. Restoring backup..."
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Tests failed; source restored from $backup"
}

Write-Host ""
Write-Host "Running standalone Codex UTF-8 probe..."

$probePath = Join-Path (Get-Location) "codex-utf8-probe.json"
$probeOut = Join-Path (Get-Location) "codex-utf8-probe-output.jsonl"

$probeObject = @{
  topic = "네안데르탈인은 왜 사라졌나 — 멸종이었는가, 현생인류와 섞였는가"
  sentinel = "표본비율 2.4–3.8%"
}
$probeJson = $probeObject | ConvertTo-Json -Compress

# UTF-8 with BOM, written without relying on .NET method invocation from Codex.
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($probePath, $probeJson, $utf8Bom)

$prompt = 'Read codex-utf8-probe.json. If you use PowerShell, use Get-Content -Raw -Encoding UTF8 and do not use System.IO.File methods. Reply with exactly one line containing the sentinel value, then " | ", then the topic value. Do not add any other text.'

& codex.cmd exec `
  --json `
  --ephemeral `
  --skip-git-repo-check `
  --sandbox read-only `
  --cd (Get-Location).Path `
  $prompt | Tee-Object $probeOut | Out-Host

if ($LASTEXITCODE -ne 0) {
  throw "Codex UTF-8 probe process failed. Workflow was not touched."
}

$probeText = Get-Content $probeOut -Raw -Encoding UTF8
$hasTopic = $probeText.Contains("네안데르탈인은 왜 사라졌나 — 멸종이었는가, 현생인류와 섞였는가")
$hasSentinel = $probeText.Contains("표본비율 2.4–3.8%")

Write-Host ""
if (-not ($hasTopic -and $hasSentinel)) {
  Write-Host "UTF8_PROBE_FAILED"
  Write-Host "Probe output: $probeOut"
  throw "Codex did not round-trip Korean and quantitative punctuation exactly. Do not spend another T010 attempt yet."
}

Write-Host "UTF8_PROBE_OK"
Write-Host "PATCH_OK: request.json is BOM-marked UTF-8; build/tests passed; standalone Codex Korean/percentage round-trip passed."
Write-Host "Next: inspect workflow status before retrying T010."
