import {createHash, randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, statSync} from "node:fs";
import {dirname, resolve} from "node:path";
import type {
  ApprovalRecord,
  ClipQcRecord,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  QcResult
} from "@vpf/domain";
import {ProjectBootstrapService} from "@vpf/project-bootstrap";
import {SqliteMediaBindingRepository} from "@vpf/storage/media-binding";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";

export type EditorOpeningMigrationErrorCode =
  | "OPENING_REVIEW_CONFIRMATION_REQUIRED"
  | "OPENING_APPROVER_REQUIRED"
  | "OPENING_MEDIA_NOT_AVAILABLE"
  | "OPENING_VIDEO_REQUIRED"
  | "OPENING_FIRST_SCENE_MISSING"
  | "OPENING_PRIMARY_ASSET_REQUIRED"
  | "OPENING_FFMPEG_REQUIRED"
  | "OPENING_DERIVED_FRAME_INVALID"
  | "OPENING_ASSET_STATE_INVALID"
  | "OPENING_LINK_STATE_INVALID"
  | "OPENING_EXISTING_IMPLEMENTATION_CONFLICT";

export class EditorOpeningMigrationError extends Error {
  constructor(public readonly code: EditorOpeningMigrationErrorCode, message: string) {
    super(message);
    this.name = "EditorOpeningMigrationError";
  }
}

const OPENING_VIDEO_PATH = "06_clips/CLIP 00.mp4";
const OPENING_FRAME_PATH = "02_image_assets/migration/EXTRA_START_FROM_CLIP_00.png";
const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

function eventOutbox(input: {
  projectId: string;
  eventType: string;
  targetType: string;
  targetId: string;
  trigger?: WorkflowEvent["trigger"];
  payload?: unknown;
  now?: string;
}): {event: WorkflowEvent; outbox: OutboxRecord} {
  const now = input.now ?? nowIso();
  const eventId = id("evt");
  return {
    event: {
      eventId,
      projectId: input.projectId,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      trigger: input.trigger ?? "MIGRATION",
      ...(input.payload === undefined ? {} : {payload: input.payload}),
      createdAt: now
    },
    outbox: {
      outboxId: id("outbox"),
      eventId,
      status: "PENDING",
      attempts: 0,
      createdAt: now
    }
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function nextAsset(
  asset: ProductionAsset,
  patch: Partial<ProductionAsset>,
  now: string
): ProductionAsset {
  return {
    ...asset,
    ...patch,
    id: asset.id,
    projectId: asset.projectId,
    revision: asset.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: asset.createdAt,
    updatedAt: now
  };
}

function nextLink(
  link: ProductionLink,
  patch: Partial<ProductionLink>,
  now: string
): ProductionLink {
  return {
    ...link,
    ...patch,
    id: link.id,
    projectId: link.projectId,
    revision: link.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: link.createdAt,
    updatedAt: now
  };
}

function nextClip(
  clip: ProductionClip,
  patch: Partial<ProductionClip>,
  now: string
): ProductionClip {
  return {
    ...clip,
    ...patch,
    id: clip.id,
    projectId: clip.projectId,
    revision: clip.revision + 1,
    lifecycleStatus: "ACTIVE",
    createdAt: clip.createdAt,
    updatedAt: now
  };
}

function isOpeningLink(link: ProductionLink): boolean {
  return (
    link.fromSceneId === link.toSceneId &&
    link.fromStateRef.stateField === "STATE_IN" &&
    link.toStateRef.stateField === "STATE_CURRENT"
  );
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

async function extraStartAsset(
  repo: SqliteMediaBindingRepository,
  projectId: string,
  sceneId: string
): Promise<ProductionAsset | null> {
  const row = repo.db.prepare(
    `SELECT id FROM production_assets
     WHERE project_id = ?
       AND lifecycle_status = 'ACTIVE'
       AND asset_class = 'EXTRA_START'
       AND owner_type = 'SCENE'
       AND owner_id = ?
     ORDER BY revision DESC, rowid DESC
     LIMIT 1`
  ).get(projectId, sceneId) as {id: string} | undefined;
  return row === undefined ? null : repo.getLatestAsset(projectId, row.id);
}

function extractOpeningFrame(projectRoot: string): {
  absolutePath: string;
  relativePath: string;
  checksum: string;
} {
  const source = resolve(projectRoot, OPENING_VIDEO_PATH);
  if (!existsSync(source) || statSync(source).size <= 0) {
    throw new EditorOpeningMigrationError(
      "OPENING_MEDIA_NOT_AVAILABLE",
      `Opening source video is missing or empty: ${OPENING_VIDEO_PATH}`
    );
  }
  const output = resolve(projectRoot, OPENING_FRAME_PATH);
  mkdirSync(dirname(output), {recursive: true});
  const ffmpeg = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", source, "-frames:v", "1", output],
    {encoding: "utf8", windowsHide: true}
  );
  if (ffmpeg.error !== undefined || ffmpeg.status !== 0) {
    throw new EditorOpeningMigrationError(
      "OPENING_FFMPEG_REQUIRED",
      `Failed to extract the canonical EXTRA_START frame from CLIP 00. ${String(ffmpeg.stderr ?? ffmpeg.error ?? "ffmpeg unavailable").trim()}`
    );
  }
  if (!existsSync(output) || statSync(output).size <= 0) {
    throw new EditorOpeningMigrationError(
      "OPENING_DERIVED_FRAME_INVALID",
      `Derived opening frame was not created: ${OPENING_FRAME_PATH}`
    );
  }
  return {
    absolutePath: output,
    relativePath: OPENING_FRAME_PATH,
    checksum: sha256(output)
  };
}

export class EditorOpeningMigrationService {
  constructor(private readonly projects = new ProjectBootstrapService()) {}

  async migrate(input: {
    projectId: string;
    approvedById: string;
    confirmReviewed: boolean;
    durationMs?: number;
  }) {
    if (!input.confirmReviewed) {
      throw new EditorOpeningMigrationError(
        "OPENING_REVIEW_CONFIRMATION_REQUIRED",
        "Opening migration requires explicit --confirm-reviewed operator confirmation."
      );
    }
    const approvedById = input.approvedById.trim();
    if (!approvedById) {
      throw new EditorOpeningMigrationError(
        "OPENING_APPROVER_REQUIRED",
        "--approved-by must identify the operator accepting the migrated opening media."
      );
    }

    const status = await this.projects.getStatus(input.projectId);
    const repo = new SqliteMediaBindingRepository(status.projectDbPath);
    try {
      const openingMedia = await activeMediaByPath(repo, input.projectId, OPENING_VIDEO_PATH);
      if (openingMedia === null) {
        throw new EditorOpeningMigrationError(
          "OPENING_MEDIA_NOT_AVAILABLE",
          `Opening media is not AVAILABLE: ${OPENING_VIDEO_PATH}`
        );
      }
      if (
        openingMedia.mediaType !== "VIDEO" ||
        !openingMedia.mimeType.toLowerCase().startsWith("video/") ||
        openingMedia.durationMs === undefined ||
        !Number.isFinite(openingMedia.durationMs) ||
        openingMedia.durationMs <= 0
      ) {
        throw new EditorOpeningMigrationError(
          "OPENING_VIDEO_REQUIRED",
          "CLIP 00 must be an AVAILABLE video with a positive duration."
        );
      }

      const scenes = await repo.listApprovedSceneChain(input.projectId);
      const firstScene = scenes[0]?.scene;
      if (firstScene === undefined) {
        throw new EditorOpeningMigrationError(
          "OPENING_FIRST_SCENE_MISSING",
          "Roman IX opening migration requires an approved first Scene."
        );
      }
      const primaryAsset = await repo.getApprovedPrimaryAsset(input.projectId, firstScene.id);
      if (primaryAsset === null || primaryAsset.approvedMediaId === undefined) {
        throw new EditorOpeningMigrationError(
          "OPENING_PRIMARY_ASSET_REQUIRED",
          "The first Scene requires an approved PRIMARY_SCENE Asset before opening migration."
        );
      }
      const primaryMedia = await repo.getMedia(input.projectId, primaryAsset.approvedMediaId);
      if (
        primaryMedia === null ||
        primaryMedia.mediaStatus !== "AVAILABLE" ||
        primaryMedia.mediaType !== "IMAGE"
      ) {
        throw new EditorOpeningMigrationError(
          "OPENING_PRIMARY_ASSET_REQUIRED",
          "The first Scene PRIMARY_SCENE approved media must be an available image."
        );
      }

      let openingLink = await repo.getLinkByScenes(input.projectId, firstScene.id, firstScene.id);
      if (openingLink !== null && !isOpeningLink(openingLink)) {
        throw new EditorOpeningMigrationError(
          "OPENING_EXISTING_IMPLEMENTATION_CONFLICT",
          `A non-opening self Link already exists for first Scene ${firstScene.id}.`
        );
      }
      if (openingLink !== null && openingLink.implementationType === "CLIP" && openingLink.implementationRefId !== undefined) {
        const existingClip = await repo.getLatestClip(input.projectId, openingLink.implementationRefId);
        const existingQc = existingClip === null ? null : await repo.getLatestClipQc(input.projectId, existingClip.id);
        if (
          existingClip !== null &&
          !existingClip.stale &&
          existingClip.clipStatus === "APPROVED" &&
          existingClip.approvedMediaId === openingMedia.id &&
          existingQc !== null &&
          (existingQc.status === "PASS" || existingQc.status === "TRIM_PASS") &&
          existingQc.candidateMediaId === openingMedia.id &&
          await repo.hasClipMediaApproval(
            input.projectId,
            existingClip.id,
            existingClip.revision,
            openingMedia.id
          )
        ) {
          return {
            projectId: input.projectId,
            status: "READY",
            reused: true,
            openingMediaId: openingMedia.id,
            openingLinkId: openingLink.id,
            openingLinkRevision: openingLink.revision,
            openingClipId: existingClip.id,
            openingClipRevision: existingClip.revision,
            sourceInMs: existingQc.status === "TRIM_PASS" ? existingQc.usableInMs ?? 0 : 0,
            sourceOutMs: existingQc.status === "TRIM_PASS" ? existingQc.usableOutMs ?? openingMedia.durationMs : openingMedia.durationMs
          };
        }
      }

      let startAsset = await extraStartAsset(repo, input.projectId, firstScene.id);
      if (startAsset !== null && startAsset.stale) {
        throw new EditorOpeningMigrationError(
          "OPENING_ASSET_STATE_INVALID",
          `Existing EXTRA_START Asset ${startAsset.id} is stale.`
        );
      }

      const derived = extractOpeningFrame(status.projectRoot);
      let derivedMedia = await activeMediaByPath(repo, input.projectId, derived.relativePath);
      if (derivedMedia !== null && derivedMedia.checksum !== derived.checksum) {
        derivedMedia = null;
      }

      if (startAsset === null) {
        const now = nowIso();
        startAsset = {
          id: id("ast"),
          projectId: input.projectId,
          revision: 1,
          lifecycleStatus: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          stale: false,
          assetClass: "EXTRA_START",
          assetRole: "STORY_ANCHOR",
          productionPriority: "IMPORTANT",
          sourceStrategy: "IMPORT",
          owner: {type: "SCENE", id: firstScene.id},
          stateRef: {
            entityType: "SCENE",
            entityId: firstScene.id,
            entityRevision: firstScene.revision,
            stateField: "STATE_IN"
          },
          design: {
            visualGoal: "Canonical opening start frame reconstructed from the first frame of the reviewed CLIP 00 migration source.",
            composition: "Preserve the exact opening frame used by the existing reviewed opening video.",
            continuityRequirements: ["Connect directly into the first Scene PRIMARY_SCENE visual."],
            identityAnchorIds: [...primaryAsset.design.identityAnchorIds],
            factualConstraints: [...primaryAsset.design.factualConstraints],
            avoidances: [...primaryAsset.design.avoidances]
          },
          candidateMediaIds: [],
          assetStatus: "DESIGNED",
          sourceSceneRevision: firstScene.revision,
          sourceProjectStyleId: primaryAsset.sourceProjectStyleId,
          sourceProjectStyleRevision: primaryAsset.sourceProjectStyleRevision,
          sourceIdentityAnchorRevisions: {...primaryAsset.sourceIdentityAnchorRevisions},
          formatProfileVersion: primaryAsset.formatProfileVersion
        };
        const {event, outbox} = eventOutbox({
          projectId: input.projectId,
          eventType: "OPENING_EXTRA_START_ASSET_DESIGNED",
          targetType: "ASSET",
          targetId: startAsset.id,
          now,
          payload: {firstSceneId: firstScene.id, sourceVideoMediaId: openingMedia.id}
        });
        await repo.commitAssetDesign({previous: null, next: startAsset, event, outbox});
      }

      if (startAsset.assetStatus !== "APPROVED" || startAsset.approvedMediaId === undefined) {
        if (derivedMedia === null) {
          const now = nowIso();
          derivedMedia = {
            id: id("media"),
            projectId: input.projectId,
            revision: 1,
            lifecycleStatus: "ACTIVE",
            createdAt: now,
            updatedAt: now,
            mediaType: "IMAGE",
            relativePath: derived.relativePath,
            mimeType: "image/png",
            checksum: derived.checksum,
            mediaStatus: "AVAILABLE"
          };
        }

        if (!startAsset.candidateMediaIds.includes(derivedMedia.id)) {
          const now = nowIso();
          const previous = startAsset;
          startAsset = nextAsset(
            previous,
            {
              candidateMediaIds: [...new Set([...previous.candidateMediaIds, derivedMedia.id])],
              assetStatus: "CANDIDATE_AVAILABLE"
            },
            now
          );
          const {event, outbox} = eventOutbox({
            projectId: input.projectId,
            eventType: "OPENING_EXTRA_START_CANDIDATE_IMPORTED",
            targetType: "ASSET",
            targetId: startAsset.id,
            now,
            payload: {mediaId: derivedMedia.id, relativePath: derivedMedia.relativePath}
          });
          const persisted = await repo.getMedia(input.projectId, derivedMedia.id);
          await repo.commitAssetCandidate({
            previousAsset: previous,
            nextAsset: startAsset,
            ...(persisted === null ? {media: derivedMedia} : {}),
            event,
            outbox
          });
        }

        let imageQc = await repo.getLatestQcForMedia(input.projectId, startAsset.id, derivedMedia.id);
        if (imageQc === null || (imageQc.qcStatus !== "PASS" && imageQc.qcStatus !== "PASS_WITH_NOTE")) {
          const now = nowIso();
          const previous = startAsset;
          imageQc = {
            id: id("qc"),
            projectId: input.projectId,
            revision: 1,
            lifecycleStatus: "ACTIVE",
            createdAt: now,
            updatedAt: now,
            qcType: "IMAGE_QC",
            targetType: "ASSET",
            targetId: previous.id,
            targetRevision: previous.revision,
            mediaId: derivedMedia.id,
            qcStatus: "PASS_WITH_NOTE",
            severity: "MINOR",
            confidence: 1,
            recommendedAction: "Migration-derived EXTRA_START frame; preserve only as opening provenance anchor."
          };
          startAsset = nextAsset(previous, {assetStatus: "NEEDS_REVIEW"}, now);
          const {event, outbox} = eventOutbox({
            projectId: input.projectId,
            eventType: "OPENING_EXTRA_START_IMAGE_QC_COMPLETED",
            targetType: "ASSET",
            targetId: startAsset.id,
            trigger: "QC_RESULT",
            now,
            payload: {mediaId: derivedMedia.id, qcId: imageQc.id, qcStatus: imageQc.qcStatus}
          });
          await repo.commitImageQc({
            previousAsset: previous,
            nextAsset: startAsset,
            qc: imageQc,
            event,
            outbox
          });
        }

        if (startAsset.assetStatus !== "APPROVED" || startAsset.approvedMediaId !== derivedMedia.id) {
          const now = nowIso();
          const previous = startAsset;
          startAsset = nextAsset(
            previous,
            {approvedMediaId: derivedMedia.id, assetStatus: "APPROVED"},
            now
          );
          const approval: ApprovalRecord = {
            id: id("apr"),
            projectId: input.projectId,
            targetType: "ASSET",
            targetId: startAsset.id,
            targetRevision: startAsset.revision,
            approvalState: "HUMAN_APPROVED",
            reason: "OPENING_EXTRA_START_MIGRATION_APPROVED",
            approvedByType: "USER",
            approvedById,
            selectedMediaId: derivedMedia.id,
            createdAt: now
          };
          const {event, outbox} = eventOutbox({
            projectId: input.projectId,
            eventType: "OPENING_EXTRA_START_ASSET_APPROVED",
            targetType: "ASSET",
            targetId: startAsset.id,
            trigger: "USER",
            now,
            payload: {selectedMediaId: derivedMedia.id, approvedById}
          });
          await repo.commitAssetApproval({
            previousAsset: previous,
            nextAsset: startAsset,
            approval,
            event,
            outbox
          });
        }
      }

      if (startAsset.approvedMediaId === undefined) {
        throw new EditorOpeningMigrationError(
          "OPENING_ASSET_STATE_INVALID",
          "EXTRA_START migration did not produce an approved media selection."
        );
      }
      const startMedia = await repo.getMedia(input.projectId, startAsset.approvedMediaId);
      if (startMedia === null || startMedia.mediaStatus !== "AVAILABLE" || startMedia.mediaType !== "IMAGE") {
        throw new EditorOpeningMigrationError(
          "OPENING_ASSET_STATE_INVALID",
          "Approved EXTRA_START media is unavailable or is not an image."
        );
      }

      openingLink = await repo.getLinkByScenes(input.projectId, firstScene.id, firstScene.id);
      if (openingLink === null) {
        const now = nowIso();
        openingLink = {
          id: id("lnk"),
          projectId: input.projectId,
          revision: 1,
          lifecycleStatus: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          stale: false,
          fromSceneId: firstScene.id,
          fromSceneRevision: firstScene.revision,
          fromStateRef: {
            entityType: "SCENE",
            entityId: firstScene.id,
            entityRevision: firstScene.revision,
            stateField: "STATE_IN"
          },
          toSceneId: firstScene.id,
          toSceneRevision: firstScene.revision,
          toStateRef: {
            entityType: "SCENE",
            entityId: firstScene.id,
            entityRevision: firstScene.revision,
            stateField: "STATE_CURRENT"
          },
          linkScope: "FULL_VIDEO_PRIMARY",
          preLinkRequired: true,
          continuityLevel: "OPENING_TO_FIRST_SCENE",
          stateChange: `${firstScene.stateIn} -> ${firstScene.stateCurrent}`,
          handoffIntent: "Connect the canonical EXTRA_START opening frame into the first Scene primary visual.",
          handoffAnchor: ["EXTRA_START", "FIRST_SCENE"],
          handoffChannels: ["VISUAL", "EDIT"],
          transitionIntent: "OPENING_ENTRY",
          preLinkMatch: "NOT_EVALUATED",
          linkStatus: "NOT_PLANNED"
        };
        const {event, outbox} = eventOutbox({
          projectId: input.projectId,
          eventType: "OPENING_LINK_GRAPH_CREATED",
          targetType: "LINK",
          targetId: openingLink.id,
          now,
          payload: {sceneId: firstScene.id}
        });
        await repo.commitLinkGraph({changes: [{previous: null, next: openingLink}], staleLinkIds: [], event, outbox});
      }

      if (openingLink.stale || !isOpeningLink(openingLink)) {
        throw new EditorOpeningMigrationError(
          "OPENING_LINK_STATE_INVALID",
          "Opening Link is stale or does not represent STATE_IN -> STATE_CURRENT of the first Scene."
        );
      }

      if (openingLink.linkStatus === "NOT_PLANNED") {
        const now = nowIso();
        const previous = openingLink;
        const approvalId = id("apr");
        openingLink = nextLink(
          previous,
          {
            preLinkRequired: true,
            continuityLevel: "OPENING_TO_FIRST_SCENE",
            stateChange: `${firstScene.stateIn} -> ${firstScene.stateCurrent}`,
            handoffIntent: "Connect the canonical EXTRA_START opening frame into the first Scene primary visual.",
            handoffAnchor: ["EXTRA_START", "FIRST_SCENE"],
            handoffChannels: ["VISUAL", "EDIT"],
            transitionIntent: "OPENING_ENTRY",
            preLinkApprovalId: approvalId,
            linkStatus: "WAITING_FOR_ASSETS"
          },
          now
        );
        const approval: ApprovalRecord = {
          id: approvalId,
          projectId: input.projectId,
          targetType: "LINK",
          targetId: openingLink.id,
          targetRevision: openingLink.revision,
          approvalState: "HUMAN_APPROVED",
          reason: "OPENING_PRE_LINK_MIGRATION_APPROVED",
          approvedByType: "USER",
          approvedById,
          createdAt: now
        };
        const {event, outbox} = eventOutbox({
          projectId: input.projectId,
          eventType: "OPENING_PRE_LINK_APPROVED",
          targetType: "LINK",
          targetId: openingLink.id,
          trigger: "USER",
          now,
          payload: {approvedById}
        });
        await repo.commitPreLink({previous, next: openingLink, approval, event, outbox});
      }

      if (openingLink.linkStatus === "WAITING_FOR_ASSETS" || openingLink.linkStatus === "PRE_LINK_APPROVED") {
        const now = nowIso();
        const previous = openingLink;
        openingLink = nextLink(
          previous,
          {
            fromAssetId: startAsset.id,
            fromAssetRevision: startAsset.revision,
            fromMediaId: startMedia.id,
            toAssetId: primaryAsset.id,
            toAssetRevision: primaryAsset.revision,
            toMediaId: primaryMedia.id,
            preLinkMatch: "NOT_EVALUATED",
            linkStatus: "HANDOFF_QC_PENDING"
          },
          now
        );
        delete openingLink.handoffQcId;
        delete openingLink.handoffUsable;
        delete openingLink.handoffReviewApprovalId;
        const {event, outbox} = eventOutbox({
          projectId: input.projectId,
          eventType: "OPENING_LINK_ASSETS_BOUND",
          targetType: "LINK",
          targetId: openingLink.id,
          now,
          payload: {
            fromAssetId: startAsset.id,
            fromMediaId: startMedia.id,
            toAssetId: primaryAsset.id,
            toMediaId: primaryMedia.id
          }
        });
        await repo.commitAssetBinding({previous, next: openingLink, event, outbox});
      }

      if (openingLink.linkStatus === "HANDOFF_QC_PENDING") {
        const now = nowIso();
        const previous = openingLink;
        const handoffQc: QcResult = {
          id: id("qc"),
          projectId: input.projectId,
          revision: 1,
          lifecycleStatus: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          qcType: "HANDOFF_QC",
          targetType: "LINK",
          targetId: previous.id,
          targetRevision: previous.revision,
          qcStatus: "PASS_WITH_NOTE",
          severity: "MINOR",
          confidence: 1,
          recommendedAction: "Opening handoff reconstructed from the reviewed existing CLIP 00 and its derived first-frame anchor."
        };
        openingLink = nextLink(
          previous,
          {
            handoffQcId: handoffQc.id,
            handoffUsable: true,
            preLinkMatch: "MATCH",
            linkStatus: "HANDOFF_PASS"
          },
          now
        );
        const {event, outbox} = eventOutbox({
          projectId: input.projectId,
          eventType: "OPENING_HANDOFF_QC_COMPLETED",
          targetType: "LINK",
          targetId: openingLink.id,
          trigger: "QC_RESULT",
          now,
          payload: {qcId: handoffQc.id, qcStatus: handoffQc.qcStatus}
        });
        await repo.commitHandoffQc({previous, next: openingLink, qc: handoffQc, event, outbox});
      }

      if (
        openingLink.linkStatus !== "HANDOFF_PASS" &&
        openingLink.linkStatus !== "FINAL_DESIGN_READY" &&
        openingLink.linkStatus !== "IMPLEMENTED"
      ) {
        throw new EditorOpeningMigrationError(
          "OPENING_LINK_STATE_INVALID",
          `Opening Link is not ready for final implementation: ${openingLink.linkStatus}`
        );
      }

      let openingClip = await repo.getActiveClipByLink(input.projectId, openingLink.id);
      if (openingClip === null) {
        const now = nowIso();
        const previousLink = openingLink;
        const clipId = id("clp");
        const finalDesignApprovalId = id("apr");
        openingLink = nextLink(
          previousLink,
          {
            implementationType: "CLIP",
            implementationRefId: clipId,
            linkStatus: "FINAL_DESIGN_READY"
          },
          now
        );
        const desiredDuration = input.durationMs === undefined
          ? openingMedia.durationMs
          : Math.min(openingMedia.durationMs, Math.max(1, Math.round(input.durationMs)));
        openingClip = {
          id: clipId,
          projectId: input.projectId,
          revision: 1,
          lifecycleStatus: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          stale: false,
          linkId: openingLink.id,
          linkRevision: openingLink.revision,
          clipMode: "DIRECT_START_END_I2V",
          clipStartStateRef: openingLink.fromStateRef,
          clipEndStateTarget: openingLink.toStateRef,
          startAssetId: startAsset.id,
          startAssetRevision: startAsset.revision,
          startMediaId: startMedia.id,
          endAssetId: primaryAsset.id,
          endAssetRevision: primaryAsset.revision,
          endMediaId: primaryMedia.id,
          transitionMethod: "DIRECT",
          cameraMove: "migration-preserved opening motion",
          subjectMotion: "migration-preserved opening motion",
          environmentMotion: "migration-preserved opening motion",
          durationMs: desiredDuration,
          providerExecutionRequired: true,
          finalDesignApprovalId,
          candidateMediaIds: [openingMedia.id],
          clipStatus: "CANDIDATE_AVAILABLE"
        };
        const approval: ApprovalRecord = {
          id: finalDesignApprovalId,
          projectId: input.projectId,
          targetType: "CLIP",
          targetId: openingClip.id,
          targetRevision: openingClip.revision,
          approvalState: "HUMAN_APPROVED",
          reason: "OPENING_FINAL_CLIP_DESIGN_MIGRATION_APPROVED",
          approvedByType: "USER",
          approvedById,
          createdAt: now
        };
        const {event, outbox} = eventOutbox({
          projectId: input.projectId,
          eventType: "OPENING_FINAL_CLIP_DESIGN_READY",
          targetType: "CLIP",
          targetId: openingClip.id,
          trigger: "USER",
          now,
          payload: {
            mediaId: openingMedia.id,
            designedDurationMs: desiredDuration,
            approvedById
          }
        });
        await repo.commitClipDesign({
          previousLink,
          nextLink: openingLink,
          previousClip: null,
          previousCut: null,
          clip: openingClip,
          approval,
          event,
          outbox
        });
      }

      if (openingClip.stale) {
        throw new EditorOpeningMigrationError(
          "OPENING_LINK_STATE_INVALID",
          "Opening Clip is stale."
        );
      }

      let openingQc = await repo.getLatestClipQc(input.projectId, openingClip.id);
      if (
        openingClip.clipStatus !== "APPROVED" ||
        openingClip.approvedMediaId !== openingMedia.id ||
        openingQc === null ||
        (openingQc.status !== "PASS" && openingQc.status !== "TRIM_PASS") ||
        openingQc.candidateMediaId !== openingMedia.id
      ) {
        if (openingQc === null || openingQc.candidateMediaId !== openingMedia.id) {
          const now = nowIso();
          const previous = openingClip;
          const sourceOutMs = Math.min(openingMedia.durationMs, previous.durationMs);
          const trim = sourceOutMs < openingMedia.durationMs;
          openingQc = {
            id: id("qc"),
            projectId: input.projectId,
            revision: 1,
            lifecycleStatus: "ACTIVE",
            createdAt: now,
            updatedAt: now,
            clipId: previous.id,
            clipRevision: previous.revision + 1,
            candidateMediaId: openingMedia.id,
            status: trim ? "TRIM_PASS" : "PASS",
            severity: "MINOR",
            confidence: 1,
            ...(trim ? {usableInMs: 0, usableOutMs: sourceOutMs} : {}),
            issues: trim ? ["MIGRATION_TRIM_TO_DESIGNED_DURATION"] : [],
            decisionId: `migration_opening_qc_${previous.id}_${openingMedia.id}`
          };
          openingClip = nextClip(previous, {clipStatus: "NEEDS_REVIEW"}, now);
          const {event, outbox} = eventOutbox({
            projectId: input.projectId,
            eventType: `OPENING_CLIP_QC_${openingQc.status}`,
            targetType: "CLIP",
            targetId: openingClip.id,
            trigger: "QC_RESULT",
            now,
            payload: {
              qcId: openingQc.id,
              candidateMediaId: openingMedia.id,
              usableInMs: openingQc.usableInMs ?? null,
              usableOutMs: openingQc.usableOutMs ?? null
            }
          });
          await repo.commitClipQc({
            previousClip: previous,
            nextClip: openingClip,
            qc: openingQc,
            event,
            outbox
          });
        }

        if (openingClip.clipStatus !== "APPROVED" || openingClip.approvedMediaId !== openingMedia.id) {
          const now = nowIso();
          const previous = openingClip;
          openingClip = nextClip(
            previous,
            {clipStatus: "APPROVED", approvedMediaId: openingMedia.id},
            now
          );
          const approval: ApprovalRecord = {
            id: id("apr"),
            projectId: input.projectId,
            targetType: "CLIP",
            targetId: openingClip.id,
            targetRevision: openingClip.revision,
            approvalState: "HUMAN_APPROVED",
            reason: openingQc.status === "TRIM_PASS"
              ? "OPENING_CLIP_QC_TRIM_PASS_APPROVED"
              : "OPENING_CLIP_QC_PASS_APPROVED",
            approvedByType: "USER",
            approvedById,
            selectedMediaId: openingMedia.id,
            createdAt: now
          };
          const {event, outbox} = eventOutbox({
            projectId: input.projectId,
            eventType: "OPENING_CLIP_QC_REVIEW_APPROVED",
            targetType: "CLIP",
            targetId: openingClip.id,
            trigger: "USER",
            now,
            payload: {qcId: openingQc.id, candidateMediaId: openingMedia.id, approvedById}
          });
          await repo.commitQcApproval({
            previousClip: previous,
            nextClip: openingClip,
            approval,
            event,
            outbox
          });
        }
      }

      return {
        projectId: input.projectId,
        status: "READY",
        reused: false,
        openingMediaId: openingMedia.id,
        extraStartAssetId: startAsset.id,
        extraStartAssetRevision: startAsset.revision,
        extraStartMediaId: startAsset.approvedMediaId,
        openingLinkId: openingLink.id,
        openingLinkRevision: openingLink.revision,
        openingClipId: openingClip.id,
        openingClipRevision: openingClip.revision,
        designedDurationMs: openingClip.durationMs,
        qcStatus: openingQc.status,
        sourceInMs: openingQc.status === "TRIM_PASS" ? openingQc.usableInMs ?? 0 : 0,
        sourceOutMs: openingQc.status === "TRIM_PASS" ? openingQc.usableOutMs ?? openingMedia.durationMs : openingMedia.durationMs
      };
    } finally {
      repo.close();
    }
  }
}
