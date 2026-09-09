import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  AnchorPlanDecision,
  ChannelVisualBibleSnapshot,
  ProjectStyleDecision,
  SceneDesignDecision,
  SequenceDesignDecision,
  StoryDecisionPort,
  StructureDesignDecision,
  VisualIdentityDecisionPort
} from "@vpf/production-system";
import {
  StoryGenerationService,
  StoryPipeline,
  type IdFactory,
  type StoryClock
} from "@vpf/story";
import {
  VisualIdentityPipeline,
  type ChannelVisualBiblePort,
  type VisualIdentityClock,
  type VisualIdentityIdFactory
} from "@vpf/visual-identity";
import { SqliteStoryRepository } from "../src/index.js";
import { SqliteVisualIdentityRepository } from "../src/visual-identity.js";

const now = "2026-09-09T09:00:00.000Z";
const storyClock: StoryClock = { nowIso: () => now };
const visualClock: VisualIdentityClock = { nowIso: () => now };

function storyIds(): IdFactory {
  let n = 0;
  return { next: prefix => `${prefix}_${++n}` };
}

function visualIds(): VisualIdentityIdFactory {
  let n = 1000;
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
        storyPurpose: "두 장면의 연속성을 만든다"
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
          mustBeSeen: [],
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
          mustBeSeen: [],
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
  environmentLanguage: "고증된 생활 공간",
  characterRenderingPrinciple: "얼굴과 신분 일관성",
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
          rationale: "두 장면의 동일 인물 연속성",
          continuityReason: "RECURRING",
          productionPriority: "CRITICAL",
          requiredBySceneIds: sceneIds,
          specification: {
            locked: ["얼굴 구조", "연령", "기본 복식"],
            contextual: ["표정"],
            temporary: []
          }
        }]
      };
    }
  };
}

const bibleSnapshot: ChannelVisualBibleSnapshot = {
  version: "2.0.0",
  resourceId: "history-channel",
  contentHash: "sha256:test",
  payload: { canonical: true }
};

const bible: ChannelVisualBiblePort = {
  async resolve(version: string) {
    return version === "2.0.0" ? bibleSnapshot : null;
  }
};

test("WF-07 story and WF-08 visual identity share one project DB without Scene revision churn", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vpf-wf08-"));
  const dbPath = join(dir, "project.db");

  try {
    const storyRepo = new SqliteStoryRepository(dbPath);
    const sid = storyIds();
    const storyPipeline = new StoryPipeline(storyRepo, storyClock, sid);
    const storyGeneration = new StoryGenerationService(
      storyRepo,
      storyDecisions,
      storyClock,
      sid
    );

    const script = await storyPipeline.createScript({
      projectId: "prj_1",
      body: "첫 장면. 둘째 장면.",
      kind: "FINAL"
    });
    await storyPipeline.approveFinalScript({
      projectId: "prj_1",
      scriptId: script.id
    });
    const graph = await storyGeneration.generate({
      projectId: "prj_1",
      format: "LONGFORM"
    });
    storyRepo.close();

    const visualRepo = new SqliteVisualIdentityRepository(dbPath);
    const vid = visualIds();
    const visual = new VisualIdentityPipeline(
      visualRepo,
      visualRepo,
      bible,
      visualDecisions(graph.scenes.map(scene => scene.id)),
      visualClock,
      vid
    );

    const style = await visual.generateProjectStyle({
      projectId: "prj_1",
      format: "LONGFORM",
      channelVisualBibleVersion: "2.0.0"
    });
    await visual.approveProjectStyle({ projectId: "prj_1" });
    const anchors = await visual.planIdentityAnchors({
      projectId: "prj_1",
      format: "LONGFORM"
    });
    await visual.approveAnchors({
      projectId: "prj_1",
      anchorIds: anchors.map(anchor => anchor.id)
    });

    const readiness = await visual.getReadiness("prj_1");
    assert.equal(readiness.ready, true);

    const projectedScenes = await visualRepo.listActiveScenes("prj_1");
    assert.equal(projectedScenes.length, 2);
    assert.deepEqual(
      projectedScenes.map(scene => scene.requiredIdentityAnchorIds),
      [[anchors[0]!.id], [anchors[0]!.id]]
    );

    const sceneRevisionCounts = visualRepo.db.prepare(
      "SELECT id, COUNT(*) AS count FROM scenes GROUP BY id ORDER BY id"
    ).all() as Array<{ id: string; count: number }>;
    assert.equal(sceneRevisionCounts.every(row => row.count === 1), true);

    const relationCount = visualRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM scene_identity_anchor_requirements"
    ).get() as { count: number };
    assert.equal(relationCount.count, 2);

    const revisedAnchor = await visual.reviseAnchor({
      projectId: "prj_1",
      anchorId: anchors[0]!.id,
      patch: { rationale: "수정된 반복 인물 연속성 기준" }
    });
    const relationRevisions = visualRepo.db.prepare(
      `SELECT anchor_revision
       FROM scene_identity_anchor_requirements
       WHERE project_id = ? AND anchor_id = ?
       ORDER BY scene_id`
    ).all("prj_1", revisedAnchor.id) as Array<{ anchor_revision: number }>;
    assert.deepEqual(
      relationRevisions.map(row => row.anchor_revision),
      [revisedAnchor.revision, revisedAnchor.revision]
    );

    const styleApprovalCount = visualRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM approval_records WHERE target_type = 'PROJECT_STYLE'"
    ).get() as { count: number };
    const anchorApprovalCount = visualRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM approval_records WHERE target_type = 'IDENTITY_ANCHOR'"
    ).get() as { count: number };
    assert.equal(styleApprovalCount.count, 1);
    assert.equal(anchorApprovalCount.count, 1);

    const outboxCount = visualRepo.db.prepare(
      "SELECT COUNT(*) AS count FROM event_outbox WHERE status = 'PENDING'"
    ).get() as { count: number };
    assert.ok(outboxCount.count >= 6);

    const style2 = await visual.reviseProjectStyle({
      projectId: "prj_1",
      patch: { lightingLanguage: "차가운 자연광" }
    });
    assert.equal(style2.id, style.id);
    assert.equal(style2.revision, 2);
    assert.equal(await visualRepo.getApprovedProjectStyle("prj_1"), null);

    const staleAnchors = await visualRepo.listActiveAnchors("prj_1");
    assert.equal(staleAnchors.every(anchor => anchor.stale), true);

    visualRepo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
