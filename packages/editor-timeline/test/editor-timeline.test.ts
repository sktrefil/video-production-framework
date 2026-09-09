import assert from "node:assert/strict";
import test from "node:test";
import type {
  EditorContentPlan,
  EditorHandoffManifest,
  MediaArtifact,
  TimelineAssemblyRecord
} from "@vpf/domain";
import {
  EditorTimelineAssemblyPipeline,
  type EditorContentSourcePort,
  type EditorHandoffSourcePort,
  type TimelineAssemblyClock,
  type TimelineAssemblyIdFactory,
  type TimelineAssemblyRepository
} from "../src/index.js";

const now = "2026-09-09T14:00:00.000Z";
const clock: TimelineAssemblyClock = { nowIso: () => now };

function ids(): TimelineAssemblyIdFactory {
  let n = 0;
  return { next: prefix => prefix + "_" + ++n };
}

function videoItem(order = 1) {
  return {
    order,
    bindingId: "bind-video",
    bindingRevision: 1,
    linkId: "link-video",
    linkRevision: 4,
    implementationType: "CLIP" as const,
    implementationId: "clip-video",
    implementationRevision: 5,
    bindingKind: "VIDEO" as const,
    clipMode: "DIRECT_START_END_I2V" as const,
    mediaId: "vid1",
    relativePath: "clips/clip1.mp4",
    sourceInMs: 400,
    sourceOutMs: 4400,
    sourceAssetDurationMs: 5000,
    durationMs: 4000,
    transitionMethod: "DIRECT" as const,
    cameraMove: "slow push",
    subjectMotion: "restrained",
    environmentMotion: "minimal"
  };
}

function staticItem(order = 2) {
  return {
    order,
    bindingId: "bind-static",
    bindingRevision: 1,
    linkId: "link-static",
    linkRevision: 3,
    implementationType: "CLIP" as const,
    implementationId: "clip-static",
    implementationRevision: 2,
    bindingKind: "EDITORIAL" as const,
    clipMode: "STATIC_HOLD" as const,
    mediaId: "img1",
    relativePath: "images/scene.png",
    durationMs: 2000,
    transitionMethod: "HARD_CUT" as const,
    cameraMove: "none",
    subjectMotion: "none",
    environmentMotion: "none"
  };
}

function cutItem(order = 2) {
  return {
    order,
    bindingId: "bind-cut",
    bindingRevision: 1,
    linkId: "link-cut",
    linkRevision: 2,
    implementationType: "CUT" as const,
    implementationId: "cut1",
    implementationRevision: 1,
    bindingKind: "CUT" as const,
    durationMs: 0,
    transitionMethod: "HARD_CUT" as const
  };
}

function moveItem(order = 2) {
  return {
    order,
    bindingId: "bind-move",
    bindingRevision: 1,
    linkId: "link-move",
    linkRevision: 3,
    implementationType: "CLIP" as const,
    implementationId: "clip-move",
    implementationRevision: 2,
    bindingKind: "EDITORIAL" as const,
    clipMode: "EDITORIAL_MOVE" as const,
    mediaId: "img2",
    relativePath: "images/move.png",
    durationMs: 3000,
    transitionMethod: "DIRECT" as const,
    cameraMove: "slow 5 percent push in",
    subjectMotion: "none",
    environmentMotion: "none"
  };
}

function reframeItem(order = 2) {
  return {
    order,
    bindingId: "bind-reframe",
    bindingRevision: 1,
    linkId: "link-reframe",
    linkRevision: 3,
    implementationType: "CLIP" as const,
    implementationId: "clip-reframe",
    implementationRevision: 2,
    bindingKind: "EDITORIAL" as const,
    clipMode: "REUSE_REFRAME" as const,
    mediaId: "img3",
    relativePath: "images/reframe.png",
    durationMs: 3000,
    transitionMethod: "DIRECT" as const,
    cameraMove: "slow 6 percent pan left",
    subjectMotion: "none",
    environmentMotion: "none"
  };
}

function manifest(items: EditorHandoffManifest["items"]): EditorHandoffManifest {
  return {
    schemaVersion: "1.0",
    projectId: "p1",
    createdAt: now,
    recommendedFileName: "media_binding.json",
    status: "READY",
    totalImplementations: items.length,
    boundImplementations: items.length,
    items,
    blockers: []
  };
}

class FakeHandoff implements EditorHandoffSourcePort {
  current: EditorHandoffManifest = manifest([videoItem()]);
  async buildEditorHandoff(): Promise<EditorHandoffManifest> {
    return this.current;
  }
}

function audioMedia(id: string, durationMs: number): MediaArtifact {
  return {
    id,
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "AUDIO",
    relativePath: "audio/" + id + ".mp3",
    mimeType: "audio/mpeg",
    durationMs,
    checksum: "sha256:" + id,
    mediaStatus: "AVAILABLE"
  };
}

function approvedContentPlan(revision = 1): EditorContentPlan {
  return {
    id: "content1",
    projectId: "p1",
    revision,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    planStatus: "APPROVED",
    audio: [
      {
        id: "narration",
        type: "TTS",
        mediaId: "tts1",
        timelineStartMs: 0,
        volume: 1
      },
      {
        id: "clip-audio",
        type: "CLIP_AUDIO",
        mediaId: "clip-audio1",
        timelineStartMs: 1000,
        durationMs: 1000,
        volume: 0.12
      },
      {
        id: "bgm",
        type: "BGM",
        mediaId: "bgm1",
        timelineStartMs: 0,
        volume: 0.1,
        loop: true
      },
      {
        id: "impact",
        type: "SFX",
        mediaId: "sfx1",
        timelineStartMs: 2000,
        volume: 0.35
      }
    ],
    subtitles: [
      {
        id: "001",
        startMs: 0,
        endMs: 2000,
        text: "첫 번째 자막",
        generationSource: "SCRIPT_TTS_ALIGN",
        generatedFromAudioPlacementIds: ["narration"]
      },
      {
        id: "002",
        startMs: 2000,
        endMs: 4000,
        text: "두 번째 자막",
        generationSource: "SCRIPT_TTS_ALIGN",
        generatedFromAudioPlacementIds: ["narration"]
      }
    ],
    textOverlays: [
      {
        id: "title",
        startMs: 0,
        endMs: 1000,
        text: "사건의 시작",
        textRole: "TOP_TITLE",
        x: 540,
        y: 190,
        width: 900,
        fontSize: 68
      }
    ],
    graphics: [
      {
        id: "bottom-blur",
        startMs: 0,
        endMs: 4000,
        graphicType: "BLUR_PANEL",
        x: 0,
        y: 1420,
        width: 1080,
        height: 500,
        opacity: 0.38,
        blurPx: 24,
        backgroundColor: "rgba(0,0,0,0.35)",
        borderRadius: 0
      }
    ]
  };
}

class FakeContentSource implements EditorContentSourcePort {
  current: EditorContentPlan | null = approvedContentPlan();
  media = new Map<string, MediaArtifact>([
    ["tts1", audioMedia("tts1", 4000)],
    ["clip-audio1", audioMedia("clip-audio1", 1000)],
    ["bgm1", audioMedia("bgm1", 2000)],
    ["sfx1", audioMedia("sfx1", 500)]
  ]);

  async getLatestEditorContentPlan(): Promise<EditorContentPlan | null> {
    return this.current;
  }

  async getMedia(_projectId: string, mediaId: string): Promise<MediaArtifact | null> {
    return this.media.get(mediaId) ?? null;
  }
}

class FakeRepo implements TimelineAssemblyRepository {
  active: TimelineAssemblyRecord | null = null;
  history: TimelineAssemblyRecord[] = [];

  async getLatestAssembly(): Promise<TimelineAssemblyRecord | null> {
    return this.active;
  }

  async commitAssembly(input: {
    previousAssembly: TimelineAssemblyRecord | null;
    assembly: TimelineAssemblyRecord;
  }): Promise<void> {
    if (input.previousAssembly !== null) {
      const previous = this.history.find(
        item =>
          item.id === input.previousAssembly?.id &&
          item.revision === input.previousAssembly.revision
      );
      if (previous) previous.lifecycleStatus = "SUPERSEDED";
    }
    this.active = structuredClone(input.assembly);
    this.history.push(this.active);
  }

  async markAssemblyStale(input: {
    previousAssembly: TimelineAssemblyRecord;
    nextAssembly: TimelineAssemblyRecord;
  }): Promise<void> {
    const previous = this.history.find(
      item =>
        item.id === input.previousAssembly.id &&
        item.revision === input.previousAssembly.revision
    );
    if (previous) previous.lifecycleStatus = "SUPERSEDED";
    this.active = structuredClone(input.nextAssembly);
    this.history.push(this.active);
  }
}

const profile = {
  fps: 30,
  width: 1080,
  height: 1920
};

test("WF-14 converts approved TRIM_PASS window to Generic Editor frames", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "READY");
  assert.equal(result.output.recommendedFileName, "edit_project.json");
  assert.equal(result.output.editProject.schemaVersion, 1);
  assert.deepEqual(
    result.output.editProject.tracks.map(track => track.id),
    ["V1", "G1", "T1", "A1"]
  );

  const item = result.output.editProject.items[0];
  assert.equal(item?.type, "VIDEO");
  if (item?.type !== "VIDEO") throw new Error("Expected VIDEO");
  assert.equal(item.timelineStartFrame, 0);
  assert.equal(item.sourceStartFrame, 12);
  assert.equal(item.sourceDurationInFrames, 120);
  assert.equal(item.sourceAssetDurationInFrames, 150);
  assert.equal(item.durationInFrames, 120);
  assert.equal(item.volume, 0);
  assert.equal(result.output.editProject.project.durationInFrames, 120);
});

test("WF-14 lays visual items contiguously on V1", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  handoff.current = manifest([videoItem(1), staticItem(2)]);
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "READY");
  assert.equal(result.output.editProject.items.length, 2);
  assert.equal(result.output.editProject.items[0]?.timelineStartFrame, 0);
  assert.equal(result.output.editProject.items[0]?.durationInFrames, 120);
  assert.equal(result.output.editProject.items[1]?.timelineStartFrame, 120);
  assert.equal(result.output.editProject.items[1]?.durationInFrames, 60);
  assert.equal(result.output.editProject.project.durationInFrames, 180);
});

test("WF-14 keeps CUT as a zero-duration boundary instead of a fake media item", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  handoff.current = manifest([videoItem(1), cutItem(2), staticItem(3)]);
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.editProject.items.length, 2);
  assert.equal(result.output.cutBoundaries.length, 1);
  assert.equal(result.output.cutBoundaries[0]?.timelineFrame, 120);
  assert.equal(result.output.cutBoundaries[0]?.transitionMethod, "HARD_CUT");
  assert.equal(result.output.editProject.project.durationInFrames, 180);
});

test("WF-15 compiles EDITORIAL_MOVE into executable Generic Editor motion", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  handoff.current = manifest([videoItem(1), moveItem(2)]);
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "READY");
  assert.equal(result.output.motionDirectives.length, 1);
  assert.equal(result.output.motionDirectives[0]?.clipMode, "EDITORIAL_MOVE");
  assert.equal(result.output.motionDirectives[0]?.supportedByCurrentRenderer, true);
  assert.deepEqual(result.output.motionDirectives[0]?.compiledMotion, {
    kind: "TRANSFORM",
    from: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    to: { x: 0, y: 0, scale: 1.05, rotation: 0, opacity: 1 },
    easing: "EASE_IN_OUT"
  });

  const image = result.output.editProject.items[1];
  assert.equal(image?.type, "IMAGE");
  if (image?.type !== "IMAGE") throw new Error("Expected IMAGE");
  assert.deepEqual(image.motion, result.output.motionDirectives[0]?.compiledMotion);

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.timelineAssemblyReady, true);
  assert.equal(readiness.remotionHandoffReady, true);
});

test("WF-15 compiles REUSE_REFRAME directional motion without exposing frame edges", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  handoff.current = manifest([reframeItem(1)]);
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "READY");
  const image = result.output.editProject.items[0];
  assert.equal(image?.type, "IMAGE");
  if (image?.type !== "IMAGE") throw new Error("Expected IMAGE");
  assert.deepEqual(image.motion, {
    kind: "TRANSFORM",
    from: { x: 0, y: 0, scale: 1.06, rotation: 0, opacity: 1 },
    to: { x: -65, y: 0, scale: 1.06, rotation: 0, opacity: 1 },
    easing: "EASE_IN_OUT"
  });
});

test("WF-14 is idempotent for identical bindings and timeline profile", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const first = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });
  const second = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.assembly.id, first.assembly.id);
  assert.equal(second.assembly.revision, first.assembly.revision);
  assert.equal(repo.history.length, 1);

  const changedProfile = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile: { ...profile, videoVolume: 0.25 }
  });
  assert.equal(changedProfile.created, true);
  assert.equal(changedProfile.assembly.id, first.assembly.id);
  assert.equal(changedProfile.assembly.revision, first.assembly.revision + 1);
  const changedVideo = changedProfile.output.editProject.items[0];
  assert.equal(changedVideo?.type, "VIDEO");
  if (changedVideo?.type !== "VIDEO") throw new Error("Expected VIDEO");
  assert.equal(changedVideo.volume, 0.25);
});

test("WF-14 marks an existing assembly stale when a source binding revision changes", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const first = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  const changed = videoItem();
  changed.bindingRevision = 2;
  handoff.current = manifest([changed]);

  const stale = await pipeline.reconcileStaleAssembly("p1");
  assert.equal(stale?.id, first.assembly.id);
  assert.equal(stale?.revision, first.assembly.revision + 1);
  assert.equal(stale?.stale, true);
  assert.equal(stale?.staleReason, "SOURCE_BINDING_REVISION_CHANGED");
  assert.equal(stale?.assemblyStatus, "BLOCKED");
});

test("WF-14 blocks a CUT-only project because no visual item can be rendered", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  handoff.current = manifest([cutItem(1)]);
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "BLOCKED");
  assert.equal(result.output.editProject.items.length, 0);
  assert.equal(result.output.editProject.project.durationInFrames, 0);
  assert.ok(result.output.blockers.includes("NO_RENDERABLE_VISUAL_ITEMS"));
});

test("WF-16 assembles TTS, clip audio, BGM, SFX, subtitles, text, and graphics into canonical tracks", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const content = new FakeContentSource();
  const pipeline = new EditorTimelineAssemblyPipeline(
    repo,
    handoff,
    clock,
    ids(),
    content
  );

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "READY");
  assert.deepEqual(
    result.output.editProject.tracks.map(track => track.id),
    ["V1", "G1", "T1", "A1", "T2", "A2", "A3", "A4"]
  );
  assert.deepEqual(result.assembly.sourceContentPlanRef, {
    contentPlanId: "content1",
    contentPlanRevision: 1
  });

  const tts = result.output.editProject.items.find(item => item.id === "audio-narration");
  assert.equal(tts?.type, "TTS");
  if (tts?.type !== "TTS") throw new Error("Expected TTS");
  assert.equal(tts.trackId, "A1");
  assert.equal(tts.timelineStartFrame, 0);
  assert.equal(tts.durationInFrames, 120);
  assert.equal(tts.sourceDurationInFrames, 120);
  assert.equal(tts.volume, 1);
  assert.equal(tts.loop, undefined);

  const clipAudio = result.output.editProject.items.find(item => item.id === "audio-clip-audio");
  assert.equal(clipAudio?.type, "CLIP_AUDIO");
  if (clipAudio?.type !== "CLIP_AUDIO") throw new Error("Expected CLIP_AUDIO");
  assert.equal(clipAudio.trackId, "A2");
  assert.equal(clipAudio.timelineStartFrame, 30);
  assert.equal(clipAudio.durationInFrames, 30);

  const bgm = result.output.editProject.items.find(item => item.id === "audio-bgm");
  assert.equal(bgm?.type, "BGM");
  if (bgm?.type !== "BGM") throw new Error("Expected BGM");
  assert.equal(bgm.trackId, "A3");
  assert.equal(bgm.durationInFrames, 120);
  assert.equal(bgm.sourceDurationInFrames, 60);
  assert.equal(bgm.loop, true);
  assert.equal(bgm.fadeInFrames, 15);
  assert.equal(bgm.fadeOutFrames, 36);

  const sfx = result.output.editProject.items.find(item => item.id === "audio-impact");
  assert.equal(sfx?.type, "SFX");
  if (sfx?.type !== "SFX") throw new Error("Expected SFX");
  assert.equal(sfx.trackId, "A4");
  assert.equal(sfx.timelineStartFrame, 60);
  assert.equal(sfx.durationInFrames, 15);
  assert.equal(sfx.fadeOutFrames, 2);

  const subtitle = result.output.editProject.items.find(item => item.id === "subtitle-001");
  assert.equal(subtitle?.type, "SUBTITLE");
  if (subtitle?.type !== "SUBTITLE") throw new Error("Expected SUBTITLE");
  assert.equal(subtitle.trackId, "T1");
  assert.deepEqual(subtitle.generatedFromTtsIds, ["audio-narration"]);
  assert.equal(subtitle.fontFamily, "VITRO");
  assert.equal(subtitle.x, 540);
  assert.equal(subtitle.width, 936.036);

  const title = result.output.editProject.items.find(item => item.id === "text-title");
  assert.equal(title?.type, "TEXT");
  if (title?.type !== "TEXT") throw new Error("Expected TEXT");
  assert.equal(title.trackId, "T2");
  assert.equal(title.textRole, "TOP_TITLE");

  const graphic = result.output.editProject.items.find(item => item.id === "graphic-bottom-blur");
  assert.equal(graphic?.type, "GRAPHIC");
  if (graphic?.type !== "GRAPHIC") throw new Error("Expected GRAPHIC");
  assert.equal(graphic.trackId, "G1");
  assert.equal(graphic.graphicType, "BLUR_PANEL");

  assert.equal(result.output.editProject.items.length, 9);
  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.remotionHandoffReady, true);
});

test("WF-16 blocks an unapproved content plan without polluting the editor items", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const content = new FakeContentSource();
  content.current = {
    ...approvedContentPlan(),
    planStatus: "DRAFT"
  };
  const pipeline = new EditorTimelineAssemblyPipeline(
    repo,
    handoff,
    clock,
    ids(),
    content
  );

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "PARTIAL");
  assert.ok(result.output.blockers.includes("CONTENT_PLAN_NOT_APPROVED"));
  assert.equal(result.output.editProject.items.length, 1);
});

test("WF-16 allows source-longer BGM only when loop is explicitly enabled", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const content = new FakeContentSource();
  const plan = approvedContentPlan();
  plan.audio = [
    {
      id: "bad-bgm",
      type: "BGM",
      mediaId: "bgm1",
      timelineStartMs: 0,
      durationMs: 4000,
      loop: false
    }
  ];
  plan.subtitles = [];
  plan.textOverlays = [];
  plan.graphics = [];
  content.current = plan;

  const pipeline = new EditorTimelineAssemblyPipeline(
    repo,
    handoff,
    clock,
    ids(),
    content
  );
  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "PARTIAL");
  assert.ok(
    result.output.blockers.includes("CONTENT_AUDIO_EXCEEDS_SOURCE:bad-bgm")
  );
  assert.equal(
    result.output.editProject.items.some(item => item.id === "audio-bad-bgm"),
    false
  );
});

test("WF-16 blocks a subtitle that escapes its referenced TTS window", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const content = new FakeContentSource();
  const plan = approvedContentPlan();
  plan.audio = [
    {
      id: "narration",
      type: "TTS",
      mediaId: "tts1",
      timelineStartMs: 0,
      durationMs: 2000
    }
  ];
  plan.subtitles = [
    {
      id: "bad",
      startMs: 0,
      endMs: 4000,
      text: "TTS보다 긴 자막",
      generationSource: "SCRIPT_TTS_ALIGN",
      generatedFromAudioPlacementIds: ["narration"]
    }
  ];
  plan.textOverlays = [];
  plan.graphics = [];
  content.current = plan;

  const pipeline = new EditorTimelineAssemblyPipeline(
    repo,
    handoff,
    clock,
    ids(),
    content
  );
  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "PARTIAL");
  assert.ok(
    result.output.blockers.includes("CONTENT_SUBTITLE_OUTSIDE_TTS_RANGE:bad")
  );
  assert.equal(
    result.output.editProject.items.some(item => item.id === "subtitle-bad"),
    false
  );
});

test("WF-16 stales an assembled timeline when the content plan revision changes", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  const content = new FakeContentSource();
  const pipeline = new EditorTimelineAssemblyPipeline(
    repo,
    handoff,
    clock,
    ids(),
    content
  );

  const first = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });
  content.current = approvedContentPlan(2);

  const stale = await pipeline.reconcileStaleAssembly("p1");
  assert.equal(stale?.id, first.assembly.id);
  assert.equal(stale?.stale, true);
  assert.equal(stale?.staleReason, "SOURCE_CONTENT_PLAN_REVISION_CHANGED");
  assert.equal(stale?.assemblyStatus, "BLOCKED");
});

