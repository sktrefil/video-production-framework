import {randomUUID} from "node:crypto";
import type {ApprovalRecord, ClipQcRecord, ProductionClip} from "@vpf/domain";
import {ProjectBootstrapService} from "@vpf/project-bootstrap";
import {SqliteMediaBindingRepository} from "@vpf/storage/media-binding";
import {EditorOpeningMigrationError, EditorOpeningMigrationService} from "./editor-opening-migration.js";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const nowIso = () => new Date().toISOString();

function desiredDuration(requestedMs: number, sourceDurationMs: number): number {
  return Math.min(sourceDurationMs, Math.max(1, Math.round(requestedMs)));
}

function qcMatchesDuration(
  qc: ClipQcRecord | null,
  mediaId: string,
  desiredMs: number,
  sourceDurationMs: number
): boolean {
  if (qc === null || qc.candidateMediaId !== mediaId) return false;
  if (desiredMs < sourceDurationMs) {
    return qc.status === "TRIM_PASS" && qc.usableInMs === 0 && qc.usableOutMs === desiredMs;
  }
  return qc.status === "PASS";
}

export class EditorOpeningMigrationReconcilerService {
  constructor(
    private readonly base = new EditorOpeningMigrationService(),
    private readonly projects = new ProjectBootstrapService()
  ) {}

  async migrate(input: {
    projectId: string;
    approvedById: string;
    confirmReviewed: boolean;
    durationMs?: number;
  }) {
    const baseResult = await this.base.migrate(input);
    if (input.durationMs === undefined) {
      return {...baseResult, durationReconciled: false};
    }

    const status = await this.projects.getStatus(input.projectId);
    const repo = new SqliteMediaBindingRepository(status.projectDbPath);
    try {
      const clip = await repo.getLatestClip(input.projectId, baseResult.openingClipId);
      const media = await repo.getMedia(input.projectId, baseResult.openingMediaId);
      if (clip === null || clip.stale) {
        throw new EditorOpeningMigrationError(
          "OPENING_LINK_STATE_INVALID",
          "Opening Clip is unavailable or stale during duration reconciliation."
        );
      }
      if (
        media === null ||
        media.mediaStatus !== "AVAILABLE" ||
        media.mediaType !== "VIDEO" ||
        media.durationMs === undefined ||
        !Number.isFinite(media.durationMs) ||
        media.durationMs <= 0
      ) {
        throw new EditorOpeningMigrationError(
          "OPENING_VIDEO_REQUIRED",
          "Opening duration reconciliation requires the AVAILABLE CLIP 00 video with positive duration."
        );
      }

      const targetDurationMs = desiredDuration(input.durationMs, media.durationMs);
      const currentQc = await repo.getLatestClipQc(input.projectId, clip.id);
      const alreadyMatches =
        clip.durationMs === targetDurationMs &&
        clip.clipStatus === "APPROVED" &&
        clip.approvedMediaId === media.id &&
        qcMatchesDuration(currentQc, media.id, targetDurationMs, media.durationMs) &&
        await repo.hasClipMediaApproval(
          input.projectId,
          clip.id,
          clip.revision,
          media.id
        );

      if (alreadyMatches) {
        return {
          ...baseResult,
          openingClipRevision: clip.revision,
          designedDurationMs: targetDurationMs,
          qcStatus: currentQc!.status,
          sourceInMs: currentQc!.status === "TRIM_PASS" ? currentQc!.usableInMs ?? 0 : 0,
          sourceOutMs: currentQc!.status === "TRIM_PASS" ? currentQc!.usableOutMs ?? targetDurationMs : media.durationMs,
          durationReconciled: false
        };
      }

      const now = nowIso();
      const trim = targetDurationMs < media.durationMs;
      const nextClip: ProductionClip = {
        ...clip,
        revision: clip.revision + 1,
        lifecycleStatus: "ACTIVE",
        updatedAt: now,
        durationMs: targetDurationMs,
        candidateMediaIds: [...new Set([...clip.candidateMediaIds, media.id])],
        approvedMediaId: media.id,
        clipStatus: "APPROVED"
      };
      const qc: ClipQcRecord = {
        id: id("qc"),
        projectId: input.projectId,
        revision: 1,
        lifecycleStatus: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        clipId: clip.id,
        clipRevision: nextClip.revision,
        candidateMediaId: media.id,
        status: trim ? "TRIM_PASS" : "PASS",
        severity: "MINOR",
        confidence: 1,
        ...(trim ? {usableInMs: 0, usableOutMs: targetDurationMs} : {}),
        issues: trim ? ["MIGRATION_TRIM_TO_REQUESTED_OPENING_DURATION"] : [],
        decisionId: `migration_opening_duration_${clip.id}_${targetDurationMs}`
      };
      const approval: ApprovalRecord = {
        id: id("apr"),
        projectId: input.projectId,
        targetType: "CLIP",
        targetId: clip.id,
        targetRevision: nextClip.revision,
        approvalState: "HUMAN_APPROVED",
        reason: trim
          ? "OPENING_DURATION_RECONCILED_TRIM_PASS"
          : "OPENING_DURATION_RECONCILED_PASS",
        approvedByType: "USER",
        approvedById: input.approvedById.trim(),
        selectedMediaId: media.id,
        createdAt: now
      };
      const eventId = id("evt");
      await repo.commitClipQc({
        previousClip: clip,
        nextClip,
        qc,
        approval,
        event: {
          eventId,
          projectId: input.projectId,
          eventType: "OPENING_CLIP_DURATION_RECONCILED",
          targetType: "CLIP",
          targetId: clip.id,
          trigger: "USER",
          payload: {
            previousDurationMs: clip.durationMs,
            requestedDurationMs: input.durationMs,
            designedDurationMs: targetDurationMs,
            sourceDurationMs: media.durationMs,
            qcStatus: qc.status,
            approvedById: input.approvedById.trim()
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

      return {
        ...baseResult,
        reused: false,
        openingClipRevision: nextClip.revision,
        designedDurationMs: targetDurationMs,
        qcStatus: qc.status,
        sourceInMs: 0,
        sourceOutMs: trim ? targetDurationMs : media.durationMs,
        durationReconciled: true
      };
    } finally {
      repo.close();
    }
  }
}
