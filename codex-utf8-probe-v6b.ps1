$ErrorActionPreference = "Stop"

$probePath = Join-Path (Get-Location) "codex-utf8-probe.json"
$probeOut  = Join-Path (Get-Location) "codex-utf8-probe-output.jsonl"

$probeObject = @{
  topic    = "네안데르탈인은 왜 사라졌나 — 멸종이었는가, 현생인류와 섞였는가"
  sentinel = "표본비율 2.4–3.8%"
}

# Write UTF-8 with BOM.
$probeJson = $probeObject | ConvertTo-Json -Compress
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($probePath, $probeJson, $utf8Bom)

# IMPORTANT:
# Keep the prompt free of cmd.exe metacharacters such as |, >, <, &, and embedded quotes.
$prompt = "Read codex-utf8-probe.json using UTF-8. Reply with exactly the sentinel field value, then SPACE SLASH SPACE, then the topic field value. Do not add any other text."

Write-Host "Running corrected standalone Codex UTF-8 probe..."

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
$expectedTopic = "네안데르탈인은 왜 사라졌나 — 멸종이었는가, 현생인류와 섞였는가"
$expectedSentinel = "표본비율 2.4–3.8%"

$hasTopic = $probeText.Contains($expectedTopic)
$hasSentinel = $probeText.Contains($expectedSentinel)

Write-Host ""
if (-not ($hasTopic -and $hasSentinel)) {
  Write-Host "UTF8_PROBE_FAILED"
  Write-Host "Probe output saved to: $probeOut"
  throw "Codex did not round-trip Korean and quantitative punctuation exactly. Do not run Agent2 yet."
}

Write-Host "UTF8_PROBE_OK"
Write-Host "No workflow attempt was consumed."
Write-Host "Next command:"
Write-Host "npm.cmd run vpf -- workflow status pilot_longform_005"
