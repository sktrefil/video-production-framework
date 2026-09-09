import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApprovalRecord,
  LinkCutImplementation,
  MediaArtifact,
  ProductionAsset,
  ProductionClip,
  ProductionLink,
  ProviderJob,
  ProviderPreflightRecord,
  Scene
} from "@vpf/domain";
import type {
  FinalClipDecisionPort,
  FinalClipDesignDecision,
  ProductionDecisionWithMeta,
  ProviderPreQcDecision,
  VideoPromptDecision
} from "@vpf/production-system";
import type { OutboxRecord, WorkflowEvent } from "@vpf/workflow";
import {
  FinalClipBatchService,
  FinalClipPipeline,
  FinalClipValidationError,
  type FinalClipClock,
  type FinalClipContextPort,
  type FinalClipIdFactory,
  type FinalClipRepository
} from "../src/index.js";

const now = "2026-09-09T16:00:00.000Z";
const clock: FinalClipClock = { nowIso: () => now };

function ids(): FinalClipIdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

function scene(id: string): Scene {
  return {
    id,
    projectId: "prj_1",
    sequenceId: "seq_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    displayNumber: id === "sc_1" ? 1 : 2,
    scriptSegment: id,
    scriptRef: { scriptId: "script_1", scriptRevision: 1 },
    stateIn: "in",
    stateCurrent: id,
    stateOut: "out",
    primaryVisualIdea: id,
    mustBeSeen: [],
    canBeNarrated: [],
    canBeImplied: [],
    requiredIdentityAnchorIds: [],
    sceneStatus: "APPROVED",
    stale: false
  };
}

function media(id: string, mediaType: "IMAGE" | "VIDEO" = "IMAGE"): MediaArtifact {
  return {
    id,
    projectId: "prj_1",
    revision: 1,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    mediaType,
    relativePath:
      mediaType === "IMAGE"
        ? `06_generated_assets/images/${id}.png`
        : `07_generated_clips/${id}.mp4`,
    mimeType: mediaType === "IMAGE" ? "image/png" : "video/mp4",
    ...(mediaType === "VIDEO" ? { durationMs: 5000 } : {}),
    checksum: `sha256:${id}`,
    mediaStatus: "AVAILABLE"
  };
}

function asset(id: string, sceneId: string, mediaId: string): ProductionAsset {
  return {
    id,
    projectId: "prj_1",
    revision: 3,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    assetClass: "PRIMARY_SCENE",
    assetRole: "STANDARD",
    productionPriority: "CRITICAL",
    sourceStrategy: "GENERATE",
    owner: { type: "SCENE", id: sceneId },
    stateRef: {
      entityType: "SCENE",
      entityId: sceneId,
      entityRevision: 1,
      stateField: "STATE_CURRENT"
    },
    design: {
      visualGoal: sceneId,
      composition: "medium",
      continuityRequirements: [],
      identityAnchorIds: [],
      factualConstraints: [],
      avoidances: []
    },
    candidateMediaIds: [mediaId],
    approvedMediaId: mediaId,
    assetStatus: "APPROVED",
    sourceSceneRevision: 1,
    sourceProjectStyleId: "sty_1",
    sourceProjectStyleRevision: 1,
    sourceIdentityAnchorRevisions: {},
    formatProfileVersion: "fmt_1"
  };
}

function link(id = "lnk_1"): ProductionLink {
  return {
    id,
    projectId: "prj_1",
    revision: 4,
    lifecycleStatus: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    stale: false,
    fromSceneId: "sc_1",
    fromSceneRevision: 1,
    fromStateRef: {
      entityType: "SCENE",
      entityId: "sc_1",
      entityRevision: 1,
      stateField: "STATE_OUT"
    },
    toSceneId: "sc_2",
    toSceneRevision: 1,
    toStateRef: {
      entityType: "SCENE",
      entityId: "sc_2",
      entityRevision: 1,
      stateField: "STATE_IN"
    },
    linkScope: "SEQUENCE_LOCAL",
    preLinkRequired: true,
    continuityLevel: "STRICT",
    stateChange: "A to B",
    handoffIntent: "continue",
    handoffAnchor: ["subject"],
    handoffChannels: ["VISUAL"],
    transitionIntent: "DIRECT",
    preLinkApprovalId: "apr_pre",
    fromAssetId: "ast_1",
    fromAssetRevision: 3,
    fromMediaId: "med_1",
    toAssetId: "ast_2",
    toAssetRevision: 3,
    toMediaId: "med_2",
    handoffQcId: "qc_handoff",
    handoffUsable: true,
    preLinkMatch: "MATCH",
    linkStatus: "HANDOFF_PASS"
  };
}

class MemoryStore implements FinalClipRepository, FinalClipContextPort {
  links: ProductionLink[] = [link()];
  scenes = new Map([
    ["sc_1", scene("sc_1")],
    ["sc_2", scene("sc_2")]
  ]);
  assets = new Map<string, ProductionAsset>();
  media = new Map<string, MediaArtifact>();
  clips: ProductionClip[] = [];
  cuts: LinkCutImplementation[] = [];
  preflights: ProviderPreflightRecord[] = [];
  jobs: ProviderJob[] = [];
  approvals: ApprovalRecord[] = [];
  events: WorkflowEvent[] = [];
  outbox: OutboxRecord[] = [];

  constructor() {
    const a1 = asset("ast_1", "sc_1", "med_1");
    const a2 = asset("ast_2", "sc_2", "med_2");
    this.assets.set(a1.id, a1);
    this.assets.set(a2.id, a2);
    this.media.set("med_1", media("med_1"));
    this.media.set("med_2", media("med_2"));
  }

  async getLink(_projectId: string, linkId: string) {
    return [...this.links]
      .filter(item => item.id === linkId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async getScene(_projectId: string, sceneId: string) {
    return this.scenes.get(sceneId) ?? null;
  }

  async getAsset(_projectId: string, assetId: string) {
    return this.assets.get(assetId) ?? null;
  }

  async getMedia(_projectId: string, mediaId: string) {
    return this.media.get(mediaId) ?? null;
  }

  async getActiveClipByLink(_projectId: string, linkId: string) {
    return [...this.clips]
      .filter(item => item.linkId === linkId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async getLatestClip(_projectId: string, clipId: string) {
    return [...this.clips]
      .filter(item => item.id === clipId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async listActiveClips() {
    return this.clips.filter(item => item.lifecycleStatus === "ACTIVE");
  }

  async getActiveCutByLink(_projectId: string, linkId: string) {
    return [...this.cuts]
      .filter(item => item.linkId === linkId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async getLatestCut(_projectId: string, cutId: string) {
    return [...this.cuts]
      .filter(item => item.id === cutId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async listActiveCuts() {
    return this.cuts.filter(item => item.lifecycleStatus === "ACTIVE");
  }

  async commitAdditionalAssetRequirement(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    reason: string;
    decisionId: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeLink(input.previousLink);
    this.links.push(input.nextLink);
    this.record(input.event, input.outbox);
  }

  async commitClipDesign(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip | null;
    previousCut: LinkCutImplementation | null;
    clip: ProductionClip;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeLink(input.previousLink);
    this.links.push(input.nextLink);
    if (input.previousClip) this.supersedeClip(input.previousClip);
    if (input.previousCut) this.supersedeCut(input.previousCut);
    this.clips.push(input.clip);
    if (input.approval) this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitCutDesign(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip | null;
    previousCut: LinkCutImplementation | null;
    cut: LinkCutImplementation;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeLink(input.previousLink);
    this.links.push(input.nextLink);
    if (input.previousClip) this.supersedeClip(input.previousClip);
    if (input.previousCut) this.supersedeCut(input.previousCut);
    this.cuts.push(input.cut);
    if (input.approval) this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitClipDesignApproval(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeLink(input.previousLink);
    this.links.push(input.nextLink);
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async commitCutDesignApproval(input: {
    previousLink: ProductionLink;
    nextLink: ProductionLink;
    previousCut: LinkCutImplementation;
    nextCut: LinkCutImplementation;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeLink(input.previousLink);
    this.links.push(input.nextLink);
    this.supersedeCut(input.previousCut);
    this.cuts.push(input.nextCut);
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async getProviderPreflight(_projectId: string, preflightId: string) {
    return [...this.preflights]
      .filter(item => item.id === preflightId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async commitProviderPreflight(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    preflight: ProviderPreflightRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.preflights.push(input.preflight);
    this.record(input.event, input.outbox);
  }

  async commitProviderPreflightReview(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousPreflight: ProviderPreflightRecord;
    nextPreflight: ProviderPreflightRecord;
    approval: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.preflights = this.preflights.map(item =>
      item.id === input.previousPreflight.id &&
      item.revision === input.previousPreflight.revision
        ? { ...item, lifecycleStatus: "SUPERSEDED" as const }
        : item
    );
    this.preflights.push(input.nextPreflight);
    this.approvals.push(input.approval);
    this.record(input.event, input.outbox);
  }

  async createVideoProviderJob(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.jobs.push(input.job);
    this.record(input.event, input.outbox);
  }

  async getLatestProviderJob(_projectId: string, jobId: string) {
    return [...this.jobs]
      .filter(item => item.id === jobId && item.lifecycleStatus === "ACTIVE")
      .sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  async commitVideoProviderFailure(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.supersedeJob(input.previousJob);
    this.jobs.push(input.nextJob);
    this.record(input.event, input.outbox);
  }

  async createRetryVideoProviderJob(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    job: ProviderJob;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.jobs.push(input.job);
    this.record(input.event, input.outbox);
  }

  async commitVideoProviderResult(input: {
    previousClip: ProductionClip;
    nextClip: ProductionClip;
    previousJob: ProviderJob;
    nextJob: ProviderJob;
    media: MediaArtifact;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    this.supersedeClip(input.previousClip);
    this.clips.push(input.nextClip);
    this.supersedeJob(input.previousJob);
    this.jobs.push(input.nextJob);
    this.media.set(input.media.id, input.media);
    this.record(input.event, input.outbox);
  }

  async markImplementationsStale(input: {
    clipIds: string[];
    cutIds: string[];
    reason: string;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }) {
    const clips = new Set(input.clipIds);
    const cuts = new Set(input.cutIds);
    this.clips = this.clips.map(item =>
      clips.has(item.id) && item.lifecycleStatus === "ACTIVE"
        ? { ...item, stale: true, staleReason: input.reason }
        : item
    );
    this.cuts = this.cuts.map(item =>
      cuts.has(item.id) && item.lifecycleStatus === "ACTIVE"
        ? { ...item, stale: true, staleReason: input.reason }
        : item
    );
    this.record(input.event, input.outbox);
  }

  private supersedeLink(previous: ProductionLink) {
    this.links = this.links.map(item =>
      item.id === previous.id && item.revision === previous.revision
        ? { ...item, lifecycleStatus: "SUPERSEDED" as const }
        : item
    );
  }

  private supersedeClip(previous: ProductionClip) {
    this.clips = this.clips.map(item =>
      item.id === previous.id && item.revision === previous.revision
        ? {
            ...item,
            lifecycleStatus: "SUPERSEDED" as const,
            clipStatus: "SUPERSEDED" as const
          }
        : item
    );
  }

  private supersedeCut(previous: LinkCutImplementation) {
    this.cuts = this.cuts.map(item =>
      item.id === previous.id && item.revision === previous.revision
        ? { ...item, lifecycleStatus: "SUPERSEDED" as const }
        : item
    );
  }

  private supersedeJob(previous: ProviderJob) {
    this.jobs = this.jobs.map(item =>
      item.id === previous.id && item.revision === previous.revision
        ? { ...item, lifecycleStatus: "SUPERSEDED" as const }
        : item
    );
  }

  private record(event: WorkflowEvent, outbox: OutboxRecord) {
    this.events.push(event);
    this.outbox.push(outbox);
  }
}

class Decisions implements FinalClipDecisionPort {
  finalDecision: FinalClipDesignDecision = {
    implementationType: "CLIP",
    clipMode: "DIRECT_START_END_I2V",
    transitionMethod: "DIRECT",
    durationMs: 5000,
    cameraMove: "LOW",
    subjectMotion: "LOW",
    environmentMotion: "LOW",
    rationale: "direct transition",
    additionalAssetRequired: false
  };

  finalReview = false;

  preflightDecision: ProviderPreQcDecision = {
    status: "PASS",
    safetySafe: true,
    capabilityCompatible: true,
    requiresAlternativeRepresentation: false,
    issueCodes: []
  };

  preflightReview = false;

  async designFinalClip(): Promise<
    ProductionDecisionWithMeta<FinalClipDesignDecision>
  > {
    return {
      decision: { ...this.finalDecision },
      status: this.finalReview ? "NEEDS_REVIEW" : "SUCCESS",
      confidence: this.finalReview ? 0.65 : 0.98,
      requiresHumanReview: this.finalReview,
      warnings: [],
      decisionId: "dec_final"
    };
  }

  async runProviderPreQc(): Promise<
    ProductionDecisionWithMeta<ProviderPreQcDecision>
  > {
    return {
      decision: { ...this.preflightDecision },
      status: this.preflightReview ? "NEEDS_REVIEW" : "SUCCESS",
      confidence: this.preflightReview ? 0.65 : 0.99,
      requiresHumanReview: this.preflightReview,
      warnings: [],
      decisionId: "dec_preflight"
    };
  }

  async compileVideoPrompt(): Promise<
    ProductionDecisionWithMeta<VideoPromptDecision>
  > {
    return {
      decision: {
        prompt: "Use approved START and END images exactly.",
        negativePrompt: "new character, modern object"
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_prompt"
    };
  }
}

function setup() {
  const store = new MemoryStore();
  const decisions = new Decisions();
  const pipeline = new FinalClipPipeline(
    store,
    store,
    decisions,
    clock,
    ids()
  );
  return { store, decisions, pipeline };
}

test("CUT and editorial implementations do not require provider execution", async () => {
  const cutSetup = setup();
  cutSetup.decisions.finalDecision = {
    implementationType: "CUT",
    transitionMethod: "HARD_CUT",
    rationale: "sequence reset",
    additionalAssetRequired: false
  };
  const cut = await cutSetup.pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(cut.kind, "CUT");
  if (cut.kind === "CUT") {
    assert.equal(cut.cut.ready, true);
    assert.equal(cut.link.linkStatus, "FINAL_DESIGN_READY");
  }
  assert.equal(cutSetup.store.clips.length, 0);
  assert.equal(cutSetup.store.jobs.length, 0);

  const editorialSetup = setup();
  editorialSetup.decisions.finalDecision = {
    implementationType: "CLIP",
    clipMode: "EDITORIAL_MOVE",
    singleImageSource: "FROM",
    transitionMethod: "DIRECT",
    durationMs: 4000,
    cameraMove: "SLOW_PUSH_IN",
    subjectMotion: "NONE",
    environmentMotion: "NONE",
    rationale: "editorial still-image move",
    additionalAssetRequired: false
  };
  const editorial = await editorialSetup.pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(editorial.kind, "CLIP");
  if (editorial.kind === "CLIP") {
    assert.equal(editorial.clip.providerExecutionRequired, false);
    assert.equal(editorial.clip.clipStatus, "READY");
    await assert.rejects(
      () => editorialSetup.pipeline.runProviderPreQc({
        projectId: "prj_1",
        clipId: editorial.clip.id,
        format: "LONGFORM",
        provider: "GOOGLE_FLOW",
        providerProfileVersion: "flow-v1"
      }),
      (error: unknown) =>
        error instanceof FinalClipValidationError &&
        error.code === "PROVIDER_EXECUTION_NOT_REQUIRED"
    );
  }
});

test("Final Clip human review blocks provider execution until explicit design approval", async () => {
  const { decisions, pipeline } = setup();
  decisions.finalReview = true;
  const result = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(result.kind, "CLIP");
  if (result.kind !== "CLIP") return;

  assert.equal(result.clip.finalDesignApprovalId, undefined);
  assert.equal(result.link.linkStatus, "HANDOFF_PASS");

  await assert.rejects(
    () => pipeline.runProviderPreQc({
      projectId: "prj_1",
      clipId: result.clip.id,
      format: "LONGFORM",
      provider: "GOOGLE_FLOW",
      providerProfileVersion: "flow-v1"
    }),
    (error: unknown) =>
      error instanceof FinalClipValidationError &&
      error.code === "FINAL_DESIGN_APPROVAL_REQUIRED"
  );

  const approved = await pipeline.approveFinalClipDesign({
    projectId: "prj_1",
    clipId: result.clip.id
  });
  assert.equal(approved.approval.approvalState, "HUMAN_APPROVED");
  assert.equal(approved.link.linkStatus, "FINAL_DESIGN_READY");
});

test("unsafe Provider Pre-QC blocks execution and cannot be human-overridden", async () => {
  const { decisions, pipeline } = setup();
  const designed = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(designed.kind, "CLIP");
  if (designed.kind !== "CLIP") return;

  decisions.preflightDecision = {
    status: "BLOCKED",
    safetySafe: false,
    capabilityCompatible: true,
    requiresAlternativeRepresentation: true,
    issueCodes: ["SAFETY_REPRESENTATION_BLOCK"],
    recommendedAction: "Use an approved alternative representation."
  };

  const result = await pipeline.runProviderPreQc({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });
  assert.equal(result.preflight.status, "BLOCKED");
  assert.equal(result.clip.clipStatus, "BLOCKED");

  await assert.rejects(
    () => pipeline.approveProviderPreflightReview({
      projectId: "prj_1",
      clipId: designed.clip.id
    }),
    (error: unknown) =>
      error instanceof FinalClipValidationError &&
      error.code === "PROVIDER_PREFLIGHT_REVIEW_NOT_APPROVABLE"
  );
});

test("safe Provider Pre-QC review requires human acceptance before READY", async () => {
  const { decisions, pipeline } = setup();
  const designed = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(designed.kind, "CLIP");
  if (designed.kind !== "CLIP") return;

  decisions.preflightReview = true;
  decisions.preflightDecision = {
    status: "NEEDS_REVIEW",
    safetySafe: true,
    capabilityCompatible: true,
    requiresAlternativeRepresentation: false,
    issueCodes: ["LOW_CONFIDENCE_CAPABILITY_MATCH"]
  };

  const preflight = await pipeline.runProviderPreQc({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });
  assert.equal(preflight.clip.clipStatus, "NEEDS_REVIEW");

  const accepted = await pipeline.approveProviderPreflightReview({
    projectId: "prj_1",
    clipId: designed.clip.id
  });
  assert.equal(accepted.preflight.status, "PASS");
  assert.equal(accepted.clip.clipStatus, "READY");
  assert.equal(accepted.approval.approvalState, "HUMAN_APPROVED");
});

test("manual video result remains Candidate and Job Pack carries START/END media paths", async () => {
  const { pipeline } = setup();
  const designed = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(designed.kind, "CLIP");
  if (designed.kind !== "CLIP") return;

  await pipeline.runProviderPreQc({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });
  const created = await pipeline.createVideoGenerationJob({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1",
    executionMode: "MANUAL_EXTERNAL"
  });
  assert.equal(created.job.status, "WAITING_EXTERNAL");

  const pack = await pipeline.exportVideoJobPack({
    projectId: "prj_1",
    jobIds: [created.job.id]
  });
  assert.equal(pack.jobs.length, 1);
  assert.equal(pack.jobs[0]!.startMediaPath.endsWith("med_1.png"), true);
  assert.equal(pack.jobs[0]!.endMediaPath?.endsWith("med_2.png"), true);

  const result = await pipeline.registerVideoResult({
    projectId: "prj_1",
    jobId: created.job.id,
    relativePath: "07_generated_clips/clip_1.mp4",
    mimeType: "video/mp4",
    checksum: "sha256:clip1",
    durationMs: 5000,
    width: 1080,
    height: 1920
  });
  assert.equal(result.job.status, "COMPLETE");
  assert.equal(result.clip.clipStatus, "CANDIDATE_AVAILABLE");
  assert.equal(result.clip.approvedMediaId, undefined);
  assert.deepEqual(result.clip.candidateMediaIds, [result.media.id]);
});

test("failed video Job retries as a new Job and Batch result import isolates failures", async () => {
  const { pipeline } = setup();
  const designed = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(designed.kind, "CLIP");
  if (designed.kind !== "CLIP") return;

  await pipeline.runProviderPreQc({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });
  const created = await pipeline.createVideoGenerationJob({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1",
    executionMode: "MANUAL_EXTERNAL"
  });
  const failed = await pipeline.markVideoJobFailed({
    projectId: "prj_1",
    jobId: created.job.id,
    errorCode: "EXTERNAL_FAILURE"
  });
  assert.equal(failed.job.status, "FAILED");
  assert.equal(failed.clip.clipStatus, "REGENERATE_REQUIRED");

  const retried = await pipeline.retryVideoGenerationJob({
    projectId: "prj_1",
    failedJobId: failed.job.id,
    format: "LONGFORM"
  });
  assert.notEqual(retried.job.id, failed.job.id);
  assert.equal(retried.job.retryOfJobId, failed.job.id);
  assert.equal(retried.job.attempt, 2);

  const batch = new FinalClipBatchService(pipeline);
  const imported = await batch.importVideoResults({
    projectId: "prj_1",
    items: [
      {
        jobId: retried.job.id,
        relativePath: "07_generated_clips/retry.mp4",
        mimeType: "video/mp4",
        checksum: "sha256:retry",
        durationMs: 5000
      },
      {
        jobId: "missing_job",
        relativePath: "07_generated_clips/missing.mp4",
        mimeType: "video/mp4",
        checksum: "sha256:missing",
        durationMs: 5000
      }
    ]
  });
  assert.equal(imported.status, "PARTIAL_COMPLETE");
  assert.equal(imported.succeeded, 1);
  assert.equal(imported.failed, 1);
  assert.equal(imported.items[1]?.code, "PROVIDER_JOB_NOT_FOUND");
});

test("Additional Asset requirement stops provider path and returns Link to rework", async () => {
  const { store, decisions, pipeline } = setup();
  decisions.finalDecision = {
    implementationType: "CLIP",
    transitionMethod: "DIRECT",
    rationale: "approved endpoints are insufficient",
    additionalAssetRequired: true,
    additionalAssetReason: "A SPECIAL_END image is needed for a stable end state."
  };

  const result = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(result.kind, "ADDITIONAL_ASSET_REQUIRED");
  assert.equal(result.link.linkStatus, "REWORK_REQUIRED");
  assert.equal(store.clips.length, 0);
  assert.equal(store.jobs.length, 0);
});


test("late Provider result is rejected after Clip execution revision changes", async () => {
  const { store, pipeline } = setup();
  const designed = await pipeline.designFinalImplementation({
    projectId: "prj_1",
    linkId: "lnk_1",
    format: "LONGFORM"
  });
  assert.equal(designed.kind, "CLIP");
  if (designed.kind !== "CLIP") return;

  await pipeline.runProviderPreQc({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1"
  });
  const created = await pipeline.createVideoGenerationJob({
    projectId: "prj_1",
    clipId: designed.clip.id,
    format: "LONGFORM",
    provider: "GOOGLE_FLOW",
    providerProfileVersion: "flow-v1",
    executionMode: "MANUAL_EXTERNAL"
  });

  const current = await store.getLatestClip("prj_1", designed.clip.id);
  assert.ok(current);
  store.clips = store.clips.map(item =>
    item.id === current.id && item.revision === current.revision
      ? { ...item, revision: item.revision + 1 }
      : item
  );

  await assert.rejects(
    () => pipeline.registerVideoResult({
      projectId: "prj_1",
      jobId: created.job.id,
      relativePath: "07_generated_clips/late.mp4",
      mimeType: "video/mp4",
      checksum: "sha256:late",
      durationMs: 5000
    }),
    (error: unknown) =>
      error instanceof FinalClipValidationError &&
      error.code === "IMPLEMENTATION_STALE"
  );
});
