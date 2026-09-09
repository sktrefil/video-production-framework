import assert from "node:assert/strict";
import test from "node:test";
import type {
  ClipQcRecord,
  CurrentImplementationRef,
  FinalMediaBinding,
  LinkCutImplementation,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink
} from "@vpf/domain";
import {
  MediaBindingPipeline,
  MediaBindingValidationError,
  type MediaBindingClock,
  type MediaBindingContextPort,
  type MediaBindingIdFactory,
  type MediaBindingRepository
} from "../src/index.js";

const now = "2026-09-09T13:00:00.000Z";
const clock: MediaBindingClock = { nowIso: () => now };

function ids(): MediaBindingIdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

function baseAsset(id: string, mediaId: string): ProductionAsset {
  return {
    id,
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    assetClass: "PRIMARY_SCENE",
    assetRole: "STANDARD",
    productionPriority: "CRITICAL",
    sourceStrategy: "GENERATE",
    owner: { type: "SCENE", id: id === "a1" ? "s1" : "s2" },
    stateRef: { entityType: "SCENE", entityId: id === "a1" ? "s1" : "s2", stateField: "STATE_CURRENT" },
    design: {
      visualGoal: "goal",
      composition: "mid",
      continuityRequirements: [],
      identityAnchorIds: [],
      factualConstraints: [],
      avoidances: []
    },
    candidateMediaIds: [mediaId],
    approvedMediaId: mediaId,
    assetStatus: "APPROVED",
    sourceSceneRevision: 1,
    sourceProjectStyleId: "style1",
    sourceProjectStyleRevision: 1,
    sourceIdentityAnchorRevisions: {},
    formatProfileVersion: "short-v1"
  };
}

function image(id: string): MediaArtifact {
  return {
    id,
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "IMAGE",
    relativePath: `images/${id}.png`,
    mimeType: "image/png",
    width: 1080,
    height: 1920,
    checksum: `sha256:${id}`,
    mediaStatus: "AVAILABLE"
  };
}

function video(id: string): MediaArtifact {
  return {
    id,
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "VIDEO",
    relativePath: `clips/${id}.mp4`,
    mimeType: "video/mp4",
    width: 1080,
    height: 1920,
    durationMs: 5000,
    checksum: `sha256:${id}`,
    mediaStatus: "AVAILABLE"
  };
}

function baseClip(): ProductionClip {
  return {
    id: "clip1",
    projectId: "p1",
    revision: 5,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    linkId: "link1",
    linkRevision: 4,
    clipMode: "DIRECT_START_END_I2V",
    clipStartStateRef: { entityType: "SCENE", entityId: "s1", stateField: "STATE_OUT" },
    clipEndStateTarget: { entityType: "SCENE", entityId: "s2", stateField: "STATE_IN" },
    startAssetId: "a1",
    startAssetRevision: 1,
    startMediaId: "img1",
    endAssetId: "a2",
    endAssetRevision: 1,
    endMediaId: "img2",
    transitionMethod: "DIRECT",
    cameraMove: "slow push",
    subjectMotion: "restrained",
    environmentMotion: "minimal",
    durationMs: 5000,
    providerExecutionRequired: true,
    finalDesignApprovalId: "apr-design",
    providerPreflightId: "preflight1",
    candidateMediaIds: ["vid1"],
    approvedMediaId: "vid1",
    clipStatus: "APPROVED"
  };
}

function baseLink(type: "CLIP" | "CUT" = "CLIP", implementationId = "clip1"): ProductionLink {
  return {
    id: "link1",
    projectId: "p1",
    revision: 4,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    fromSceneId: "s1",
    fromSceneRevision: 1,
    fromStateRef: { entityType: "SCENE", entityId: "s1", stateField: "STATE_OUT" },
    toSceneId: "s2",
    toSceneRevision: 1,
    toStateRef: { entityType: "SCENE", entityId: "s2", stateField: "STATE_IN" },
    linkScope: "FULL_VIDEO_PRIMARY",
    preLinkRequired: true,
    continuityLevel: "HIGH",
    stateChange: "continue",
    handoffIntent: "connect",
    handoffAnchor: [],
    handoffChannels: ["VISUAL"],
    transitionIntent: "direct",
    fromAssetId: "a1",
    fromAssetRevision: 1,
    fromMediaId: "img1",
    toAssetId: "a2",
    toAssetRevision: 1,
    toMediaId: "img2",
    handoffQcId: "hq1",
    handoffUsable: true,
    implementationType: type,
    implementationRefId: implementationId,
    preLinkMatch: "MATCH",
    linkStatus: "FINAL_DESIGN_READY"
  };
}

function baseQc(): ClipQcRecord {
  return {
    id: "qc1",
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    clipId: "clip1",
    clipRevision: 5,
    candidateMediaId: "vid1",
    status: "TRIM_PASS",
    severity: "MINOR",
    confidence: 0.98,
    usableInMs: 400,
    usableOutMs: 4400,
    issues: ["unstable tail"],
    decisionId: "decision-qc"
  };
}

class FakeStore implements MediaBindingRepository, MediaBindingContextPort {
  clip: ProductionClip | null = baseClip();
  cut: LinkCutImplementation | null = null;
  link: ProductionLink | null = baseLink();
  qc: ClipQcRecord | null = baseQc();
  approval = true;
  bindings: FinalMediaBinding[] = [];
  assets = new Map<string, ProductionAsset>([
    ["a1", baseAsset("a1", "img1")],
    ["a2", baseAsset("a2", "img2")]
  ]);
  media = new Map<string, MediaArtifact>([
    ["img1", image("img1")],
    ["img2", image("img2")],
    ["vid1", video("vid1")]
  ]);

  async getLink(): Promise<ProductionLink | null> { return this.link; }
  async getAsset(_projectId: string, assetId: string): Promise<ProductionAsset | null> {
    return this.assets.get(assetId) ?? null;
  }
  async getMedia(_projectId: string, mediaId: string): Promise<MediaArtifact | null> {
    return this.media.get(mediaId) ?? null;
  }
  async getLatestClip(): Promise<ProductionClip | null> { return this.clip; }
  async getLatestCut(): Promise<LinkCutImplementation | null> { return this.cut; }
  async getLatestClipQc(): Promise<ClipQcRecord | null> { return this.qc; }
  async getLatestBindingByImplementation(
    _projectId: string,
    implementationType: "CLIP" | "CUT",
    implementationId: string
  ): Promise<FinalMediaBinding | null> {
    return [...this.bindings].reverse().find(
      b => b.lifecycleStatus === "ACTIVE" &&
        b.implementationType === implementationType &&
        b.implementationId === implementationId
    ) ?? null;
  }
  async listActiveBindings(): Promise<FinalMediaBinding[]> {
    return this.bindings.filter(b => b.lifecycleStatus === "ACTIVE");
  }
  async listCurrentImplementationRefs(): Promise<CurrentImplementationRef[]> {
    if (this.link?.implementationType === undefined || this.link.implementationRefId === undefined) return [];
    return [{
      linkId: this.link.id,
      linkRevision: this.link.revision,
      implementationType: this.link.implementationType,
      implementationId: this.link.implementationRefId
    }];
  }
  async hasClipMediaApproval(): Promise<boolean> { return this.approval; }
  async commitBinding(input: {
    previousBinding: FinalMediaBinding | null;
    binding: FinalMediaBinding;
  }): Promise<void> {
    if (input.previousBinding !== null) {
      const found = this.bindings.find(b =>
        b.id === input.previousBinding!.id &&
        b.revision === input.previousBinding!.revision
      );
      if (found) found.lifecycleStatus = "SUPERSEDED";
    }
    this.bindings.push({ ...input.binding });
  }
  async markBindingsStale(input: {
    items: Array<{ bindingId: string; reason: string }>;
  }): Promise<void> {
    for (const item of input.items) {
      const found = this.bindings.find(b => b.id === item.bindingId && b.lifecycleStatus === "ACTIVE");
      if (found) {
        found.stale = true;
        found.staleReason = item.reason;
        found.bindingStatus = "STALE";
      }
    }
  }
}

test("WF-13 preserves WF-12 TRIM_PASS range in final video binding", async () => {
  const store = new FakeStore();
  const pipeline = new MediaBindingPipeline(store, store, clock, ids());
  const result = await pipeline.bindClip({ projectId: "p1", clipId: "clip1" });
  assert.equal(result.binding.bindingKind, "VIDEO");
  assert.equal(result.binding.mediaId, "vid1");
  assert.equal(result.binding.sourceQcId, "qc1");
  assert.equal(result.binding.sourceInMs, 400);
  assert.equal(result.binding.sourceOutMs, 4400);
  assert.equal(result.binding.durationMs, 4000);
});

test("WF-13 rejects an approvedMediaId without durable media approval", async () => {
  const store = new FakeStore();
  store.approval = false;
  const pipeline = new MediaBindingPipeline(store, store, clock, ids());
  await assert.rejects(
    pipeline.bindClip({ projectId: "p1", clipId: "clip1" }),
    (error: unknown) =>
      error instanceof MediaBindingValidationError &&
      error.code === "FINAL_MEDIA_NOT_APPROVED"
  );
});

test("WF-13 binds approved editorial Clip to its START image without video QC", async () => {
  const store = new FakeStore();
  store.clip = {
    ...baseClip(),
    revision: 2,
    clipMode: "EDITORIAL_MOVE",
    providerExecutionRequired: false,
    providerPreflightId: undefined,
    candidateMediaIds: [],
    approvedMediaId: undefined,
    clipStatus: "READY",
    durationMs: 4200
  };
  store.qc = null;
  const pipeline = new MediaBindingPipeline(store, store, clock, ids());
  const result = await pipeline.bindClip({ projectId: "p1", clipId: "clip1" });
  assert.equal(result.binding.bindingKind, "EDITORIAL");
  assert.equal(result.binding.mediaId, "img1");
  assert.equal(result.binding.sourceAssetId, "a1");
  assert.equal(result.binding.durationMs, 4200);
  assert.equal(result.binding.sourceInMs, undefined);
  assert.equal(result.binding.sourceOutMs, undefined);
});

test("WF-13 represents approved CUT as a media-free editor instruction", async () => {
  const store = new FakeStore();
  store.clip = null;
  store.cut = {
    id: "cut1",
    projectId: "p1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    linkId: "link1",
    linkRevision: 4,
    transitionMethod: "HARD_CUT",
    rationale: "clean cut",
    finalDesignApprovalId: "apr-cut",
    ready: true
  };
  store.link = baseLink("CUT", "cut1");
  const pipeline = new MediaBindingPipeline(store, store, clock, ids());
  const result = await pipeline.bindCut({ projectId: "p1", cutId: "cut1" });
  assert.equal(result.binding.bindingKind, "CUT");
  assert.equal(result.binding.mediaId, undefined);
  assert.equal(result.binding.durationMs, 0);
  assert.equal(result.binding.transitionMethod, "HARD_CUT");
});

test("WF-13 marks an existing binding stale when the Clip revision changes", async () => {
  const store = new FakeStore();
  const pipeline = new MediaBindingPipeline(store, store, clock, ids());
  const result = await pipeline.bindClip({ projectId: "p1", clipId: "clip1" });
  store.clip = { ...store.clip!, revision: 6 };
  const stale = await pipeline.reconcileStaleBindings("p1");
  assert.deepEqual(stale, [result.binding.id]);
  const current = await store.getLatestBindingByImplementation("p1", "CLIP", "clip1");
  assert.equal(current?.stale, true);
  assert.equal(current?.staleReason, "CLIP_REVISION_CHANGED");
});

test("WF-13 editor handoff is READY only when every current implementation is bound", async () => {
  const store = new FakeStore();
  const pipeline = new MediaBindingPipeline(store, store, clock, ids());

  const blocked = await pipeline.buildEditorHandoff("p1");
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.blockers[0]?.reason, "CURRENT_IMPLEMENTATION_NOT_BOUND");

  await pipeline.bindClip({ projectId: "p1", clipId: "clip1" });
  const ready = await pipeline.buildEditorHandoff("p1");
  assert.equal(ready.status, "READY");
  assert.equal(ready.recommendedFileName, "media_binding.json");
  assert.equal(ready.boundImplementations, 1);
  assert.equal(ready.items[0]?.relativePath, "clips/vid1.mp4");
  assert.equal(ready.items[0]?.sourceInMs, 400);
  assert.equal(ready.items[0]?.sourceOutMs, 4400);
});
