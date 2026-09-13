import {randomUUID} from "node:crypto";
import type {ApprovalRecord, ClipQcRecord, MediaArtifact, ProductionClip} from "@vpf/domain";
import {ProjectBootstrapService} from "@vpf/project-bootstrap";
import {SqliteMediaBindingRepository} from "@vpf/storage/media-binding";

export type EditorProviderMigrationErrorCode =
  | "PROVIDER_MEDIA_REVIEW_CONFIRMATION_REQUIRED"
  | "PROVIDER_MEDIA_APPROVER_REQUIRED"
  | "PROVIDER_MEDIA_MAPPING_INVALID"
  | "PROVIDER_MEDIA_NOT_AVAILABLE"
  | "PROVIDER_MEDIA_VIDEO_REQUIRED"
  | "PROVIDER_CLIP_NOT_APPROVABLE";

export class EditorProviderMigrationError extends Error {
  constructor(public readonly code: EditorProviderMigrationErrorCode, message: string) {
    super(message);
    this.name = "EditorProviderMigrationError";
  }
}

const ROMAN_IX_TOTAL_CLIP_COUNT = 11;
const ROMAN_IX_SCENE_LINK_CLIP_COUNT = 10;
const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

function expectedClipPath(index: number): string {
  return `06_clips/CLIP ${String(index).padStart(2, "0")}.mp4`;
}

async function activeMediaByPath(
  repo: SqliteMediaBindingRepository,
  projectId: string,
  relativePath: string
): Promise<MediaArtifact | null> {
  const row = repo.db.prepare(
    `SELECT id FROM media_artifacts
     WHERE project_id = ?
       AND relative_path = ?
       AND lifecycle_status = 'ACTIVE'
       AND media_status = 'AVAILABLE'
     ORDER BY revision DESC, rowid DESC
     LIMIT 1`
  ).get(projectId, relativePath) as {id: string} | undefined;
  return row === undefined ? null : repo.getMedia(projectId, row.id);
}

async function romanClipMedia(
  repo: SqliteMediaBindingRepository,
  projectId: string
): Promise<Array<{clipIndex: number; relativePath: string; media: MediaArtifact | null}>> {
  const items = [];
  for (let clipIndex = 0; clipIndex < ROMAN_IX_TOTAL_CLIP_COUNT; clipIndex += 1) {
    const relativePath = expectedClipPath(clipIndex);
    items.push({
      clipIndex,
      relativePath,
      media: await activeMediaByPath(repo, projectId, relativePath)
    });
  }
  return items;
}

function approvalReady(clip: ProductionClip): boolean {
  return clip.finalDesignApprovalId !== undefined && !clip.stale;
}

export class EditorProviderMediaMigrationService {
  constructor(private readonly projects = new ProjectBootstrapService()) {}

  private async withRepository<T>(
    projectId: string,
    fn: (repo: SqliteMediaBindingRepository) => Promise<T>
  ): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteMediaBindingRepository(status.projectDbPath);
    try {
      return await fn(repo);
    } finally {
      repo.close();
    }
  }

  async status(projectId: string) {
    return this.withRepository(projectId, async repo => {
      const refs = await repo.listCurrentImplementationRefs(projectId);
      const media = await romanClipMedia(repo, projectId);
      const openingMedia = media[0]?.media ?? null;
      const firstLink = refs.length === 0
        ? null
        : await repo.getLink(projectId, refs[0]!.linkId);
      const openingAssetRow = firstLink === null
        ? undefined
        : repo.db.prepare(
            `SELECT id, asset_status, approved_media_id, owner_id, state_field, stale
             FROM production_assets
             WHERE project_id = ?
               AND lifecycle_status = 'ACTIVE'
               AND asset_class = 'EXTRA_START'
               AND owner_type = 'SCENE'
               AND owner_id = ?
             ORDER BY revision DESC, rowid DESC
             LIMIT 1`
          ).get(projectId, firstLink.fromSceneId) as
            | {
                id: string;
                asset_status: string;
                approved_media_id: string | null;
                owner_id: string;
                state_field: string;
                stale: number;
              }
            | undefined;

      const items = [];
      for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index]!;
        // Current WF-10 topology represents SC1->SC2 ... SC10->SC11.
        // Those correspond to produced CLIP 01 ... CLIP 10.
        const clipIndex = index + 1;
        const relativePath = expectedClipPath(clipIndex);
        const mediaEntry = media[clipIndex];
        const clipMedia = mediaEntry?.media ?? null;
        if (ref.implementationType !== "CLIP") {
          items.push({
            order: index + 1,
            clipIndex,
            implementationType: ref.implementationType,
            implementationId: ref.implementationId,
            providerExecutionRequired: false,
            expectedPath: relativePath,
            mediaId: clipMedia?.id ?? null,
            state: "NON_CLIP_IMPLEMENTATION"
          });
          continue;
        }
        const clip = await repo.getLatestClip(projectId, ref.implementationId);
        const qc = clip === null ? null : await repo.getLatestClipQc(projectId, clip.id);
        items.push({
          order: index + 1,
          clipIndex,
          implementationType: ref.implementationType,
          implementationId: ref.implementationId,
          clipMode: clip?.clipMode ?? null,
          providerExecutionRequired: clip?.providerExecutionRequired ?? null,
          clipStatus: clip?.clipStatus ?? null,
          clipRevision: clip?.revision ?? null,
          expectedPath: relativePath,
          mediaId: clipMedia?.id ?? null,
          mediaDurationMs: clipMedia?.durationMs ?? null,
          approvedMediaId: clip?.approvedMediaId ?? null,
          qcStatus: qc?.status ?? null,
          qcCandidateMediaId: qc?.candidateMediaId ?? null,
          state: clip === null
            ? "CLIP_MISSING"
            : !clip.providerExecutionRequired
              ? "EDITORIAL"
              : clip.approvedMediaId !== undefined &&
                  qc !== null &&
                  (qc.status === "PASS" || qc.status === "TRIM_PASS") &&
                  qc.candidateMediaId === clip.approvedMediaId
                ? "APPROVED"
                : clipMedia === null
                  ? "MEDIA_MISSING"
                  : "AWAITING_WF12_APPROVAL"
        });
      }

      const availableMedia = media.filter(item => item.media !== null);
      const sceneLinkMappingReady = refs.length === ROMAN_IX_SCENE_LINK_CLIP_COUNT;
      const openingAsset = openingAssetRow === undefined
        ? null
        : {
            assetId: openingAssetRow.id,
            ownerSceneId: openingAssetRow.owner_id,
            stateField: openingAssetRow.state_field,
            assetStatus: openingAssetRow.asset_status,
            approvedMediaId: openingAssetRow.approved_media_id,
            stale: openingAssetRow.stale === 1
          };
      const openingState = openingMedia === null
        ? "MEDIA_MISSING"
        : openingAsset === null
          ? "EXTRA_START_ASSET_MISSING"
          : openingAsset.stale
            ? "EXTRA_START_ASSET_STALE"
            : openingAsset.assetStatus !== "APPROVED" || openingAsset.approvedMediaId === null
              ? "EXTRA_START_ASSET_NOT_APPROVED"
              : "OPENING_LINK_REQUIRED";

      return {
        projectId,
        producedClipRange: "CLIP 00.mp4 .. CLIP 10.mp4",
        producedClipCount: ROMAN_IX_TOTAL_CLIP_COUNT,
        mediaClipCount: availableMedia.length,
        missingMediaPaths: media.filter(item => item.media === null).map(item => item.relativePath),
        implementationCount: refs.length,
        sceneLinkClipRange: "CLIP 01.mp4 .. CLIP 10.mp4",
        sceneLinkExpectedCount: ROMAN_IX_SCENE_LINK_CLIP_COUNT,
        sceneLinkMappingStatus: sceneLinkMappingReady ? "READY" : "IMPLEMENTATION_COUNT_MISMATCH",
        opening: {
          clipIndex: 0,
          expectedPath: expectedClipPath(0),
          mediaId: openingMedia?.id ?? null,
          mediaDurationMs: openingMedia?.durationMs ?? null,
          firstSceneId: firstLink?.fromSceneId ?? null,
          extraStartAsset: openingAsset,
          state: openingState
        },
        mappingStatus:
          sceneLinkMappingReady && openingState === "OPENING_LINK_REQUIRED"
            ? "OPENING_LINK_REQUIRED"
            : sceneLinkMappingReady && openingState !== "OPENING_LINK_REQUIRED"
              ? openingState
              : "IMPLEMENTATION_COUNT_MISMATCH",
        providerCount: items.filter(item => item.providerExecutionRequired === true).length,
        approvedProviderCount: items.filter(item => item.state === "APPROVED").length,
        awaitingApprovalCount: items.filter(item => item.state === "AWAITING_WF12_APPROVAL").length,
        items
      };
    });
  }

  async approveExistingProviderMedia(input: {
    projectId: string;
    approvedById: string;
    confirmReviewed: boolean;
  }) {
    if (!input.confirmReviewed) {
      throw new EditorProviderMigrationError(
        "PROVIDER_MEDIA_REVIEW_CONFIRMATION_REQUIRED",
        "Existing provider videos can be migrated only after explicit --confirm-reviewed operator confirmation."
      );
    }
    const approvedById = input.approvedById.trim();
    if (!approvedById) {
      throw new EditorProviderMigrationError(
        "PROVIDER_MEDIA_APPROVER_REQUIRED",
        "--approved-by must identify the operator accepting the reviewed provider videos."
      );
    }

    return this.withRepository(input.projectId, async repo => {
      const refs = await repo.listCurrentImplementationRefs(input.projectId);
      if (refs.length !== ROMAN_IX_SCENE_LINK_CLIP_COUNT) {
        throw new EditorProviderMigrationError(
          "PROVIDER_MEDIA_MAPPING_INVALID",
          `Roman IX scene-link topology should contain ${ROMAN_IX_SCENE_LINK_CLIP_COUNT} implementations for CLIP 01..10, but project.db has ${refs.length}.`
        );
      }
      const mediaEntries = await romanClipMedia(repo, input.projectId);
      const missing = mediaEntries.filter(item => item.media === null);
      if (missing.length > 0) {
        throw new EditorProviderMigrationError(
          "PROVIDER_MEDIA_NOT_AVAILABLE",
          `Roman IX expected media is not AVAILABLE: ${missing.map(item => item.relativePath).join(", ")}`
        );
      }

      const pending: Array<{order: number; clipIndex: number; clip: ProductionClip; media: MediaArtifact}> = [];
      const skipped: Array<{order: number; clipIndex: number; clipId: string; mediaId: string; reason: string}> = [];

      for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index]!;
        const clipIndex = index + 1;
        if (ref.implementationType !== "CLIP") continue;
        const clip = await repo.getLatestClip(input.projectId, ref.implementationId);
        if (clip === null) {
          throw new EditorProviderMigrationError(
            "PROVIDER_MEDIA_MAPPING_INVALID",
            `Current implementation ${ref.implementationId} has no active Clip.`
          );
        }
        if (!clip.providerExecutionRequired) continue;
        if (!approvalReady(clip)) {
          throw new EditorProviderMigrationError(
            "PROVIDER_CLIP_NOT_APPROVABLE",
            `Provider Clip ${clip.id} must be current, non-stale, and have Final Clip Design approval before migration.`
          );
        }
        const link = await repo.getLink(input.projectId, clip.linkId);
        if (
          link === null ||
          link.stale ||
          link.revision !== clip.linkRevision ||
          link.implementationType !== "CLIP" ||
          link.implementationRefId !== clip.id
        ) {
          throw new EditorProviderMigrationError(
            "PROVIDER_MEDIA_MAPPING_INVALID",
            `Provider Clip ${clip.id} no longer matches the current Link implementation.`
          );
        }

        const media = mediaEntries[clipIndex]!.media!;
        if (
          media.mediaType !== "VIDEO" ||
          !media.mimeType.toLowerCase().startsWith("video/") ||
          media.durationMs === undefined ||
          !Number.isFinite(media.durationMs) ||
          media.durationMs <= 0
        ) {
          throw new EditorProviderMigrationError(
            "PROVIDER_MEDIA_VIDEO_REQUIRED",
            `Expected provider media must be an AVAILABLE VIDEO with positive duration: ${media.relativePath}`
          );
        }

        const currentQc = await repo.getLatestClipQc(input.projectId, clip.id);
        if (
          clip.clipStatus === "APPROVED" &&
          clip.approvedMediaId === media.id &&
          currentQc !== null &&
          (currentQc.status === "PASS" || currentQc.status === "TRIM_PASS") &&
          currentQc.candidateMediaId === media.id &&
          await repo.hasClipMediaApproval(input.projectId, clip.id, clip.revision, media.id)
        ) {
          skipped.push({order: index + 1, clipIndex, clipId: clip.id, mediaId: media.id, reason: "ALREADY_APPROVED"});
          continue;
        }

        if (clip.clipStatus === "BLOCKED") {
          throw new EditorProviderMigrationError(
            "PROVIDER_CLIP_NOT_APPROVABLE",
            `Provider Clip ${clip.id} is BLOCKED and cannot be overridden by migration.`
          );
        }
        if (clip.providerPreflightId !== undefined) {
          const preflight = await repo.getProviderPreflight(input.projectId, clip.providerPreflightId);
          if (
            preflight !== null &&
            (preflight.status === "BLOCKED" ||
              !preflight.safetySafe ||
              !preflight.capabilityCompatible ||
              preflight.requiresAlternativeRepresentation)
          ) {
            throw new EditorProviderMigrationError(
              "PROVIDER_CLIP_NOT_APPROVABLE",
              `Provider Clip ${clip.id} has a blocked/unsafe/incompatible Provider Pre-QC and cannot be overridden.`
            );
          }
        }
        pending.push({order: index + 1, clipIndex, clip, media});
      }

      const results = [];
      for (const item of pending) {
        const now = nowIso();
        const nextClip: ProductionClip = {
          ...item.clip,
          revision: item.clip.revision + 1,
          lifecycleStatus: "ACTIVE",
          updatedAt: now,
          candidateMediaIds: [...new Set([...item.clip.candidateMediaIds, item.media.id])],
          approvedMediaId: item.media.id,
          clipStatus: "APPROVED"
        };
        const qc: ClipQcRecord = {
          id: id("qc"),
          projectId: input.projectId,
          revision: 1,
          lifecycleStatus: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          clipId: item.clip.id,
          clipRevision: nextClip.revision,
          candidateMediaId: item.media.id,
          status: "PASS",
          severity: "MINOR",
          confidence: 1,
          issues: [],
          decisionId: `migration_human_review_${item.clip.id}_${item.media.id}`
        };
        const approval: ApprovalRecord = {
          id: id("apr"),
          projectId: input.projectId,
          targetType: "CLIP",
          targetId: item.clip.id,
          targetRevision: nextClip.revision,
          approvalState: "HUMAN_APPROVED",
          reason: "EXISTING_PROVIDER_VIDEO_MIGRATION_QC_PASS",
          approvedByType: "USER",
          approvedById,
          selectedMediaId: item.media.id,
          createdAt: now
        };
        const eventId = id("evt");
        await repo.commitClipQc({
          previousClip: item.clip,
          nextClip,
          qc,
          approval,
          event: {
            eventId,
            projectId: input.projectId,
            eventType: "EXISTING_PROVIDER_VIDEO_MIGRATED_QC_PASS",
            targetType: "CLIP",
            targetId: item.clip.id,
            trigger: "USER",
            payload: {
              order: item.order,
              clipIndex: item.clipIndex,
              mediaId: item.media.id,
              relativePath: item.media.relativePath,
              approvedById
            },
            createdAt: now
          },
          outbox: {
            outboxId: id("outbox"),
            eventId,
            status: "PENDING",
            attempts: 0,
            createdAt: now
          }
        });
        results.push({
          order: item.order,
          clipIndex: item.clipIndex,
          clipId: item.clip.id,
          previousRevision: item.clip.revision,
          approvedRevision: nextClip.revision,
          mediaId: item.media.id,
          relativePath: item.media.relativePath,
          qcId: qc.id,
          approvalId: approval.id
        });
      }

      return {
        projectId: input.projectId,
        status: "APPROVED",
        sceneLinkClipRange: "CLIP 01.mp4 .. CLIP 10.mp4",
        approvedCount: results.length,
        skippedCount: skipped.length,
        openingClipPending: expectedClipPath(0),
        results,
        skipped
      };
    });
  }
}
