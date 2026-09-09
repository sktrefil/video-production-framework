import type {
  EditorCutBoundary,
  EditorHandoffManifest,
  EditorMotionDirective,
  GenericEditProject,
  GenericEditorImageItem,
  GenericEditorImageMotionSpec,
  GenericEditorVideoItem,
  TimelineAssemblyOutput,
  TimelineAssemblyRecord
} from "@vpf/domain";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";

export interface EditorHandoffSourcePort {
  buildEditorHandoff(projectId: string): Promise<EditorHandoffManifest>;
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
  next(prefix: "assembly" | "evt" | "outbox"): string;
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

function baseTracks(): GenericEditProject["tracks"] {
  return [
    { id: "V1", type: "VIDEO", name: "Main Visual", enabled: true, locked: false, order: 0 },
    { id: "G1", type: "GRAPHIC", name: "Graphics", enabled: true, locked: false, order: 1 },
    { id: "T1", type: "TEXT", name: "Subtitles / Text", enabled: true, locked: false, order: 2 },
    { id: "A1", type: "AUDIO", name: "Audio", enabled: true, locked: false, order: 3 }
  ];
}

export class EditorTimelineAssemblyPipeline {
  constructor(
    private readonly repository: TimelineAssemblyRepository,
    private readonly handoff: EditorHandoffSourcePort,
    private readonly clock: TimelineAssemblyClock,
    private readonly ids: TimelineAssemblyIdFactory
  ) {}

  async assembleProject(input: {
    projectId: string;
    projectName: string;
    profile: TimelineProfile;
  }): Promise<TimelineAssemblyOutcome> {
    validateProfile(input.profile);
    const source = await this.handoff.buildEditorHandoff(input.projectId);
    const sourceBindingRefs = source.items.map(item => ({
      bindingId: item.bindingId,
      bindingRevision: item.bindingRevision
    }));
    const previous = await this.repository.getLatestAssembly(input.projectId);

    if (
      previous !== null &&
      !previous.stale &&
      refsEqual(previous.sourceBindingRefs, sourceBindingRefs) &&
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
              cameraMove: item.cameraMove,
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

    if (items.length === 0) {
      blockers.push("NO_RENDERABLE_VISUAL_ITEMS");
    }

    const status: TimelineAssemblyRecord["assemblyStatus"] =
      items.length === 0
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
      tracks: baseTracks(),
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
        motionDirectiveCount: motionDirectives.length
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

  async reconcileStaleAssembly(projectId: string): Promise<TimelineAssemblyRecord | null> {
    const previous = await this.repository.getLatestAssembly(projectId);
    if (previous === null || previous.stale) return previous;

    const source = await this.handoff.buildEditorHandoff(projectId);
    const currentRefs = source.items.map(item => ({
      bindingId: item.bindingId,
      bindingRevision: item.bindingRevision
    }));
    const reason =
      source.status !== "READY"
        ? "MEDIA_BINDING_NOT_READY"
        : refsEqual(previous.sourceBindingRefs, currentRefs)
          ? null
          : "SOURCE_BINDING_REVISION_CHANGED";

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
