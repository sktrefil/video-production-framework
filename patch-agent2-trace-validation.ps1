$ErrorActionPreference = "Stop"

$path = "cli\vpf\src\agent2-runtime-adapter-service.ts"

if (-not (Test-Path $path)) {
  throw "File not found: $path. Run this script from D:\git\video-production-framework-migrated"
}

$backup = "$path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $path $backup -Force
Write-Host "Backup: $backup"

$text = Get-Content $path -Raw -Encoding UTF8

$startMarker = "function verifyResearchTrace("
$endMarker = "function parseStructuredJson"

$start = $text.IndexOf($startMarker)
if ($start -lt 0) {
  throw "Could not find verifyResearchTrace(). No changes made."
}

$end = $text.IndexOf($endMarker, $start)
if ($end -lt 0) {
  throw "Could not find parseStructuredJson() after verifyResearchTrace(). No changes made."
}

$newFunction = @'
function verifyResearchTrace(
  bundle: Agent2ResearchBundle,
  observedUrls: Iterable<string>,
  providerLabel: string
): void {
  const observed = new Set([...observedUrls].map(canonicalWebUrl));

  const sourceById = new Map(
    bundle.research_spec.sources.map(source => [source.source_id, source] as const)
  );

  const criticalRefs = new Set<string>();
  for (const fact of bundle.fact_check_spec.facts) {
    if (fact.classification === "VERIFIED_FACT" || fact.confidence === "HIGH") {
      for (const ref of fact.source_refs) criticalRefs.add(ref);
    }
  }

  // Codex CLI can record native web_search activity without exposing result URLs
  // in JSONL. The caller separately requires webSearchCount > 0.
  // When URL telemetry is unavailable, preserve structural/source validation
  // instead of treating the run as if no research occurred.
  if (observed.size === 0) {
    if (bundle.research_spec.sources.length === 0) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
        `${providerLabel} T010 produced no research sources.`
      );
    }

    for (const source of bundle.research_spec.sources) {
      if (!source.url) continue;

      let parsed: URL;
      try {
        parsed = new URL(source.url);
      } catch {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
          `${providerLabel} research source has an invalid URL: ${source.url}`
        );
      }

      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.hostname.endsWith(".invalid") ||
        parsed.hostname === "localhost"
      ) {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
          `${providerLabel} research source has an unacceptable URL: ${source.url}`
        );
      }
    }

    for (const ref of criticalRefs) {
      const source = sourceById.get(ref);
      if (!source?.url) {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
          `${providerLabel} critical source ${ref} has no source URL.`
        );
      }
    }

    return;
  }

  // Strict provenance mode when the Codex JSONL trace exposes URLs.
  for (const source of bundle.research_spec.sources) {
    if (!source.url) continue;
    if (!observed.has(canonicalWebUrl(source.url))) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
        `${providerLabel} research referenced a URL not observed in web-search trace: ${source.url}`
      );
    }
  }

  for (const ref of criticalRefs) {
    const source = sourceById.get(ref);
    if (!source?.url) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
        `${providerLabel} critical source ${ref} has no traceable URL.`
      );
    }
    if (!observed.has(canonicalWebUrl(source.url))) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
        `${providerLabel} critical source ${ref} was not observed in web-search trace: ${source.url}`
      );
    }
  }
}

'@

$patched = $text.Substring(0, $start) + $newFunction + $text.Substring($end)

Set-Content -Path $path -Value $patched -Encoding UTF8
Write-Host "Patched: $path"

Write-Host ""
Write-Host "Building @vpf/cli..."
npm.cmd run build --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. Restoring backup..."
  Copy-Item $backup $path -Force
  throw "Build failed; original source restored from $backup"
}

Write-Host ""
Write-Host "Running @vpf/cli tests..."
npm.cmd test --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Tests failed. Source file remains patched for inspection."
  throw "Tests failed. Review output before running agent2."
}

Write-Host ""
Write-Host "PATCH_OK: build and CLI tests passed."
Write-Host "Do NOT run pilot_longform_003. Continue with pilot_longform_004 only."
