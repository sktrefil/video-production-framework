import type {
  EditorContentPlan,
  EditorCutBoundary,
  GenericEditorAudioItem,
  EditorHandoffItem,
  EditorHandoffManifest,
  GenericEditorImageItem,
  GenericEditorTimelineItem,
  GenericEditorVideoItem,
  MediaArtifact,
  TimelineAssemblyRecord
} from "@vpf/domain";
import type {
  EditorHandoffSourcePort,
  TimelineAssemblyRepository,
  TimelineProfile
} from "@vpf/editor-timeline";
import {SqliteEditorTimelineRepository} from "@vpf/storage/editor-timeline";

export type NarrationTimingErrorCode =
  | "NARRATION_TIMING_SCENE_COUNT_MISMATCH"
  | "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID"
  | "NARRATION_TIMING_LINK_MAPPING_INVALID"
  | "NARRATION_TIMING_HOLD_MEDIA_INVALID"
  | "NARRATION_TIMING_TRANSITION_TOO_LONG";

export class NarrationTimingError extends Error {
  constructor(public readonly code: NarrationTimingErrorCode, message: string) {
    super(message);
    this.name = "NarrationTimingError";
  }
}

type Segment = {
  order: number;
  sceneId: string;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  transitionInFrames: number;
  source: EditorHandoffItem;
  holdMedia: MediaArtifact;
};

export type NarrationTimingPlan = {
  projectId: string;
  expectedDurationInFrames: number;
  segments: Segment[];
};

function frameAt(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

function durationFrames(ms: number, fps: number): number {
  return Math.max(1, frameAt(ms, fps));
}

function normalizeNarrationText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function editorialClipMode(
  item: EditorHandoffItem
): "EDITORIAL_MOVE" | "STATIC_HOLD" | "REUSE_REFRAME" {
  if (item.clipMode === "EDITORIAL_MOVE" || item.clipMode === "REUSE_REFRAME") {
    return item.clipMode;
  }
  return "STATIC_HOLD";
}

function makeProjectedItem(
  segment: Segment,
  fps: number
): EditorHandoffItem {
  const source = segment.source;
  return {
    order: segment.order,
    bindingId: source.bindingId,
    bindingRevision: source.bindingRevision,
    linkId: source.linkId,
    linkRevision: source.linkRevision,
    implementationType: source.implementationType,
    implementationId: source.implementationId,
    implementationRevision: source.implementationRevision,
    bindingKind: "EDITORIAL",
    clipMode: editorialClipMode(source),
    mediaId: segment.holdMedia.id,
    relativePath: segment.holdMedia.relativePath,
    durationMs: (segment.durationInFrames * 1000) / fps,
    transitionMethod: source.transitionMethod,
    ...(source.cameraMove === undefined ? {} : {cameraMove: source.cameraMove}),
    ...(source.subjectMotion === undefined ? {} : {subjectMotion: source.subjectMotion}),
    ...(source.environmentMotion === undefined
      ? {}
      : {environmentMotion: source.environmentMotion})
  };
}

function visualItemId(item: EditorHandoffItem): string {
  return `visual-${item.bindingId}-r${item.bindingRevision}`;
}

function isVisualItem(
  item: GenericEditorTimelineItem
): item is GenericEditorVideoItem | GenericEditorImageItem {
  return item.type === "VIDEO" || item.type === "IMAGE";
}

export class NarrationTimedHandoffSource implements EditorHandoffSourcePort {
  private readonly manifest: EditorHandoffManifest;

  constructor(base: EditorHandoffManifest, plan: NarrationTimingPlan, fps: number) {
    this.manifest = {
      ...base,
      totalImplementations: plan.segments.length,
      boundImplementations: plan.segments.length,
      items: plan.segments.map(segment => makeProjectedItem(segment, fps))
    };
  }

  async buildEditorHandoff(): Promise<EditorHandoffManifest> {
    return structuredClone(this.manifest);
  }
}

export class NarrationTimedAssemblyRepository implements TimelineAssemblyRepository {
  constructor(
    private readonly delegate: SqliteEditorTimelineRepository,
    private readonly plan: NarrationTimingPlan,
    private readonly profile: TimelineProfile
  ) {}

  async getLatestAssembly(projectId: string): Promise<TimelineAssemblyRecord | null> {
    const current = await this.delegate.getLatestAssembly(projectId);
    if (current === null) return null;
    const allNarrationSegmentsUseVideo = this.plan.segments.every(
      segment => segment.source.bindingKind === "VIDEO"
    );
    const containsLegacyImageHold = current.editProject.items.some(
      item => item.trackId === "V1" && item.type === "IMAGE" && item.id.endsWith("-hold")
    );
    if (
      current.assemblyStatus !== "READY" ||
      current.editProject.project.durationInFrames !== this.plan.expectedDurationInFrames ||
      (allNarrationSegmentsUseVideo && containsLegacyImageHold)
    ) {
      return {...current, stale: true};
    }
    return current;
  }

  async commitAssembly(input: Parameters<TimelineAssemblyRepository["commitAssembly"]>[0]): Promise<void> {
    this.applyNarrationTiming(input.assembly);
    const payload = input.event.payload;
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      record.durationInFrames = input.assembly.editProject.project.durationInFrames;
      record.itemCount = input.assembly.editProject.items.length;
      record.cutBoundaryCount = input.assembly.cutBoundaries.length;
      record.motionDirectiveCount = input.assembly.motionDirectives.length;
      record.audioItemCount = input.assembly.editProject.items.filter(item =>
        item.type === "TTS" ||
        item.type === "CLIP_AUDIO" ||
        item.type === "BGM" ||
        item.type === "SFX"
      ).length;
      record.subtitleItemCount = input.assembly.editProject.items.filter(
        item => item.type === "SUBTITLE"
      ).length;
      record.textItemCount = input.assembly.editProject.items.filter(
        item => item.type === "TEXT"
      ).length;
      record.graphicItemCount = input.assembly.editProject.items.filter(
        item => item.type === "GRAPHIC"
      ).length;
    }
    await this.delegate.commitAssembly(input);
  }

  async markAssemblyStale(
    input: Parameters<TimelineAssemblyRepository["markAssemblyStale"]>[0]
  ): Promise<void> {
    await this.delegate.markAssemblyStale(input);
  }

  private applyNarrationTiming(assembly: TimelineAssemblyRecord): void {
    const placeholderIds = new Set(
      this.plan.segments.map(segment => visualItemId(segment.source))
    );
    const placeholders = new Map<string, GenericEditorImageItem>();
    for (const item of assembly.editProject.items) {
      if (item.type === "IMAGE" && placeholderIds.has(item.id)) {
        placeholders.set(item.id, item);
      }
    }

    const replacement: Array<
      GenericEditorVideoItem | GenericEditorImageItem | GenericEditorAudioItem
    > = [];
    const cutBoundaries: EditorCutBoundary[] = [];

    for (const segment of this.plan.segments) {
      const source = segment.source;
      const placeholder = placeholders.get(visualItemId(source));
      if (placeholder === undefined) {
        throw new NarrationTimingError(
          "NARRATION_TIMING_LINK_MAPPING_INVALID",
          `Projected visual placeholder is missing for binding ${source.bindingId}.`
        );
      }

      const transitionFrames = segment.transitionInFrames;
      if (source.bindingKind === "VIDEO") {
        if (
          source.relativePath === undefined ||
          source.sourceInMs === undefined ||
          source.sourceOutMs === undefined ||
          source.sourceAssetDurationMs === undefined
        ) {
          throw new NarrationTimingError(
            "NARRATION_TIMING_LINK_MAPPING_INVALID",
            `Video binding ${source.bindingId} is missing its approved source window.`
          );
        }
        const sourceStartFrame = frameAt(source.sourceInMs, this.profile.fps);
        const sourceAssetDurationInFrames = frameAt(
          source.sourceAssetDurationMs,
          this.profile.fps
        );
        const availableSourceFrames = sourceAssetDurationInFrames - sourceStartFrame;
        if (availableSourceFrames <= 0) {
          throw new NarrationTimingError(
            "NARRATION_TIMING_LINK_MAPPING_INVALID",
            `Video binding ${source.bindingId} has no playable source frames.`
          );
        }
        const videoFrames = segment.durationInFrames;
        const sourceDurationInFrames = Math.min(availableSourceFrames, videoFrames);
        replacement.push({
          id: placeholder.id,
          type: "VIDEO",
          trackId: "V1",
          timelineStartFrame: segment.startFrame,
          durationInFrames: videoFrames,
          enabled: true,
          locked: false,
          src: source.relativePath,
          sourceStartFrame,
          sourceDurationInFrames,
          sourceAssetDurationInFrames,
          playbackRate: 1,
          ...(videoFrames > sourceDurationInFrames ? {loop: true} : {}),
          volume: this.profile.videoVolume ?? 0,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fit: "cover"
        });
        // The narration-timing projection initially represents every scene as
        // an editorial placeholder. Restore the original clip sound here,
        // after the final scene timing is known, so A2 follows the V1 source
        // window exactly and can be mixed independently of video playback.
        replacement.push({
          id: `audio-${placeholder.id}`,
          type: "CLIP_AUDIO",
          trackId: "A2",
          timelineStartFrame: segment.startFrame,
          durationInFrames: sourceDurationInFrames,
          enabled: true,
          locked: false,
          src: source.relativePath,
          sourceStartFrame,
          sourceDurationInFrames,
          sourceAssetDurationInFrames,
          volume: this.profile.clipAudioVolume ?? 1,
          muted: false,
          fadeInFrames: 0,
          fadeOutFrames: 0
        });
      } else if (source.bindingKind === "EDITORIAL") {
        if (source.relativePath === undefined) {
          throw new NarrationTimingError(
            "NARRATION_TIMING_LINK_MAPPING_INVALID",
            `Editorial binding ${source.bindingId} has no source image.`
          );
        }
        replacement.push({
          ...placeholder,
          timelineStartFrame: segment.startFrame,
          durationInFrames: transitionFrames,
          src: source.relativePath
        });
      } else {
        cutBoundaries.push({
          order: segment.order,
          timelineFrame: segment.startFrame,
          linkId: source.linkId,
          implementationId: source.implementationId,
          transitionMethod: source.transitionMethod
        });
      }

      const holdFrames = source.bindingKind === "VIDEO" ? 0 : segment.durationInFrames - transitionFrames;
      if (holdFrames > 0) {
        replacement.push({
          id: `${placeholder.id}-hold`,
          type: "IMAGE",
          trackId: "V1",
          timelineStartFrame: segment.startFrame + transitionFrames,
          durationInFrames: holdFrames,
          enabled: true,
          locked: false,
          src: segment.holdMedia.relativePath,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fit: "cover"
        });
      }
    }

    const nonVisual = assembly.editProject.items.filter(
      item => !isVisualItem(item) || !placeholderIds.has(item.id)
    );
    assembly.editProject.items = [...replacement, ...nonVisual];
    assembly.editProject.project.durationInFrames = this.plan.expectedDurationInFrames;
    assembly.cutBoundaries = cutBoundaries;
  }
}

export async function buildNarrationTimingPlan(input: {
  repo: SqliteEditorTimelineRepository;
  projectId: string;
  handoff: EditorHandoffManifest;
  contentPlan: EditorContentPlan;
  narrationDurationMs: number;
  profile: TimelineProfile;
}): Promise<NarrationTimingPlan> {
  const scenes = await input.repo.listApprovedSceneChain(input.projectId);
  const cues = [...input.contentPlan.subtitles].sort(
    (left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id)
  );

  if (scenes.length === 0 || input.handoff.items.length !== scenes.length) {
    throw new NarrationTimingError(
      "NARRATION_TIMING_SCENE_COUNT_MISMATCH",
      `Narration-timed assembly requires one implementation per destination Scene; scenes=${scenes.length}, implementations=${input.handoff.items.length}.`
    );
  }
  if (cues.length === 0) {
    throw new NarrationTimingError(
      "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
      "Narration-timed assembly requires subtitle cues aligned to the narration."
    );
  }

  const sceneCueStarts: number[] = [];
  let cueIndex = 0;
  for (const ordered of scenes) {
    const target = normalizeNarrationText(ordered.scene.scriptSegment);
    if (!target) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
        `Scene ${ordered.scene.id} has an empty normalized script segment.`
      );
    }
    const firstCueIndex = cueIndex;
    let accumulated = "";
    while (cueIndex < cues.length && accumulated.length < target.length) {
      const piece = normalizeNarrationText(cues[cueIndex]!.text);
      const next = accumulated + piece;
      if (!piece || !target.startsWith(next)) {
        throw new NarrationTimingError(
          "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
          `Subtitle ${cues[cueIndex]!.id} does not match Scene ${ordered.scene.id} script order.`
        );
      }
      accumulated = next;
      cueIndex += 1;
    }
    if (accumulated !== target || firstCueIndex === cueIndex) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
        `Subtitle text does not exactly cover Scene ${ordered.scene.id}.`
      );
    }
    sceneCueStarts.push(cues[firstCueIndex]!.startMs);
  }
  if (cueIndex !== cues.length) {
    throw new NarrationTimingError(
      "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
      `Subtitle cues remain after mapping all Scenes: ${cues.length - cueIndex}.`
    );
  }

  const sourceByScene = new Map<
    string,
    {source: EditorHandoffItem; holdMedia: MediaArtifact}
  >();
  for (const source of input.handoff.items) {
    const link = await input.repo.getLink(input.projectId, source.linkId);
    if (link === null || link.stale) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_LINK_MAPPING_INVALID",
        `Current Link is unavailable for binding ${source.bindingId}.`
      );
    }
    if (sourceByScene.has(link.toSceneId)) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_LINK_MAPPING_INVALID",
        `Multiple current implementations target Scene ${link.toSceneId}.`
      );
    }
    if (link.toMediaId === undefined) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_HOLD_MEDIA_INVALID",
        `Link ${link.id} has no approved destination media for Scene hold.`
      );
    }
    const media = await input.repo.getMedia(input.projectId, link.toMediaId);
    if (
      media === null ||
      media.lifecycleStatus !== "ACTIVE" ||
      media.mediaStatus !== "AVAILABLE" ||
      media.mediaType !== "IMAGE" ||
      !media.relativePath.trim()
    ) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_HOLD_MEDIA_INVALID",
        `Destination Scene media is not an AVAILABLE image for Link ${link.id}.`
      );
    }
    sourceByScene.set(link.toSceneId, {source, holdMedia: media});
  }

  const expectedDurationInFrames = frameAt(
    input.narrationDurationMs,
    input.profile.fps
  );
  if (expectedDurationInFrames <= 0) {
    throw new NarrationTimingError(
      "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
      "Narration duration must produce a positive timeline frame count."
    );
  }

  const startFrames = scenes.map((_, index) =>
    index === 0
      ? 0
      : frameAt(sceneCueStarts[index]!, input.profile.fps)
  );
  const segments: Segment[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]!.scene;
    const mapped = sourceByScene.get(scene.id);
    if (mapped === undefined) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_LINK_MAPPING_INVALID",
        `No current implementation targets destination Scene ${scene.id}.`
      );
    }
    const startFrame = startFrames[index]!;
    const endFrame = index + 1 < startFrames.length
      ? startFrames[index + 1]!
      : expectedDurationInFrames;
    const spanFrames = endFrame - startFrame;
    if (spanFrames <= 0) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_SUBTITLE_MAPPING_INVALID",
        `Scene ${scene.id} has a non-positive narration span.`
      );
    }
    const transitionInFrames = mapped.source.bindingKind === "VIDEO"
      ? (() => {
          if (
            mapped.source.sourceInMs === undefined ||
            mapped.source.sourceOutMs === undefined
          ) {
            return -1;
          }
          return frameAt(mapped.source.sourceOutMs, input.profile.fps) -
            frameAt(mapped.source.sourceInMs, input.profile.fps);
        })()
      : mapped.source.bindingKind === "CUT"
        ? 0
        : durationFrames(mapped.source.durationMs, input.profile.fps);
    if (transitionInFrames < 0 || transitionInFrames > spanFrames) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_TRANSITION_TOO_LONG",
        `Implementation ${mapped.source.implementationId} requires ${transitionInFrames} frames inside Scene ${scene.id} span of ${spanFrames} frames.`
      );
    }
    segments.push({
      order: index + 1,
      sceneId: scene.id,
      startFrame,
      endFrame,
      durationInFrames: spanFrames,
      transitionInFrames,
      source: mapped.source,
      holdMedia: mapped.holdMedia
    });
  }

  return {
    projectId: input.projectId,
    expectedDurationInFrames,
    segments
  };
}
