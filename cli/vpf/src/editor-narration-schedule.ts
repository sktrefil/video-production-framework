import type {
  EditorContentPlan,
  EditorHandoffItem,
  EditorHandoffManifest,
  MediaArtifact
} from "@vpf/domain";
import type {TimelineProfile} from "@vpf/editor-timeline";
import {SqliteEditorTimelineRepository} from "@vpf/storage/editor-timeline";
import {
  NarrationTimingError,
  type NarrationTimingPlan
} from "./editor-narration-timing.js";

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

function transitionFrames(item: EditorHandoffItem, fps: number): number {
  if (item.bindingKind === "VIDEO") {
    if (item.sourceInMs === undefined || item.sourceOutMs === undefined) {
      return -1;
    }
    return frameAt(item.sourceOutMs, fps) - frameAt(item.sourceInMs, fps);
  }
  if (item.bindingKind === "CUT") return 0;
  return durationFrames(item.durationMs, fps);
}

/**
 * Builds the canonical narration-timed visual schedule while allowing a
 * transition to spill beyond its destination Scene narration start window.
 *
 * A transition itself is never trimmed or stretched here. If a transition
 * occupies more time than the narration span immediately assigned to the
 * Scene, the following transition is delayed just enough to avoid visual
 * overlap. Any later narration slack absorbs that delay automatically.
 *
 * This preserves WF-12 approved source windows while keeping one continuous
 * V1 timeline that ends exactly with the narration.
 */
export async function buildSpilloverNarrationTimingPlan(input: {
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

  const desiredStarts = scenes.map((_, index) =>
    index === 0 ? 0 : frameAt(sceneCueStarts[index]!, input.profile.fps)
  );

  const mappedScenes = scenes.map(ordered => {
    const mapped = sourceByScene.get(ordered.scene.id);
    if (mapped === undefined) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_LINK_MAPPING_INVALID",
        `No current implementation targets destination Scene ${ordered.scene.id}.`
      );
    }
    const frames = transitionFrames(mapped.source, input.profile.fps);
    if (frames < 0) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_LINK_MAPPING_INVALID",
        `Implementation ${mapped.source.implementationId} is missing its approved transition duration.`
      );
    }
    return {ordered, mapped, transitionInFrames: frames};
  });

  // Schedule transitions without overlap. A long transition may cross a Scene
  // narration boundary, but it is never shortened. Later narration slack lets
  // the schedule catch back up to the desired Scene start automatically.
  const actualStarts: number[] = [];
  let visualCursor = 0;
  for (let index = 0; index < mappedScenes.length; index += 1) {
    const item = mappedScenes[index]!;
    const desiredStart = desiredStarts[index]!;
    const actualStart = Math.max(desiredStart, visualCursor);
    const transitionEnd = actualStart + item.transitionInFrames;
    if (transitionEnd > expectedDurationInFrames) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_TRANSITION_TOO_LONG",
        `Implementation ${item.mapped.source.implementationId} ends at frame ${transitionEnd}, beyond narration end frame ${expectedDurationInFrames}.`
      );
    }
    actualStarts.push(actualStart);
    visualCursor = transitionEnd;
  }

  const segments: NarrationTimingPlan["segments"] = [];
  for (let index = 0; index < mappedScenes.length; index += 1) {
    const item = mappedScenes[index]!;
    const startFrame = actualStarts[index]!;
    const endFrame = index + 1 < actualStarts.length
      ? actualStarts[index + 1]!
      : expectedDurationInFrames;
    const spanFrames = endFrame - startFrame;

    if (spanFrames < item.transitionInFrames || spanFrames <= 0) {
      throw new NarrationTimingError(
        "NARRATION_TIMING_TRANSITION_TOO_LONG",
        `Implementation ${item.mapped.source.implementationId} requires ${item.transitionInFrames} frames but only ${spanFrames} scheduled frames remain before the next visual transition.`
      );
    }

    segments.push({
      order: index + 1,
      sceneId: item.ordered.scene.id,
      startFrame,
      endFrame,
      durationInFrames: spanFrames,
      transitionInFrames: item.transitionInFrames,
      source: item.mapped.source,
      holdMedia: item.mapped.holdMedia
    });
  }

  return {
    projectId: input.projectId,
    expectedDurationInFrames,
    segments
  };
}
