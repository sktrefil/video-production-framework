$ErrorActionPreference = "Stop"

$path = "cli\vpf\src\codex-process-runner.ts"

if (-not (Test-Path $path)) {
  throw "File not found: $path. Run this from D:\git\video-production-framework-migrated"
}

$backup = "$path.bak-trace-v4-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $path $backup -Force
Write-Host "Backup: $backup"

$text = Get-Content $path -Raw -Encoding UTF8

$startMarker = "function collectTraceEvidence(trace: string): {"
$endMarker = "export class CodexProcessRunner"

$start = $text.IndexOf($startMarker)
if ($start -lt 0) {
  throw "Could not find collectTraceEvidence(). No changes made."
}

$end = $text.IndexOf($endMarker, $start)
if ($end -lt 0) {
  throw "Could not find CodexProcessRunner after collectTraceEvidence(). No changes made."
}

$newFunction = @'
function collectTraceEvidence(trace: string): {
  webSearchCount: number;
  observedUrls: string[];
} {
  let webSearchCount = 0;
  const urls = new Set<string>();

  const addUrl = (candidate: unknown): void => {
    if (typeof candidate !== "string" || !/^https?:\/\//iu.test(candidate)) return;
    try {
      const url = new URL(candidate);
      url.hash = "";
      urls.add(url.toString());
    } catch {
      // Ignore malformed URLs surfaced in Codex web-search telemetry.
    }
  };

  const collectResultUrls = (input: unknown): void => {
    if (Array.isArray(input)) {
      input.forEach(collectResultUrls);
      return;
    }
    if (typeof input !== "object" || input === null) return;

    const object = input as Record<string, unknown>;

    // Only accept URL-shaped response/result fields as provenance.
    // Do NOT treat query/queries strings as observed source URLs:
    // Codex 0.155.x may echo a URL supplied as the search query while
    // omitting the actual result/open-page URL telemetry.
    for (const key of ["url", "link", "href"]) {
      addUrl(object[key]);
    }

    for (const [key, value] of Object.entries(object)) {
      if (key === "query" || key === "queries") continue;
      collectResultUrls(value);
    }
  };

  for (const line of trace.split(/\r?\n/u)) {
    if (!line.trim()) continue;

    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      continue;
    }

    const visit = (input: unknown): void => {
      if (Array.isArray(input)) {
        input.forEach(visit);
        return;
      }
      if (typeof input !== "object" || input === null) return;

      const object = input as Record<string, unknown>;
      const type = typeof object.type === "string" ? object.type : "";

      if (type === "web_search" || type === "web_search_call") {
        webSearchCount += 1;
        collectResultUrls(object);
        return;
      }

      for (const nested of Object.values(object)) visit(nested);
    };

    visit(value);
  }

  return {
    webSearchCount,
    observedUrls: [...urls].sort()
  };
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
  throw "Build failed; original restored from $backup"
}

Write-Host ""
Write-Host "Running @vpf/cli tests..."
npm.cmd test --workspace @vpf/cli
if ($LASTEXITCODE -ne 0) {
  Write-Host "Tests failed. Restoring backup and rebuilding original..."
  Copy-Item $backup $path -Force
  npm.cmd run build --workspace @vpf/cli | Out-Host
  throw "Tests failed; original source restored from $backup"
}

Write-Host ""
Write-Host "PATCH_OK: Codex trace provenance parser patched; build and CLI tests passed."
Write-Host "Query URLs are no longer treated as observed source URLs."
