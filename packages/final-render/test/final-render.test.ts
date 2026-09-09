import assert from "node:assert/strict";
import test from "node:test";
import type {
  FinalDeliveryManifest,
  FinalRenderAttempt,
  FinalRenderResultImport,
  FinalRenderTechnicalQcRecord,
  TimelineAssemblyRecord
} from "@vpf/domain";
import {
  FinalRenderPipeline,
  FinalRenderValidationError,
  type FinalRenderClock,
  type FinalRenderIdFactory,
  type FinalRenderRepository
} from "../src/index.js";

const now = "2026-09-09T15:00:00.000Z";
const clock: FinalRenderClock = {nowIso: () => now};

function ids(): FinalRenderIdFactory {
  let n = 0;
  return {next: prefix => prefix + "_" + ++n};
}

function assembly(withAudio = true): TimelineAssemblyRecord {
  return {
    id: "assembly1",
    projectId: "p1",
    revision: 3,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    sourceBindingRefs: [{bindingId: "bind1", bindingRevision: 1}],
    fps: 30,
    width: 1080,
    height: 1920,
    assemblyStatus: "READY",
    stale: false,
    editProject: {
      schemaVersion: 1,
      project: {
        id: "p1",
        name: "History",
        fps: 30,
        width: 1080,
        height: 1920,
        durationInFrames: 120
      },
      tracks: [
        {
          id: "V1",
          type: "VIDEO",
          name: "Main Visual",
          enabled: true,
          locked: false,
          order: 0
        },
        ...(withAudio
          ? [{
              id: "A1",
              type: "AUDIO" as const,
              name: "TTS",
              enabled: true,
              locked: false,
              order: 1
            }]
          : [])
      ],
      items: [
        {
          id: "image1",
          type: "IMAGE",
          trackId: "V1",
          timelineStartFrame: 0,
          durationInFrames: 120,
          enabled: true,
          locked: false,
          src: "projects/p1/frame.png",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fit: "cover"
        },
        ...(withAudio
          ? [{
              id: "tts1",
              type: "TTS" as const,
              trackId: "A1",
              timelineStartFrame: 0,
              durationInFrames: 120,
              enabled: true,
              locked: false,
              src: "projects/p1/tts.mp3",
              sourceStartFrame: 0,
              sourceDurationInFrames: 120,
              sourceAssetDurationInFrames: 120,
              volume: 1,
              muted: false,
              fadeInFrames: 0,
              fadeOutFrames: 0
            }]
          : [])
      ],
      settings: {
        snapEnabled: true,
        snapToleranceFrames: 4,
        timelineZoom: 1,
        masterVolume: 1
      }
    },
    cutBoundaries: [],
    motionDirectives: [],
    blockers: []
  };
}

function validResult(attempt: FinalRenderAttempt): FinalRenderResultImport {
  return {
    schemaVersion: 1,
    status: "RENDERED",
    compositionId: "GenericFinalRender",
    projectId: "p1",
    projectSha256: attempt.projectSha256,
    renderedAt: now,
    metadata: {
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 120
    },
    output: {
      path: attempt.paths.outputPath,
      sizeBytes: 5_000_000,
      sha256: "a".repeat(64),
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      crf: 18
    },
    probe: {
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      videoCodec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 4000,
      hasAudioStream: true
    }
  };
}

class FakeRepo implements FinalRenderRepository {
  currentAssembly: TimelineAssemblyRecord | null = assembly();
  attempts: FinalRenderAttempt[] = [];
  qcs: FinalRenderTechnicalQcRecord[] = [];
  deliveries: FinalDeliveryManifest[] = [];

  async getLatestAssembly(): Promise<TimelineAssemblyRecord | null> {
    return this.currentAssembly;
  }

  async getLatestRenderAttempt(): Promise<FinalRenderAttempt | null> {
    return [...this.attempts].reverse().find(x => x.lifecycleStatus === "ACTIVE") ?? null;
  }

  async getRenderAttempt(
    _projectId: string,
    id: string
  ): Promise<FinalRenderAttempt | null> {
    return [...this.attempts].reverse().find(
      x => x.id === id && x.lifecycleStatus === "ACTIVE"
    ) ?? null;
  }

  async getLatestTechnicalQc(
    _projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderTechnicalQcRecord | null> {
    return [...this.qcs].reverse().find(
      x => x.renderAttemptId === renderAttemptId && x.lifecycleStatus === "ACTIVE"
    ) ?? null;
  }

  async getLatestDeliveryManifest(): Promise<FinalDeliveryManifest | null> {
    return [...this.deliveries].reverse().find(
      x => x.lifecycleStatus === "ACTIVE"
    ) ?? null;
  }

  async commitRenderAttempt(input: {
    previousAttempt: FinalRenderAttempt | null;
    nextAttempt: FinalRenderAttempt;
  }): Promise<void> {
    if (input.previousAttempt !== null) this.supersedeAttempt(input.previousAttempt);
    this.attempts.push(structuredClone(input.nextAttempt));
  }

  async commitRenderOutcome(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    technicalQc: FinalRenderTechnicalQcRecord;
    previousDelivery: FinalDeliveryManifest | null;
    delivery: FinalDeliveryManifest;
  }): Promise<void> {
    this.supersedeAttempt(input.previousAttempt);
    if (input.previousDelivery !== null) this.supersedeDelivery(input.previousDelivery);
    this.attempts.push(structuredClone(input.nextAttempt));
    this.qcs.push(structuredClone(input.technicalQc));
    this.deliveries.push(structuredClone(input.delivery));
  }

  async commitRenderFailure(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
  }): Promise<void> {
    this.supersedeAttempt(input.previousAttempt);
    this.attempts.push(structuredClone(input.nextAttempt));
  }

  async commitRenderStale(input: {
    previousAttempt: FinalRenderAttempt;
    nextAttempt: FinalRenderAttempt;
    previousDelivery: FinalDeliveryManifest | null;
    nextDelivery: FinalDeliveryManifest | null;
  }): Promise<void> {
    this.supersedeAttempt(input.previousAttempt);
    this.attempts.push(structuredClone(input.nextAttempt));
    if (input.previousDelivery !== null && input.nextDelivery !== null) {
      this.supersedeDelivery(input.previousDelivery);
      this.deliveries.push(structuredClone(input.nextDelivery));
    }
  }

  private supersedeAttempt(previous: FinalRenderAttempt): void {
    const found = this.attempts.find(
      x => x.id === previous.id && x.revision === previous.revision
    );
    if (found) found.lifecycleStatus = "SUPERSEDED";
  }

  private supersedeDelivery(previous: FinalDeliveryManifest): void {
    const found = this.deliveries.find(
      x => x.id === previous.id && x.revision === previous.revision
    );
    if (found) found.lifecycleStatus = "SUPERSEDED";
  }
}

test("WF-17 prepares an idempotent render request from READY WF-16 timeline", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalRenderPipeline(repo, clock, ids());
  const first = await pipeline.prepareRender({projectId: "p1"});
  const second = await pipeline.prepareRender({projectId: "p1"});

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.renderAttempt.id, second.renderAttempt.id);
  assert.equal(first.renderAttempt.status, "READY");
  assert.equal(first.renderAttempt.attempt, 1);
  assert.equal(first.renderAttempt.expectedAudio, true);
  assert.equal(first.renderAttempt.profile.codec, "h264");
  assert.equal(first.renderAttempt.profile.audioCodec, "aac");
  assert.equal(first.renderAttempt.profile.pixelFormat, "yuv420p");
  assert.equal(first.renderAttempt.paths.outputPath, "out/p1/final.mp4");
  assert.match(first.renderAttempt.projectSha256, /^[a-f0-9]{64}$/);
});

test("WF-17 accepts probed H264/AAC output and creates DELIVERY_READY manifest", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalRenderPipeline(repo, clock, ids());
  const prepared = await pipeline.prepareRender({projectId: "p1"});
  const running = await pipeline.markRunning({
    projectId: "p1",
    renderAttemptId: prepared.renderAttempt.id
  });
  assert.equal(running.status, "RUNNING");

  const outcome = await pipeline.importRenderResult({
    projectId: "p1",
    renderAttemptId: running.id,
    result: validResult(running)
  });

  assert.equal(outcome.renderAttempt.status, "DELIVERY_READY");
  assert.equal(outcome.technicalQc.status, "PASS");
  assert.deepEqual(outcome.technicalQc.issueCodes, []);
  assert.equal(outcome.delivery.status, "READY");
  assert.equal(outcome.delivery.codec, "h264");
  assert.equal(outcome.delivery.audioCodec, "aac");
  assert.equal(outcome.delivery.pixelFormat, "yuv420p");
  assert.equal(outcome.delivery.durationInFrames, 120);
  assert.equal(outcome.delivery.durationMs, 4000);

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.technicalQcPassed, true);
  assert.equal(readiness.deliveryReady, true);
  assert.equal(readiness.status, "DELIVERY_READY");
});

test("WF-17 fails Technical QC when actual codec or duration differs", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalRenderPipeline(repo, clock, ids());
  const prepared = await pipeline.prepareRender({projectId: "p1"});
  const result = validResult(prepared.renderAttempt);
  result.probe.videoCodec = "hevc";
  result.probe.durationMs = 4800;

  const outcome = await pipeline.importRenderResult({
    projectId: "p1",
    renderAttemptId: prepared.renderAttempt.id,
    result
  });

  assert.equal(outcome.renderAttempt.status, "TECHNICAL_QC_FAILED");
  assert.equal(outcome.technicalQc.status, "FAIL");
  assert.ok(outcome.technicalQc.issueCodes.includes("VIDEO_CODEC_NOT_H264"));
  assert.ok(outcome.technicalQc.issueCodes.includes("DURATION_MISMATCH"));
  assert.equal(outcome.delivery.status, "BLOCKED");

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.deliveryReady, false);
  assert.equal(readiness.status, "TECHNICAL_QC_FAILED");
});

test("WF-17 retries failed Technical QC as a new render attempt", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalRenderPipeline(repo, clock, ids());
  const first = await pipeline.prepareRender({projectId: "p1"});
  const bad = validResult(first.renderAttempt);
  bad.probe.pixelFormat = "yuv444p";

  await pipeline.importRenderResult({
    projectId: "p1",
    renderAttemptId: first.renderAttempt.id,
    result: bad
  });

  const retry = await pipeline.prepareRender({projectId: "p1"});
  assert.equal(retry.created, true);
  assert.notEqual(retry.renderAttempt.id, first.renderAttempt.id);
  assert.equal(retry.renderAttempt.attempt, 2);
  assert.equal(retry.renderAttempt.retryOfRenderAttemptId, first.renderAttempt.id);
  assert.equal(retry.renderAttempt.status, "READY");
});

test("WF-17 rejects unexpected audio stream when timeline has no audible audio", async () => {
  const repo = new FakeRepo();
  repo.currentAssembly = assembly(false);
  const pipeline = new FinalRenderPipeline(repo, clock, ids());
  const prepared = await pipeline.prepareRender({projectId: "p1"});
  assert.equal(prepared.renderAttempt.expectedAudio, false);

  const result = validResult(prepared.renderAttempt);
  const outcome = await pipeline.importRenderResult({
    projectId: "p1",
    renderAttemptId: prepared.renderAttempt.id,
    result
  });

  assert.equal(outcome.technicalQc.status, "FAIL");
  assert.ok(
    outcome.technicalQc.issueCodes.includes("UNEXPECTED_AUDIO_STREAM")
  );
});

test("WF-17 marks delivered render and delivery manifest stale after timeline revision changes", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalRenderPipeline(repo, clock, ids());
  const prepared = await pipeline.prepareRender({projectId: "p1"});
  const outcome = await pipeline.importRenderResult({
    projectId: "p1",
    renderAttemptId: prepared.renderAttempt.id,
    result: validResult(prepared.renderAttempt)
  });
  assert.equal(outcome.delivery.status, "READY");

  repo.currentAssembly = {
    ...repo.currentAssembly!,
    revision: repo.currentAssembly!.revision + 1
  };

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.status, "STALE");
  assert.equal(readiness.deliveryReady, false);

  const delivery = await repo.getLatestDeliveryManifest("p1");
  assert.equal(delivery?.status, "STALE");
});

test("WF-17 blocks render preparation when WF-16 timeline is not READY", async () => {
  const repo = new FakeRepo();
  repo.currentAssembly = {
    ...repo.currentAssembly!,
    assemblyStatus: "PARTIAL"
  };
  const pipeline = new FinalRenderPipeline(repo, clock, ids());

  await assert.rejects(
    pipeline.prepareRender({projectId: "p1"}),
    (error: unknown) =>
      error instanceof FinalRenderValidationError &&
      error.code === "TIMELINE_NOT_READY"
  );
});
