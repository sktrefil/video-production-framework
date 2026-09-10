import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ChannelVisualBibleRegistryAdapter,
  FileSystemResourceRegistry,
  FormatProfileRegistryAdapter
} from "@vpf/resource-registry";
import type {
  ApprovalRecord,
  IdentityAnchor,
  MediaArtifact,
  ProductionAsset,
  ProjectStyle,
  ProviderJob,
  QcResult,
  Scene
} from "@vpf/domain";
import type {
  AssetPlanDecision,
  ChannelVisualBibleSnapshot,
  FormatProfileSnapshot,
  ImageAssetDesignDecision,
  ImagePromptDecision,
  ImageQcDecision,
  SceneAssetDecisionPort
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  SceneAssetBatchService,
  SceneAssetPipeline,
  SceneAssetValidationError,
  type ChannelVisualBiblePort,
  type FormatProfilePort,
  type ImageApprovalPolicy,
  type SceneAssetClock,
  type SceneAssetContextPort,
  type SceneAssetIdFactory,
  type SceneAssetRepository
} from "../src/index.js";

const now = "2026-09-09T11:00:00.000Z";
const clock: SceneAssetClock = { nowIso: () => now };

function ids(): SceneAssetIdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

function makeScene(id = "sc_1", approved = true): Scene {
  return {
    id,
    projectId: "prj_1",
    sequenceId: "seq_1",
    revision: 2,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    displayNumber: id === "sc_1" ? 1 : 2,
    scriptSegment: "장면.",
    scriptRef: { scriptId: "script_1", scriptRevision: 1 },
    stateIn: "A",
    stateCurrent: "B",
    stateOut: "C",
    primaryVisualIdea: "인물 장면",
    mustBeSeen: [],
    canBeNarrated: [],
    canBeImplied: [],
    requiredIdentityAnchorIds: ["anc_1"],
    sceneStatus: approved ? "APPROVED" : "DESIGNED",
    stale: false
  };
}

const style: ProjectStyle = {
  id: "sty_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  channelVisualBibleVersion: "2.0.0",
  sourceScriptId: "script_1",
  sourceScriptRevision: 1,
  eraRegion: "조선",
  visualApproach: "역사 재현",
  realismLevel: "사실적",
  colorLanguage: "저채도",
  lightingLanguage: "자연광",
  materialLanguage: "목재",
  environmentLanguage: "고증 공간",
  characterRenderingPrinciple: "일관성",
  cameraCompositionTendency: "관찰형",
  moodRange: ["절제"],
  factualConstraints: [],
  avoidances: [],
  stale: false
};

const anchor: IdentityAnchor = {
  id: "anc_1",
  projectId: "prj_1",
  revision: 1,
  lifecycleStatus: "ACTIVE",
  createdAt: now,
  updatedAt: now,
  anchorType: "CHARACTER",
  name: "주요 인물",
  rationale: "반복 등장",
  continuityReason: "RECURRING",
  productionPriority: "CRITICAL",
  specification: {
    locked: ["얼굴", "연령", "기본 복식"],
    contextual: ["표정"],
    temporary: []
  },
  requiredBySceneIds: ["sc_1", "sc_2"],
  referenceMediaIds: [],
  sourceProjectStyleId: style.id,
  sourceProjectStyleRevision: style.revision,
  sourceChannelVisualBibleVersion: "2.0.0",
  stale: false
};

class MemoryContext implements SceneAssetContextPort {
  scenes = new Map<string, Scene>([
    ["sc_1", makeScene("sc_1")],
    ["sc_2", makeScene("sc_2")]
  ]);
  approvedStyle: ProjectStyle | null = style;
  anchors = [anchor];
  anchorApproved = true;

  async getScene(_projectId: string, sceneId: string) {
    return this.scenes.get(sceneId) ?? null;
  }
  async getApprovedProjectStyle() {
    return this.approvedStyle;
  }
  async getRequiredIdentityAnchors() {
    return this.anchors;
  }
  async isIdentityAnchorApproved() {
    return this.anchorApproved;
  }
}

class MemoryRepository implements SceneAssetRepository {
  assets: ProductionAsset[] = [];
  media: MediaArtifact[] = [];
  jobs: ProviderJob[] = [];
  qc: QcResult[] = [];
  approvals: ApprovalRecord[] = [];
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  async getLatestAsset(_projectId: string, assetId: string) {
    return [...this.assets]
      .filter(a => a.id === assetId && a.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }
  async getPrimarySceneAsset(_projectId: string, sceneId: string) {
    return [...this.assets]
      .filter(a =>
        a.owner.type === "SCENE" &&
        a.owner.id === sceneId &&
        a.assetClass === "PRIMARY_SCENE" &&
        a.lifecycleStatus === "ACTIVE"
      )
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }
  async listAssets() {
    return this.assets.filter(a => a.lifecycleStatus === "ACTIVE");
  }

  async commitAssetDesign(input: {
    previous: ProductionAsset | null;
    next: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    if (input.previous) this.supersedeAsset(input.previous);
    this.assets.push(input.next);
    this.record(input.event, input.outbox);
  }

  async commitAssetCandidate(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    media?: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeAsset(input.previousAsset);
    this.assets.push(input.nextAsset);
    if (input.media) this.media.push(input.media);
    this.record(input.event, input.outbox);
  }

  async createProviderJob(input: {
    job: ProviderJob;
    asset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const previous = await this.getLatestAsset(input.asset.projectId, input.asset.id);
    if (previous) this.supersedeAsset(previous);
    this.assets.push(input.asset);
    this.jobs.push(input.job);
    this.record(input.event, input.outbox);
  }

  async getLatestProviderJob(_projectId: string, jobId: string) {
    return [...this.jobs]
      .filter(j => j.id === jobId && j.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async commitProviderResult(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeJob(input.previousJob);
    this.supersedeAsset(input.previousAsset);
    this.jobs.push(input.nextJob);
    this.assets.push(input.nextAsset);
    this.media.push(input.media);
    this.record(input.event, input.outbox);
  }

  async commitProviderJobFailure(input: {
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeJob(input.previousJob);
    this.supersedeAsset(input.previousAsset);
    this.jobs.push(input.nextJob);
    this.assets.push(input.nextAsset);
    this.record(input.event, input.outbox);
  }

  async createRetryProviderJob(input: {
    job: ProviderJob;
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeAsset(input.previousAsset);
    this.assets.push(input.nextAsset);
    this.jobs.push(input.job);
    this.record(input.event, input.outbox);
  }

  async getMedia(_projectId: string, mediaId: string) {
    return this.media.find(m => m.id === mediaId && m.lifecycleStatus === "ACTIVE") ?? null;
  }
  async getLatestQcForMedia(
    _projectId: string,
    assetId: string,
    mediaId: string
  ) {
    return [...this.qc].reverse().find(q =>
      q.targetId === assetId && q.mediaId === mediaId
    ) ?? null;
  }

  async commitImageQc(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    qc: QcResult;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeAsset(input.previousAsset);
    this.assets.push(input.nextAsset);
    this.qc.push(input.qc);
    if (input.approval) this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitAssetApproval(input: {
    previousAsset: ProductionAsset;
    nextAsset: ProductionAsset;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeAsset(input.previousAsset);
    this.assets.push(input.nextAsset);
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async markAssetsStale(input: {
    assetIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const ids = new Set(input.assetIds);
    this.assets = this.assets.map(a =>
      ids.has(a.id) && a.lifecycleStatus === "ACTIVE"
        ? { ...a, stale: true, staleReason: input.reason }
        : a
    );
    this.record(input.event, input.outbox);
  }

  private supersedeAsset(asset: ProductionAsset) {
    this.assets = this.assets.map(a =>
      a.id === asset.id && a.revision === asset.revision
        ? { ...a, lifecycleStatus: "SUPERSEDED" as const, assetStatus: "SUPERSEDED" as const }
        : a
    );
  }
  private supersedeJob(job: ProviderJob) {
    this.jobs = this.jobs.map(j =>
      j.id === job.id && j.revision === job.revision
        ? { ...j, lifecycleStatus: "SUPERSEDED" as const }
        : j
    );
  }
  private record(event: WorkflowEvent, outbox: OutboxRecord) {
    this.events.push(event);
    this.outbox.push(outbox);
  }
}

class Decisions implements SceneAssetDecisionPort {
  qcDecision: ImageQcDecision = {
    qcStatus: "PASS",
    severity: "MINOR",
    confidence: 0.95
  };

  planDecision: AssetPlanDecision = {
    assetClass: "PRIMARY_SCENE",
    assetRole: "STANDARD",
    productionPriority: "CRITICAL",
    sourceStrategy: "GENERATE",
    stateField: "STATE_CURRENT",
    rationale: "기본 장면 이미지"
  };

  async planAsset(): Promise<AssetPlanDecision> {
    return { ...this.planDecision };
  }
  async designImageAsset(): Promise<ImageAssetDesignDecision> {
    return {
      visualGoal: "장면의 핵심 상태를 보여준다",
      composition: "중경",
      continuityRequirements: ["같은 인물 유지"],
      identityAnchorIds: ["anc_1"],
      factualConstraints: [],
      avoidances: ["현대 물건"]
    };
  }
  async compileImagePrompt(): Promise<ImagePromptDecision> {
    return { prompt: "approved scene image prompt", negativePrompt: "modern object" };
  }
  async runImageQc(): Promise<ImageQcDecision> {
    return this.qcDecision;
  }
}

const bible: ChannelVisualBiblePort = {
  async resolve(version: string): Promise<ChannelVisualBibleSnapshot | null> {
    return version === "2.0.0"
      ? { version, resourceId: "channel", contentHash: "hash", payload: {} }
      : null;
  }
};

const formats: FormatProfilePort = {
  async resolve(version: string): Promise<FormatProfileSnapshot | null> {
    return version === "shorts-v1"
      ? { version, resourceId: "shorts", contentHash: "hash2", payload: {} }
      : null;
  }
};

function makePipeline(options?: {
  autoApprove?: boolean;
  context?: MemoryContext;
  repository?: MemoryRepository;
  decisions?: Decisions;
  bible?: ChannelVisualBiblePort;
  formats?: FormatProfilePort;
}) {
  const repository = options?.repository ?? new MemoryRepository();
  const context = options?.context ?? new MemoryContext();
  const decisions = options?.decisions ?? new Decisions();
  const policy: ImageApprovalPolicy = {
    shouldAutoApprove: () => options?.autoApprove ?? false
  };
  return {
    repository,
    context,
    decisions,
    service: new SceneAssetPipeline(
      repository,
      context,
      options?.bible ?? bible,
      options?.formats ?? formats,
      decisions,
      policy,
      clock,
      ids()
    )
  };
}

test("readiness requires Scene, Style, Anchor and Format prerequisites", async () => {
  const context = new MemoryContext();
  context.anchorApproved = false;
  const { service } = makePipeline({ context });
  let readiness = await service.getReadiness({
    projectId: "prj_1",
    sceneId: "sc_1",
    formatProfileVersion: "shorts-v1"
  });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missingAnchorApprovalIds, ["anc_1"]);

  context.anchorApproved = true;
  readiness = await service.getReadiness({
    projectId: "prj_1",
    sceneId: "sc_1",
    formatProfileVersion: "shorts-v1"
  });
  assert.equal(readiness.ready, true);
});

test("manual external image result remains Candidate until QC and explicit Approval", async () => {
  const { service } = makePipeline();
  const asset = await service.designPrimarySceneAsset({
    projectId: "prj_1",
    sceneId: "sc_1",
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  const created = await service.createImageGenerationJob({
    projectId: "prj_1",
    assetId: asset.id,
    format: "SHORTFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1",
    executionMode: "MANUAL_EXTERNAL"
  });
  assert.equal(created.job.status, "WAITING_EXTERNAL");

  const result = await service.registerImageResult({
    projectId: "prj_1",
    jobId: created.job.id,
    relativePath: "06_generated_assets/images/result.png",
    mimeType: "image/png",
    checksum: "sha256:abc"
  });
  assert.equal(result.asset.assetStatus, "CANDIDATE_AVAILABLE");
  assert.equal(result.asset.approvedMediaId, undefined);

  const qc = await service.runImageQc({
    projectId: "prj_1",
    assetId: asset.id,
    mediaId: result.media.id,
    format: "SHORTFORM"
  });
  assert.equal(qc.qc.qcStatus, "PASS");
  assert.equal(qc.asset.assetStatus, "NEEDS_REVIEW");
  assert.equal(qc.approval, undefined);

  const approved = await service.approveAsset({
    projectId: "prj_1",
    assetId: asset.id,
    mediaId: result.media.id
  });
  assert.equal(approved.asset.assetStatus, "APPROVED");
  assert.equal(approved.approval.selectedMediaId, result.media.id);
  assert.equal(approved.approval.approvalState, "HUMAN_APPROVED");
});

test("ApprovalPolicy can auto-approve PASS without hardcoded confidence threshold", async () => {
  const { service } = makePipeline({ autoApprove: true });
  const asset = await service.designPrimarySceneAsset({
    projectId: "prj_1",
    sceneId: "sc_1",
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  const job = await service.createImageGenerationJob({
    projectId: "prj_1",
    assetId: asset.id,
    format: "SHORTFORM",
    provider: "TEST",
    providerProfileVersion: "1",
    executionMode: "AUTOMATED"
  });
  const result = await service.registerImageResult({
    projectId: "prj_1",
    jobId: job.job.id,
    relativePath: "06_generated_assets/images/auto.png",
    mimeType: "image/png",
    checksum: "sha256:auto"
  });
  const qc = await service.runImageQc({
    projectId: "prj_1",
    assetId: asset.id,
    mediaId: result.media.id,
    format: "SHORTFORM"
  });
  assert.equal(qc.asset.assetStatus, "APPROVED");
  assert.equal(qc.approval?.approvalState, "AUTO_APPROVED");
});

test("media import rejects traversal and non-image MIME", async () => {
  const { service } = makePipeline();
  const asset = await service.designPrimarySceneAsset({
    projectId: "prj_1",
    sceneId: "sc_1",
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  const job = await service.createImageGenerationJob({
    projectId: "prj_1",
    assetId: asset.id,
    format: "SHORTFORM",
    provider: "FLOW",
    providerProfileVersion: "1",
    executionMode: "MANUAL_EXTERNAL"
  });

  await assert.rejects(
    () => service.registerImageResult({
      projectId: "prj_1",
      jobId: job.job.id,
      relativePath: "../outside.png",
      mimeType: "image/png",
      checksum: "x"
    }),
    (error: unknown) =>
      error instanceof SceneAssetValidationError &&
      error.code === "MEDIA_PATH_INVALID"
  );

  await assert.rejects(
    () => service.registerImageResult({
      projectId: "prj_1",
      jobId: job.job.id,
      relativePath: "06_generated_assets/file.txt",
      mimeType: "text/plain",
      checksum: "x"
    }),
    (error: unknown) =>
      error instanceof SceneAssetValidationError &&
      error.code === "MEDIA_TYPE_INVALID"
  );
});

test("failed Provider Job retries as a new Job and batch operations preserve partial success", async () => {
  const context = new MemoryContext();
  context.scenes.set("sc_bad", makeScene("sc_bad", false));
  const { service } = makePipeline({ context });
  const batch = new SceneAssetBatchService(service);

  const designBatch = await batch.designPrimarySceneAssets({
    projectId: "prj_1",
    sceneIds: ["sc_1", "sc_bad"],
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  assert.equal(designBatch.status, "PARTIAL_COMPLETE");
  assert.equal(designBatch.succeeded, 1);
  assert.equal(designBatch.failed, 1);

  const asset = designBatch.items.find(item => item.ok)?.value;
  assert.ok(asset);

  const created = await service.createImageGenerationJob({
    projectId: "prj_1",
    assetId: asset.id,
    format: "SHORTFORM",
    provider: "FLOW",
    providerProfileVersion: "1",
    executionMode: "MANUAL_EXTERNAL"
  });
  const failed = await service.markImageJobFailed({
    projectId: "prj_1",
    jobId: created.job.id,
    errorCode: "EXTERNAL_FAILURE"
  });
  assert.equal(failed.job.status, "FAILED");
  assert.equal(failed.asset.assetStatus, "REGENERATE_REQUIRED");

  const retried = await batch.retryFailedJobs({
    projectId: "prj_1",
    failedJobIds: [failed.job.id],
    format: "SHORTFORM"
  });
  assert.equal(retried.status, "COMPLETE");
  const retryJob = retried.items[0]?.value?.job;
  assert.ok(retryJob);
  assert.notEqual(retryJob.id, failed.job.id);
  assert.equal(retryJob.retryOfJobId, failed.job.id);
  assert.equal(retryJob.attempt, 2);
});


test("IMPORT and REUSE source strategies attach candidates without Provider Jobs", async () => {
  const repository = new MemoryRepository();
  const context = new MemoryContext();
  const decisions = new Decisions();
  const { service } = makePipeline({ repository, context, decisions });

  decisions.planDecision = {
    ...decisions.planDecision,
    sourceStrategy: "IMPORT"
  };
  const importedAsset = await service.designPrimarySceneAsset({
    projectId: "prj_1",
    sceneId: "sc_1",
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  const imported = await service.registerImportedImageCandidate({
    projectId: "prj_1",
    assetId: importedAsset.id,
    relativePath: "06_generated_assets/images/imported.png",
    mimeType: "image/png",
    checksum: "sha256:imported"
  });
  assert.equal(imported.asset.assetStatus, "CANDIDATE_AVAILABLE");
  assert.equal(repository.jobs.length, 0);

  decisions.planDecision = {
    ...decisions.planDecision,
    sourceStrategy: "REUSE"
  };
  const reuseAsset = await service.designPrimarySceneAsset({
    projectId: "prj_1",
    sceneId: "sc_2",
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  const reused = await service.reuseImageCandidate({
    projectId: "prj_1",
    assetId: reuseAsset.id,
    mediaId: imported.media.id
  });
  assert.equal(reused.asset.assetStatus, "CANDIDATE_AVAILABLE");
  assert.deepEqual(reused.asset.candidateMediaIds, [imported.media.id]);
  assert.equal(repository.media.length, 1);
});

test("manual Image Job Pack exports prompts and batch result import isolates failures", async () => {
  const { service } = makePipeline();
  const batch = new SceneAssetBatchService(service);

  const designed = await batch.designPrimarySceneAssets({
    projectId: "prj_1",
    sceneIds: ["sc_1", "sc_2"],
    format: "SHORTFORM",
    formatProfileVersion: "shorts-v1"
  });
  assert.equal(designed.status, "COMPLETE");
  const assetIds = designed.items.map(item => item.value!.id);

  const jobs = await batch.createImageGenerationJobs({
    projectId: "prj_1",
    assetIds,
    format: "SHORTFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1",
    executionMode: "MANUAL_EXTERNAL"
  });
  assert.equal(jobs.status, "COMPLETE");

  const jobIds = jobs.items.map(item => item.value!.job.id);
  const pack = await service.exportImageJobPack({
    projectId: "prj_1",
    jobIds
  });
  assert.equal(pack.schemaVersion, "1.0");
  assert.equal(pack.jobs.length, 2);
  assert.equal(pack.jobs.every(item => item.prompt.length > 0), true);
  assert.deepEqual(pack.jobs.map(item => item.resultKey), jobIds);

  const imported = await batch.importImageResults({
    projectId: "prj_1",
    items: [
      {
        jobId: jobIds[0]!,
        relativePath: "06_generated_assets/images/job1.png",
        mimeType: "image/png",
        checksum: "sha256:job1"
      },
      {
        jobId: jobIds[1]!,
        relativePath: "../unsafe.png",
        mimeType: "image/png",
        checksum: "sha256:job2"
      }
    ]
  });
  assert.equal(imported.status, "PARTIAL_COMPLETE");
  assert.equal(imported.succeeded, 1);
  assert.equal(imported.failed, 1);
  assert.equal(imported.items[1]?.code, "MEDIA_PATH_INVALID");
});


test("WF-09 readiness resolves canonical Visual Bible and Format Profile through registry adapters", async () => {
  const resourcesRoot = fileURLToPath(new URL("../../../resources/", import.meta.url));
  const registry = new FileSystemResourceRegistry(resourcesRoot);
  const context = new MemoryContext();
  context.approvedStyle = {
    ...style,
    channelVisualBibleVersion: "1.0.0"
  };

  const { service } = makePipeline({
    context,
    bible: new ChannelVisualBibleRegistryAdapter(
      registry,
      "HISTORY_MYSTERY_VISUAL_BIBLE"
    ),
    formats: new FormatProfileRegistryAdapter(
      registry,
      "SHORTFORM_9X16_V1"
    )
  });

  const readiness = await service.getReadiness({
    projectId: "prj_1",
    sceneId: "sc_1",
    formatProfileVersion: "1.0.0"
  });

  assert.equal(readiness.channelVisualBibleResolved, true);
  assert.equal(readiness.formatProfileResolved, true);
  assert.equal(readiness.ready, true);
});
