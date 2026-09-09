import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalRecord,
  FinalDeliveryManifest,
  FinalOutputQcRecord,
  FinalRenderAttempt,
  FinalRenderTechnicalQcRecord,
  PublishPackageManifest
} from "@vpf/domain";
import {
  FinalOutputPipeline,
  FinalOutputValidationError,
  type FinalOutputClock,
  type FinalOutputIdFactory,
  type FinalOutputRepository
} from "../src/index.js";

const now = "2026-09-10T00:00:00.000Z";
const clock: FinalOutputClock = {nowIso: () => now};

function ids(): FinalOutputIdFactory {
  let n = 0;
  return {next: prefix => prefix + "_" + ++n};
}

function render(): FinalRenderAttempt {
  return {
    id: "render1",
    projectId: "p1",
    revision: 3,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    assemblyId: "assembly1",
    assemblyRevision: 2,
    projectSha256: "1".repeat(64),
    attempt: 1,
    status: "DELIVERY_READY",
    profile: {
      compositionId: "GenericFinalRender",
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      crf: 18
    },
    paths: {
      outputPath: "out/p1/final.mp4",
      gateReportPath: "out/p1/production_gate.json",
      renderPropsPath: "out/p1/render_props.json",
      renderManifestPath: "out/p1/render_manifest.json",
      technicalQcPath: "out/p1/technical_qc.json",
      deliveryManifestPath: "out/p1/delivery_manifest.json"
    },
    expectedFps: 30,
    expectedWidth: 1080,
    expectedHeight: 1920,
    expectedDurationInFrames: 120,
    expectedAudio: true,
    completedAt: now
  };
}

function technicalQc(): FinalRenderTechnicalQcRecord {
  return {
    id: "techqc1",
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    renderAttemptId: "render1",
    renderAttemptRevision: 3,
    assemblyId: "assembly1",
    assemblyRevision: 2,
    status: "PASS",
    issueCodes: [],
    expected: {
      projectSha256: "1".repeat(64),
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 120,
      durationMs: 4000,
      audioExpected: true,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p"
    },
    actual: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      pixelFormatVerification: "RENDER_PROFILE",
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 4000,
      hasAudioStream: true
    },
    outputPath: "out/p1/final.mp4",
    outputSizeBytes: 5000,
    outputSha256: "a".repeat(64)
  };
}

function delivery(): FinalDeliveryManifest {
  return {
    id: "delivery1",
    projectId: "p1",
    revision: 2,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    renderAttemptId: "render1",
    renderAttemptRevision: 3,
    technicalQcId: "techqc1",
    technicalQcRevision: 1,
    assemblyId: "assembly1",
    assemblyRevision: 2,
    projectSha256: "1".repeat(64),
    status: "READY",
    outputPath: "out/p1/final.mp4",
    outputSizeBytes: 5000,
    outputSha256: "a".repeat(64),
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 120,
    durationMs: 4000,
    createdFromRenderManifestPath: "out/p1/render_manifest.json",
    technicalQcPath: "out/p1/technical_qc.json"
  };
}

class FakeRepo implements FinalOutputRepository {
  render: FinalRenderAttempt | null = render();
  technical: FinalRenderTechnicalQcRecord | null = technicalQc();
  delivery: FinalDeliveryManifest | null = delivery();
  qcs: FinalOutputQcRecord[] = [];
  packages: PublishPackageManifest[] = [];
  approvals: ApprovalRecord[] = [];

  async getLatestRenderAttempt(): Promise<FinalRenderAttempt | null> {
    return this.render;
  }

  async getLatestTechnicalQc(): Promise<FinalRenderTechnicalQcRecord | null> {
    return this.technical;
  }

  async getLatestDeliveryManifest(): Promise<FinalDeliveryManifest | null> {
    return this.delivery;
  }

  async getLatestFinalOutputQc(): Promise<FinalOutputQcRecord | null> {
    return [...this.qcs].reverse().find(x => x.lifecycleStatus === "ACTIVE") ?? null;
  }

  async getLatestPublishPackage(): Promise<PublishPackageManifest | null> {
    return [...this.packages].reverse().find(x => x.lifecycleStatus === "ACTIVE") ?? null;
  }

  async commitFinalOutputQc(input: {
    previousQc: FinalOutputQcRecord | null;
    nextQc: FinalOutputQcRecord;
    approval?: ApprovalRecord;
  }): Promise<void> {
    if (input.previousQc) {
      const prev = this.qcs.find(
        x => x.id === input.previousQc!.id && x.revision === input.previousQc!.revision
      );
      if (prev) prev.lifecycleStatus = "SUPERSEDED";
    }
    this.qcs.push(structuredClone(input.nextQc));
    if (input.approval) this.approvals.push(structuredClone(input.approval));
  }

  async commitPublishPackage(input: {
    previousPackage: PublishPackageManifest | null;
    nextPackage: PublishPackageManifest;
  }): Promise<void> {
    if (input.previousPackage) {
      const prev = this.packages.find(
        x => x.id === input.previousPackage!.id &&
          x.revision === input.previousPackage!.revision
      );
      if (prev) prev.lifecycleStatus = "SUPERSEDED";
    }
    this.packages.push(structuredClone(input.nextPackage));
  }

  async commitPublishPackageStale(input: {
    previousPackage: PublishPackageManifest;
    nextPackage: PublishPackageManifest;
  }): Promise<void> {
    const prev = this.packages.find(
      x => x.id === input.previousPackage.id &&
        x.revision === input.previousPackage.revision
    );
    if (prev) prev.lifecycleStatus = "SUPERSEDED";
    this.packages.push(structuredClone(input.nextPackage));
  }
}

const metadata = {
  platform: "YOUTUBE" as const,
  title: "  History Mystery  ",
  description: "description",
  tags: ["history", "mystery", "history"],
  visibility: "PRIVATE" as const,
  madeForKids: false,
  language: "ko"
};

test("WF-18 records PASS only against the current WF-17 delivery", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalOutputPipeline(repo, clock, ids());
  const qc = await pipeline.recordFinalOutputQc({
    projectId: "p1",
    status: "PASS",
    confidence: 0.96,
    notes: ["human watched final output"]
  });

  assert.equal(qc.status, "PASS");
  assert.equal(qc.deliveryManifestId, "delivery1");
  assert.equal(qc.deliveryManifestRevision, 2);
  assert.equal(qc.outputSha256, "a".repeat(64));

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.finalOutputQcPassed, true);
  assert.equal(readiness.packageReady, false);
  assert.ok(readiness.blockers.includes("PUBLISH_PACKAGE_REQUIRED"));
});

test("WF-18 supports explicit human review before Final Output QC PASS", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalOutputPipeline(repo, clock, ids());

  const pending = await pipeline.recordFinalOutputQc({
    projectId: "p1",
    status: "PASS",
    confidence: 0.9,
    reviewRequired: true
  });
  assert.equal(pending.status, "NEEDS_REVIEW");

  const before = await pipeline.getReadiness("p1");
  assert.equal(before.status, "NEEDS_REVIEW");

  const approved = await pipeline.approveFinalOutputQc({
    projectId: "p1",
    approvedById: "reviewer",
    reason: "Watched final render."
  });
  assert.equal(approved.status, "PASS");
  assert.ok(approved.reviewApprovalId);
  assert.equal(repo.approvals.length, 1);
  assert.equal(repo.approvals[0]?.approvalState, "HUMAN_APPROVED");
  assert.equal(repo.approvals[0]?.targetType, "FINAL_OUTPUT");
});

test("WF-18 blocks packaging for FIX_REQUIRED or BLOCKED output QC", async () => {
  for (const status of ["FIX_REQUIRED", "BLOCKED"] as const) {
    const repo = new FakeRepo();
    const pipeline = new FinalOutputPipeline(repo, clock, ids());
    await pipeline.recordFinalOutputQc({
      projectId: "p1",
      status,
      confidence: 0.8,
      issueCodes: ["OUTPUT_REVIEW_ISSUE"]
    });

    await assert.rejects(
      pipeline.createPublishPackage({projectId: "p1", metadata}),
      (error: unknown) =>
        error instanceof FinalOutputValidationError &&
        error.code === "OUTPUT_QC_NOT_READY"
    );
  }
});

test("WF-18 creates an idempotent YouTube publish handoff after QC PASS", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalOutputPipeline(repo, clock, ids());
  await pipeline.recordFinalOutputQc({
    projectId: "p1",
    status: "PASS",
    confidence: 1
  });

  const first = await pipeline.createPublishPackage({
    projectId: "p1",
    metadata: {
      ...metadata,
      thumbnail: {
        relativePath: "assets/thumbnail.png",
        sizeBytes: 1200,
        sha256: "b".repeat(64)
      }
    }
  });
  const second = await pipeline.createPublishPackage({
    projectId: "p1",
    metadata: {
      ...metadata,
      thumbnail: {
        relativePath: "assets/thumbnail.png",
        sizeBytes: 1200,
        sha256: "b".repeat(64)
      }
    }
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.manifest.packageStatus, "READY");
  assert.equal(first.output.status, "READY");
  assert.equal(first.output.recommendedFileName, "publish_handoff.json");
  assert.equal(first.manifest.metadata.title, "History Mystery");
  assert.deepEqual(first.manifest.metadata.tags, ["history", "mystery"]);
  assert.match(first.manifest.packageSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    first.manifest.files.find(file => file.role === "VIDEO")?.sha256,
    "a".repeat(64)
  );
  assert.ok(first.manifest.files.some(file => file.role === "THUMBNAIL"));

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.packageReady, true);
  assert.equal(readiness.publishHandoffReady, true);
  assert.equal(readiness.status, "PACKAGE_READY");
});

test("WF-18 marks an existing package STALE when delivery revision changes", async () => {
  const repo = new FakeRepo();
  const pipeline = new FinalOutputPipeline(repo, clock, ids());
  await pipeline.recordFinalOutputQc({
    projectId: "p1",
    status: "PASS",
    confidence: 1
  });
  await pipeline.createPublishPackage({projectId: "p1", metadata});

  repo.delivery = {
    ...repo.delivery!,
    revision: 3
  };

  const stale = await pipeline.reconcileStale("p1");
  assert.equal(stale, true);
  const pkg = await repo.getLatestPublishPackage("p1");
  assert.equal(pkg?.packageStatus, "STALE");

  const readiness = await pipeline.getReadiness("p1");
  assert.equal(readiness.publishHandoffReady, false);
  assert.equal(readiness.status, "STALE");
});

test("WF-18 refuses to start when WF-17 delivery is not current READY", async () => {
  const repo = new FakeRepo();
  repo.delivery = {...repo.delivery!, status: "BLOCKED"};
  const pipeline = new FinalOutputPipeline(repo, clock, ids());

  await assert.rejects(
    pipeline.recordFinalOutputQc({
      projectId: "p1",
      status: "PASS",
      confidence: 1
    }),
    (error: unknown) =>
      error instanceof FinalOutputValidationError &&
      error.code === "DELIVERY_NOT_READY"
  );
});
