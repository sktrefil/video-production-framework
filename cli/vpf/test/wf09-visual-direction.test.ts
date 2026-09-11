import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichSceneAssetPlanWithVisualDirection,
  type VisualDirectionGrammarV1
} from "../src/wf09-visual-direction.js";

function grammar(): VisualDirectionGrammarV1 {
  return {
    grammarId: "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1",
    grammarVersion: "1.0.0",
    coreStatement: "Story first.",
    storyHierarchy: [
      "NARRATIVE_FUNCTION",
      "ENVIRONMENT_AND_SPATIAL_CONTEXT",
      "CONTINUITY_AND_HANDOFF",
      "EVIDENCE",
      "CHARACTER_OR_OBJECT"
    ],
    shotGrammar: {
      defaultShotFamilies: ["MEDIUM_WIDE", "WIDE"],
      defaultSubjectScale: ["SMALL", "MEDIUM"],
      environmentVisibility: "HIGH",
      closeUpPolicy: {
        default: "RESTRICTED",
        allowedReasons: ["DECISIVE_EVIDENCE"],
        rule: "Close-up requires narrative function."
      }
    },
    surfaceGrammar: {
      structure: "HISTORICALLY_REALISTIC",
      finish: "RESTRAINED_PAINTERLY_MATTE",
      photographicMicrodetail: "REDUCE",
      skinAndMaterialSharpness: "CONTROLLED",
      gameRenderGloss: "FORBIDDEN",
      rule: "Keep historically realistic structure with restrained painterly matte treatment."
    },
    evidenceGrammar: {
      priority: "SUPPORT_NARRATIVE",
      generatedReadableHistoricalText: "FORBIDDEN",
      unsupportedHeraldryOrInsignia: "FORBIDDEN",
      consecutiveEvidenceCloseUps: "AVOID",
      contextRecoveryRule: "Return to context."
    },
    certaintyGrammar: {
      FACT: "observational",
      RECONSTRUCTION: "visibly reconstructed",
      HYPOTHESIS: "reduced specificity",
      LEGEND: "symbolic",
      UNKNOWN: "negative space"
    },
    handoffGrammar: {
      preserveElementsMin: 2,
      preserveElementsMax: 4,
      preferredElements: ["DEPTH_AXIS", "WEATHER_OR_ATMOSPHERE"],
      rule: "Leave useful continuity for the next cut."
    },
    motionGrammar: {
      preferred: ["SLOW_PUSH_IN"],
      avoidByDefault: ["WHIP_PAN"]
    },
    formatGrammar: {
      LONGFORM: { rule: "Preserve long-form geography." },
      SHORTFORM: {
        essentialInformationZone: "CENTER_60_70_PERCENT",
        topPeripheralZone: "TOP_15_20_PERCENT_LOW_DETAIL",
        bottomPeripheralZone: "BOTTOM_15_20_PERCENT_LOW_DETAIL",
        rule: "Keep essential story information in the central 60-70%; upper and lower 15-20% remain atmospheric and lower-detail for blur/crop."
      }
    },
    promptCompilation: {
      principles: ["Keep prompts compact."],
      forbidden: ["HEROIC_CLOSEUP_BY_DEFAULT"]
    }
  };
}

const context = {
  resourceId: "HISTORY_MYSTERY_VISUAL_BIBLE",
  version: "1.1.0",
  contentHash: "sha256:test"
};

function sourcePlan(composition = "Deep road perspective with a marching formation low in frame") {
  return {
    scenes: [
      {
        sceneId: "sc_1",
        assetPlan: { sourceStrategy: "GENERATE" },
        imageAssetDesign: {
          visualGoal: "carry the story northward",
          composition,
          continuityRequirements: ["keep the road axis toward frame right"],
          factualConstraints: ["later fate remains unresolved"],
          avoidances: ["fantasy armor"]
        },
        imagePrompt: {
          prompt: "Roman legionaries crossing a cold northern landscape.",
          negativePrompt: "fantasy armor"
        }
      }
    ]
  };
}

test("SHORTFORM derives story-first composition and central information zones", () => {
  const result = enrichSceneAssetPlanWithVisualDirection(
    sourcePlan(),
    grammar(),
    "SHORTFORM",
    context
  );
  const scene = result.plan.scenes[0]!;
  const design = scene.imageAssetDesign as {
    composition: string;
    continuityRequirements: string[];
    factualConstraints: string[];
    avoidances: string[];
  };
  const prompt = scene.imagePrompt as { prompt: string; negativePrompt: string };

  assert.equal(result.enrichedSceneCount, 1);
  assert.match(design.composition, /environment-first medium-wide\/wide/u);
  assert.match(design.composition, /central 60-70%/u);
  assert.ok(design.continuityRequirements.some(item => item.startsWith("[VDG STORY]")));
  assert.ok(design.continuityRequirements.some(item => item.startsWith("[VDG SHORTFORM]")));
  assert.deepEqual(design.factualConstraints, ["later fate remains unresolved"]);
  assert.match(prompt.prompt, /restrained painterly matte surface/u);
  assert.match(prompt.prompt, /upper\/lower 15-20% kept atmospheric/u);
  assert.match(prompt.negativePrompt, /readable generated historical text/u);
  assert.match(prompt.negativePrompt, /oversized character or object without narrative reason/u);
});

test("explicit evidence close-up is preserved instead of being overwritten by the default wide rule", () => {
  const result = enrichSceneAssetPlanWithVisualDirection(
    sourcePlan("Evidence-focused close-up of a weathered stone fragment with fortress context behind"),
    grammar(),
    "SHORTFORM",
    context
  );
  const scene = result.plan.scenes[0]!;
  const design = scene.imageAssetDesign as { composition: string };
  const prompt = scene.imagePrompt as { prompt: string };

  assert.match(design.composition, /Preserve the explicitly justified close\/detail view/u);
  assert.doesNotMatch(design.composition, /Use environment-first medium-wide\/wide framing/u);
  assert.match(prompt.prompt, /keep the source-approved close\/detail framing/u);
});

test("Visual Direction enrichment is idempotent and records canonical grammar provenance", () => {
  const once = enrichSceneAssetPlanWithVisualDirection(
    sourcePlan(), grammar(), "LONGFORM", context
  );
  const twice = enrichSceneAssetPlanWithVisualDirection(
    once.plan, grammar(), "LONGFORM", context
  );

  const firstScene = once.plan.scenes[0]!;
  const secondScene = twice.plan.scenes[0]!;
  const firstDesign = firstScene.imageAssetDesign as { continuityRequirements: string[] };
  const secondDesign = secondScene.imageAssetDesign as { continuityRequirements: string[] };
  const firstPrompt = firstScene.imagePrompt as { prompt: string };
  const secondPrompt = secondScene.imagePrompt as { prompt: string };
  const visualDirectionContext = secondScene.visualDirectionContext as {
    source: string;
    grammarId: string;
    resourceVersion: string;
    contentHash: string;
  };

  assert.equal(firstPrompt.prompt, secondPrompt.prompt);
  assert.deepEqual(firstDesign.continuityRequirements, secondDesign.continuityRequirements);
  assert.equal(visualDirectionContext.source, "pinned_channel_visual_bible");
  assert.equal(visualDirectionContext.grammarId, "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1");
  assert.equal(visualDirectionContext.resourceVersion, "1.1.0");
  assert.equal(visualDirectionContext.contentHash, "sha256:test");
});
