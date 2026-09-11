import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { runUnifiedCli } from "../src/main.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const adapterPath = path.join(
  repositoryRoot,
  "cli",
  "vpf",
  "test",
  "fixtures",
  "wf09b-image-adapter.mjs"
);

function lastJson(output: string[]): any {
  return JSON.parse(output.at(-1)!);
}

async function createAutoFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf09-auto-"));
  const projectId = "wf09_auto_short";
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
    "--title", "WF09 AUTO Short",
    "--format", "shortform"
  ], io, service), 0);
  const created = await service.getStatus(projectId);

  const scriptPath = path.join(created.projectRoot, "02_script", "final.txt");
  const storyPath = path.join(created.projectRoot, "02_script", "story.json");
  await writeFile(scriptPath, "The Ninth Legion approaches Eboracum.", "utf8");
  await writeFile(storyPath, JSON.stringify({
    structure: {
      chapters: [{ key: "ch1", displayNumber: 1, title: "Evidence" }]
    },
    sequences: {
      sequences: [{
        key: "seq1",
        chapterKey: "ch1",
        displayNumber: 1,
        title: "York",
        storyPurpose: "EVIDENCE"
      }]
    },
    scenes: {
      scenes: [{
        key: "sc1",
        sequenceKey: "seq1",
        displayNumber: 1,
        scriptSegment: "The Ninth Legion approaches Eboracum.",
        stateIn: "Northern road",
        stateCurrent: "Approaching Eboracum",
        stateOut: "Fortress reached",
        primaryVisualIdea: "Roman legionaries approach a northern fortress",
        mustBeSeen: ["legionaries", "fortress"],
        canBeNarrated: [],
        canBeImplied: [],
        requiredIdentityAnchorIds: []
      }]
    }
  }, null, 2), "utf8");

  assert.equal(await runUnifiedCli([
    "script", "create", projectId,
    "--file", scriptPath,
    "--kind", "FINAL"
  ], io, service), 0);
  const script = lastJson(output);
  assert.equal(await runUnifiedCli([
    "script", "approve", projectId, script.id,
    "--approved-by", "operator"
  ], io, service), 0);
  assert.equal(await runUnifiedCli([
    "story", "generate", projectId,
    "--plan", storyPath
  ], io, service), 0);
  const story = lastJson(output);
  assert.equal(await runUnifiedCli([
    "story", "approve-scenes", projectId,
    "--all",
    "--approved-by", "operator"
  ], io, service), 0);

  const stylePath = path.join(created.projectRoot, "04_visual_identity", "project-style.json");
  await writeFile(stylePath, JSON.stringify({
    eraRegion: "Roman Britain, early second century CE",
    visualApproach: "evidence-led cinematic historical reconstruction",
    realismLevel: "grounded historical realism",
    colorLanguage: "material-derived stone, iron, wool and northern earth",
    lightingLanguage: "soft overcast daylight",
    materialLanguage: "weathered stone, timber, iron, wool and leather",
    environmentLanguage: "wind-exposed northern Britain",
    characterRenderingPrinciple: "natural proportions and plausible period equipment",
    cameraCompositionTendency: "documentary vertical compositions",
    moodRange: ["investigative", "austere"],
    factualConstraints: ["distinguish reconstruction from evidence"],
    avoidances: ["fantasy armor", "modern objects"]
  }, null, 2), "utf8");
  assert.equal(await runUnifiedCli([
    "visual", "style", "apply", projectId,
    "--file", stylePath
  ], io, service), 0);
  assert.equal(await runUnifiedCli([
    "visual", "style", "approve", projectId,
    "--approved-by", "operator"
  ], io, service), 0);

  const exactPrompt = "Exact WF-09 AUTO Roman Britain image prompt.";
  const exactNegativePrompt = "fantasy armor, modern objects";
  const assetPath = path.join(created.projectRoot, "05_images", "scene-assets.json");
  await writeFile(assetPath, JSON.stringify({
    scenes: [{
      sceneId: story.scenes[0].id,
      assetPlan: {
        assetClass: "PRIMARY_SCENE",
        assetRole: "HERO",
        productionPriority: "CRITICAL",
        sourceStrategy: "GENERATE",
        stateField: "STATE_CURRENT",
        rationale: "Primary scene image"
      },
      imageAssetDesign: {
        visualGoal: "Show plausible Roman military presence at Eboracum.",
        composition: "Vertical documentary frame.",
        continuityRequirements: [],
        factualConstraints: ["Do not invent unsupported heraldry."],
        avoidances: ["fantasy armor", "modern objects"]
      },
      imagePrompt: {
        prompt: exactPrompt,
        negativePrompt: exactNegativePrompt
      }
    }]
  }, null, 2), "utf8");

  return {
    projectId,
    service,
    projectRoot: created.projectRoot,
    projectDbPath: created.projectDbPath,
    assetPath,
    sceneId: story.scenes[0].id,
    exactPrompt,
    exactNegativePrompt,
    output,
    errors,
    io
  };
}

test("WF-09 AUTO connects Visual Direction, design, prompt materialization, cut markdown and image candidate in one command", async () => {
  const f = await createAutoFixture();
  const previousAdapter = process.env.VPF_IMAGE_ADAPTER_MODULE;
  const previousKey = process.env.IMAGE_PROVIDER_API_KEY;
  process.env.VPF_IMAGE_ADAPTER_MODULE = adapterPath;
  delete process.env.IMAGE_PROVIDER_API_KEY;
  try {
    assert.equal(await runUnifiedCli([
      "asset", "auto", "run", f.projectId,
      "--all",
      "--file", f.assetPath
    ], f.io, f.service), 0, f.errors.join("\n"));
    const result = lastJson(f.output);
    assert.equal(result.repinned, true);
    assert.equal(result.providerProfileVersion, "1.1.0");
    assert.equal(result.visualDirectionPlan.applied, true);
    assert.equal(result.visualDirectionPlan.grammarId, "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1");
    assert.equal(result.visualDirectionPlan.grammarVersion, "1.0.0");
    assert.equal(result.designedCount, 1);
    assert.equal(result.promptMaterializedCount, 1);
    assert.equal(result.promptMarkdownCount, 1);
    assert.equal(result.execution.completed, 1);
    assert.equal(result.execution.failed, 0);
    assert.equal(result.mirroredCandidateCount, 1);
    assert.equal(result.runtimeStatus.candidateAvailableCount, 1);
    assert.equal(result.runtimeStatus.approvedCount, 0);

    const current = await f.service.getStatus(f.projectId);
    const channelPin = current.resourcePins.find(pin => pin.resourceType === "CHANNEL_PROFILE");
    const visualBiblePin = current.resourcePins.find(pin =>
      pin.resourceType === "CHANNEL_VISUAL_BIBLE" && pin.resourceId === "HISTORY_MYSTERY_VISUAL_BIBLE"
    );
    const imagePin = current.resourcePins.find(pin =>
      pin.resourceType === "PROVIDER_PROFILE" && pin.resourceId === "IMAGE_PROVIDER_EXECUTION_V1"
    );
    assert.equal(channelPin?.version, "1.3.0");
    assert.equal(visualBiblePin?.version, "1.1.0");
    assert.equal(imagePin?.version, "1.1.0");
    assert.equal(current.project.versions.channelVisualBibleVersion, "1.1.0");
    assert.equal(current.project.revision, 2);

    const promptMd = await readFile(
      path.join(f.projectRoot, "05_images", "prompts", "cut_001.md"),
      "utf8"
    );
    assert.ok(promptMd.includes(f.exactPrompt));
    assert.ok(promptMd.includes(f.exactNegativePrompt));
    assert.ok(promptMd.includes("VISUAL DIRECTION:"));
    assert.ok(promptMd.includes(`scene_id: ${f.sceneId}`));
    assert.ok(promptMd.includes("provider_profile: IMAGE_PROVIDER_EXECUTION_V1@1.1.0"));

    const productionPlan = JSON.parse(await readFile(
      path.join(f.projectRoot, "05_images", "scene-assets.production-ready.json"),
      "utf8"
    ));
    const productionScene = productionPlan.scenes[0];
    assert.equal(productionPlan.visualDirectionDerivation.grammarId, "HISTORY_MYSTERY_VISUAL_DIRECTION_GRAMMAR_V1");
    assert.equal(productionScene.visualDirectionContext.resourceVersion, "1.1.0");
    assert.match(productionScene.imageAssetDesign.composition, /environment-first medium-wide\/wide/u);
    assert.match(productionScene.imageAssetDesign.composition, /central 60-70%/u);
    assert.match(productionScene.imagePrompt.prompt, /restrained painterly matte surface/u);

    const manifest = JSON.parse(await readFile(
      path.join(f.projectRoot, "05_images", "prompts", "manifest.json"),
      "utf8"
    ));
    assert.equal(manifest.entries.length, 1);
    assert.equal(manifest.entries[0].cutName, "cut_001");
    assert.equal(manifest.candidates.length, 1);
    assert.equal(manifest.candidates[0].relativePath, "05_images/generated/cut_001/candidate_001.png");
    await access(path.join(f.projectRoot, manifest.candidates[0].relativePath));

    const db = (await import("better-sqlite3")).default;
    const sqlite = new db(f.projectDbPath, { readonly: true });
    try {
      const job = sqlite.prepare(
        `SELECT input_payload_json, provider, provider_profile_version, status
         FROM provider_jobs
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE' AND job_type = 'IMAGE_GENERATION'`
      ).get(f.projectId) as any;
      const payload = JSON.parse(job.input_payload_json);
      assert.equal(payload.prompt, productionScene.imagePrompt.prompt);
      assert.equal(payload.negativePrompt, productionScene.imagePrompt.negativePrompt);
      assert.ok(payload.prompt.startsWith(f.exactPrompt));
      assert.ok(payload.negativePrompt.includes(f.exactNegativePrompt));
      assert.match(payload.prompt, /VISUAL DIRECTION:/u);
      assert.match(payload.negativePrompt, /readable generated historical text/u);
      assert.equal(job.provider, "CHATGPT_BROWSER");
      assert.equal(job.provider_profile_version, "1.1.0");
      assert.equal(job.status, "COMPLETE");
    } finally {
      sqlite.close();
    }

    const doctor = await f.service.doctor(f.projectId);
    assert.equal(doctor.healthy, true, JSON.stringify(doctor.diagnostics));

    assert.equal(await runUnifiedCli([
      "asset", "auto", "run", f.projectId,
      "--all",
      "--file", f.assetPath
    ], f.io, f.service), 0);
    const rerun = lastJson(f.output);
    assert.equal(rerun.repinned, false);
    assert.equal(rerun.execution.requested, 0);
    assert.equal(rerun.runtimeStatus.providerJobCount, 1);
    assert.equal(rerun.runtimeStatus.approvedCount, 0);

    assert.equal(await runUnifiedCli([
      "asset", "auto", "resume", f.projectId
    ], f.io, f.service), 0);
    const resumed = lastJson(f.output);
    assert.equal(resumed.retry, null);
    assert.equal(resumed.execution, null);
    assert.equal(resumed.runtimeStatus.candidateAvailableCount, 1);
  } finally {
    if (previousAdapter === undefined) delete process.env.VPF_IMAGE_ADAPTER_MODULE;
    else process.env.VPF_IMAGE_ADAPTER_MODULE = previousAdapter;
    if (previousKey === undefined) delete process.env.IMAGE_PROVIDER_API_KEY;
    else process.env.IMAGE_PROVIDER_API_KEY = previousKey;
  }
});
