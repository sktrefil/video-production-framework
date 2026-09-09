import type {
  EditorContentPlan,
  EditorContentPlanRef,
  EditorCutBoundary,
  EditorHandoffManifest,
  EditorMotionDirective,
  GenericEditProject,
  GenericEditorAudioItem,
  GenericEditorGraphicItem,
  GenericEditorImageItem,
  GenericEditorImageMotionSpec,
  GenericEditorSubtitleItem,
  GenericEditorTextItem,
  GenericEditorVideoItem,
  MediaArtifact,
  TimelineAssemblyOutput,
  TimelineAssemblyRecord
} from "@vpf/domain";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface EditorHandoffSourcePort {
  buildEditorHandoff(projectId: string): Promise<EditorHandoffManifest>;
}

export interface EditorContentSourcePort {
  getLatestEditorContentPlan(projectId: string): Promise<EditorContentPlan | null>;
  getMedia(projectId: string, mediaId: string): Promise<MediaArtifact | null>;
}

export interface EditorContentPlanRepository extends EditorContentSourcePort {
  commitEditorContentPlan(input: {
    previousPlan: EditorContentPlan | null;
    plan: EditorContentPlan;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface TimelineAssemblyRepository {
  getLatestAssembly(projectId: string): Promise<TimelineAssemblyRecord | null>;
  commitAssembly(input: {
    previousAssembly: TimelineAssemblyRecord | null;
    assembly: TimelineAssemblyRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  markAssemblyStale(input: {
    previousAssembly: TimelineAssemblyRecord;
    nextAssembly: TimelineAssemblyRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface TimelineAssemblyClock {
  nowIso(): string;
}

export interface TimelineAssemblyIdFactory {
  next(prefix: "assembly" | "content-plan" | "evt" | "outbox"): string;
}

export interface TimelineProfile {
  fps: number;
  width: number;
  height: number;
  snapEnabled?: boolean;
  snapToleranceFrames?: number;
  timelineZoom?: number;
  masterVolume?: number;
  videoVolume?: number;
}

export class TimelineAssemblyValidationError extends Error {
  constructor(
    public readonly code:
      | "PROFILE_INVALID"
      | "MEDIA_BINDING_NOT_READY"
      | "SOURCE_PATH_REQUIRED"
      | "SOURCE_DURATION_REQUIRED"
      | "SOURCE_WINDOW_INVALID",
    message: string
  ) {
    super(message);
    this.name = "TimelineAssemblyValidationError";
  }
}

export interface TimelineAssemblyOutcome {
  assembly: TimelineAssemblyRecord;
  output: TimelineAssemblyOutput;
  created: boolean;
}

export interface EditorContentPlanInput {
  projectId: string;
  planStatus: EditorContentPlan["planStatus"];
  audio: EditorContentPlan["audio"];
  subtitles: EditorContentPlan["subtitles"];
  textOverlays: EditorContentPlan["textOverlays"];
  graphics: EditorContentPlan["graphics"];
}

export class EditorContentPlanService {
  constructor(
    private readonly repository: EditorContentPlanRepository,
    private readonly clock: TimelineAssemblyClock,
    private readonly ids: TimelineAssemblyIdFactory
  ) {}

  async savePlan(input: EditorContentPlanInput): Promise<EditorContentPlan> {
    const previous = await this.repository.getLatestEditorContentPlan(input.projectId);
    const now = this.clock.nowIso();
    const plan: EditorContentPlan = {
      id: previous?.id ?? this.ids.next("content-plan"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      planStatus: input.planStatus,
      audio: structuredClone(input.audio),
      subtitles: structuredClone(input.subtitles),
      textOverlays: structuredClone(input.textOverlays),
      graphics: structuredClone(input.graphics)
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "EDITOR_CONTENT_PLAN_SAVED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        contentPlanId: plan.id,
        contentPlanRevision: plan.revision,
        planStatus: plan.planStatus,
        audioCount: plan.audio.length,
        subtitleCount: plan.subtitles.length,
        textOverlayCount: plan.textOverlays.length,
        graphicCount: plan.graphics.length
      }
    });

    await this.repository.commitEditorContentPlan({
      previousPlan: previous,
      plan,
      event,
      outbox
    });
    return plan;
  }
}


function durableEvent(
  ids: TimelineAssemblyIdFactory,
  clock: TimelineAssemblyClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): { event: WorkflowEvent; outbox: OutboxRecord } {
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

function validateProfile(profile: TimelineProfile): void {
  if (
    !Number.isInteger(profile.fps) ||
    profile.fps <= 0 ||
    !Number.isInteger(profile.width) ||
    profile.width <= 0 ||
    !Number.isInteger(profile.height) ||
    profile.height <= 0
  ) {
    throw new TimelineAssemblyValidationError(
      "PROFILE_INVALID",
      "Timeline profile requires positive integer fps, width, and height."
    );
  }
  for (const value of [
    profile.snapToleranceFrames,
    profile.timelineZoom,
    profile.masterVolume,
    profile.videoVolume
  ]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new TimelineAssemblyValidationError(
        "PROFILE_INVALID",
        "Timeline profile numeric settings must be finite and non-negative."
      );
    }
  }
}

function frameAt(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

function durationFrames(ms: number, fps: number): number {
  return Math.max(1, frameAt(ms, fps));
}

function clampMotionStrength(value: number, fallback: number): number {
  const normalized = Number.isFinite(value) ? value : fallback;
  return Math.min(12, Math.max(2, normalized));
}

function motionStrength(cameraMove: string | undefined, fallback: number): number {
  if (cameraMove === undefined) return fallback;
  const match = cameraMove.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  return clampMotionStrength(match === null ? fallback : Number(match[1]), fallback);
}

function compileImageMotion(input: {
  clipMode: "EDITORIAL_MOVE" | "REUSE_REFRAME";
  cameraMove?: string;
  width: number;
  height: number;
}): GenericEditorImageMotionSpec {
  const text = (input.cameraMove ?? "").toLowerCase();
  const strength = motionStrength(
    input.cameraMove,
    input.clipMode === "REUSE_REFRAME" ? 7 : 5
  );
  const ratio = strength / 100;
  const travelX = Math.round(input.width * ratio);
  const travelY = Math.round(input.height * ratio);

  const left = /(?:pan|move|shift|reframe)\s+(?:to\s+)?(?:the\s+)?left|leftward/.test(text);
  const right = /(?:pan|move|shift|reframe)\s+(?:to\s+)?(?:the\s+)?right|rightward/.test(text);
  const up = /(?:pan|move|shift|reframe)\s+(?:to\s+)?(?:the\s+)?(?:up|top)|upward/.test(text);
  const down = /(?:pan|move|shift|reframe)\s+(?:to\s+)?(?:the\s+)?(?:down|bottom)|downward/.test(text);
  const directional = left || right || up || down;

  const pushOut = /(?:push|zoom|dolly)[\s-]*out/.test(text);
  const pushIn = /(?:push|zoom|dolly)[\s-]*in/.test(text);
  const explicitScale = pushIn || pushOut;

  const from = {
    x: 0,
    y: 0,
    scale: directional && !explicitScale ? 1 + ratio : pushOut ? 1 + ratio : 1,
    rotation: 0,
    opacity: 1
  };
  const to = {
    x: left ? -travelX : right ? travelX : 0,
    y: up ? -travelY : down ? travelY : 0,
    scale: directional && !explicitScale ? 1 + ratio : pushOut ? 1 : 1 + ratio,
    rotation: 0,
    opacity: 1
  };

  return {
    kind: "TRANSFORM",
    from,
    to,
    easing: "EASE_IN_OUT"
  };
}

function contentRefEqual(
  a: EditorContentPlanRef | undefined,
  b: EditorContentPlanRef | undefined
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.contentPlanId === b.contentPlanId &&
    a.contentPlanRevision === b.contentPlanRevision
  );
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function audioTrackId(type: GenericEditorAudioItem["type"]): string {
  if (type === "TTS") return "A1";
  if (type === "CLIP_AUDIO") return "A2";
  if (type === "BGM") return "A3";
  return "A4";
}

function defaultAudioVolume(type: GenericEditorAudioItem["type"]): number {
  if (type === "TTS") return 1;
  if (type === "CLIP_AUDIO") return 0.12;
  if (type === "BGM") return 0.1;
  return 0.35;
}

function defaultSubtitleStyle(
  width: number,
  height: number,
  style: EditorContentPlan["subtitles"][number]["style"]
): Omit<
  GenericEditorSubtitleItem,
  | "id"
  | "type"
  | "trackId"
  | "timelineStartFrame"
  | "durationInFrames"
  | "enabled"
  | "locked"
  | "generationSource"
  | "generatedFromTtsIds"
  | "text"
> {
  const minimumDimension = Math.min(width, height);
  return {
    x: finiteNonNegative(style?.x, width / 2),
    y: finiteNonNegative(style?.y, height * 0.86),
    width: finitePositive(style?.width, width * 0.8667),
    fontFamily: style?.fontFamily?.trim() || "VITRO",
    fontSize: finitePositive(style?.fontSize, minimumDimension * 0.085),
    fontWeight: finitePositive(style?.fontWeight, 700),
    color: style?.color?.trim() || "#FFFDF7",
    strokeColor: style?.strokeColor?.trim() || "#17130F",
    strokeWidth: finiteNonNegative(style?.strokeWidth, 4),
    textAlign: style?.textAlign ?? "center",
    lineHeight: finitePositive(style?.lineHeight, 1.16),
    maxLines: Math.max(1, Math.round(finitePositive(style?.maxLines, 2))),
    backgroundEnabled: style?.backgroundEnabled ?? false,
    backgroundColor: style?.backgroundColor?.trim() || "#000000",
    backgroundOpacity: Math.min(
      1,
      finiteNonNegative(style?.backgroundOpacity, 0.4)
    )
  };
}

function refsEqual(
  a: TimelineAssemblyRecord["sourceBindingRefs"],
  b: TimelineAssemblyRecord["sourceBindingRefs"]
): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) =>
      item.bindingId === b[index]?.bindingId &&
      item.bindingRevision === b[index]?.bindingRevision
    )
  );
}

function profileEqual(
  assembly: TimelineAssemblyRecord,
  input: {
    projectName: string;
    profile: TimelineProfile;
  }
): boolean {
  const settings = assembly.editProject.settings;
  return (
    assembly.fps === input.profile.fps &&
    assembly.width === input.profile.width &&
    assembly.height === input.profile.height &&
    assembly.editProject.project.name === input.projectName &&
    settings.snapEnabled === (input.profile.snapEnabled ?? true) &&
    settings.snapToleranceFrames === (input.profile.snapToleranceFrames ?? 4) &&
    settings.timelineZoom === (input.profile.timelineZoom ?? 1) &&
    settings.masterVolume === (input.profile.masterVolume ?? 1) &&
    assembly.editProject.items
      .filter(item => item.type === "VIDEO")
      .every(item => item.type === "VIDEO" && item.volume === (input.profile.videoVolume ?? 0))
  );
}

function baseTracks(includeContentLayers: boolean): GenericEditProject["tracks"] {
  const tracks: GenericEditProject["tracks"] = [
    { id: "V1", type: "VIDEO", name: "Main Visual", enabled: true, locked: false, order: 0 },
    { id: "G1", type: "GRAPHIC", name: "Graphics", enabled: true, locked: false, order: 1 },
    { id: "T1", type: "TEXT", name: "Subtitles", enabled: true, locked: false, order: 2 },
    { id: "A1", type: "AUDIO", name: "TTS", enabled: true, locked: false, order: 3 }
  ];
  if (!includeContentLayers) return tracks;
  tracks.push(
    { id: "T2", type: "TEXT", name: "Text", enabled: true, locked: false, order: 4 },
    { id: "A2", type: "AUDIO", name: "Clip Audio", enabled: true, locked: false, order: 5 },
    { id: "A3", type: "AUDIO", name: "BGM", enabled: true, locked: false, order: 6 },
    { id: "A4", type: "AUDIO", name: "SFX", enabled: true, locked: false, order: 7 }
  );
  return tracks;
}

export class EditorTimelineAssemblyPipeline {
  constructor(
    private readonly repository: TimelineAssemblyRepository,
    private readonly handoff: EditorHandoffSourcePort,
    private readonly clock: TimelineAssemblyClock,
    private readonly ids: TimelineAssemblyIdFactory,
    private readonly contentSource?: EditorContentSourcePort
  ) {}

  async assembleProject(input: {
    projectId: string;
    projectName: string;
    profile: TimelineProfile;
  }): Promise<TimelineAssemblyOutcome> {
    validateProfile(input.profile);
    const source = await this.handoff.buildEditorHandoff(input.projectId);
    const contentPlan =
      this.contentSource === undefined
        ? null
        : await this.contentSource.getLatestEditorContentPlan(input.projectId);
    const sourceBindingRefs = source.items.map(item => ({
      bindingId: item.bindingId,
      bindingRevision: item.bindingRevision
    }));
    const sourceContentPlanRef: EditorContentPlanRef | undefined =
      contentPlan === null
        ? undefined
        : {
            contentPlanId: contentPlan.id,
            contentPlanRevision: contentPlan.revision
          };
    const previous = await this.repository.getLatestAssembly(input.projectId);

    if (
      previous !== null &&
      !previous.stale &&
      refsEqual(previous.sourceBindingRefs, sourceBindingRefs) &&
      contentRefEqual(previous.sourceContentPlanRef, sourceContentPlanRef) &&
      profileEqual(previous, input)
    ) {
      return {
        assembly: previous,
        output: this.toOutput(previous),
        created: false
      };
    }

    const now = this.clock.nowIso();
    const blockers: string[] = [];
    const cutBoundaries: EditorCutBoundary[] = [];
    const motionDirectives: EditorMotionDirective[] = [];
    const items: GenericEditProject["items"] = [];
    let cursor = 0;

    if (source.status !== "READY") {
      blockers.push("MEDIA_BINDING_NOT_READY");
      for (const blocker of source.blockers) {
        blockers.push(
          "BINDING_BLOCKER:" +
            blocker.implementationType +
            ":" +
            blocker.implementationId +
            ":" +
            blocker.reason
        );
      }
    }

    for (const item of source.items) {
      if (item.bindingKind === "CUT") {
        cutBoundaries.push({
          order: item.order,
          timelineFrame: cursor,
          linkId: item.linkId,
          implementationId: item.implementationId,
          transitionMethod: item.transitionMethod
        });
        continue;
      }

      if (item.relativePath === undefined || !item.relativePath.trim()) {
        blockers.push("SOURCE_PATH_REQUIRED:" + item.bindingId);
        continue;
      }

      const itemId = "visual-" + item.bindingId + "-r" + item.bindingRevision;

      if (item.bindingKind === "VIDEO") {
        if (
          item.sourceInMs === undefined ||
          item.sourceOutMs === undefined ||
          item.sourceAssetDurationMs === undefined
        ) {
          blockers.push("SOURCE_DURATION_REQUIRED:" + item.bindingId);
          continue;
        }
        const sourceStartFrame = frameAt(item.sourceInMs, input.profile.fps);
        const sourceOutFrame = frameAt(item.sourceOutMs, input.profile.fps);
        const sourceDurationInFrames = sourceOutFrame - sourceStartFrame;
        const sourceAssetDurationInFrames = frameAt(
          item.sourceAssetDurationMs,
          input.profile.fps
        );
        if (
          sourceStartFrame < 0 ||
          sourceDurationInFrames <= 0 ||
          sourceAssetDurationInFrames <= 0 ||
          sourceStartFrame + sourceDurationInFrames > sourceAssetDurationInFrames
        ) {
          blockers.push("SOURCE_WINDOW_INVALID:" + item.bindingId);
          continue;
        }

        const visual: GenericEditorVideoItem = {
          id: itemId,
          type: "VIDEO",
          trackId: "V1",
          timelineStartFrame: cursor,
          durationInFrames: sourceDurationInFrames,
          enabled: true,
          locked: false,
          src: item.relativePath,
          sourceStartFrame,
          sourceDurationInFrames,
          sourceAssetDurationInFrames,
          playbackRate: 1,
          volume: input.profile.videoVolume ?? 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fit: "cover"
        };
        items.push(visual);
        cursor += sourceDurationInFrames;
        continue;
      }

      const frames = durationFrames(item.durationMs, input.profile.fps);
      const compiledMotion =
        item.clipMode === "EDITORIAL_MOVE" || item.clipMode === "REUSE_REFRAME"
          ? compileImageMotion({
              clipMode: item.clipMode,
              ...(item.cameraMove === undefined ? {} : { cameraMove: item.cameraMove }),
              width: input.profile.width,
              height: input.profile.height
            })
          : undefined;

      const visual: GenericEditorImageItem = {
        id: itemId,
        type: "IMAGE",
        trackId: "V1",
        timelineStartFrame: cursor,
        durationInFrames: frames,
        enabled: true,
        locked: false,
        src: item.relativePath,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        fit: "cover",
        ...(compiledMotion === undefined ? {} : { motion: compiledMotion })
      };
      items.push(visual);

      if (
        compiledMotion !== undefined &&
        (item.clipMode === "EDITORIAL_MOVE" || item.clipMode === "REUSE_REFRAME")
      ) {
        motionDirectives.push({
          itemId,
          bindingId: item.bindingId,
          clipMode: item.clipMode,
          ...(item.cameraMove === undefined ? {} : { cameraMove: item.cameraMove }),
          ...(item.subjectMotion === undefined ? {} : { subjectMotion: item.subjectMotion }),
          ...(item.environmentMotion === undefined ? {} : { environmentMotion: item.environmentMotion }),
          supportedByCurrentRenderer: true,
          compiledMotion
        });
      }
      cursor += frames;
    }

    const visualItemCount = items.length;

    if (contentPlan !== null) {
      if (contentPlan.planStatus !== "APPROVED") {
        blockers.push("CONTENT_PLAN_NOT_APPROVED");
      } else if (this.contentSource === undefined) {
        blockers.push("CONTENT_SOURCE_UNAVAILABLE");
      } else {
        await this.appendContentPlan({
          projectId: input.projectId,
          plan: contentPlan,
          profile: input.profile,
          projectDurationInFrames: cursor,
          items,
          blockers
        });
      }
    }

    if (visualItemCount === 0) {
      blockers.push("NO_RENDERABLE_VISUAL_ITEMS");
    }

    const status: TimelineAssemblyRecord["assemblyStatus"] =
      visualItemCount === 0
        ? "BLOCKED"
        : blockers.length === 0
          ? "READY"
          : "PARTIAL";

    const editProject: GenericEditProject = {
      schemaVersion: 1,
      project: {
        id: input.projectId,
        name: input.projectName,
        fps: input.profile.fps,
        width: input.profile.width,
        height: input.profile.height,
        durationInFrames: cursor
      },
      tracks: baseTracks(contentPlan !== null),
      items,
      settings: {
        snapEnabled: input.profile.snapEnabled ?? true,
        snapToleranceFrames: input.profile.snapToleranceFrames ?? 4,
        timelineZoom: input.profile.timelineZoom ?? 1,
        masterVolume: input.profile.masterVolume ?? 1
      }
    };

    const assembly: TimelineAssemblyRecord = {
      id: previous?.id ?? this.ids.next("assembly"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      sourceBindingRefs,
      ...(sourceContentPlanRef === undefined ? {} : { sourceContentPlanRef }),
      fps: input.profile.fps,
      width: input.profile.width,
      height: input.profile.height,
      assemblyStatus: status,
      stale: false,
      editProject,
      cutBoundaries,
      motionDirectives,
      blockers
    };

    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "EDITOR_TIMELINE_ASSEMBLED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        assemblyId: assembly.id,
        assemblyRevision: assembly.revision,
        status,
        durationInFrames: cursor,
        itemCount: items.length,
        cutBoundaryCount: cutBoundaries.length,
        motionDirectiveCount: motionDirectives.length,
        contentPlanRevision: sourceContentPlanRef?.contentPlanRevision ?? null,
        audioItemCount: items.filter(item =>
          item.type === "TTS" ||
          item.type === "CLIP_AUDIO" ||
          item.type === "BGM" ||
          item.type === "SFX"
        ).length,
        subtitleItemCount: items.filter(item => item.type === "SUBTITLE").length,
        textItemCount: items.filter(item => item.type === "TEXT").length,
        graphicItemCount: items.filter(item => item.type === "GRAPHIC").length
      }
    });
    await this.repository.commitAssembly({
      previousAssembly: previous,
      assembly,
      event,
      outbox
    });

    return {
      assembly,
      output: this.toOutput(assembly),
      created: true
    };
  }

  private async appendContentPlan(input: {
    projectId: string;
    plan: EditorContentPlan;
    profile: TimelineProfile;
    projectDurationInFrames: number;
    items: GenericEditProject["items"];
    blockers: string[];
  }): Promise<void> {
    if (this.contentSource === undefined) {
      input.blockers.push("CONTENT_SOURCE_UNAVAILABLE");
      return;
    }

    const fps = input.profile.fps;
    const usedPlanIds = new Set<string>();
    const ttsWindows = new Map<
      string,
      { itemId: string; startFrame: number; endFrame: number }
    >();

    for (const placement of input.plan.audio) {
      if (!placement.id.trim() || usedPlanIds.has("audio:" + placement.id)) {
        input.blockers.push("CONTENT_AUDIO_ID_INVALID:" + placement.id);
        continue;
      }
      usedPlanIds.add("audio:" + placement.id);

      if (
        !Number.isFinite(placement.timelineStartMs) ||
        placement.timelineStartMs < 0
      ) {
        input.blockers.push("CONTENT_AUDIO_START_INVALID:" + placement.id);
        continue;
      }
      if (placement.loop === true && placement.type !== "BGM") {
        input.blockers.push("CONTENT_AUDIO_LOOP_INVALID:" + placement.id);
        continue;
      }

      const media = await this.contentSource.getMedia(
        input.projectId,
        placement.mediaId
      );
      if (
        media === null ||
        media.lifecycleStatus !== "ACTIVE" ||
        media.mediaStatus !== "AVAILABLE" ||
        media.mediaType !== "AUDIO" ||
        media.durationMs === undefined ||
        !Number.isFinite(media.durationMs) ||
        media.durationMs <= 0 ||
        !media.relativePath.trim()
      ) {
        input.blockers.push("CONTENT_AUDIO_MEDIA_INVALID:" + placement.id);
        continue;
      }

      const sourceInMs = placement.sourceInMs ?? 0;
      const sourceOutMs = placement.sourceOutMs ?? media.durationMs;
      if (
        !Number.isFinite(sourceInMs) ||
        !Number.isFinite(sourceOutMs) ||
        sourceInMs < 0 ||
        sourceOutMs <= sourceInMs ||
        sourceOutMs > media.durationMs
      ) {
        input.blockers.push("CONTENT_AUDIO_SOURCE_WINDOW_INVALID:" + placement.id);
        continue;
      }

      const sourceStartFrame = frameAt(sourceInMs, fps);
      const sourceOutFrame = frameAt(sourceOutMs, fps);
      const sourceDurationInFrames = sourceOutFrame - sourceStartFrame;
      const sourceAssetDurationInFrames = frameAt(media.durationMs, fps);
      if (
        sourceStartFrame < 0 ||
        sourceDurationInFrames <= 0 ||
        sourceAssetDurationInFrames <= 0 ||
        sourceStartFrame + sourceDurationInFrames >
          sourceAssetDurationInFrames
      ) {
        input.blockers.push("CONTENT_AUDIO_SOURCE_FRAME_INVALID:" + placement.id);
        continue;
      }

      const timelineStartFrame = frameAt(placement.timelineStartMs, fps);
      const remainingFrames =
        input.projectDurationInFrames - timelineStartFrame;
      if (timelineStartFrame < 0 || remainingFrames <= 0) {
        input.blockers.push("CONTENT_AUDIO_OUTSIDE_TIMELINE:" + placement.id);
        continue;
      }

      const requestedDurationMs =
        placement.durationMs ??
        (placement.type === "BGM" && placement.loop === true
          ? (remainingFrames / fps) * 1000
          : sourceOutMs - sourceInMs);
      if (
        !Number.isFinite(requestedDurationMs) ||
        requestedDurationMs <= 0
      ) {
        input.blockers.push("CONTENT_AUDIO_DURATION_INVALID:" + placement.id);
        continue;
      }

      const timelineDurationInFrames = frameAt(requestedDurationMs, fps);
      if (
        timelineDurationInFrames <= 0 ||
        timelineDurationInFrames > remainingFrames
      ) {
        input.blockers.push("CONTENT_AUDIO_EXCEEDS_TIMELINE:" + placement.id);
        continue;
      }
      if (
        placement.loop !== true &&
        timelineDurationInFrames > sourceDurationInFrames
      ) {
        input.blockers.push("CONTENT_AUDIO_EXCEEDS_SOURCE:" + placement.id);
        continue;
      }

      const fadeInFrames = Math.min(
        timelineDurationInFrames,
        Math.max(
          0,
          frameAt(
            placement.fadeInMs ??
              (placement.type === "BGM" ? 500 : 0),
            fps
          )
        )
      );
      const fadeOutFrames = Math.min(
        timelineDurationInFrames,
        Math.max(
          0,
          frameAt(
            placement.fadeOutMs ??
              (placement.type === "BGM"
                ? 1200
                : placement.type === "SFX"
                  ? 80
                  : 0),
            fps
          )
        )
      );
      const audioItemId = "audio-" + placement.id;
      const audio: GenericEditorAudioItem = {
        id: audioItemId,
        type: placement.type,
        trackId: audioTrackId(placement.type),
        timelineStartFrame,
        durationInFrames: timelineDurationInFrames,
        enabled: true,
        locked: false,
        src: media.relativePath,
        sourceStartFrame,
        sourceDurationInFrames,
        sourceAssetDurationInFrames,
        volume: finiteNonNegative(
          placement.volume,
          defaultAudioVolume(placement.type)
        ),
        muted: placement.muted ?? false,
        fadeInFrames,
        fadeOutFrames,
        ...(placement.loop === undefined ? {} : { loop: placement.loop })
      };
      input.items.push(audio);

      if (placement.type === "TTS") {
        ttsWindows.set(placement.id, {
          itemId: audioItemId,
          startFrame: timelineStartFrame,
          endFrame: timelineStartFrame + timelineDurationInFrames
        });
      }
    }

    const orderedSubtitles = [...input.plan.subtitles].sort(
      (left, right) =>
        left.startMs - right.startMs || left.id.localeCompare(right.id)
    );
    let previousSubtitleEnd = -1;

    for (const cue of orderedSubtitles) {
      if (!cue.id.trim() || usedPlanIds.has("subtitle:" + cue.id)) {
        input.blockers.push("CONTENT_SUBTITLE_ID_INVALID:" + cue.id);
        continue;
      }
      usedPlanIds.add("subtitle:" + cue.id);

      const startFrame = frameAt(cue.startMs, fps);
      const endFrame = frameAt(cue.endMs, fps);
      if (
        !Number.isFinite(cue.startMs) ||
        !Number.isFinite(cue.endMs) ||
        cue.startMs < 0 ||
        cue.endMs <= cue.startMs ||
        startFrame < 0 ||
        endFrame <= startFrame ||
        endFrame > input.projectDurationInFrames ||
        !cue.text.trim()
      ) {
        input.blockers.push("CONTENT_SUBTITLE_TIMING_INVALID:" + cue.id);
        continue;
      }
      if (startFrame < previousSubtitleEnd) {
        input.blockers.push("CONTENT_SUBTITLE_OVERLAP:" + cue.id);
        continue;
      }

      const referencePlacementIds =
        cue.generatedFromAudioPlacementIds ?? [];
      const generatedFromTtsIds: string[] = [];
      const referencedWindows: Array<{
        startFrame: number;
        endFrame: number;
      }> = [];
      let referenceInvalid = false;

      for (const placementId of referencePlacementIds) {
        const reference = ttsWindows.get(placementId);
        if (reference === undefined) {
          input.blockers.push(
            "CONTENT_SUBTITLE_TTS_REFERENCE_INVALID:" +
              cue.id +
              ":" +
              placementId
          );
          referenceInvalid = true;
          continue;
        }
        generatedFromTtsIds.push(reference.itemId);
        referencedWindows.push(reference);
      }

      const generationSource =
        cue.generationSource ??
        (generatedFromTtsIds.length > 0
          ? "SCRIPT_TTS_ALIGN"
          : "MANUAL");
      if (
        generationSource !== "MANUAL" &&
        generatedFromTtsIds.length === 0
      ) {
        input.blockers.push("CONTENT_SUBTITLE_TTS_REFERENCE_REQUIRED:" + cue.id);
        referenceInvalid = true;
      }

      if (referencedWindows.length > 0) {
        const referenceStart = Math.min(
          ...referencedWindows.map(window => window.startFrame)
        );
        const referenceEnd = Math.max(
          ...referencedWindows.map(window => window.endFrame)
        );
        const tolerance = 2;
        if (
          startFrame < referenceStart - tolerance ||
          endFrame > referenceEnd + tolerance
        ) {
          input.blockers.push(
            "CONTENT_SUBTITLE_OUTSIDE_TTS_RANGE:" + cue.id
          );
          referenceInvalid = true;
        }
      }

      if (referenceInvalid) continue;

      const style = defaultSubtitleStyle(
        input.profile.width,
        input.profile.height,
        cue.style
      );
      const subtitle: GenericEditorSubtitleItem = {
        id: "subtitle-" + cue.id,
        type: "SUBTITLE",
        trackId: "T1",
        timelineStartFrame: startFrame,
        durationInFrames: endFrame - startFrame,
        enabled: true,
        locked: false,
        text: cue.text,
        ...style,
        generationSource,
        ...(generatedFromTtsIds.length === 0
          ? {}
          : { generatedFromTtsIds })
      };
      input.items.push(subtitle);
      previousSubtitleEnd = endFrame;
    }

    for (const overlay of input.plan.textOverlays) {
      if (!overlay.id.trim() || usedPlanIds.has("text:" + overlay.id)) {
        input.blockers.push("CONTENT_TEXT_ID_INVALID:" + overlay.id);
        continue;
      }
      usedPlanIds.add("text:" + overlay.id);
      const startFrame = frameAt(overlay.startMs, fps);
      const endFrame = frameAt(overlay.endMs, fps);
      if (
        !Number.isFinite(overlay.startMs) ||
        !Number.isFinite(overlay.endMs) ||
        overlay.startMs < 0 ||
        overlay.endMs <= overlay.startMs ||
        startFrame < 0 ||
        endFrame <= startFrame ||
        endFrame > input.projectDurationInFrames ||
        !overlay.text.trim() ||
        !Number.isFinite(overlay.x) ||
        !Number.isFinite(overlay.y) ||
        !Number.isFinite(overlay.width) ||
        overlay.width <= 0 ||
        !Number.isFinite(overlay.fontSize) ||
        overlay.fontSize <= 0
      ) {
        input.blockers.push("CONTENT_TEXT_INVALID:" + overlay.id);
        continue;
      }

      const text: GenericEditorTextItem = {
        id: "text-" + overlay.id,
        type: "TEXT",
        trackId: "T2",
        timelineStartFrame: startFrame,
        durationInFrames: endFrame - startFrame,
        enabled: true,
        locked: false,
        ...(overlay.zIndex === undefined ? {} : { zIndex: overlay.zIndex }),
        text: overlay.text,
        textRole: overlay.textRole,
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        fontFamily: overlay.fontFamily?.trim() || "VITRO",
        fontSize: overlay.fontSize,
        fontWeight: finitePositive(overlay.fontWeight, 800),
        color: overlay.color?.trim() || "#FFFDF7",
        strokeColor: overlay.strokeColor?.trim() || "#17130F",
        strokeWidth: finiteNonNegative(overlay.strokeWidth, 3),
        textAlign: overlay.textAlign ?? "center",
        lineHeight: finitePositive(overlay.lineHeight, 1.12),
        maxLines: Math.max(
          1,
          Math.round(finitePositive(overlay.maxLines, 2))
        ),
        backgroundEnabled: overlay.backgroundEnabled ?? false,
        backgroundColor: overlay.backgroundColor?.trim() || "#000000",
        backgroundOpacity: Math.min(
          1,
          finiteNonNegative(overlay.backgroundOpacity, 0.35)
        )
      };
      input.items.push(text);
    }

    for (const overlay of input.plan.graphics) {
      if (!overlay.id.trim() || usedPlanIds.has("graphic:" + overlay.id)) {
        input.blockers.push("CONTENT_GRAPHIC_ID_INVALID:" + overlay.id);
        continue;
      }
      usedPlanIds.add("graphic:" + overlay.id);
      const startFrame = frameAt(overlay.startMs, fps);
      const endFrame = frameAt(overlay.endMs, fps);
      if (
        !Number.isFinite(overlay.startMs) ||
        !Number.isFinite(overlay.endMs) ||
        overlay.startMs < 0 ||
        overlay.endMs <= overlay.startMs ||
        startFrame < 0 ||
        endFrame <= startFrame ||
        endFrame > input.projectDurationInFrames ||
        !Number.isFinite(overlay.x) ||
        !Number.isFinite(overlay.y) ||
        !Number.isFinite(overlay.width) ||
        !Number.isFinite(overlay.height) ||
        overlay.width <= 0 ||
        overlay.height <= 0 ||
        !Number.isFinite(overlay.opacity) ||
        overlay.opacity < 0 ||
        overlay.opacity > 1 ||
        !overlay.backgroundColor.trim()
      ) {
        input.blockers.push("CONTENT_GRAPHIC_INVALID:" + overlay.id);
        continue;
      }

      const graphic: GenericEditorGraphicItem = {
        id: "graphic-" + overlay.id,
        type: "GRAPHIC",
        trackId: "G1",
        timelineStartFrame: startFrame,
        durationInFrames: endFrame - startFrame,
        enabled: true,
        locked: false,
        ...(overlay.zIndex === undefined ? {} : { zIndex: overlay.zIndex }),
        graphicType: overlay.graphicType,
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
        opacity: overlay.opacity,
        blurPx: finiteNonNegative(overlay.blurPx, 0),
        backgroundColor: overlay.backgroundColor,
        borderRadius: finiteNonNegative(overlay.borderRadius, 0),
        ...(overlay.gradientStartColor === undefined
          ? {}
          : { gradientStartColor: overlay.gradientStartColor }),
        ...(overlay.gradientEndColor === undefined
          ? {}
          : { gradientEndColor: overlay.gradientEndColor }),
        ...(overlay.gradientAngleDeg === undefined
          ? {}
          : { gradientAngleDeg: overlay.gradientAngleDeg })
      };
      input.items.push(graphic);
    }
  }

  async reconcileStaleAssembly(projectId: string): Promise<TimelineAssemblyRecord | null> {
    const previous = await this.repository.getLatestAssembly(projectId);
    if (previous === null || previous.stale) return previous;

    const source = await this.handoff.buildEditorHandoff(projectId);
    const currentRefs = source.items.map(item => ({
      bindingId: item.bindingId,
      bindingRevision: item.bindingRevision
    }));
    const currentContentPlan =
      this.contentSource === undefined
        ? null
        : await this.contentSource.getLatestEditorContentPlan(projectId);
    const currentContentRef: EditorContentPlanRef | undefined =
      currentContentPlan === null
        ? undefined
        : {
            contentPlanId: currentContentPlan.id,
            contentPlanRevision: currentContentPlan.revision
          };
    const reason =
      source.status !== "READY"
        ? "MEDIA_BINDING_NOT_READY"
        : !refsEqual(previous.sourceBindingRefs, currentRefs)
          ? "SOURCE_BINDING_REVISION_CHANGED"
          : this.contentSource !== undefined &&
              currentContentPlan !== null &&
              currentContentPlan.planStatus !== "APPROVED"
            ? "CONTENT_PLAN_NOT_APPROVED"
            : !contentRefEqual(
                  previous.sourceContentPlanRef,
                  currentContentRef
                )
              ? "SOURCE_CONTENT_PLAN_REVISION_CHANGED"
              : null;

    if (reason === null) return previous;

    const now = this.clock.nowIso();
    const next: TimelineAssemblyRecord = {
      ...previous,
      revision: previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      assemblyStatus: "BLOCKED",
      stale: true,
      staleReason: reason
    };
    const { event, outbox } = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "EDITOR_TIMELINE_STALE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        assemblyId: previous.id,
        previousRevision: previous.revision,
        reason
      }
    });
    await this.repository.markAssemblyStale({
      previousAssembly: previous,
      nextAssembly: next,
      event,
      outbox
    });
    return next;
  }

  async getReadiness(projectId: string): Promise<{
    timelineAssemblyReady: boolean;
    remotionHandoffReady: boolean;
    status: TimelineAssemblyRecord["assemblyStatus"] | "NOT_ASSEMBLED";
    blockers: string[];
  }> {
    const current = await this.reconcileStaleAssembly(projectId);
    if (current === null) {
      return {
        timelineAssemblyReady: false,
        remotionHandoffReady: false,
        status: "NOT_ASSEMBLED",
        blockers: ["TIMELINE_NOT_ASSEMBLED"]
      };
    }
    return {
      timelineAssemblyReady: !current.stale && current.assemblyStatus !== "BLOCKED",
      remotionHandoffReady: !current.stale && current.assemblyStatus === "READY",
      status: current.assemblyStatus,
      blockers: [...current.blockers]
    };
  }

  serializeEditProject(output: TimelineAssemblyOutput): string {
    return JSON.stringify(output.editProject, null, 2);
  }

  serializeAssemblyOutput(output: TimelineAssemblyOutput): string {
    return JSON.stringify(output, null, 2);
  }

  private toOutput(assembly: TimelineAssemblyRecord): TimelineAssemblyOutput {
    return {
      schemaVersion: "1.0",
      projectId: assembly.projectId,
      createdAt: assembly.updatedAt,
      recommendedFileName: "edit_project.json",
      status: assembly.assemblyStatus,
      editProject: assembly.editProject,
      cutBoundaries: [...assembly.cutBoundaries],
      motionDirectives: [...assembly.motionDirectives],
      blockers: [...assembly.blockers]
    };
  }
}
