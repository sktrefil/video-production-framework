$ErrorActionPreference = "Stop"

$path = "cli\vpf\src\agent2-runtime-adapter-service.ts"

if (-not (Test-Path $path)) {
  throw "File not found: $path. Run this from D:\git\video-production-framework-migrated"
}

$backup = "$path.bak-topic-v5-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $path $backup -Force
Write-Host "Backup: $backup"

$text = Get-Content $path -Raw -Encoding UTF8

$oldOpenAi = '    const bundle = normalizeResearchBundle(parseStructuredJson<Agent2ResearchBundle>(response));'
$newOpenAi = @'
    const generatedBundle = parseStructuredJson<Agent2ResearchBundle>(response);
    const bundle = normalizeResearchBundle({
      ...generatedBundle,
      research_spec: {
        ...generatedBundle.research_spec,
        project_id: input.projectId,
        topic: input.topic
      },
      fact_check_spec: {
        ...generatedBundle.fact_check_spec,
        project_id: input.projectId
      }
    });
'@

if (-not $text.Contains($oldOpenAi)) {
  throw "OpenAI research normalization call was not found. No changes made."
}
$text = $text.Replace($oldOpenAi, $newOpenAi)

$oldCodex = '            const bundle = normalizeResearchBundle(generated.output);'
$newCodex = @'
            const bundle = normalizeResearchBundle({
              ...generated.output,
              research_spec: {
                ...generated.output.research_spec,
                project_id: projectId,
                topic
              },
              fact_check_spec: {
                ...generated.output.fact_check_spec,
                project_id: projectId
              }
            });
'@

if (-not $text.Contains($oldCodex)) {
  throw "Codex research normalization call was not found. No changes made."
}
$text = $text.Replace($oldCodex, $newCodex)

Set-Content -Path $path -Value $text -Encoding UTF8
Write-Host "Patched canonical runtime metadata in: $path"

Write-Host ""
Write-Host "Build @vpf/cli..."
npm.cmd run build --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. Restoring backup..."
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Build failed; original source restored from $backup"
}

Write-Host ""
Write-Host "Run @vpf/cli tests..."
npm.cmd test --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Tests failed. Restoring backup..."
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Tests failed; original source restored from $backup"
}

Write-Host ""
Write-Host "PATCH_OK: canonical Project Spec identity is injected only in AI runtime paths."
Write-Host "Direct/manual payload validation remains unchanged, so RESEARCH_TOPIC_MISMATCH protection is preserved."
Write-Host "Build and CLI tests passed."
