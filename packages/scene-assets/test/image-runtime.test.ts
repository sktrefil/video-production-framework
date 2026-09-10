import assert from "node:assert/strict";
import test from "node:test";
import type {
  IdentityAnchor,
  MediaArtifact,
  ProductionAsset,
  ProjectStyle,
  ProviderJob,
  QcResult,
  Scene
} from "@vpf/domain";
import type { SceneAssetDecisionPort } from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  SceneAssetPipeline,
  type SceneAssetContextPort,
  type SceneAssetIdFactory,
  type SceneAssetRepository
} from "../src/index.js";
import { UnifiedImageRuntimeJobService } from "../src/image-runtime.js";

const now = "2026-09-10T12:30:00.000Z";
const projectId = "mig06-project";

function idFactory(): SceneAssetIdFactory {
  let value = 0;
  return { next: prefix => `${prefix}-mig06-${++value}` };
}

const scene: Scene = {
  id: "scene-1",
  projectId,
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  sequenceId: "sequence-1",
  displayNumber: 1,
  scriptSegment: "approved scene",
  scriptRef: { scriptId: "script-1", scriptRevision: 1 },
  stateIn: "before",
  stateCurrent: "current",
  stateOut: "after",
  primaryVisualIdea: "approved visual",
  mustBeSeen: [],
  canBeNarrated: [],
  canBeImplied: [],
  requiredIdentityAnchorIds: ["anchor-1"],
  sceneStatus: "APPROVED",
  stale: false
};

const style: ProjectStyle = {
  id: "style-1",
  projectId,
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  channelVisualBibleVersion: "2.0.0",
  sourceScriptId: "script-1",
  sourceScriptRevision: 1,
  eraRegion: "approved",
  visualApproach: "approved",
  realismLevel: "approved",
  colorLanguage: "approved",
  lightingLanguage: "approved",
  materialLanguage: "approved",
  environmentLanguage: "approved",
  characterRenderingPrinciple: "approved",
  cameraCompositionTendency: "approved",
  moodRange: [],
  factualConstraints: [],
  avoidances: [],
  stale: false
};

const anchor: IdentityAnchor = {
  id: "anchor-1",
  projectId,
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  anchorType: "CHARACTER",
  name: "approved anchor",
  rationale: "continuity",
  continuityReason: "RECURRING",
  productionPriority: "CRITICAL",
  specification: { locked: [], contextual: [], temporary: [] },
  requiredBySceneIds: [scene.id],
  referenceMediaIds: ["reference-1"],
  sourceProjectStyleId: style.id,
  sourceProjectStyleRevision: style.revision,
  sourceChannelVisualBibleVersion: "2.0.0",
  stale: false
};

function designedAsset(): ProductionAsset {
  return {
    id: "asset-1",
    projectId,
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    assetClass: "PRIMARY_SCENE",
    assetRole: "HERO",
    productionPriority: "CRITICAL",
    sourceStrategy: "GENERATE",
    owner: { type: "SCENE", id: scene.id },
    stateRef: { entityType: "SCENE", entityId: scene.id, stateField: "STATE_CURRENT", entityRevision: 1 },
    design: {
      visualGoal: "approved",
      composition: "approved",
      continuityRequirements: [],
      identityAnchorIds: [anchor.id],
      factualConstraints: [],
      avoidances: []
    },
    candidateMediaIds: [],
    assetStatus: "DESIGNED",
    sourceSceneRevision: 1,
    sourceProjectStyleId: style.id,
    sourceProjectStyleRevision: style.revision,
    sourceIdentityAnchorRevisions: { [anchor.id]: anchor.revision },
    formatProfileVersion: "LONGFORM_16X9_V1@1.0.0",
    stale: false
  };
}

class Repo {
  asset = designedAsset();
  job: ProviderJob | null = null;
  media = new Map<string, MediaArtifact>([
    ["reference-1", {
      id: "reference-1",
      projectId,
      revision: 1,
      lifecycleStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      mediaType: "IMAGE",
      relativePath: "04_visual_identity/reference.png",
      mimeType: "image/png",
      width: 512,
      height: 512,
      checksum: "1".repeat(64),
      mediaStatus: "AVAILABLE"
    }]
  ]);
  qc: QcResult | null = null;
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  async getLatestAsset() { return this.asset; }
  async getMedia(_project: string, mediaId: string) { return this.media.get(mediaId) ?? null; }
  async getLatestProviderJob() { return this.job; }
  async createProviderJob(input: any) {
    this.asset = input.asset;
    this.job = input.job;
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
  async createRetryProviderJob(input: any) {
    this.asset = input.nextAsset;
    this.job = input.job;
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
  async commitAssetCandidate(input: any) {
    this.asset = input.nextAsset;
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
  async getLatestQcForMedia() { return this.qc; }
  async commitImageQc(input: any) {
    this.asset = input.nextAsset;
    this.qc = input.qc;
    this.events.push(input.event);
    this.outbox.push(input.outbox);
  }
}

const context: SceneAssetContextPort = {
  async getScene() { return scene; },
  async getApprovedProjectStyle() { return style; },
  async getRequiredIdentityAnchors() { return [anchor]; },
  async isIdentityAnchorApproved() { return true; }
};

const bibles = {
  async resolve(version: string) {
    return { version, resourceId: "HISTORY_MYSTERY_VISUAL_BIBLE_V2", contentHash: "b".repeat(64), payload: {} };
  }
};
const formats = {
  async resolve(version: string) {
    return {
      version,
      resourceId: "LONGFORM_16X9_V1",
      contentHash: "c".repeat(64),
      payload: { aspectRatio: "16:9", imageGeneration: { width: 1536, height: 864 } }
    };
  }
};
const exactPrompt = "Exact final WF-09 prompt. Do not append any style text.";
const exactNegative = "Exact approved negative prompt.";
const decisions = {
  async compileImagePrompt() {
    return { prompt: exactPrompt, negativePrompt: exactNegative };
  },
  async runImageQc() {
    return { qcStatus: "PASS", severity: "MINOR", confidence: 0.99 };
  }
} as SceneAssetDecisionPort;

function service(repo: Repo, ids: SceneAssetIdFactory) {
  return new UnifiedImageRuntimeJobService(
    repo as unknown as SceneAssetRepository,
    context,
    bibles,
    formats,
    decisions,
    { nowIso: () => now },
    ids
  );
}

test("MIG-06 job stores exact prompt, format dimensions, references and current GENERATING target revision", async () => {
  const repo = new Repo();
  const result = await service(repo, idFactory()).prepareGeneration({
    projectId,
    assetId: repo.asset.id,
    format: "LONGFORM",
    provider: "MOCK_IMAGE",
    providerProfileVersion: "mock-v1",
    executionMode: "AUTOMATED"
  });
  assert.equal(result.job.status, "READY");
  assert.equal(result.asset.assetStatus, "GENERATING");
  assert.equal(result.job.targetRevision, result.asset.revision);
  assert.equal(result.runtimeInput.prompt, exactPrompt);
  assert.equal(result.runtimeInput.negativePrompt, exactNegative);
  assert.equal(result.runtimeInput.width, 1536);
  assert.equal(result.runtimeInput.height, 864);
  assert.equal(result.runtimeInput.aspectRatio, "16:9");
  assert.deepEqual(result.runtimeInput.references, [{
    mediaId: "reference-1",
    role: "IDENTITY_ANCHOR:anchor-1",
    relativePath: "04_visual_identity/reference.png",
    sha256: "1".repeat(64)
  }]);
  assert.equal(result.expectedOutputs[0]?.acceptedMimeTypes?.[0], "image/png");
  assert.equal(await result.job.targetRevision, (await result.asset.revision));
});

test("runtime MediaArtifact attaches only as candidate and existing IMAGE_QC remains mandatory", async () => {
  const repo = new Repo();
  const ids = idFactory();
  const runtime = service(repo, ids);
  const prepared = await runtime.prepareGeneration({
    projectId,
    assetId: repo.asset.id,
    format: "LONGFORM",
    provider: "MOCK_IMAGE",
    providerProfileVersion: "mock-v1",
    executionMode: "AUTOMATED"
  });
  const candidate: MediaArtifact = {
    id: "candidate-1",
    projectId,
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType: "IMAGE",
    relativePath: prepared.runtimeInput.outputRelativePath,
    mimeType: "image/png",
    width: 1536,
    height: 864,
    checksum: "2".repeat(64),
    sourceJobId: prepared.job.id,
    mediaStatus: "AVAILABLE"
  };
  repo.media.set(candidate.id, candidate);
  repo.job = {
    ...prepared.job,
    revision: 3,
    status: "COMPLETE",
    resultMediaIds: [candidate.id]
  };
  const candidateAsset = await runtime.synchronizeRuntimeOutcome({
    projectId,
    jobId: prepared.job.id
  });
  assert.equal(candidateAsset.assetStatus, "CANDIDATE_AVAILABLE");
  assert.deepEqual(candidateAsset.candidateMediaIds, [candidate.id]);
  assert.equal(candidateAsset.approvedMediaId, undefined);

  const pipeline = new SceneAssetPipeline(
    repo as unknown as SceneAssetRepository,
    context,
    bibles,
    formats,
    decisions,
    { shouldAutoApprove: () => false },
    { nowIso: () => now },
    ids
  );
  const qc = await pipeline.runImageQc({
    projectId,
    assetId: candidateAsset.id,
    mediaId: candidate.id,
    format: "LONGFORM"
  });
  assert.equal(qc.qc.qcType, "IMAGE_QC");
  assert.equal(qc.qc.qcStatus, "PASS");
  assert.equal(qc.asset.assetStatus, "NEEDS_REVIEW");
  assert.equal(qc.approval, undefined);
});

test("retry preserves semantic prompt, negative prompt, dimensions and exact references", async () => {
  const repo = new Repo();
  const runtime = service(repo, idFactory());
  const prepared = await runtime.prepareGeneration({
    projectId,
    assetId: repo.asset.id,
    format: "LONGFORM",
    provider: "MOCK_IMAGE",
    providerProfileVersion: "mock-v1",
    executionMode: "AUTOMATED"
  });
  repo.job = {
    ...prepared.job,
    revision: 3,
    status: "FAILED",
    errorCode: "PROVIDER_REQUEST_FAILED",
    errorDetail: "transient"
  };
  const failedAsset = await runtime.synchronizeRuntimeOutcome({ projectId, jobId: prepared.job.id });
  assert.equal(failedAsset.assetStatus, "REGENERATE_REQUIRED");
  const retry = await runtime.retryFailedGeneration({ projectId, jobId: prepared.job.id });
  assert.equal(retry.job.attempt, 2);
  assert.equal(retry.job.retryOfJobId, prepared.job.id);
  assert.equal(retry.job.targetRevision, retry.asset.revision);
  assert.equal(retry.runtimeInput.prompt, prepared.runtimeInput.prompt);
  assert.equal(retry.runtimeInput.negativePrompt, prepared.runtimeInput.negativePrompt);
  assert.equal(retry.runtimeInput.width, prepared.runtimeInput.width);
  assert.equal(retry.runtimeInput.height, prepared.runtimeInput.height);
  assert.deepEqual(retry.runtimeInput.references, prepared.runtimeInput.references);
  assert.notEqual(retry.runtimeInput.outputRelativePath, prepared.runtimeInput.outputRelativePath);
});
