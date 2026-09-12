const Database = require("better-sqlite3");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [, , dbPath, projectId, assetId, mediaId] = process.argv;
if (!dbPath || !projectId || !assetId || !mediaId) {
  fail("Usage: node inspect-pilot-vdg-media.cjs <project.db> <projectId> <assetId> <mediaId>");
}

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

  if (!asset || !job || !media) {
    fail("Missing active Asset, ProviderJob, or MediaArtifact.");
  }

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
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  db.close();
}
