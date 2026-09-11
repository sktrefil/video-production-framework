import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { runUnifiedCli } from "../src/main.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function parseLast(output: string[]): any {
  return JSON.parse(output.at(-1)!);
}

async function fixture(projectId = "wf09_short") {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf09-cli-"));
  const service = new ProjectBootstrapService({
    repositoryRoot,
    workspaceRoot: path.join(root, "workspace")
  });
  const output: string[] = [];
  const errors: string[] = [];
  const io = {
    out: (message: string) => output.push(message),
    error: (message: string) => errors.push(message)
  };

  assert.equal(await runUnifiedCli([
    "project", "create", projectId,
    "--title", "WF09 Short",
    "--format", "shortform"
  ], io, service), 0);
  const status = await service.getStatus(projectId);

  const finalPath = path.join(status.projectRoot, "02_script", "final.txt");
  const storyPath = path.join(status.projectRoot, "02_script", "story-plan.json");
  await writeFile(
    finalPath,
    "The legion enters Eboracum. Later the record becomes uncertain.",
    "utf8"
  );
  await writeFile(storyPath, JSON.stringify({
    structure: {
      chapters: [{ key: "ch1", displayNumber: 1, title: "The Ninth" }]
    },
    sequences: {
      sequences: [{
        key: "seq1",
        chapterKey: "ch1",
        displayNumber: 1,
        title: "Evidence",
        storyPurpose: "EVIDENCE"
      }]
    },
    scenes: {
      scenes: [
        {
          key: "sc1",
          sequenceKey: "seq1",
          displayNumber: 1,
          scriptSegment: "The legion enters Eboracum.",
          stateIn: "Northern road",
          stateCurrent: "Legion approaching fortress",
          stateOut: "Fortress gate reached",
          primaryVisualIdea: "Roman legion approaches a northern fortress",
          mustBeSeen: ["legionaries", "Roman fortress"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "sc2",
          sequenceKey: "seq1",
          displayNumber: 2,
          scriptSegment: "Later the record becomes uncertain.",
          stateIn: "Documented presence",
          stateCurrent: "Evidence gap",
          stateOut: "Unknown fate",
          primaryVisualIdea: "Roman fortress under empty overcast sky",
          mustBeSeen: ["same fortress", "uncertainty"],
          canBeNarrated: [],
          canBeImplied: ["unknown later fate"],
          requiredIdentityAnchorIds: []
        }
      ]
    }
  }, null, 2), "utf8");

  assert.equal(await runUnifiedCli([
    "script", "create", projectId,
    "--file", finalPath,
    "--kind", "FINAL"
  ], io, service), 0);
  const script = parseLast(output);
  assert.equal(await runUnifiedCli([
    "script", "approve", projectId, script.id,
    "--approved-by", "operator"
  ], io, service), 0);
  assert.equal(await runUnifiedCli([
    "story", "generate", projectId,
    "--plan", storyPath
  ], io, service), 0);
  const story = parseLast(output);
  assert.equal(await runUnifiedCli([
    "story", "approve-scenes", projectId,
    "--all",
    "--approved-by", "operator"
  ], io, service), 0);

  const stylePath = path.join(status.projectRoot, "04_visual_identity", "project-style.json");
  const anchorsPath = path.join(status.projectRoot, "04_visual_identity", "identity-anchors.json");
  await writeFile(stylePath, JSON.stringify({
    eraRegion: "Roman Britain, early second century CE",
    visualApproach: "evidence-led cinematic historical reconstruction",
    realismLevel: "grounded historical realism with explicit uncertainty",
    colorLanguage: "muted material-derived stone, iron, leather and northern earth tones",
    lightingLanguage: "soft overcast daylight with restrained contrast",
    materialLanguage: "weathered stone, timber, iron, wool and leather",
    environmentLanguage: "wind-exposed Roman military landscapes in northern Britain",
    characterRenderingPrinciple: "natural proportions and plausible early second-century equipment",
    cameraCompositionTendency: "documentary wides mixed with evidence-focused close details",
    moodRange: ["investigative", "austere", "uncertain"],
    factualConstraints: ["distinguish evidence from reconstruction"],
    avoidances: ["fantasy armor", "modern objects", "unsupported certainty"]
  }, null, 2), "utf8");

  assert.equal(await runUnifiedCli([
    "visual", "style", "apply", projectId,
    "--file", stylePath
  ], io, service), 0);
  assert.equal(await runUnifiedCli([
    "visual", "style", "approve", projectId,
    "--approved-by", "operator"
  ], io, service), 0);

  const sceneIds = story.scenes.map((scene: any) => scene.id);
  await writeFile(anchorsPath, JSON.stringify({
    anchors: [{
      key: "eboracum",
      anchorType: "LOCATION",
      name: "Eboracum Fortress",
      rationale: "The same location recurs across the evidence sequence.",
      continuityReason: "RECURRING",
      productionPriority: "CRITICAL",
      requiredBySceneIds: sceneIds,
      specification: {
        locked: ["gate geometry", "wall scale", "masonry logic"],
        contextual: ["weather", "activity"],
        temporary: ["mist", "mud"]
      }
    }]
  }, null, 2), "utf8");
  assert.equal(await runUnifiedCli([
    "visual", "anchors", "apply", projectId,
    "--file", anchorsPath
  ], io, service), 0);
  assert.equal(await runUnifiedCli([
    "visual", "anchors", "approve", projectId,
    "--all",
    "--approved-by", "operator"
  ], io, service), 0);

  return { service, status, story, projectId, output, errors, io };
}

function sceneAssetInput(sceneId: string, index: number) {
  return {
    sceneId,
    assetPlan: {
      assetClass: "PRIMARY_SCENE",
      assetRole: index === 0 ? "HERO" : "STANDARD",
      productionPriority: index === 0 ? "CRITICAL" : "IMPORTANT",
      sourceStrategy: "GENERATE",
      stateField: "STATE_CURRENT",
      rationale: "Primary evidence-led scene image"
    },
    imageAssetDesign: {
      visualGoal: index === 0
        ? "Establish the documented Roman military presence in northern Britain."
        : "Show the evidence gap without depicting an unsupported destruction event.",
      composition: "Vertical 9:16 frame with a readable foreground subject and uncluttered upper safe area.",
      continuityRequirements: ["Preserve the approved Eboracum fortress geometry."],
      factualConstraints: ["Keep reconstruction visually distinct from authenticated evidence."],
      avoidances: ["fantasy armor", "fabricated readable inscriptions", "modern objects"]
    },
    imagePrompt: {
      prompt: index === 0
        ? "Early second-century Roman legionaries approaching Eboracum in northern Britain, grounded historical reconstruction, weathered stone fortifications, plausible Roman military equipment, cold overcast daylight, vertical 9:16 composition, restrained documentary realism."
        : "Early second-century Roman fortress in northern Britain after the documented record becomes uncertain, empty wind-exposed approach, cold overcast daylight, grounded historical reconstruction, vertical 9:16 composition, unresolved historical mood without depicting a fictional destruction event.",
      negativePrompt: "fantasy armor, modern objects, readable invented Latin, game render, excessive gore"
    }
  };
}

test("WF-09A CLI persists Scene Asset Design and IMAGE_PROMPT without Provider Jobs", async () => {
  const f = await fixture();
  const file = path.join(f.status.projectRoot, "05_images", "scene-assets.json");
  await writeFile(file, JSON.stringify({
    scenes: f.story.scenes.map((scene: any, index: number) => sceneAssetInput(scene.id, index))
  }, null, 2), "utf8");

  assert.equal(await runUnifiedCli([
    "asset", "readiness", f.projectId,
    "--file", file
  ], f.io, f.service), 0);
  const readiness = parseLast(f.output);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.sceneCount, 2);
  assert.equal(readiness.readyCount, 2);

  assert.equal(await runUnifiedCli([
    "asset", "design", "apply", f.projectId,
    "--file", file
  ], f.io, f.service), 0);
  const designed = parseLast(f.output);
  assert.equal(designed.designedCount, 2);
  assert.equal(designed.assets.every((asset: any) => asset.assetStatus === "DESIGNED"), true);
  assert.equal(designed.assets.every((asset: any) => asset.design.identityAnchorIds.length === 1), true);

  assert.equal(await runUnifiedCli([
    "asset", "status", f.projectId
  ], f.io, f.service), 0);
  let status = parseLast(f.output);
  assert.equal(status.assetCount, 2);
  assert.equal(status.promptMaterializedCount, 0);
  assert.equal(status.providerJobCount, 0);
  assert.equal(status.wf09aReady, false);

  assert.equal(await runUnifiedCli([
    "asset", "prompt", "materialize", f.projectId,
    "--file", file
  ], f.io, f.service), 0);
  const prompts = parseLast(f.output);
  assert.equal(prompts.promptMaterializedCount, 2);
  assert.equal(prompts.providerJobsCreated, 0);
  assert.equal(prompts.assets.every((asset: any) => asset.revision === 2), true);

  assert.equal(await runUnifiedCli([
    "asset", "status", f.projectId
  ], f.io, f.service), 0);
  status = parseLast(f.output);
  assert.equal(status.assetCount, 2);
  assert.equal(status.promptMaterializedCount, 2);
  assert.equal(status.providerJobCount, 0);
  assert.equal(status.wf09aReady, true);
  assert.equal(status.assets.every((asset: any) => asset.design.imagePrompt.length > 0), true);
});

test("WF-09A rejects input outside project workspace before persistence", async () => {
  const f = await fixture("wf09_isolation");
  const outside = path.join(path.dirname(f.status.projectRoot), "scene-assets.json");
  await writeFile(outside, JSON.stringify({
    scenes: f.story.scenes.map((scene: any, index: number) => sceneAssetInput(scene.id, index))
  }), "utf8");

  assert.equal(await runUnifiedCli([
    "asset", "design", "apply", f.projectId,
    "--file", outside
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /WF09_INPUT_PATH/);

  assert.equal(await runUnifiedCli([
    "asset", "status", f.projectId
  ], f.io, f.service), 0);
  assert.equal(parseLast(f.output).assetCount, 0);
});
