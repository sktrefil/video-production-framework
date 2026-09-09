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
  ProductionDecisionWithMeta
} from "@vpf/production-system";
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
import { SqliteVisualIdentityRepository } from "../src/visual-identity.js";

const now = "2026-09-09T12:00:00.000Z";
const storyClock: StoryClock = { nowIso: () => now };
const visualClock: VisualIdentityClock = { nowIso: () => now };
const assetClock: SceneAssetClock = { nowIso: () => now };
const linkClock: PreLinkHandoffClock = { nowIso: () => now };

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

test("WF-07 -> WF-08 -> WF-09 -> WF-10 completes in one project.db through actual Handoff QC", async () => {
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
