param(
  [string]$Project = "pilot_short_roman_ix",
  [switch]$SkipBuild,
  [switch]$ResetPreVdg,
  [switch]$ContinueAll
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($ResetPreVdg -and $ContinueAll) {
  throw "-ResetPreVdg and -ContinueAll cannot be used together. Reset first, review the new cut_001, then use -ContinueAll in a later run."
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
Set-Location $repoRoot

$projectRoot = Join-Path $repoRoot "workspace\projects\$Project"
$projectDb = Join-Path $projectRoot "project.db"
$planFile = Join-Path $projectRoot "05_images\scene-assets.json"
$productionPlanFile = Join-Path $projectRoot "05_images\scene-assets.production-ready.json"
$cli = Join-Path $repoRoot "cli\vpf\dist\main.js"
$defaultAdapter = Join-Path $repoRoot "runtimes\image\adapters\chatgpt-browser-adapter.mjs"

if (-not (Test-Path $projectDb)) {
  throw "Project database not found: $projectDb"
}
if (-not (Test-Path $planFile)) {
  throw "WF-09 Scene Asset plan not found: $planFile"
}
if (-not (Test-Path $defaultAdapter)) {
  throw "ChatGPT Browser adapter not found: $defaultAdapter"
}

function Invoke-RepositoryBuild {
  Write-Host "Building PILOT-VDG-01 CLI and repository workspaces..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }
}

function Test-PilotCli {
  if (-not (Test-Path $cli)) {
    return $false
  }
  $helpRaw = & node $cli --help 2>&1
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  $helpText = ($helpRaw -join [Environment]::NewLine)
  return (
    $helpText.Contains("vpf asset auto prepare") -and
    $helpText.Contains("vpf asset auto reset-pre-vdg")
  )
}

if (-not $SkipBuild) {
  Invoke-RepositoryBuild
} elseif (-not (Test-PilotCli)) {
  Write-Host "PILOT-VDG-01 CLI build is missing or stale; rebuilding automatically."
  Invoke-RepositoryBuild
}

if (-not (Test-PilotCli)) {
  throw "Compiled CLI does not contain PILOT-VDG-01 AUTO prepare/reset support: $cli"
}

function Invoke-VpfJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $raw = & node $cli @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "VPF command failed: vpf $($Arguments -join ' ')`n$($raw -join [Environment]::NewLine)"
  }
  $text = ($raw -join [Environment]::NewLine).Trim()
  if (-not $text) {
    throw "VPF command returned no JSON: vpf $($Arguments -join ' ')"
  }
  return $text | ConvertFrom-Json
}

function Assert-CanonicalPins {
  param([Parameter(Mandatory = $true)]$Status)

  if ($Status.channelProfileVersion -ne "1.3.0") {
    throw "Expected HISTORY_MYSTERY_V1@1.3.0; found $($Status.channelProfileVersion)."
  }
  if ($Status.imageProviderProfileVersion -ne "1.1.0") {
    throw "Expected IMAGE_PROVIDER_EXECUTION_V1@1.1.0; found $($Status.imageProviderProfileVersion)."
  }
  if ($Status.visualDirection.visualBibleVersion -ne "1.1.0") {
    throw "Expected HISTORY_MYSTERY_VISUAL_BIBLE@1.1.0; found $($Status.visualDirection.visualBibleVersion)."
  }
  if ($Status.visualDirection.grammarId -ne "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1" -or
      $Status.visualDirection.grammarVersion -ne "1.0.0") {
    throw "Visual Direction Grammar V1 is not active."
  }
}

function Assert-ProductionPlan {
  if (-not (Test-Path $productionPlanFile)) {
    throw "Production-ready Scene Asset plan not found: $productionPlanFile"
  }
  $plan = Get-Content -Raw -Encoding UTF8 $productionPlanFile | ConvertFrom-Json
  if ($plan.scenes.Count -ne 11) {
    throw "Expected 11 production-ready Roman IX scenes; found $($plan.scenes.Count)."
  }
  if ($plan.visualDirectionDerivation.grammarId -ne "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1" -or
      $plan.visualDirectionDerivation.grammarVersion -ne "1.0.0") {
    throw "Production-ready plan is not derived from Visual Direction Grammar V1."
  }
  foreach ($scene in $plan.scenes) {
    if (-not $scene.imageAssetDesign.composition.Contains("VISUAL DIRECTION:")) {
      throw "Scene $($scene.sceneId) composition is missing Visual Direction derivation."
    }
    if (-not $scene.imagePrompt.prompt.Contains("VISUAL DIRECTION:")) {
      throw "Scene $($scene.sceneId) IMAGE_PROMPT is missing Visual Direction derivation."
    }
    if (-not $scene.imagePrompt.prompt.Contains("restrained painterly matte surface")) {
      throw "Scene $($scene.sceneId) prompt is missing the VDG surface rule."
    }
    if (-not $scene.imageAssetDesign.composition.Contains("central 60-70%")) {
      throw "Scene $($scene.sceneId) is missing the SHORTFORM central information zone."
    }
  }
  return $plan
}

function Assert-BrowserEnvironment {
  if ([string]::IsNullOrWhiteSpace($env:VPF_IMAGE_ADAPTER_MODULE)) {
    $env:VPF_IMAGE_ADAPTER_MODULE = $defaultAdapter
  }
  if ([string]::IsNullOrWhiteSpace($env:CHATGPT_CDP_URL)) {
    $env:CHATGPT_CDP_URL = "http://127.0.0.1:9222"
  }
  if ([string]::IsNullOrWhiteSpace($env:CHATGPT_IMAGE_TIMEOUT_SECONDS)) {
    $env:CHATGPT_IMAGE_TIMEOUT_SECONDS = "180"
  }
  if ([string]::IsNullOrWhiteSpace($env:VPF_PYTHON_EXECUTABLE)) {
    $env:VPF_PYTHON_EXECUTABLE = "python"
  }

  try {
    $cdpVersionUrl = $env:CHATGPT_CDP_URL.TrimEnd('/') + "/json/version"
    $null = Invoke-RestMethod -Uri $cdpVersionUrl -TimeoutSec 5
  } catch {
    throw "Chrome CDP is not reachable at $env:CHATGPT_CDP_URL. Start a logged-in Chrome debugging session with a dedicated --user-data-dir before real generation."
  }

  & $env:VPF_PYTHON_EXECUTABLE -c "import playwright; from PIL import Image; print('PILOT-VDG-01 Python dependencies: PASS')"
  if ($LASTEXITCODE -ne 0) {
    throw "The selected Python environment requires Playwright and Pillow."
  }
}

function Get-MediaEvidence {
  param(
    [Parameter(Mandatory = $true)][string]$AssetId,
    [Parameter(Mandatory = $true)][string]$MediaId
  )

  $query = @'
const Database = require("better-sqlite3");
const [, dbPath, projectId, assetId, mediaId] = process.argv;
const db = new Database(dbPath, { readonly: true });
try {
  const asset = db.prepare(`
    SELECT revision, asset_status, image_prompt, negative_prompt, candidate_media_ids_json
    FROM production_assets
    WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
  `).get(projectId, assetId);
  const job = db.prepare(`
    SELECT id, provider, provider_profile_version, status, input_payload_json, result_media_ids_json
    FROM provider_jobs
    WHERE project_id = ? AND target_id = ? AND lifecycle_status = 'ACTIVE'
      AND job_type = 'IMAGE_GENERATION'
    ORDER BY created_at DESC LIMIT 1
  `).get(projectId, assetId);
  const media = db.prepare(`
    SELECT id, relative_path, mime_type, width, height, checksum, source_job_id, media_status
    FROM media_artifacts
    WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
  `).get(projectId, mediaId);
  if (!asset || !job || !media) throw new Error("Missing active Asset, ProviderJob, or MediaArtifact.");
  const payload = JSON.parse(job.input_payload_json);
  const resultMediaIds = JSON.parse(job.result_media_ids_json);
  console.log(JSON.stringify({
    assetRevision: asset.revision,
    assetStatus: asset.asset_status,
    candidateMediaIds: JSON.parse(asset.candidate_media_ids_json),
    jobId: job.id,
    provider: job.provider,
    providerProfileVersion: job.provider_profile_version,
    jobStatus: job.status,
    exactPromptMatch: payload.prompt === asset.image_prompt,
    exactNegativePromptMatch: (payload.negativePrompt ?? null) === (asset.negative_prompt ?? null),
    resultMediaIds,
    media
  }));
} finally {
  db.close();
}
'@

  $raw = & node -e $query $projectDb $Project $AssetId $MediaId 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect PILOT-VDG-01 DB evidence:`n$($raw -join [Environment]::NewLine)"
  }
  return (($raw -join [Environment]::NewLine).Trim() | ConvertFrom-Json)
}

# Optional explicit recovery for the state discovered in the real Roman IX
# pilot: pre-VDG Assets already have ProviderJobs/Candidates. This is never
# automatic because it crosses a production-state boundary. Historical rows
# are superseded, generated files are archived, and human-approved media makes
# the reset fail closed.
if ($ResetPreVdg) {
  $reset = Invoke-VpfJson @("asset", "auto", "reset-pre-vdg", $Project)
  if (-not $reset.reset) {
    Write-Host "PILOT-VDG-01 pre-VDG reset: no active image ProviderJobs required reset."
  } else {
    Write-Host "PILOT-VDG-01 pre-VDG reset: PASS"
    Write-Host "Superseded ProviderJobs: $($reset.supersededProviderJobCount)"
    Write-Host "Superseded MediaArtifacts: $($reset.supersededMediaCount)"
    Write-Host "Superseded QC: $($reset.supersededQcCount)"
    Write-Host "Archived generated files: $($reset.archivedFiles.Count)"
  }
}

# Phase A: no browser/provider execution. This is safe to run first and is
# intentionally the only phase that may migrate pre-VDG DESIGNED assets.
$prepared = Invoke-VpfJson @(
  "asset", "auto", "prepare", $Project,
  "--all", "--file", $planFile
)

$statusAfterPrepare = Invoke-VpfJson @("asset", "auto", "status", $Project)
Assert-CanonicalPins $statusAfterPrepare
$productionPlan = Assert-ProductionPlan

if ($prepared.wf09Status.assetCount -ne 11) {
  throw "Expected 11 WF-09 Assets after prepare; found $($prepared.wf09Status.assetCount)."
}
if ($prepared.wf09Status.promptMaterializedCount -ne 11) {
  throw "Expected 11 materialized IMAGE_PROMPTs after prepare; found $($prepared.wf09Status.promptMaterializedCount)."
}

$firstSceneId = [string]$productionPlan.scenes[0].sceneId
$firstAsset = @($prepared.wf09Status.assets | Where-Object { $_.owner.id -eq $firstSceneId }) | Select-Object -First 1
if ($null -eq $firstAsset) {
  throw "Could not resolve cut_001 Asset for first Scene $firstSceneId."
}
$firstAssetId = [string]$firstAsset.id

if ($ContinueAll) {
  # Explicit -ContinueAll is treated as the operator's confirmation that the
  # first generated cut has already been visually inspected and is suitable
  # for extending the same grammar to the remaining cuts.
  $runtimeBeforeAll = Invoke-VpfJson @("asset", "runtime", "status", $Project)
  $firstRuntimeAsset = @($runtimeBeforeAll.assets | Where-Object { $_.assetId -eq $firstAssetId }) | Select-Object -First 1
  if ($null -eq $firstRuntimeAsset -or $firstRuntimeAsset.candidateMediaIds.Count -lt 1) {
    throw "-ContinueAll requires an existing cut_001 Candidate. Run this script once without -ContinueAll and visually review cut_001 first."
  }
  if ($runtimeBeforeAll.failedJobCount -ne 0 -or $runtimeBeforeAll.blockedJobCount -ne 0) {
    throw "Cannot continue full generation while FAILED/BLOCKED image jobs exist."
  }

  Assert-BrowserEnvironment
  $approvedBeforeAll = [int]$runtimeBeforeAll.approvedCount
  $allResult = Invoke-VpfJson @(
    "asset", "auto", "run", $Project,
    "--all", "--file", $planFile
  )
  $allStatus = Invoke-VpfJson @("asset", "auto", "status", $Project)
  Assert-CanonicalPins $allStatus

  $ready = @($allStatus.runtime.assets | Where-Object {
    $_.assetStatus -in @("CANDIDATE_AVAILABLE", "NEEDS_REVIEW", "APPROVED") -and
    $_.candidateMediaIds.Count -ge 1
  })
  if ($ready.Count -ne 11) {
    throw "Expected 11 cuts with Candidate Media after full generation; found $($ready.Count)."
  }
  if ($allStatus.runtime.failedJobCount -ne 0 -or $allStatus.runtime.blockedJobCount -ne 0) {
    throw "Full generation left FAILED/BLOCKED image Provider Jobs."
  }
  if ([int]$allStatus.runtime.approvedCount -ne $approvedBeforeAll) {
    throw "WF-09 AUTO must not auto-approve generated images."
  }

  $manifestPath = Join-Path $projectRoot "05_images\prompts\manifest.json"
  if (-not (Test-Path $manifestPath)) {
    throw "Prompt manifest not found after full generation: $manifestPath"
  }
  $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
  if ($manifest.entries.Count -ne 11) {
    throw "Expected 11 prompt MD entries; found $($manifest.entries.Count)."
  }
  if ($manifest.candidates.Count -lt 11) {
    throw "Expected at least 11 cut-named Candidate mirrors; found $($manifest.candidates.Count)."
  }
  foreach ($candidate in $manifest.candidates) {
    $image = Join-Path $projectRoot $candidate.relativePath
    if (-not (Test-Path $image)) {
      throw "Cut-named Candidate image missing: $image"
    }
  }

  Write-Host "PILOT-VDG-01 FULL GENERATION: PASS"
  Write-Host "Project: $Project"
  Write-Host "Cuts with Candidate Media: 11 / 11"
  Write-Host "Grammar: HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1@1.0.0"
  Write-Host "Visual Bible: HISTORY_MYSTERY_VISUAL_BIBLE@1.1.0"
  Write-Host "Provider: CHATGPT_BROWSER"
  Write-Host "IMAGE_QC: PENDING / existing QC preserved"
  Write-Host "Human Approval: NOT AUTO-CHANGED"
  Write-Host "Prompt manifest: $manifestPath"
  exit 0
}

# Phase B: generate exactly cut_001. Do not generate the remaining ten cuts
# until the operator visually reviews this real browser result.
$runtimeBefore = Invoke-VpfJson @("asset", "runtime", "status", $Project)
$approvedBefore = [int]$runtimeBefore.approvedCount
$firstRuntimeAsset = @($runtimeBefore.assets | Where-Object { $_.assetId -eq $firstAssetId }) | Select-Object -First 1

if ($null -eq $firstRuntimeAsset) {
  throw "cut_001 Asset is missing from WF-09B runtime status: $firstAssetId"
}

if ($firstRuntimeAsset.candidateMediaIds.Count -eq 0) {
  if ($runtimeBefore.providerJobCount -ne 0) {
    throw "Provider Jobs already exist but cut_001 has no Candidate. Resolve or retry the existing job explicitly before continuing."
  }

  Assert-BrowserEnvironment
  $preflight = Invoke-VpfJson @("asset", "runtime", "preflight", $Project)
  if (-not $preflight.ready -or $preflight.assetCount -ne 11) {
    throw "WF-09B preflight is not ready for all 11 prepared Assets."
  }

  $one = Invoke-VpfJson @(
    "asset", "runtime", "execute", $Project,
    "--asset", $firstAssetId
  )
  if ($one.requested -ne 1 -or $one.completed -ne 1 -or $one.failed -ne 0) {
    throw "cut_001 real generation did not complete exactly one image successfully."
  }
}

$runtimeAfter = Invoke-VpfJson @("asset", "runtime", "status", $Project)
$firstAfter = @($runtimeAfter.assets | Where-Object { $_.assetId -eq $firstAssetId }) | Select-Object -First 1
if ($null -eq $firstAfter -or $firstAfter.candidateMediaIds.Count -lt 1) {
  throw "cut_001 did not reach Candidate Media state."
}
if ($firstAfter.assetStatus -notin @("CANDIDATE_AVAILABLE", "NEEDS_REVIEW", "APPROVED")) {
  throw "cut_001 has unexpected Asset status: $($firstAfter.assetStatus)."
}
if ($runtimeAfter.failedJobCount -ne 0 -or $runtimeAfter.blockedJobCount -ne 0) {
  throw "cut_001 validation has FAILED/BLOCKED Provider Jobs."
}
if ([int]$runtimeAfter.approvedCount -ne $approvedBefore) {
  throw "Real image generation must not auto-approve cut_001."
}

$mediaId = [string]$firstAfter.candidateMediaIds[0]
$evidence = Get-MediaEvidence -AssetId $firstAssetId -MediaId $mediaId
if (-not $evidence.exactPromptMatch) {
  throw "DB IMAGE_PROMPT and ProviderJob prompt differ for cut_001."
}
if (-not $evidence.exactNegativePromptMatch) {
  throw "DB negative prompt and ProviderJob negative prompt differ for cut_001."
}
if ($evidence.provider -ne "CHATGPT_BROWSER" -or $evidence.providerProfileVersion -ne "1.1.0") {
  throw "cut_001 did not execute through CHATGPT_BROWSER / IMAGE_PROVIDER_EXECUTION_V1@1.1.0."
}
if ($evidence.jobStatus -ne "COMPLETE" -or $evidence.media.mediaStatus -ne "AVAILABLE") {
  throw "cut_001 ProviderJob/MediaArtifact is not COMPLETE/AVAILABLE."
}
if ($evidence.media.mime_type -ne "image/png") {
  throw "cut_001 MediaArtifact is not PNG: $($evidence.media.mime_type)."
}
if ($evidence.media.source_job_id -ne $evidence.jobId) {
  throw "cut_001 MediaArtifact provenance does not point to its ProviderJob."
}

$imagePath = Join-Path $projectRoot ([string]$evidence.media.relative_path)
if (-not (Test-Path $imagePath)) {
  throw "cut_001 MediaArtifact file is missing: $imagePath"
}
$actualHash = (Get-FileHash -Algorithm SHA256 $imagePath).Hash.ToLowerInvariant()
if ($actualHash -ne ([string]$evidence.media.checksum).ToLowerInvariant()) {
  throw "cut_001 file SHA-256 does not match MediaArtifact checksum."
}

$imageInfoRaw = & $env:VPF_PYTHON_EXECUTABLE -c "from PIL import Image; import json,sys; im=Image.open(sys.argv[1]); print(json.dumps({'width':im.width,'height':im.height,'format':im.format}))" $imagePath 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Pillow could not inspect generated cut_001 image:`n$($imageInfoRaw -join [Environment]::NewLine)"
}
$imageInfo = (($imageInfoRaw -join [Environment]::NewLine).Trim() | ConvertFrom-Json)
if ([int]$imageInfo.width -ne [int]$evidence.media.width -or [int]$imageInfo.height -ne [int]$evidence.media.height) {
  throw "cut_001 file dimensions do not match MediaArtifact dimensions."
}

Write-Host "PILOT-VDG-01 CUT_001 TECHNICAL VALIDATION: PASS"
Write-Host "Project: $Project"
Write-Host "cut_001 Asset: $firstAssetId"
Write-Host "cut_001 MediaArtifact: $mediaId"
Write-Host "ProviderJob: $($evidence.jobId)"
Write-Host "Provider: CHATGPT_BROWSER"
Write-Host "Visual Direction Grammar: HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1@1.0.0"
Write-Host "Exact DB -> Provider prompt transport: PASS"
Write-Host "PNG / dimensions / SHA-256 / provenance: PASS"
Write-Host "Auto approval: NONE"
Write-Host "Generated image: $imagePath"
Write-Host ""
Write-Host "HUMAN VISUAL REVIEW REQUIRED"
Write-Host "Check story-first framing, environment dominance, subject scale, painterly matte surface, factual restraint, and shortform central information zone."
Write-Host "If cut_001 is visually accepted, run again with -ContinueAll to generate the remaining cuts."