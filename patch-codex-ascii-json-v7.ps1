$ErrorActionPreference = "Stop"

$path = "cli\vpf\src\codex-process-runner.ts"

if (-not (Test-Path $path)) {
  throw "File not found: $path. Run this from D:\git\video-production-framework-migrated"
}

$backup = "$path.bak-ascii-json-v7-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $path $backup -Force
Write-Host "Backup: $backup"

$text = Get-Content $path -Raw -Encoding UTF8

# Add an ASCII-safe JSON serializer once.
if ($text -notmatch 'function stringifyAsciiSafeJson\(') {
  $marker = "function collectTraceEvidence(trace: string): {"
  $idx = $text.IndexOf($marker)
  if ($idx -lt 0) {
    throw "Could not find collectTraceEvidence() insertion point. No changes made."
  }

  $helper = @'
function stringifyAsciiSafeJson(value: unknown): string {
  const json = JSON.stringify(value);
  return json.replace(/[\u0080-\uFFFF]/g, character =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

'@

  $text = $text.Substring(0, $idx) + $helper + $text.Substring($idx)
}

# Find request.json path variable.
$requestVarMatch = [regex]::Match(
  $text,
  '(?ms)(?:const|let)\s+(?<var>[A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*[^;]*?["'']request\.json["''][^;]*?;'
)

if (-not $requestVarMatch.Success) {
  Select-String -Path $path -Pattern 'request\.json|writeFile' -Context 4,8 | Out-Host
  throw "Could not locate request.json path variable."
}

$requestVar = $requestVarMatch.Groups["var"].Value
$escapedVar = [regex]::Escape($requestVar)

# Normalize either the original writer or the prior BOM writer.
$patterns = @(
  '(?ms)writeFile\(\s*' + $escapedVar + '\s*,\s*"\\uFEFF"\s*\+\s*JSON\.stringify\((?<arg>.*?)\)\s*,\s*["'']utf8["'']\s*\)',
  '(?ms)writeFile\(\s*' + $escapedVar + '\s*,\s*JSON\.stringify\((?<arg>.*?)\)\s*,\s*["'']utf8["'']\s*\)'
)

$replaced = $false
foreach ($pattern in $patterns) {
  $m = [regex]::Match($text, $pattern)
  if ($m.Success) {
    $arg = $m.Groups["arg"].Value
    $replacement = 'writeFile(' + $requestVar + ', stringifyAsciiSafeJson(' + $arg + '), "utf8")'
    $text = $text.Substring(0, $m.Index) + $replacement + $text.Substring($m.Index + $m.Length)
    $replaced = $true
    break
  }
}

if (-not $replaced) {
  if ($text -match ('writeFile\(\s*' + $escapedVar + '\s*,\s*stringifyAsciiSafeJson\(')) {
    Write-Host "request.json writer is already ASCII-safe."
  } else {
    Select-String -Path $path -Pattern ([regex]::Escape($requestVar) + '|writeFile') -Context 4,10 | Out-Host
    throw "Could not safely rewrite request.json writer."
  }
}

Set-Content -Path $path -Value $text -Encoding UTF8
Write-Host "Patched request.json to ASCII-safe JSON."

Write-Host ""
Write-Host "Building @vpf/cli..."
npm.cmd run build --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Build failed; source restored from $backup"
}

Write-Host ""
Write-Host "Running @vpf/cli tests..."
npm.cmd test --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Tests failed; source restored from $backup"
}

Write-Host ""
Write-Host "Writing ASCII-only UTF-8 probe..."
$probePath = Join-Path (Get-Location) "codex-ascii-json-probe.json"

# This file contains only ASCII bytes. Korean and punctuation are JSON \u escapes.
$probeAscii = @'
{"topic":"\ub124\uc548\ub370\ub974\ud0c8\uc778\uc740 \uc65c \uc0ac\ub77c\uc84c\ub098 \u2014 \uba78\uc885\uc774\uc5c8\ub294\uac00, \ud604\uc0dd\uc778\ub958\uc640 \uc11e\uc600\ub294\uac00","sentinel":"\ud45c\ubcf8\ube44\uc728 2.4\u20133.8%"}
'@

Set-Content -Path $probePath -Value $probeAscii -Encoding Ascii

$bytes = [System.IO.File]::ReadAllBytes($probePath)
$nonAscii = @($bytes | Where-Object { $_ -gt 127 }).Count
if ($nonAscii -ne 0) {
  throw "Probe file unexpectedly contains non-ASCII bytes."
}

Write-Host "ASCII_PROBE_FILE_OK: all request bytes are <= 0x7F."
Write-Host ""
Write-Host "Running Codex ASCII-safe JSON probe..."

$probeOut = Join-Path (Get-Location) "codex-ascii-json-probe-output.jsonl"
$prompt = "Read codex-ascii-json-probe.json as JSON. Decode JSON unicode escapes normally. Reply exactly with the sentinel field value followed by SPACE SLASH SPACE followed by the topic field value. Do not add anything else."

# Keep prompt ASCII-only to avoid cmd.exe/PowerShell transcoding.
& codex.cmd exec `
  --json `
  --ephemeral `
  --skip-git-repo-check `
  --sandbox read-only `
  --cd (Get-Location).Path `
  $prompt | Tee-Object $probeOut | Out-Host

if ($LASTEXITCODE -ne 0) {
  throw "Codex ASCII-safe JSON probe process failed. Workflow was not touched."
}

Write-Host ""
Write-Host "PATCH_OK: request.json is now ASCII-safe JSON; build/tests passed."
Write-Host "The probe request itself cannot mojibake through Windows code pages."
Write-Host "Do NOT rerun Agent2 yet; inspect the probe agent_message and workflow state first."
