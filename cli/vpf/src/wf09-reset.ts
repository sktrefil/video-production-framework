import { access, mkdir, rename } from "node:fs/promises";
import * as path from "node:path";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { SqliteSceneAssetRepository } from "@vpf/storage/scene-assets";
import { Wf09AutoError } from "./wf09-auto.js";

interface ActiveAssetRow {
  id: string;
  revision: number;
  asset_status: string;
  approved_media_id: string | null;
}

interface ActiveJobRow {
  id: string;
}

interface ActiveMediaRow {
  id: string;
  relative_path: string;
  media_status: string;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function archiveStamp(now: string): string {
  return now.replace(/[:.]/g, "-");
}

/**
 * Explicit migration escape hatch for a pre-Visual-Direction image production
 * state. Nothing is deleted. Active jobs/media/QC are superseded, generated
 * source files are moved into an audit archive, and each active image Asset is
 * advanced to a clean DESIGNED revision using the same Asset id. This keeps
 * Scene.primaryAssetId stable and prevents attempt-1 output paths from
 * overwriting the historical candidate bytes.
 *
 * Human-approved image state is intentionally non-resettable here.
 */
export async function resetPreVisualDirectionImageState(
  projects: ProjectBootstrapService,
  projectId: string
) {
  const status = await projects.getStatus(projectId);
  const repo = new SqliteSceneAssetRepository(status.projectDbPath);
  const moved: Array<{ from: string; to: string }> = [];
  const now = new Date().toISOString();
  const archiveRoot = path.join(
    status.projectRoot,
    "05_images",
    "archive",
    `pre-vdg-${archiveStamp(now)}`
  );

  try {
    const assets = repo.db.prepare(`
      SELECT id, revision, asset_status, approved_media_id
      FROM production_assets
      WHERE project_id = ?
        AND lifecycle_status = 'ACTIVE'
        AND asset_class = 'PRIMARY_SCENE'
        AND owner_type = 'SCENE'
        AND source_strategy = 'GENERATE'
      ORDER BY owner_id
    `).all(projectId) as ActiveAssetRow[];

    if (assets.length === 0) {
      throw new Wf09AutoError(
        "WF09_AUTO_PROJECT_STATE",
        "No active GENERATE PRIMARY_SCENE Assets exist to reset."
      );
    }

    if (assets.some(asset => asset.asset_status === "APPROVED" || asset.approved_media_id !== null)) {
      throw new Wf09AutoError(
        "WF09_AUTO_PROJECT_STATE",
        "Pre-VDG reset refused because one or more image Assets are human-approved. Approved image history requires an explicit higher-level revision workflow, not AUTO reset."
      );
    }

    const assetIds = assets.map(asset => asset.id);
    const assetMarks = placeholders(assetIds.length);
    const approval = repo.db.prepare(`
      SELECT id
      FROM approval_records
      WHERE project_id = ?
        AND target_id IN (${assetMarks})
        AND selected_media_id IS NOT NULL
      LIMIT 1
    `).get(projectId, ...assetIds) as { id: string } | undefined;
    if (approval !== undefined) {
      throw new Wf09AutoError(
        "WF09_AUTO_PROJECT_STATE",
        "Pre-VDG reset refused because a human image approval record already selects media for one of these Assets."
      );
    }

    const jobs = repo.db.prepare(`
      SELECT id
      FROM provider_jobs
      WHERE project_id = ?
        AND lifecycle_status = 'ACTIVE'
        AND job_type = 'IMAGE_GENERATION'
        AND target_type = 'ASSET'
        AND target_id IN (${assetMarks})
      ORDER BY created_at
    `).all(projectId, ...assetIds) as ActiveJobRow[];

    if (jobs.length === 0) {
      return {
        projectId,
        reset: false,
        reason: "NO_ACTIVE_IMAGE_PROVIDER_JOBS",
        assetCount: assets.length,
        supersededProviderJobCount: 0,
        supersededMediaCount: 0,
        supersededQcCount: 0,
        archivedFiles: [] as string[]
      };
    }

    const jobIds = jobs.map(job => job.id);
    const jobMarks = placeholders(jobIds.length);
    const media = repo.db.prepare(`
      SELECT id, relative_path, media_status
      FROM media_artifacts
      WHERE project_id = ?
        AND lifecycle_status = 'ACTIVE'
        AND source_job_id IN (${jobMarks})
      ORDER BY created_at
    `).all(projectId, ...jobIds) as ActiveMediaRow[];

    await mkdir(archiveRoot, { recursive: true });
    const archivePaths = new Map<string, string>();
    for (const item of media) {
      const source = path.resolve(status.projectRoot, item.relative_path);
      if (!isInside(status.projectRoot, source)) {
        throw new Wf09AutoError(
          "WF09_AUTO_PROJECT_STATE",
          `Pre-VDG MediaArtifact escapes the project workspace: ${item.relative_path}`
        );
      }
      try {
        await access(source);
      } catch {
        if (item.media_status === "AVAILABLE") {
          throw new Wf09AutoError(
            "WF09_AUTO_PROJECT_STATE",
            `Pre-VDG AVAILABLE MediaArtifact file is missing; reset stopped to preserve auditability: ${item.relative_path}`
          );
        }
        continue;
      }
      const extension = path.extname(source) || ".bin";
      const destination = path.join(archiveRoot, `${encodeURIComponent(item.id)}${extension}`);
      await rename(source, destination);
      moved.push({ from: source, to: destination });
      archivePaths.set(
        item.id,
        path.relative(status.projectRoot, destination).replaceAll("\\", "/")
      );
    }

    let supersededQcCount = 0;
    try {
      repo.db.transaction(() => {
        const mediaIds = media.map(item => item.id);
        if (mediaIds.length > 0) {
          const mediaMarks = placeholders(mediaIds.length);
          const qc = repo.db.prepare(`
            UPDATE qc_results
            SET lifecycle_status = 'SUPERSEDED', updated_at = ?
            WHERE project_id = ?
              AND lifecycle_status = 'ACTIVE'
              AND (target_id IN (${assetMarks}) OR media_id IN (${mediaMarks}))
          `).run(now, projectId, ...assetIds, ...mediaIds);
          supersededQcCount = qc.changes;
        } else {
          const qc = repo.db.prepare(`
            UPDATE qc_results
            SET lifecycle_status = 'SUPERSEDED', updated_at = ?
            WHERE project_id = ?
              AND lifecycle_status = 'ACTIVE'
              AND target_id IN (${assetMarks})
          `).run(now, projectId, ...assetIds);
          supersededQcCount = qc.changes;
        }

        for (const item of media) {
          const archived = archivePaths.get(item.id);
          if (archived === undefined) {
            repo.db.prepare(`
              UPDATE media_artifacts
              SET lifecycle_status = 'SUPERSEDED', updated_at = ?
              WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
            `).run(now, projectId, item.id);
          } else {
            repo.db.prepare(`
              UPDATE media_artifacts
              SET relative_path = ?, lifecycle_status = 'SUPERSEDED', updated_at = ?
              WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
            `).run(archived, now, projectId, item.id);
          }
        }

        repo.db.prepare(`
          UPDATE provider_jobs
          SET lifecycle_status = 'SUPERSEDED', updated_at = ?
          WHERE project_id = ?
            AND lifecycle_status = 'ACTIVE'
            AND id IN (${jobMarks})
        `).run(now, projectId, ...jobIds);

        for (const asset of assets) {
          const changed = repo.db.prepare(`
            UPDATE production_assets
            SET lifecycle_status = 'SUPERSEDED', updated_at = ?
            WHERE project_id = ? AND id = ? AND revision = ? AND lifecycle_status = 'ACTIVE'
          `).run(now, projectId, asset.id, asset.revision);
          if (changed.changes !== 1) {
            throw new Error(`Asset ${asset.id} lost its active revision during pre-VDG reset.`);
          }

          repo.db.prepare(`
            INSERT INTO production_assets (
              id, project_id, revision, lifecycle_status,
              asset_class, asset_role, production_priority, source_strategy,
              owner_type, owner_id, state_entity_type, state_entity_id, state_field, state_entity_revision,
              visual_goal, composition, continuity_requirements_json, identity_anchor_ids_json,
              factual_constraints_json, avoidances_json, image_prompt, negative_prompt,
              candidate_media_ids_json, approved_media_id, asset_status,
              source_scene_revision, source_project_style_id, source_project_style_revision,
              source_identity_anchor_revisions_json, format_profile_version,
              stale, stale_reason, created_at, updated_at
            )
            SELECT
              id, project_id, revision + 1, 'ACTIVE',
              asset_class, asset_role, production_priority, source_strategy,
              owner_type, owner_id, state_entity_type, state_entity_id, state_field, state_entity_revision,
              visual_goal, composition, continuity_requirements_json, identity_anchor_ids_json,
              factual_constraints_json, avoidances_json, image_prompt, negative_prompt,
              '[]', NULL, 'DESIGNED',
              source_scene_revision, source_project_style_id, source_project_style_revision,
              source_identity_anchor_revisions_json, format_profile_version,
              0, NULL, created_at, ?
            FROM production_assets
            WHERE project_id = ? AND id = ? AND revision = ? AND lifecycle_status = 'SUPERSEDED'
          `).run(now, projectId, asset.id, asset.revision);
        }
      })();
    } catch (error) {
      for (const move of [...moved].reverse()) {
        try {
          await rename(move.to, move.from);
        } catch {
          // Preserve the original failure. A subsequent doctor/reset run will
          // surface any filesystem inconsistency if rollback itself fails.
        }
      }
      throw error;
    }

    return {
      projectId,
      reset: true,
      reason: "PRE_VDG_PROVIDER_STATE_SUPERSEDED",
      assetCount: assets.length,
      supersededProviderJobCount: jobs.length,
      supersededMediaCount: media.length,
      supersededQcCount,
      archivedFiles: [...archivePaths.values()]
    };
  } finally {
    repo.close();
  }
}
