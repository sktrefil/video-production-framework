import assert from "node:assert/strict";
import test from "node:test";
import type {
  EditorHandoffManifest,
  TimelineAssemblyRecord
} from "@vpf/domain";
import {
  EditorTimelineAssemblyPipeline,
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

test("WF-14 preserves unsupported editorial motion as a directive and blocks Remotion-ready", async () => {
  const repo = new FakeRepo();
  const handoff = new FakeHandoff();
  handoff.current = manifest([videoItem(1), moveItem(2)]);
  const pipeline = new EditorTimelineAssemblyPipeline(repo, handoff, clock, ids());

  const result = await pipeline.assembleProject({
    projectId: "p1",
    projectName: "History Project",
    profile
  });

  assert.equal(result.output.status, "PARTIAL");
  assert.equal(result.output.motionDirectives.length, 1);
  assert.equal(result.output.motionDirectives[0]?.clipMode, "EDITORIAL_MOVE");
  assert.equal(result.output.motionDirectives[0]?.supportedByCurrentRenderer, false);
  assert.ok(
    result.output.blockers.includes(
      "CURRENT_RENDERER_MOTION_UNSUPPORTED:bind-move"
    )
  );

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.timelineAssemblyReady, true);
  assert.equal(readiness.remotionHandoffReady, false);
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
