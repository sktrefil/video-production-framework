import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSceneHandoffRequirements,
  enrichImagePromptWithHandoffs,
  enrichSceneAssetPlanWithHandoffs,
  type CanonicalVisualHandoff
} from "../src/wf09-handoff.js";

const links: CanonicalVisualHandoff[] = [
  {
    linkId: "lnk_1_2",
    fromSceneId: "sc_1",
    toSceneId: "sc_2",
    continuityLevel: "HIGH",
    handoffIntent: "continue the northward march without a spatial reset",
    handoffAnchors: ["muddy Roman road", "marching direction", "overcast weather"],
    transitionIntent: "measured forward progression"
  },
  {
    linkId: "lnk_2_3",
    fromSceneId: "sc_2",
    toSceneId: "sc_3",
    continuityLevel: "MEDIUM",
    handoffIntent: "carry the road axis into the evidence location",
    handoffAnchors: ["road axis", "cold daylight"],
    transitionIntent: "slow push toward the next location"
  }
];

test("derives incoming and outgoing visual continuity from canonical links", () => {
  const requirements = deriveSceneHandoffRequirements("sc_2", links);
  assert.equal(requirements.length, 2);
  assert.match(requirements[0]!, /^\[HANDOFF IN\]/u);
  assert.match(requirements[0]!, /muddy Roman road/u);
  assert.match(requirements[1]!, /^\[HANDOFF OUT\]/u);
  assert.match(requirements[1]!, /slow push toward the next location/u);
});

test("prompt handoff enrichment is compact and idempotent", () => {
  const requirements = deriveSceneHandoffRequirements("sc_2", links);
  const once = enrichImagePromptWithHandoffs(
    "Roman legionaries on a cold northern road, painterly cinematic reconstruction.",
    requirements
  );
  const twice = enrichImagePromptWithHandoffs(once, requirements);
  assert.equal(once, twice);
  assert.match(once, /CONTINUITY HANDOFF:/u);
  assert.match(once, /sc_1:/u);
  assert.match(once, /sc_3:/u);
});

test("scene plan derives continuity without creating a second handoff source of truth", () => {
  const source = {
    scenes: [
      {
        sceneId: "sc_2",
        assetPlan: { sourceStrategy: "GENERATE" },
        imageAssetDesign: {
          visualGoal: "show the northern advance",
          composition: "deep road perspective",
          continuityRequirements: ["keep the same Roman kit"],
          factualConstraints: [],
          avoidances: []
        },
        imagePrompt: {
          prompt: "Roman column crossing a northern road."
        }
      }
    ]
  };

  const result = enrichSceneAssetPlanWithHandoffs(source, links);
  const scene = result.plan.scenes[0]!;
  const design = scene.imageAssetDesign as { continuityRequirements: string[] };
  const prompt = scene.imagePrompt as { prompt: string };
  const handoffContext = scene.handoffContext as { source: string; linkIds: string[] };

  assert.equal(result.enrichedSceneCount, 1);
  assert.deepEqual(result.linkIds, ["lnk_1_2", "lnk_2_3"]);
  assert.equal(design.continuityRequirements[0], "keep the same Roman kit");
  assert.equal(design.continuityRequirements.filter(item => item.startsWith("[HANDOFF ")).length, 2);
  assert.match(prompt.prompt, /CONTINUITY HANDOFF:/u);
  assert.equal(handoffContext.source, "production_links");
  assert.deepEqual(handoffContext.linkIds, ["lnk_1_2", "lnk_2_3"]);
  assert.equal(Object.hasOwn(scene, "handoffIntent"), false);
});
