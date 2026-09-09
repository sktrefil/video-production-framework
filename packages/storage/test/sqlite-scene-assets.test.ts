import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  AssetPlanDecision,
  ChannelVisualBibleSnapshot,
  FormatProfileSnapshot,
  ImageAssetDesignDecision,
  ImagePromptDecision,
  ImageQcDecision,
  SceneAssetDecisionPort,
  SceneDesignDecision,
  SequenceDesignDecision,
  StoryDecisionPort,
  StructureDesignDecision,
  VisualIdentityDecisionPort,
  ProjectStyleDecision,
  AnchorPlanDecision,
  HandoffQcDecision,
  LinkDecisionPort,
  PreLinkDecision,
  ProductionDecisionWithMeta,
  FinalClipDesignDecision,
  FinalClipDecisionPort,
  ProviderPreQcDecision,
  VideoPromptDecision,
  ClipFallbackDecision,
  ClipQcDecision,
  QcFallbackDecisionPort
} from "@vpf/production-system";
import {
  FinalClipPipeline,
  type FinalClipClock,
  type FinalClipIdFactory
} from "@vpf/final-clip";
import {
  QcFallbackPipeline,
  type QcFallbackClock,
  type QcFallbackIdFactory
} from "@vpf/qc-fallback";
import {
  MediaBindingPipeline,
  type MediaBindingClock,
  type MediaBindingIdFactory
} from "@vpf/media-binding";
import {
  EditorTimelineAssemblyPipeline,
  type TimelineAssemblyClock,
  type TimelineAssemblyIdFactory
} from "@vpf/editor-timeline";
import {
  PreLinkHandoffPipeline,
  type PreLinkHandoffClock,
  type PreLinkHandoffIdFactory
} from "@vpf/prelink-handoff";
import {
  SceneAssetPipeline,
  type ChannelVisualBiblePort as AssetBiblePort,
  type FormatProfilePort,
  type ImageApprovalPolicy,
  type SceneAssetClock,
  type SceneAssetIdFactory
} from "@vpf/scene-assets";
import {
  StoryGenerationService,
  StoryPipeline,
  type IdFactory,
  type StoryClock
} from "@vpf/story";
import {
  VisualIdentityPipeline,
  type ChannelVisualBiblePort as VisualBiblePort,
  type VisualIdentityClock,
  type VisualIdentityIdFactory
} from "@vpf/visual-identity";
import { SqliteStoryRepository } from "../src/index.js";
import { SqliteSceneAssetRepository } from "../src/scene-assets.js";
import { SqlitePreLinkHandoffRepository } from "../src/prelink-handoff.js";
import { SqliteFinalClipRepository } from "../src/final-clip.js";
import { SqliteQcFallbackRepository } from "../src/qc-fallback.js";
import { SqliteMediaBindingRepository } from "../src/media-binding.js";
import { SqliteEditorTimelineRepository } from "../src/editor-timeline.js";
import { SqliteVisualIdentityRepository } from "../src/visual-identity.js";

const now = "2026-09-09T12:00:00.000Z";
const storyClock: StoryClock = { nowIso: () => now };
const visualClock: VisualIdentityClock = { nowIso: () => now };
const assetClock: SceneAssetClock = { nowIso: () => now };
const linkClock: PreLinkHandoffClock = { nowIso: () => now };
const finalClipClock: FinalClipClock = { nowIso: () => now };
const qcFallbackClock: QcFallbackClock = { nowIso: () => now };
const mediaBindingClock: MediaBindingClock = { nowIso: () => now };
const editorTimelineClock: TimelineAssemblyClock = { nowIso: () => now };

function storyIds(): IdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}
function visualIds(): VisualIdentityIdFactory {
  let n = 1000;
  return { next: prefix => `${prefix}_${++n}` };
}
function assetIds(): SceneAssetIdFactory {
  let n = 2000;
  return { next: prefix => `${prefix}_${++n}` };
}
function linkIds(): PreLinkHandoffIdFactory {
  let n = 3000;
  return { next: prefix => `${prefix}_${++n}` };
}
function finalClipIds(): FinalClipIdFactory {
  let n = 4000;
  return { next: prefix => `${prefix}_${++n}` };
}
function qcFallbackIds(): QcFallbackIdFactory {
  let n = 5000;
  return { next: prefix => `${prefix}_${++n}` };
}
function mediaBindingIds(): MediaBindingIdFactory {
  let n = 6000;
  return { next: prefix => `${prefix}_${++n}` };
}
function editorTimelineIds(): TimelineAssemblyIdFactory {
  let n = 7000;
  return { next: prefix => `${prefix}_${++n}` };
}

const storyDecisions: StoryDecisionPort = {
  async designStructure(): Promise<StructureDesignDecision> {
    return { chapters: [{ key: "c1", displayNumber: 1, title: "1장" }] };
  },
  async designSequences(): Promise<SequenceDesignDecision> {
    return {
      sequences: [{
        key: "q1",
        chapterKey: "c1",
        displayNumber: 1,
        title: "시퀀스",
        storyPurpose: "인물의 두 장면"
      }]
    };
  },
  async designScenes(): Promise<SceneDesignDecision> {
    return {
      scenes: [
        {
          key: "s1",
          sequenceKey: "q1",
          displayNumber: 1,
          scriptSegment: "첫 장면.",
          stateIn: "A",
          stateCurrent: "B",
          stateOut: "C",
          primaryVisualIdea: "인물이 등장한다",
          mustBeSeen: ["인물"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "s2",
          sequenceKey: "q1",
          displayNumber: 2,
          scriptSegment: "둘째 장면.",
          stateIn: "C",
          stateCurrent: "D",
          stateOut: "E",
          primaryVisualIdea: "같은 인물이 다시 등장한다",
          mustBeSeen: ["같은 인물"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        }
      ]
    };
  }
};

const styleDecision: ProjectStyleDecision = {
  eraRegion: "조선 후기",
  visualApproach: "역사 다큐 재현",
  realismLevel: "사실적",
  colorLanguage: "저채도",
  lightingLanguage: "자연광",
  materialLanguage: "목재와 한지",
  environmentLanguage: "고증 공간",
  characterRenderingPrinciple: "동일 인물 유지",
  cameraCompositionTendency: "관찰형",
  moodRange: ["절제"],
  factualConstraints: [],
  avoidances: ["현대 물건"]
};

function visualDecisions(sceneIds: string[]): VisualIdentityDecisionPort {
  return {
    async designProjectStyle() {
      return styleDecision;
    },
    async planIdentityAnchors(): Promise<AnchorPlanDecision> {
      return {
        anchors: [{
          key: "person",
          anchorType: "CHARACTER",
          name: "반복 인물",
          rationale: "두 장면 동일 인물",
          continuityReason: "RECURRING",
          productionPriority: "CRITICAL",
          requiredBySceneIds: sceneIds,
          specification: {
            locked: ["얼굴 구조", "연령대", "기본 복식"],
            contextual: ["표정"],
            temporary: []
          }
        }]
      };
    }
  };
}

class AssetDecisions implements SceneAssetDecisionPort {
  async planAsset(): Promise<AssetPlanDecision> {
    return {
      assetClass: "PRIMARY_SCENE",
      assetRole: "STANDARD",
      productionPriority: "CRITICAL",
      sourceStrategy: "GENERATE",
      stateField: "STATE_CURRENT",
      rationale: "Scene 기본 이미지"
    };
  }
  async designImageAsset(): Promise<ImageAssetDesignDecision> {
    return {
      visualGoal: "Scene의 현재 상태를 보여준다",
      composition: "중경",
      continuityRequirements: ["반복 인물 동일성"],
      identityAnchorIds: [],
      factualConstraints: [],
      avoidances: ["현대 물건"]
    };
  }
  async compileImagePrompt(input: Parameters<SceneAssetDecisionPort["compileImagePrompt"]>[0]): Promise<ImagePromptDecision> {
    return {
      prompt: `render scene ${input.scene.id} with approved style and identity`,
      negativePrompt: "modern objects"
    };
  }
  async runImageQc(): Promise<ImageQcDecision> {
    return {
      qcStatus: "PASS",
      severity: "MINOR",
      confidence: 0.97
    };
  }
}

const bibleSnapshot: ChannelVisualBibleSnapshot = {
  version: "2.0.0",
  resourceId: "history-channel",
  contentHash: "sha256:bible",
  payload: { canonical: true }
};

const visualBible: VisualBiblePort = {
  async resolve(version: string) {
    return version === "2.0.0" ? bibleSnapshot : null;
  }
};
const assetBible: AssetBiblePort = {
  async resolve(version: string) {
    return version === "2.0.0" ? bibleSnapshot : null;
  }
};

const formatProfile: FormatProfileSnapshot = {
  version: "shorts-v1",
  resourceId: "shorts",
  contentHash: "sha256:format",
  payload: { aspectRatio: "9:16" }
};
const formats: FormatProfilePort = {
  async resolve(version: string) {
    return version === "shorts-v1" ? formatProfile : null;
  }
};

const manualApproval: ImageApprovalPolicy = {
  shouldAutoApprove: () => false
};

test("WF-07 -> WF-08 -> WF-09 completes in one project.db with separate Asset/Media/QC/Approval history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vpf-wf09-"));
  const dbPath = join(dir, "project.db");

  try {
    const storyRepo = new SqliteStoryRepository(dbPath);
    const sid = storyIds();
    const story = new StoryPipeline(storyRepo, storyClock, sid);
    const storyGeneration = new StoryGenerationService(
      storyRepo,
      storyDecisions,
      storyClock,
      sid
    );

    const script = await story.createScript({
      projectId: "prj_1",
      body: "첫 장면. 둘째 장면.",
      kind: "FINAL"
    });
    await story.approveFinalScript({ projectId: "prj_1", scriptId: script.id });
    const graph = await storyGeneration.generate({
      projectId: "prj_1",
      format: "SHORTFORM"
    });
    await storyGeneration.approveStructure({ projectId: "prj_1" });
    await storyGeneration.approveScenes({
      projectId: "prj_1",
      sceneIds: graph.scenes.map(scene => scene.id)
    });
    storyRepo.close();

    const visualRepo = new SqliteVisualIdentityRepository(dbPath);
    const vid = visualIds();
    const visual = new VisualIdentityPipeline(
      visualRepo,
      visualRepo,
      visualBible,
      visualDecisions(graph.scenes.map(scene => scene.id)),
      visualClock,
      vid
    );
    await visual.generateProjectStyle({
      projectId: "prj_1",
      format: "SHORTFORM",
      channelVisualBibleVersion: "2.0.0"
    });
    await visual.approveProjectStyle({ projectId: "prj_1" });
    const anchors = await visual.planIdentityAnchors({
      projectId: "prj_1",
      format: "SHORTFORM"
    });
    await visual.approveAnchors({
      projectId: "prj_1",
      anchorIds: anchors.map(anchor => anchor.id)
    });
    visualRepo.close();

    const assetRepo = new SqliteSceneAssetRepository(dbPath);
    const aid = assetIds();
    const decisions = new AssetDecisions();

    // The real adapter must return every required Anchor ID in IMAGE_ASSET_DESIGN.
    decisions.designImageAsset = async () => ({
      visualGoal: "Scene의 현재 상태를 보여준다",
      composition: "중경",
      continuityRequirements: ["반복 인물 동일성"],
      identityAnchorIds: anchors.map(anchor => anchor.id),
      factualConstraints: [],
      avoidances: ["현대 물건"]
    });

    const pipeline = new SceneAssetPipeline(
      assetRepo,
      assetRepo,
      assetBible,
      formats,
      decisions,
      manualApproval,
      assetClock,
      aid
    );

    const sourceScene = await assetRepo.getScene("prj_1", graph.scenes[0]!.id);
    assert.equal(sourceScene?.sceneStatus, "APPROVED");
    const sourceSceneRevision = sourceScene!.revision;

    const asset = await pipeline.designPrimarySceneAsset({
      projectId: "prj_1",
      sceneId: graph.scenes[0]!.id,
      format: "SHORTFORM",
      formatProfileVersion: "shorts-v1"
    });
    assert.equal(asset.assetStatus, "DESIGNED");
    assert.deepEqual(asset.design.identityAnchorIds, anchors.map(anchor => anchor.id));

    const sceneWithPrimary = await assetRepo.getScene("prj_1", graph.scenes[0]!.id);
    assert.equal(sceneWithPrimary?.primaryAssetId, asset.id);
    assert.equal(sceneWithPrimary?.revision, sourceSceneRevision);

    const job = await pipeline.createImageGenerationJob({
      projectId: "prj_1",
      assetId: asset.id,
      format: "SHORTFORM",
      provider: "GOOGLE_FLOW",
      providerProfileVersion: "flow-v1",
      executionMode: "MANUAL_EXTERNAL"
    });
    assert.equal(job.job.status, "WAITING_EXTERNAL");

    const result = await pipeline.registerImageResult({
      projectId: "prj_1",
      jobId: job.job.id,
      relativePath: "06_generated_assets/images/med_scene_1.png",
      mimeType: "image/png",
      checksum: "sha256:image",
      width: 1080,
      height: 1920
    });

    const qc = await pipeline.runImageQc({
      projectId: "prj_1",
      assetId: asset.id,
      mediaId: result.media.id,
      format: "SHORTFORM"
    });
    assert.equal(qc.asset.assetStatus, "NEEDS_REVIEW");
    assert.equal(qc.qc.qcStatus, "PASS");

    const approved = await pipeline.approveAsset({
      projectId: "prj_1",
      assetId: asset.id,
      mediaId: result.media.id
    });
    assert.equal(approved.asset.assetStatus, "APPROVED");
    assert.equal(approved.asset.approvedMediaId, result.media.id);
    assert.equal(approved.approval.selectedMediaId, result.media.id);

    const sceneAfter = await assetRepo.getScene("prj_1", graph.scenes[0]!.id);
    assert.equal(sceneAfter?.revision, sourceSceneRevision);

    const activeAssetCount = assetRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM production_assets WHERE id = ? AND lifecycle_status = 'ACTIVE'"
    ).get(asset.id) as { count: number };
    assert.equal(activeAssetCount.count, 1);

    const assetRevisionCount = assetRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM production_assets WHERE id = ?"
    ).get(asset.id) as { count: number };
    assert.equal(assetRevisionCount.count, 5);

    const mediaCount = assetRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM media_artifacts WHERE id = ?"
    ).get(result.media.id) as { count: number };
    const qcCount = assetRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM qc_results WHERE target_id = ? AND media_id = ?"
    ).get(asset.id, result.media.id) as { count: number };
    const approvalRow = assetRepo.db.prepare(
      `SELECT selected_media_id
       FROM approval_records
       WHERE target_type = 'ASSET' AND target_id = ?
       ORDER BY rowid DESC LIMIT 1`
    ).get(asset.id) as { selected_media_id: string };

    assert.equal(mediaCount.count, 1);
    assert.equal(qcCount.count, 1);
    assert.equal(approvalRow.selected_media_id, result.media.id);

    const jobRevisions = assetRepo.db.prepare(
      "SELECT revision, status, lifecycle_status FROM provider_jobs WHERE id = ? ORDER BY revision"
    ).all(job.job.id) as Array<{
      revision: number;
      status: string;
      lifecycle_status: string;
    }>;
    assert.deepEqual(jobRevisions, [
      { revision: 1, status: "WAITING_EXTERNAL", lifecycle_status: "SUPERSEDED" },
      { revision: 2, status: "COMPLETE", lifecycle_status: "ACTIVE" }
    ]);

    const outboxCount = assetRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM event_outbox WHERE status = 'PENDING'"
    ).get() as { count: number };
    assert.ok(outboxCount.count >= 10);

    assetRepo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


class LinkDecisions implements LinkDecisionPort {
  async designPreLink(): Promise<ProductionDecisionWithMeta<PreLinkDecision>> {
    return {
      decision: {
        preLinkRequired: true,
        continuityLevel: "STRICT",
        stateChange: "첫 장면의 종료 상태에서 둘째 장면의 시작 상태로 연결",
        handoffIntent: "동일 인물과 공간 방향의 연속성을 유지",
        handoffAnchor: ["반복 인물", "시선 방향"],
        handoffChannels: ["VISUAL"],
        transitionIntent: "DIRECT"
      },
      status: "SUCCESS",
      confidence: 0.98,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_prelink_sqlite"
    };
  }

  async runHandoffQc(): Promise<ProductionDecisionWithMeta<HandoffQcDecision>> {
    return {
      decision: {
        qcStatus: "PASS",
        severity: "MINOR",
        confidence: 0.99,
        preLinkMatch: "MATCH",
        continuityUsable: true
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_handoff_sqlite"
    };
  }
}

class FinalClipDecisions implements FinalClipDecisionPort {
  async designFinalClip(): Promise<
    ProductionDecisionWithMeta<FinalClipDesignDecision>
  > {
    return {
      decision: {
        implementationType: "CLIP",
        clipMode: "DIRECT_START_END_I2V",
        transitionMethod: "DIRECT",
        durationMs: 5000,
        cameraMove: "LOW",
        subjectMotion: "LOW",
        environmentMotion: "LOW",
        rationale: "approved START and END state transition",
        additionalAssetRequired: false
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_final_clip_sqlite"
    };
  }

  async runProviderPreQc(): Promise<
    ProductionDecisionWithMeta<ProviderPreQcDecision>
  > {
    return {
      decision: {
        status: "PASS",
        safetySafe: true,
        capabilityCompatible: true,
        requiresAlternativeRepresentation: false,
        issueCodes: []
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_provider_pre_qc_sqlite"
    };
  }

  async compileVideoPrompt(): Promise<
    ProductionDecisionWithMeta<VideoPromptDecision>
  > {
    return {
      decision: {
        prompt: "Use the approved START and END images exactly. Preserve identity and restrained motion.",
        negativePrompt: "new character, identity drift, modern objects"
      },
      status: "SUCCESS",
      confidence: 0.99,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_video_prompt_sqlite"
    };
  }
}


class QcFallbackDecisions implements QcFallbackDecisionPort {
  async runClipQc(): Promise<ProductionDecisionWithMeta<ClipQcDecision>> {
    return {
      decision: {
        status: "TRIM_PASS",
        severity: "MINOR",
        confidence: 0.98,
        usableInMs: 400,
        usableOutMs: 4400,
        issues: ["unstable tail"]
      },
      status: "SUCCESS",
      confidence: 0.98,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_clip_qc_sqlite"
    };
  }

  async selectClipFallback(): Promise<ProductionDecisionWithMeta<ClipFallbackDecision>> {
    return {
      decision: {
        action: "EDITORIAL_MOVE",
        rationale: "preserve approved still when generated motion is unusable"
      },
      status: "SUCCESS",
      confidence: 0.98,
      requiresHumanReview: false,
      warnings: [],
      decisionId: "dec_fallback_sqlite"
    };
  }
}

test("WF-07 -> WF-08 -> WF-09 -> WF-10 -> WF-11 -> WF-12 -> WF-13 -> WF-14 completes in one project.db through timeline assembly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vpf-wf10-"));
  const dbPath = join(dir, "project.db");

  try {
    const storyRepo = new SqliteStoryRepository(dbPath);
    const sid = storyIds();
    const story = new StoryPipeline(storyRepo, storyClock, sid);
    const storyGeneration = new StoryGenerationService(
      storyRepo,
      storyDecisions,
      storyClock,
      sid
    );

    const script = await story.createScript({
      projectId: "prj_10",
      body: "첫 장면. 둘째 장면.",
      kind: "FINAL"
    });
    await story.approveFinalScript({
      projectId: "prj_10",
      scriptId: script.id
    });
    const graph = await storyGeneration.generate({
      projectId: "prj_10",
      format: "SHORTFORM"
    });
    await storyGeneration.approveStructure({ projectId: "prj_10" });
    await storyGeneration.approveScenes({
      projectId: "prj_10",
      sceneIds: graph.scenes.map(scene => scene.id)
    });
    storyRepo.close();

    const visualRepo = new SqliteVisualIdentityRepository(dbPath);
    const vid = visualIds();
    const visual = new VisualIdentityPipeline(
      visualRepo,
      visualRepo,
      visualBible,
      visualDecisions(graph.scenes.map(scene => scene.id)),
      visualClock,
      vid
    );
    await visual.generateProjectStyle({
      projectId: "prj_10",
      format: "SHORTFORM",
      channelVisualBibleVersion: "2.0.0"
    });
    await visual.approveProjectStyle({ projectId: "prj_10" });
    const anchors = await visual.planIdentityAnchors({
      projectId: "prj_10",
      format: "SHORTFORM"
    });
    await visual.approveAnchors({
      projectId: "prj_10",
      anchorIds: anchors.map(anchor => anchor.id)
    });
    visualRepo.close();

    const assetRepo = new SqliteSceneAssetRepository(dbPath);
    const aid = assetIds();
    const assetDecisions = new AssetDecisions();
    assetDecisions.designImageAsset = async () => ({
      visualGoal: "Scene의 현재 상태를 보여준다",
      composition: "중경",
      continuityRequirements: ["반복 인물 동일성"],
      identityAnchorIds: anchors.map(anchor => anchor.id),
      factualConstraints: [],
      avoidances: ["현대 물건"]
    });
    const assetPipeline = new SceneAssetPipeline(
      assetRepo,
      assetRepo,
      assetBible,
      formats,
      assetDecisions,
      manualApproval,
      assetClock,
      aid
    );

    const approvedAssets: string[] = [];
    for (const [index, scene] of graph.scenes.entries()) {
      const asset = await assetPipeline.designPrimarySceneAsset({
        projectId: "prj_10",
        sceneId: scene.id,
        format: "SHORTFORM",
        formatProfileVersion: "shorts-v1"
      });
      const job = await assetPipeline.createImageGenerationJob({
        projectId: "prj_10",
        assetId: asset.id,
        format: "SHORTFORM",
        provider: "GOOGLE_FLOW",
        providerProfileVersion: "flow-v1",
        executionMode: "MANUAL_EXTERNAL"
      });
      const result = await assetPipeline.registerImageResult({
        projectId: "prj_10",
        jobId: job.job.id,
        relativePath: `06_generated_assets/images/wf10_scene_${index + 1}.png`,
        mimeType: "image/png",
        checksum: `sha256:wf10-${index + 1}`,
        width: 1080,
        height: 1920
      });
      await assetPipeline.runImageQc({
        projectId: "prj_10",
        assetId: asset.id,
        mediaId: result.media.id,
        format: "SHORTFORM"
      });
      const approved = await assetPipeline.approveAsset({
        projectId: "prj_10",
        assetId: asset.id,
        mediaId: result.media.id
      });
      approvedAssets.push(approved.asset.id);
    }

    const sceneBeforeLink = await assetRepo.getScene(
      "prj_10",
      graph.scenes[0]!.id
    );
    const sceneRevisionBeforeLink = sceneBeforeLink!.revision;
    assetRepo.close();

    const linkRepo = new SqlitePreLinkHandoffRepository(dbPath);
    const linkPipeline = new PreLinkHandoffPipeline(
      linkRepo,
      linkRepo,
      new LinkDecisions(),
      linkClock,
      linkIds()
    );

    const links = await linkPipeline.buildLinkGraph({
      projectId: "prj_10",
      format: "SHORTFORM"
    });
    assert.equal(links.length, 1);
    assert.equal(links[0]!.linkScope, "FULL_VIDEO_PRIMARY");
    assert.equal(links[0]!.fromStateRef.stateField, "STATE_OUT");
    assert.equal(links[0]!.toStateRef.stateField, "STATE_IN");

    const preLink = await linkPipeline.designPreLink({
      projectId: "prj_10",
      linkId: links[0]!.id,
      format: "SHORTFORM"
    });
    assert.equal(preLink.link.linkStatus, "WAITING_FOR_ASSETS");
    assert.equal(preLink.approval?.approvalState, "AUTO_APPROVED");

    const bound = await linkPipeline.bindApprovedAssets({
      projectId: "prj_10",
      linkId: links[0]!.id
    });
    assert.equal(bound.linkStatus, "HANDOFF_QC_PENDING");
    assert.deepEqual(
      [bound.fromAssetId, bound.toAssetId],
      approvedAssets
    );

    const handoff = await linkPipeline.runHandoffQc({
      projectId: "prj_10",
      linkId: links[0]!.id,
      format: "SHORTFORM"
    });
    assert.equal(handoff.link.linkStatus, "HANDOFF_PASS");
    assert.equal(handoff.link.preLinkMatch, "MATCH");
    assert.equal(handoff.qc.qcType, "HANDOFF_QC");
    assert.equal(handoff.qc.targetType, "LINK");

    const readiness = await linkPipeline.getReadiness(
      "prj_10",
      links[0]!.id
    );
    assert.equal(readiness.finalClipDesignReady, true);

    const sceneAfterLink = await linkRepo.getScene(
      "prj_10",
      graph.scenes[0]!.id
    );
    assert.equal(sceneAfterLink?.revision, sceneRevisionBeforeLink);

    const linkRevisions = linkRepo.db.prepare(
      `SELECT revision, lifecycle_status, link_status
       FROM production_links
       WHERE id = ?
       ORDER BY revision`
    ).all(links[0]!.id) as Array<{
      revision: number;
      lifecycle_status: string;
      link_status: string;
    }>;
    assert.deepEqual(linkRevisions, [
      { revision: 1, lifecycle_status: "SUPERSEDED", link_status: "NOT_PLANNED" },
      { revision: 2, lifecycle_status: "SUPERSEDED", link_status: "WAITING_FOR_ASSETS" },
      { revision: 3, lifecycle_status: "SUPERSEDED", link_status: "HANDOFF_QC_PENDING" },
      { revision: 4, lifecycle_status: "ACTIVE", link_status: "HANDOFF_PASS" }
    ]);

    const linkApproval = linkRepo.db.prepare(
      `SELECT approval_state
       FROM approval_records
       WHERE project_id = ?
         AND target_type = 'LINK'
         AND target_id = ?
       ORDER BY rowid DESC
       LIMIT 1`
    ).get("prj_10", links[0]!.id) as { approval_state: string };
    assert.equal(linkApproval.approval_state, "AUTO_APPROVED");

    const handoffQcCount = linkRepo.db.prepare(
      `SELECT COUNT(*) AS count
       FROM qc_results
       WHERE project_id = ?
         AND qc_type = 'HANDOFF_QC'
         AND target_type = 'LINK'
         AND target_id = ?`
    ).get("prj_10", links[0]!.id) as { count: number };
    assert.equal(handoffQcCount.count, 1);

    const outboxCount = linkRepo.db.prepare(
      `SELECT COUNT(*) AS count
       FROM event_outbox
       WHERE status = 'PENDING'`
    ).get() as { count: number };
    assert.ok(outboxCount.count >= 20);

    linkRepo.close();

    const finalRepo = new SqliteFinalClipRepository(dbPath);
    const finalPipeline = new FinalClipPipeline(
      finalRepo,
      finalRepo,
      new FinalClipDecisions(),
      finalClipClock,
      finalClipIds()
    );

    const finalDesign = await finalPipeline.designFinalImplementation({
      projectId: "prj_10",
      linkId: links[0]!.id,
      format: "SHORTFORM"
    });
    assert.equal(finalDesign.kind, "CLIP");
    if (finalDesign.kind !== "CLIP") {
      throw new Error("Expected CLIP implementation");
    }
    assert.equal(finalDesign.clip.clipMode, "DIRECT_START_END_I2V");
    assert.equal(finalDesign.clip.providerExecutionRequired, true);
    assert.equal(finalDesign.clip.clipStatus, "DESIGNED");
    assert.equal(finalDesign.approval?.approvalState, "AUTO_APPROVED");
    assert.equal(finalDesign.link.linkStatus, "FINAL_DESIGN_READY");

    const currentLink = await finalRepo.getLink("prj_10", links[0]!.id);
    assert.equal(currentLink?.implementationType, "CLIP");
    assert.equal(currentLink?.implementationRefId, finalDesign.clip.id);

    const preflight = await finalPipeline.runProviderPreQc({
      projectId: "prj_10",
      clipId: finalDesign.clip.id,
      format: "SHORTFORM",
      provider: "GOOGLE_FLOW",
      providerProfileVersion: "flow-v1"
    });
    assert.equal(preflight.preflight.status, "PASS");
    assert.equal(preflight.clip.clipStatus, "READY");

    const videoJob = await finalPipeline.createVideoGenerationJob({
      projectId: "prj_10",
      clipId: finalDesign.clip.id,
      format: "SHORTFORM",
      provider: "GOOGLE_FLOW",
      providerProfileVersion: "flow-v1",
      executionMode: "MANUAL_EXTERNAL"
    });
    assert.equal(videoJob.job.status, "WAITING_EXTERNAL");

    const videoPack = await finalPipeline.exportVideoJobPack({
      projectId: "prj_10",
      jobIds: [videoJob.job.id]
    });
    assert.equal(videoPack.jobs.length, 1);
    assert.equal(videoPack.jobs[0]!.clipMode, "DIRECT_START_END_I2V");
    assert.ok(videoPack.jobs[0]!.startMediaPath.includes("wf10_scene_1.png"));
    assert.ok(videoPack.jobs[0]!.endMediaPath?.includes("wf10_scene_2.png"));

    const videoResult = await finalPipeline.registerVideoResult({
      projectId: "prj_10",
      jobId: videoJob.job.id,
      relativePath: "07_generated_clips/wf11_clip_1.mp4",
      mimeType: "video/mp4",
      checksum: "sha256:wf11-clip-1",
      durationMs: 5000,
      width: 1080,
      height: 1920
    });
    assert.equal(videoResult.job.status, "COMPLETE");
    assert.equal(videoResult.clip.clipStatus, "CANDIDATE_AVAILABLE");
    assert.equal(videoResult.clip.approvedMediaId, undefined);
    assert.deepEqual(
      videoResult.clip.candidateMediaIds,
      [videoResult.media.id]
    );

    const clipRows = finalRepo.db.prepare(
      `SELECT revision, lifecycle_status, clip_status
       FROM production_clips
       WHERE id = ?
       ORDER BY revision`
    ).all(finalDesign.clip.id) as Array<{
      revision: number;
      lifecycle_status: string;
      clip_status: string;
    }>;
    assert.deepEqual(clipRows, [
      { revision: 1, lifecycle_status: "SUPERSEDED", clip_status: "SUPERSEDED" },
      { revision: 2, lifecycle_status: "SUPERSEDED", clip_status: "SUPERSEDED" },
      { revision: 3, lifecycle_status: "SUPERSEDED", clip_status: "SUPERSEDED" },
      { revision: 4, lifecycle_status: "ACTIVE", clip_status: "CANDIDATE_AVAILABLE" }
    ]);

    const preflightCount = finalRepo.db.prepare(
      `SELECT COUNT(*) AS count
       FROM provider_preflights
       WHERE project_id = ? AND clip_id = ? AND status = 'PASS'`
    ).get("prj_10", finalDesign.clip.id) as { count: number };
    assert.equal(preflightCount.count, 1);

    const clipQcCount = finalRepo.db.prepare(
      `SELECT COUNT(*) AS count
       FROM qc_results
       WHERE project_id = ? AND qc_type = 'CLIP_QC' AND target_id = ?`
    ).get("prj_10", finalDesign.clip.id) as { count: number };
    assert.equal(clipQcCount.count, 0);

    const clipMediaApprovalCount = finalRepo.db.prepare(
      `SELECT COUNT(*) AS count
       FROM approval_records
       WHERE project_id = ?
         AND target_type = 'CLIP'
         AND target_id = ?
         AND selected_media_id IS NOT NULL`
    ).get("prj_10", finalDesign.clip.id) as { count: number };
    assert.equal(clipMediaApprovalCount.count, 0);

    const sceneAfterFinalClip = await finalRepo.getScene(
      "prj_10",
      graph.scenes[0]!.id
    );
    assert.equal(sceneAfterFinalClip?.revision, sceneRevisionBeforeLink);

    finalRepo.close();

    const qcRepo = new SqliteQcFallbackRepository(dbPath);
    const qcPipeline = new QcFallbackPipeline(
      qcRepo,
      qcRepo,
      new QcFallbackDecisions(),
      qcFallbackClock,
      qcFallbackIds()
    );
    const clipQc = await qcPipeline.runClipQc({
      projectId: "prj_10",
      clipId: finalDesign.clip.id,
      candidateMediaId: videoResult.media.id,
      format: "SHORTFORM"
    });
    assert.equal(clipQc.qc.status, "TRIM_PASS");
    assert.equal(clipQc.qc.usableInMs, 400);
    assert.equal(clipQc.qc.usableOutMs, 4400);
    assert.equal(clipQc.clip.clipStatus, "APPROVED");
    assert.equal(clipQc.clip.approvedMediaId, videoResult.media.id);
    assert.equal(clipQc.approval?.selectedMediaId, videoResult.media.id);

    const storedQc = qcRepo.db.prepare(
      `SELECT status, usable_in_ms, usable_out_ms
       FROM clip_qc_records
       WHERE project_id = ? AND clip_id = ?
       ORDER BY rowid DESC LIMIT 1`
    ).get("prj_10", finalDesign.clip.id) as {
      status: string;
      usable_in_ms: number;
      usable_out_ms: number;
    };
    assert.deepEqual(storedQc, {
      status: "TRIM_PASS",
      usable_in_ms: 400,
      usable_out_ms: 4400
    });

    const approvedVideoCount = qcRepo.db.prepare(
      `SELECT COUNT(*) AS count
       FROM approval_records
       WHERE project_id = ?
         AND target_type = 'CLIP'
         AND target_id = ?
         AND selected_media_id = ?`
    ).get("prj_10", finalDesign.clip.id, videoResult.media.id) as { count: number };
    assert.equal(approvedVideoCount.count, 1);

    const sceneAfterQc = await qcRepo.getScene(
      "prj_10",
      graph.scenes[0]!.id
    );
    assert.equal(sceneAfterQc?.revision, sceneRevisionBeforeLink);

    qcRepo.close();

    const bindingRepo = new SqliteMediaBindingRepository(dbPath);
    const bindingPipeline = new MediaBindingPipeline(
      bindingRepo,
      bindingRepo,
      mediaBindingClock,
      mediaBindingIds()
    );

    const boundFinalMedia = await bindingPipeline.bindClip({
      projectId: "prj_10",
      clipId: finalDesign.clip.id
    });
    assert.equal(boundFinalMedia.binding.bindingKind, "VIDEO");
    assert.equal(boundFinalMedia.binding.mediaId, videoResult.media.id);
    assert.equal(boundFinalMedia.binding.sourceInMs, 400);
    assert.equal(boundFinalMedia.binding.sourceOutMs, 4400);
    assert.equal(boundFinalMedia.binding.durationMs, 4000);

    const manifest = await bindingPipeline.buildEditorHandoff("prj_10");
    assert.equal(manifest.status, "READY");
    assert.equal(manifest.recommendedFileName, "media_binding.json");
    assert.equal(manifest.totalImplementations, 1);
    assert.equal(manifest.boundImplementations, 1);
    assert.equal(manifest.items[0]?.bindingKind, "VIDEO");
    assert.equal(manifest.items[0]?.relativePath, "07_generated_clips/wf11_clip_1.mp4");
    assert.equal(manifest.items[0]?.sourceInMs, 400);
    assert.equal(manifest.items[0]?.sourceOutMs, 4400);
    assert.equal(manifest.items[0]?.sourceAssetDurationMs, 5000);

    const storedBinding = bindingRepo.db.prepare(
      `SELECT binding_kind, media_id, source_in_ms, source_out_ms, duration_ms, stale
       FROM final_media_bindings
       WHERE project_id = ? AND implementation_id = ?
       ORDER BY rowid DESC LIMIT 1`
    ).get("prj_10", finalDesign.clip.id) as {
      binding_kind: string;
      media_id: string;
      source_in_ms: number;
      source_out_ms: number;
      duration_ms: number;
      stale: number;
    };
    assert.deepEqual(storedBinding, {
      binding_kind: "VIDEO",
      media_id: videoResult.media.id,
      source_in_ms: 400,
      source_out_ms: 4400,
      duration_ms: 4000,
      stale: 0
    });

    const readinessAfterBinding = await bindingPipeline.getReadiness("prj_10");
    assert.equal(readinessAfterBinding.bindingReady, true);
    assert.equal(readinessAfterBinding.remotionHandoffReady, true);

    const sceneAfterBinding = await bindingRepo.getScene(
      "prj_10",
      graph.scenes[0]!.id
    );
    assert.equal(sceneAfterBinding?.revision, sceneRevisionBeforeLink);

    bindingRepo.close();

    const timelineRepo = new SqliteEditorTimelineRepository(dbPath);
    const timelineBindingSource = new MediaBindingPipeline(
      timelineRepo,
      timelineRepo,
      mediaBindingClock,
      mediaBindingIds()
    );
    const timelinePipeline = new EditorTimelineAssemblyPipeline(
      timelineRepo,
      timelineBindingSource,
      editorTimelineClock,
      editorTimelineIds()
    );

    const timeline = await timelinePipeline.assembleProject({
      projectId: "prj_10",
      projectName: "WF-14 Integration Project",
      profile: {
        fps: 30,
        width: 1080,
        height: 1920
      }
    });

    assert.equal(timeline.output.status, "READY");
    assert.equal(timeline.output.recommendedFileName, "edit_project.json");
    assert.equal(timeline.output.editProject.schemaVersion, 1);
    assert.equal(timeline.output.editProject.project.durationInFrames, 120);
    assert.deepEqual(
      timeline.output.editProject.tracks.map(track => track.id),
      ["V1", "G1", "T1", "A1"]
    );
    assert.equal(timeline.output.editProject.items.length, 1);

    const timelineVideo = timeline.output.editProject.items[0]!;
    assert.equal(timelineVideo.type, "VIDEO");
    if (timelineVideo.type !== "VIDEO") {
      throw new Error("Expected VIDEO timeline item");
    }
    assert.equal(timelineVideo.src, "07_generated_clips/wf11_clip_1.mp4");
    assert.equal(timelineVideo.timelineStartFrame, 0);
    assert.equal(timelineVideo.sourceStartFrame, 12);
    assert.equal(timelineVideo.sourceDurationInFrames, 120);
    assert.equal(timelineVideo.sourceAssetDurationInFrames, 150);
    assert.equal(timelineVideo.durationInFrames, 120);
    assert.equal(timelineVideo.volume, 0);

    const storedAssembly = timelineRepo.db.prepare(
      `SELECT revision, assembly_status, stale, fps, width, height, edit_project_json
       FROM editor_timeline_assemblies
       WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
       ORDER BY revision DESC LIMIT 1`
    ).get("prj_10") as {
      revision: number;
      assembly_status: string;
      stale: number;
      fps: number;
      width: number;
      height: number;
      edit_project_json: string;
    };

    assert.equal(storedAssembly.revision, 1);
    assert.equal(storedAssembly.assembly_status, "READY");
    assert.equal(storedAssembly.stale, 0);
    assert.equal(storedAssembly.fps, 30);
    assert.equal(storedAssembly.width, 1080);
    assert.equal(storedAssembly.height, 1920);
    const storedEditProject = JSON.parse(storedAssembly.edit_project_json) as {
      project: { durationInFrames: number };
      items: Array<{ type: string }>;
    };
    assert.equal(storedEditProject.project.durationInFrames, 120);
    assert.equal(storedEditProject.items[0]?.type, "VIDEO");

    const timelineReadiness = await timelinePipeline.getReadiness("prj_10");
    assert.equal(timelineReadiness.timelineAssemblyReady, true);
    assert.equal(timelineReadiness.remotionHandoffReady, true);
    assert.equal(timelineReadiness.status, "READY");

    const sceneAfterTimeline = await timelineRepo.getScene(
      "prj_10",
      graph.scenes[0]!.id
    );
    assert.equal(sceneAfterTimeline?.revision, sceneRevisionBeforeLink);

    timelineRepo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
