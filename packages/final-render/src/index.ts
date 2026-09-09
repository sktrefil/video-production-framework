import {createHash} from "node:crypto";
import type {
  FinalDeliveryManifest,
  FinalRenderAttempt,
  FinalRenderReadiness,
  FinalRenderResultImport,
  FinalRenderTechnicalQcRecord,
  GenericEditProject,
  TimelineAssemblyRecord
} from "@vpf/domain";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";

export interface FinalRenderRepository {
  getLatestAssembly(projectId: string): Promise<TimelineAssemblyRecord | null>;
  getLatestRenderAttempt(projectId: string): Promise<FinalRenderAttempt | null>;
  getRenderAttempt(
    projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderAttempt | null>;
  getLatestTechnicalQc(
    projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderTechnicalQcRecord | null>;
  getLatestDeliveryManifest(projectId: string): Promise<FinalDeliveryManifest | null>;
  commitRenderAttempt(input: {
    previousAttempt: FinalRenderAttempt | null;
    nextAttempt: FinalRenderAttempt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitRenderOutcome(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    technicalQc: FinalRenderTechnicalQcRecord;
    previousDelivery: FinalDeliveryManifest | null;
    delivery: FinalDeliveryManifest;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitRenderFailure(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitRenderStale(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    previousDelivery: FinalDeliveryManifest | null;
    nextDelivery: FinalDeliveryManifest | null;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface FinalRenderClock {
  nowIso(): string;
}

export interface FinalRenderIdFactory {
  next(prefix: "render" | "qc" | "delivery" | "evt" | "outbox"): string;
}

export class FinalRenderValidationError extends Error {
  constructor(
    public readonly code:
      | "TIMELINE_NOT_READY"
      | "RENDER_NOT_FOUND"
      | "RENDER_STATE_INVALID"
      | "RENDER_ALREADY_DELIVERED"
      | "RENDER_RESULT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "FinalRenderValidationError";
  }
}

export interface PrepareRenderOutcome {
  renderAttempt: FinalRenderAttempt;
  created: boolean;
}

function durableEvent(
  ids: FinalRenderIdFactory,
  clock: FinalRenderClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): {event: WorkflowEvent; outbox: OutboxRecord} {
  const createdAt = clock.nowIso();
  const event: WorkflowEvent = {
    ...input,
    eventId: ids.next("evt"),
    createdAt
  };
  return {
    event,
    outbox: {
      outboxId: ids.next("outbox"),
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt
    }
  };
}

function projectSha256(project: GenericEditProject): string {
  return createHash("sha256").update(JSON.stringify(project)).digest("hex");
}

function expectedAudio(project: GenericEditProject): boolean {
  if (project.settings.masterVolume <= 0) return false;
  const trackById = new Map(project.tracks.map(track => [track.id, track]));
  return project.items.some(item => {
    if (
      item.type !== "TTS" &&
      item.type !== "CLIP_AUDIO" &&
      item.type !== "BGM" &&
      item.type !== "SFX"
    ) {
      return false;
    }
    const track = trackById.get(item.trackId);
    if (track?.enabled === false || item.enabled === false) return false;
    return item.muted !== true && item.volume > 0;
  });
}

function defaultPaths(projectId: string) {
  const base = "out/" + projectId;
  return {
    outputPath: base + "/final.mp4",
    gateReportPath: base + "/production_gate.json",
    renderPropsPath: base + "/render_props.json",
    renderManifestPath: base + "/render_manifest.json",
    technicalQcPath: base + "/technical_qc.json",
    deliveryManifestPath: base + "/delivery_manifest.json"
  };
}

function normalizeCodec(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function durationMs(frames: number, fps: number): number {
  return (frames / fps) * 1000;
}

function getTechnicalIssues(
  attempt: FinalRenderAttempt,
  result: FinalRenderResultImport
): string[] {
  const issues: string[] = [];
  if (result.schemaVersion !== 1 || result.status !== "RENDERED") {
    issues.push("RENDER_MANIFEST_INVALID");
  }
  if (result.projectId !== attempt.projectId) {
    issues.push("PROJECT_ID_MISMATCH");
  }
  if (result.projectSha256 !== attempt.projectSha256) {
    issues.push("PROJECT_SHA_MISMATCH");
  }
  if (result.compositionId !== attempt.profile.compositionId) {
    issues.push("COMPOSITION_MISMATCH");
  }
  if (
    result.metadata.fps !== attempt.expectedFps ||
    result.metadata.width !== attempt.expectedWidth ||
    result.metadata.height !== attempt.expectedHeight ||
    result.metadata.durationInFrames !== attempt.expectedDurationInFrames
  ) {
    issues.push("RENDER_METADATA_MISMATCH");
  }
  if (result.output.path !== attempt.paths.outputPath) {
    issues.push("OUTPUT_PATH_MISMATCH");
  }
  if (
    !Number.isFinite(result.output.sizeBytes) ||
    result.output.sizeBytes <= 0
  ) {
    issues.push("OUTPUT_EMPTY");
  }
  if (!isSha256(result.output.sha256)) {
    issues.push("OUTPUT_SHA_INVALID");
  }
  if (normalizeCodec(result.output.codec) !== attempt.profile.codec) {
    issues.push("DECLARED_VIDEO_CODEC_MISMATCH");
  }
  if (normalizeCodec(result.output.audioCodec) !== attempt.profile.audioCodec) {
    issues.push("DECLARED_AUDIO_CODEC_MISMATCH");
  }
  if (normalizeCodec(result.output.pixelFormat) !== attempt.profile.pixelFormat) {
    issues.push("DECLARED_PIXEL_FORMAT_MISMATCH");
  }
  if (result.output.crf !== attempt.profile.crf) {
    issues.push("DECLARED_CRF_MISMATCH");
  }

  const probe = result.probe;
  if (!normalizeCodec(probe.container).includes("mp4")) {
    issues.push("CONTAINER_NOT_MP4");
  }
  if (normalizeCodec(probe.videoCodec) !== "h264") {
    issues.push("VIDEO_CODEC_NOT_H264");
  }
  if (normalizeCodec(probe.pixelFormat) !== "yuv420p") {
    issues.push("PIXEL_FORMAT_NOT_YUV420P");
  }
  if (probe.width !== attempt.expectedWidth || probe.height !== attempt.expectedHeight) {
    issues.push("DIMENSIONS_MISMATCH");
  }
  if (!Number.isFinite(probe.fps) || Math.abs(probe.fps - attempt.expectedFps) > 0.01) {
    issues.push("FPS_MISMATCH");
  }

  const expectedDurationMs = durationMs(
    attempt.expectedDurationInFrames,
    attempt.expectedFps
  );
  const toleranceMs = Math.max(100, 2000 / attempt.expectedFps);
  if (
    !Number.isFinite(probe.durationMs) ||
    probe.durationMs <= 0 ||
    Math.abs(probe.durationMs - expectedDurationMs) > toleranceMs
  ) {
    issues.push("DURATION_MISMATCH");
  }

  if (attempt.expectedAudio) {
    if (!probe.hasAudioStream) {
      issues.push("AUDIO_STREAM_MISSING");
    } else if (normalizeCodec(probe.audioCodec) !== "aac") {
      issues.push("AUDIO_CODEC_NOT_AAC");
    }
  } else if (probe.hasAudioStream) {
    issues.push("UNEXPECTED_AUDIO_STREAM");
  }

  return [...new Set(issues)];
}

export class FinalRenderPipeline {
  constructor(
    private readonly repository: FinalRenderRepository,
    private readonly clock: FinalRenderClock,
    private readonly ids: FinalRenderIdFactory
  ) {}

  async prepareRender(input: {
    projectId: string;
    outputPath?: string;
  }): Promise<PrepareRenderOutcome> {
    await this.reconcileStale(input.projectId);
    const assembly = await this.requireReadyAssembly(input.projectId);
    const sha = projectSha256(assembly.editProject);
    const latest = await this.repository.getLatestRenderAttempt(input.projectId);

    if (
      latest !== null &&
      latest.assemblyId === assembly.id &&
      latest.assemblyRevision === assembly.revision &&
      latest.projectSha256 === sha &&
      (latest.status === "READY" ||
        latest.status === "RUNNING" ||
        latest.status === "DELIVERY_READY")
    ) {
      return {renderAttempt: latest, created: false};
    }

    const sameAssembly =
      latest !== null &&
      latest.assemblyId === assembly.id &&
      latest.assemblyRevision === assembly.revision &&
      latest.projectSha256 === sha;
    const retry =
      sameAssembly &&
      latest !== null &&
      (latest.status === "FAILED" ||
        latest.status === "TECHNICAL_QC_FAILED");
    const now = this.clock.nowIso();
    const paths = defaultPaths(input.projectId);
    if (input.outputPath !== undefined) {
      paths.outputPath = input.outputPath;
    }

    const renderAttempt: FinalRenderAttempt = {
      id: this.ids.next("render"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      assemblyId: assembly.id,
      assemblyRevision: assembly.revision,
      projectSha256: sha,
      attempt: retry && latest !== null ? latest.attempt + 1 : 1,
      ...(retry && latest !== null
        ? {retryOfRenderAttemptId: latest.id}
        : {}),
      status: "READY",
      profile: {
        compositionId: "GenericFinalRender",
        codec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        crf: 18
      },
      paths,
      expectedFps: assembly.editProject.project.fps,
      expectedWidth: assembly.editProject.project.width,
      expectedHeight: assembly.editProject.project.height,
      expectedDurationInFrames:
        assembly.editProject.project.durationInFrames,
      expectedAudio: expectedAudio(assembly.editProject)
    };

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: retry ? "FINAL_RENDER_RETRY_PREPARED" : "FINAL_RENDER_PREPARED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        renderAttemptId: renderAttempt.id,
        assemblyId: assembly.id,
        assemblyRevision: assembly.revision,
        projectSha256: sha,
        attempt: renderAttempt.attempt,
        outputPath: renderAttempt.paths.outputPath
      }
    });

    await this.repository.commitRenderAttempt({
      previousAttempt: null,
      nextAttempt: renderAttempt,
      event,
      outbox
    });
    return {renderAttempt, created: true};
  }

  async markRunning(input: {
    projectId: string;
    renderAttemptId: string;
  }): Promise<FinalRenderAttempt> {
    const previous = await this.requireAttempt(input.projectId, input.renderAttemptId);
    if (previous.status !== "READY") {
      throw new FinalRenderValidationError(
        "RENDER_STATE_INVALID",
        "Only a READY render attempt can enter RUNNING."
      );
    }
    const now = this.clock.nowIso();
    const next: FinalRenderAttempt = {
      ...previous,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "RUNNING",
      startedAt: previous.startedAt ?? now
    };
    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_RENDER_STARTED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        renderAttemptId: previous.id,
        renderAttemptRevision: next.revision
      }
    });
    await this.repository.commitRenderAttempt({
      previousAttempt: previous,
      nextAttempt: next,
      event,
      outbox
    });
    return next;
  }

  async failRender(input: {
    projectId: string;
    renderAttemptId: string;
    errorCode: string;
    errorDetail?: string;
  }): Promise<FinalRenderAttempt> {
    const previous = await this.requireAttempt(input.projectId, input.renderAttemptId);
    if (
      previous.status !== "READY" &&
      previous.status !== "RUNNING"
    ) {
      throw new FinalRenderValidationError(
        "RENDER_STATE_INVALID",
        "Only READY/RUNNING attempts can fail."
      );
    }
    const now = this.clock.nowIso();
    const next: FinalRenderAttempt = {
      ...previous,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "FAILED",
      completedAt: now,
      errorCode: input.errorCode,
      ...(input.errorDetail === undefined
        ? {}
        : {errorDetail: input.errorDetail})
    };
    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_RENDER_FAILED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        renderAttemptId: previous.id,
        errorCode: input.errorCode
      }
    });
    await this.repository.commitRenderFailure({
      previousAttempt: previous,
      nextAttempt: next,
      event,
      outbox
    });
    return next;
  }

  async importRenderResult(input: {
    projectId: string;
    renderAttemptId: string;
    result: FinalRenderResultImport;
  }): Promise<{
    renderAttempt: FinalRenderAttempt;
    technicalQc: FinalRenderTechnicalQcRecord;
    delivery: FinalDeliveryManifest;
  }> {
    const previous = await this.requireAttempt(input.projectId, input.renderAttemptId);
    if (
      previous.status !== "READY" &&
      previous.status !== "RUNNING"
    ) {
      if (previous.status === "DELIVERY_READY") {
        throw new FinalRenderValidationError(
          "RENDER_ALREADY_DELIVERED",
          "This render attempt is already delivery-ready."
        );
      }
      throw new FinalRenderValidationError(
        "RENDER_STATE_INVALID",
        "Render result can only be imported into READY/RUNNING attempts."
      );
    }

    const currentAssembly = await this.requireReadyAssembly(input.projectId);
    if (
      currentAssembly.id !== previous.assemblyId ||
      currentAssembly.revision !== previous.assemblyRevision ||
      projectSha256(currentAssembly.editProject) !== previous.projectSha256
    ) {
      throw new FinalRenderValidationError(
        "RENDER_RESULT_INVALID",
        "Render result targets a stale timeline assembly."
      );
    }

    const issueCodes = getTechnicalIssues(previous, input.result);
    const qcStatus: FinalRenderTechnicalQcRecord["status"] =
      issueCodes.length === 0 ? "PASS" : "FAIL";
    const now = this.clock.nowIso();

    const technicalQc: FinalRenderTechnicalQcRecord = {
      id: this.ids.next("qc"),
      projectId: input.projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      renderAttemptId: previous.id,
      renderAttemptRevision: previous.revision + 1,
      assemblyId: previous.assemblyId,
      assemblyRevision: previous.assemblyRevision,
      status: qcStatus,
      issueCodes,
      expected: {
        projectSha256: previous.projectSha256,
        fps: previous.expectedFps,
        width: previous.expectedWidth,
        height: previous.expectedHeight,
        durationInFrames: previous.expectedDurationInFrames,
        durationMs: durationMs(
          previous.expectedDurationInFrames,
          previous.expectedFps
        ),
        audioExpected: previous.expectedAudio,
        codec: previous.profile.codec,
        audioCodec: previous.profile.audioCodec,
        pixelFormat: previous.profile.pixelFormat
      },
      actual: structuredClone(input.result.probe),
      outputPath: input.result.output.path,
      outputSizeBytes: input.result.output.sizeBytes,
      outputSha256: input.result.output.sha256
    };

    const previousDelivery =
      await this.repository.getLatestDeliveryManifest(input.projectId);
    const delivery: FinalDeliveryManifest = {
      id: previousDelivery?.id ?? this.ids.next("delivery"),
      projectId: input.projectId,
      revision: previousDelivery === null ? 1 : previousDelivery.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previousDelivery?.createdAt ?? now,
      updatedAt: now,
      renderAttemptId: previous.id,
      renderAttemptRevision: previous.revision + 1,
      technicalQcId: technicalQc.id,
      technicalQcRevision: technicalQc.revision,
      assemblyId: previous.assemblyId,
      assemblyRevision: previous.assemblyRevision,
      projectSha256: previous.projectSha256,
      status: qcStatus === "PASS" ? "READY" : "BLOCKED",
      outputPath: input.result.output.path,
      outputSizeBytes: input.result.output.sizeBytes,
      outputSha256: input.result.output.sha256,
      codec: "h264",
      ...(input.result.probe.hasAudioStream ? {audioCodec: "aac"} : {}),
      pixelFormat: "yuv420p",
      fps: input.result.probe.fps,
      width: input.result.probe.width,
      height: input.result.probe.height,
      durationInFrames: previous.expectedDurationInFrames,
      durationMs: input.result.probe.durationMs,
      createdFromRenderManifestPath: previous.paths.renderManifestPath,
      technicalQcPath: previous.paths.technicalQcPath
    };

    const nextAttempt: FinalRenderAttempt = {
      ...previous,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: qcStatus === "PASS" ? "DELIVERY_READY" : "TECHNICAL_QC_FAILED",
      completedAt: input.result.renderedAt,
      ...(qcStatus === "FAIL"
        ? {
            errorCode: "TECHNICAL_QC_FAILED",
            errorDetail: issueCodes.join(",")
          }
        : {})
    };

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType:
        qcStatus === "PASS"
          ? "FINAL_RENDER_DELIVERY_READY"
          : "FINAL_RENDER_TECHNICAL_QC_FAILED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "QC_RESULT",
      payload: {
        renderAttemptId: previous.id,
        technicalQcId: technicalQc.id,
        technicalQcStatus: technicalQc.status,
        deliveryManifestId: delivery.id,
        deliveryStatus: delivery.status,
        issueCodes
      }
    });

    await this.repository.commitRenderOutcome({
      previousAttempt: previous,
      nextAttempt,
      technicalQc,
      previousDelivery,
      delivery,
      event,
      outbox
    });

    return {
      renderAttempt: nextAttempt,
      technicalQc,
      delivery
    };
  }

  async reconcileStale(projectId: string): Promise<boolean> {
    const latest = await this.repository.getLatestRenderAttempt(projectId);
    if (
      latest === null ||
      latest.status === "STALE"
    ) {
      return false;
    }
    const assembly = await this.repository.getLatestAssembly(projectId);
    const stale =
      assembly === null ||
      assembly.stale ||
      assembly.assemblyStatus !== "READY" ||
      assembly.id !== latest.assemblyId ||
      assembly.revision !== latest.assemblyRevision ||
      projectSha256(assembly.editProject) !== latest.projectSha256;

    if (!stale) return false;

    const now = this.clock.nowIso();
    const nextAttempt: FinalRenderAttempt = {
      ...latest,
      revision: latest.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "STALE",
      errorCode: "SOURCE_TIMELINE_CHANGED"
    };
    const previousDelivery =
      await this.repository.getLatestDeliveryManifest(projectId);
    const nextDelivery =
      previousDelivery !== null &&
      previousDelivery.renderAttemptId === latest.id &&
      previousDelivery.status !== "STALE"
        ? {
            ...previousDelivery,
            revision: previousDelivery.revision + 1,
            lifecycleStatus: "ACTIVE" as const,
            updatedAt: now,
            status: "STALE" as const
          }
        : null;

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "FINAL_RENDER_STALE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        renderAttemptId: latest.id,
        previousStatus: latest.status,
        reason: "SOURCE_TIMELINE_CHANGED"
      }
    });

    await this.repository.commitRenderStale({
      previousAttempt: latest,
      nextAttempt,
      previousDelivery,
      nextDelivery,
      event,
      outbox
    });
    return true;
  }

  async getReadiness(projectId: string): Promise<FinalRenderReadiness> {
    await this.reconcileStale(projectId);
    const attempt = await this.repository.getLatestRenderAttempt(projectId);
    if (attempt === null) {
      return {
        renderReady: false,
        technicalQcPassed: false,
        deliveryReady: false,
        status: "NOT_PREPARED",
        blockers: ["FINAL_RENDER_NOT_PREPARED"]
      };
    }

    const qc = await this.repository.getLatestTechnicalQc(
      projectId,
      attempt.id
    );
    const delivery = await this.repository.getLatestDeliveryManifest(projectId);

    if (attempt.status === "STALE") {
      return {
        renderReady: false,
        technicalQcPassed: false,
        deliveryReady: false,
        status: "STALE",
        blockers: ["FINAL_RENDER_STALE"]
      };
    }

    if (attempt.status === "FAILED") {
      return {
        renderReady: false,
        technicalQcPassed: false,
        deliveryReady: false,
        status: "FAILED",
        blockers: [attempt.errorCode ?? "FINAL_RENDER_FAILED"]
      };
    }

    if (attempt.status === "TECHNICAL_QC_FAILED") {
      return {
        renderReady: false,
        technicalQcPassed: false,
        deliveryReady: false,
        status: "TECHNICAL_QC_FAILED",
        blockers: qc?.issueCodes ?? ["TECHNICAL_QC_FAILED"]
      };
    }

    if (
      attempt.status === "DELIVERY_READY" &&
      qc?.status === "PASS" &&
      delivery?.status === "READY" &&
      delivery.renderAttemptId === attempt.id
    ) {
      return {
        renderReady: false,
        technicalQcPassed: true,
        deliveryReady: true,
        status: "DELIVERY_READY",
        blockers: []
      };
    }

    return {
      renderReady: attempt.status === "READY",
      technicalQcPassed: false,
      deliveryReady: false,
      status: attempt.status === "RUNNING" ? "RUNNING" : "READY",
      blockers:
        attempt.status === "RUNNING"
          ? ["FINAL_RENDER_RUNNING"]
          : []
    };
  }

  private async requireReadyAssembly(projectId: string): Promise<TimelineAssemblyRecord> {
    const assembly = await this.repository.getLatestAssembly(projectId);
    if (
      assembly === null ||
      assembly.stale ||
      assembly.assemblyStatus !== "READY"
    ) {
      throw new FinalRenderValidationError(
        "TIMELINE_NOT_READY",
        "Final Render requires the current WF-16 timeline assembly to be READY."
      );
    }
    return assembly;
  }

  private async requireAttempt(
    projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderAttempt> {
    const attempt = await this.repository.getRenderAttempt(
      projectId,
      renderAttemptId
    );
    if (attempt === null) {
      throw new FinalRenderValidationError(
        "RENDER_NOT_FOUND",
        "Final render attempt does not exist."
      );
    }
    return attempt;
  }
}
