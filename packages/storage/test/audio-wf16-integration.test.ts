import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import type {EditorHandoffManifest} from "@vpf/domain";
import {
  EditorContentPlanService,
  EditorTimelineAssemblyPipeline
} from "@vpf/editor-timeline";
import {LocalAudioImportService} from "@vpf/provider-orchestrator/audio-import";
import {SqliteAudioImportRepository} from "../src/audio-import.js";
import {SqliteEditorTimelineRepository} from "../src/editor-timeline.js";

function wavBuffer(durationSeconds = 1, sampleRate = 8000): Buffer {
  const samples = Math.round(durationSeconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function idFactory() {
  let counter = 0;
  return {next: (prefix: string) => `${prefix}-${++counter}`};
}

function handoff(projectId: string): EditorHandoffManifest {
  return {
    schemaVersion: "1.0",
    projectId,
    createdAt: "2026-09-10T13:00:00.000Z",
    recommendedFileName: "media_binding.json",
    status: "READY",
    totalImplementations: 1,
    boundImplementations: 1,
    items: [{
      order: 1,
      bindingId: "binding-visual",
      bindingRevision: 1,
      linkId: "link-visual",
      linkRevision: 1,
      implementationType: "CLIP",
      implementationId: "clip-visual",
      implementationRevision: 1,
      bindingKind: "EDITORIAL",
      clipMode: "STATIC_HOLD",
      mediaId: "visual-media",
      relativePath: "05_images/fixture.png",
      durationMs: 1000,
      transitionMethod: "HARD_CUT",
      cameraMove: "none",
      subjectMotion: "none",
      environmentMotion: "none"
    }],
    blockers: []
  };
}

test("approved local A2/A3/A4 imports flow from project.db MediaArtifacts through WF-16 placement", async () => {
  const root = await mkdtemp(join(tmpdir(), "vpf-mig10-wf16-"));
  const workspaceRoot = join(root, "workspace");
  const projectId = "mig10-audio-wf16";
  const projectRoot = join(workspaceRoot, "projects", projectId);
  await mkdir(projectRoot, {recursive: true});
  const source = join(root, "approved.wav");
  await writeFile(source, wavBuffer(1));
  const dbPath = join(projectRoot, "project.db");
  const clock = {nowIso: () => "2026-09-10T13:00:00.000Z"};
  const ids = idFactory();

  const audioRepo = new SqliteAudioImportRepository(dbPath);
  let clip;
  let bgm;
  let sfx;
  try {
    const importer = new LocalAudioImportService(
      audioRepo,
      clock,
      ids as any,
      {repositoryRoot: root, workspaceRoot}
    );
    clip = (await importer.importFile({projectId, kind: "CLIP_AUDIO", sourcePath: source})).media;
    bgm = (await importer.importFile({projectId, kind: "BGM", sourcePath: source})).media;
    sfx = (await importer.importFile({projectId, kind: "SFX", sourcePath: source})).media;
  } finally {
    audioRepo.close();
  }

  const timelineRepo = new SqliteEditorTimelineRepository(dbPath);
  try {
    assert.equal((await timelineRepo.getMedia(projectId, clip.id))?.mediaStatus, "AVAILABLE");
    assert.equal((await timelineRepo.getMedia(projectId, bgm.id))?.mediaType, "AUDIO");
    assert.equal((await timelineRepo.getMedia(projectId, sfx.id))?.mediaType, "AUDIO");

    const contentPlans = new EditorContentPlanService(timelineRepo, clock, ids as any);
    const plan = await contentPlans.savePlan({
      projectId,
      planStatus: "APPROVED",
      audio: [
        {
          id: "clip-audio-placement",
          type: "CLIP_AUDIO",
          mediaId: clip.id,
          timelineStartMs: 100,
          durationMs: 400,
          volume: 0.2
        },
        {
          id: "bgm-placement",
          type: "BGM",
          mediaId: bgm.id,
          timelineStartMs: 0,
          volume: 0.1,
          loop: true
        },
        {
          id: "sfx-placement",
          type: "SFX",
          mediaId: sfx.id,
          timelineStartMs: 250,
          durationMs: 200,
          volume: 0.4
        }
      ],
      subtitles: [],
      textOverlays: [],
      graphics: []
    });
    assert.equal(plan.planStatus, "APPROVED");

    const pipeline = new EditorTimelineAssemblyPipeline(
      timelineRepo,
      {buildEditorHandoff: async () => handoff(projectId)},
      clock,
      ids as any,
      timelineRepo
    );
    const assembled = await pipeline.assembleProject({
      projectId,
      projectName: "MIG-10 Audio WF-16",
      profile: {fps: 30, width: 1080, height: 1920}
    });

    assert.equal(assembled.output.status, "READY");
    const byTrack = new Map(assembled.output.editProject.items.map(item => [item.trackId, item]));
    assert.equal(byTrack.get("A2")?.type, "CLIP_AUDIO");
    assert.equal(byTrack.get("A3")?.type, "BGM");
    assert.equal(byTrack.get("A4")?.type, "SFX");
    assert.equal(assembled.output.blockers.length, 0);
  } finally {
    timelineRepo.close();
  }
});
