import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
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

async function preparedProject() {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf09b-cli-"));
  const projectId = "wf09b_short";
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
    "--title", "WF09B Short",
    "--format", "shortform"
  ], io, service), 0);
  const status = await service.getStatus(projectId);

  const scriptPath = path.join(status.projectRoot, "02_script", "final.txt");
  const storyPath = path.join(status.projectRoot, "02_script", "story.json");
  await writeFile(scriptPath, "The legion enters Eboracum.", "utf8");
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
        scriptSegment: "The legion enters Eboracum.",
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

  const stylePath = path.join(status.projectRoot, "04_visual_identity", "project-style.json");
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

  const assetPath = path.join(status.projectRoot, "05_images", "scene-assets.json");
  const exactPrompt = "Exact materialized Roman Britain image prompt for WF-09B.";
  const exactNegativePrompt = "fantasy armor, modern objects";
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
        composition: "Vertical 9:16 documentary frame.",
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

  assert.equal(await runUnifiedCli([
    "asset", "design", "apply", projectId,
    "--file", assetPath
  ], io, service), 0);
  assert.equal(await runUnifiedCli([
    "asset", "prompt", "materialize", projectId,
    "--file", assetPath
  ], io, service), 0);

  return {
    projectId,
    service,
    status,
    story,
    output,
    errors,
    io,
    exactPrompt,
    exactNegativePrompt
  };
}

test("WF-09B executes materialized prompt through Image Runtime and keeps candidate unapproved until QC", async () => {
  const f = await preparedProject();
  const previousAdapter = process.env.VPF_IMAGE_ADAPTER_MODULE;
  const previousKey = process.env.IMAGE_PROVIDER_API_KEY;
  process.env.VPF_IMAGE_ADAPTER_MODULE = adapterPath;
  process.env.IMAGE_PROVIDER_API_KEY = "test-only-secret";
  try {
    assert.equal(await runUnifiedCli([
      "asset", "runtime", "preflight", f.projectId
    ], f.io, f.service), 0);
    const preflight = lastJson(f.output);
    assert.equal(preflight.ready, true);
    assert.equal(preflight.assetCount, 1);
    assert.deepEqual(preflight.secretRequirements, ["IMAGE_PROVIDER_API_KEY"]);

    assert.equal(await runUnifiedCli([
      "asset", "runtime", "execute", f.projectId,
      "--all"
    ], f.io, f.service), 0);
    const execution = lastJson(f.output);
    assert.equal(execution.requested, 1);
    assert.equal(execution.completed, 1);
    assert.equal(execution.failed, 0);
    assert.equal(execution.results[0].jobStatus, "COMPLETE");
    assert.equal(execution.results[0].assetStatus, "CANDIDATE_AVAILABLE");

    assert.equal(await runUnifiedCli([
      "asset", "runtime", "status", f.projectId
    ], f.io, f.service), 0);
    let status = lastJson(f.output);
    assert.equal(status.assetCount, 1);
    assert.equal(status.candidateAvailableCount, 1);
    assert.equal(status.approvedCount, 0);
    assert.equal(status.completeJobCount, 1);
    assert.equal(status.assets[0].candidateMediaIds.length, 1);

    const providerJobId = status.jobs[0].id;
    const db = (await import("better-sqlite3")).default;
    const sqlite = new db(f.status.projectDbPath, { readonly: true });
    try {
      const row = sqlite.prepare(
        `SELECT input_payload_json FROM provider_jobs
         WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'`
      ).get(f.projectId, providerJobId) as { input_payload_json: string };
      const input = JSON.parse(row.input_payload_json);
      assert.equal(input.prompt, f.exactPrompt);
      assert.equal(input.negativePrompt, f.exactNegativePrompt);
      assert.equal(input.width, 864);
      assert.equal(input.height, 1536);
      assert.equal(input.aspectRatio, "9:16");
      assert.deepEqual(input.references, []);
      const media = sqlite.prepare(
        `SELECT width, height, media_status, source_job_id
         FROM media_artifacts WHERE project_id = ? AND source_job_id = ?`
      ).get(f.projectId, providerJobId) as any;
      assert.equal(media.width, 864);
      assert.equal(media.height, 1536);
      assert.equal(media.media_status, "AVAILABLE");
      assert.equal(media.source_job_id, providerJobId);
    } finally {
      sqlite.close();
    }

    const qcPath = path.join(f.status.projectRoot, "05_images", "image-qc.json");
    await writeFile(qcPath, JSON.stringify({
      results: [{
        sceneId: f.story.scenes[0].id,
        decision: {
          qcStatus: "PASS",
          severity: "MINOR",
          confidence: 0.99,
          recommendedAction: "APPROVE"
        }
      }]
    }, null, 2), "utf8");
    assert.equal(await runUnifiedCli([
      "asset", "qc", "apply", f.projectId,
      "--file", qcPath
    ], f.io, f.service), 0);
    const qc = lastJson(f.output);
    assert.equal(qc.qcCount, 1);
    assert.equal(qc.passCount, 1);
    assert.equal(qc.results[0].assetStatus, "NEEDS_REVIEW");

    assert.equal(await runUnifiedCli([
      "asset", "approve", f.projectId,
      "--all",
      "--approved-by", "operator"
    ], f.io, f.service), 0);
    const approved = lastJson(f.output);
    assert.equal(approved.approvedCount, 1);

    assert.equal(await runUnifiedCli([
      "asset", "runtime", "status", f.projectId
    ], f.io, f.service), 0);
    status = lastJson(f.output);
    assert.equal(status.approvedCount, 1);
    assert.equal(status.assets[0].approvedMediaId, status.assets[0].candidateMediaIds[0]);
  } finally {
    if (previousAdapter === undefined) delete process.env.VPF_IMAGE_ADAPTER_MODULE;
    else process.env.VPF_IMAGE_ADAPTER_MODULE = previousAdapter;
    if (previousKey === undefined) delete process.env.IMAGE_PROVIDER_API_KEY;
    else process.env.IMAGE_PROVIDER_API_KEY = previousKey;
  }
});

test("WF-09B preflight refuses to mutate assets when adapter or required secret is missing", async () => {
  const f = await preparedProject();
  const previousAdapter = process.env.VPF_IMAGE_ADAPTER_MODULE;
  const previousKey = process.env.IMAGE_PROVIDER_API_KEY;
  delete process.env.VPF_IMAGE_ADAPTER_MODULE;
  delete process.env.IMAGE_PROVIDER_API_KEY;
  try {
    assert.equal(await runUnifiedCli([
      "asset", "runtime", "preflight", f.projectId
    ], f.io, f.service), 1);
    assert.match(f.errors.at(-1)!, /WF09B_SECRET_REQUIRED|WF09B_ADAPTER_REQUIRED/);

    assert.equal(await runUnifiedCli([
      "asset", "runtime", "status", f.projectId
    ], f.io, f.service), 0);
    const status = lastJson(f.output);
    assert.equal(status.providerJobCount, 0);
    assert.equal(status.assets[0].assetStatus, "DESIGNED");
  } finally {
    if (previousAdapter === undefined) delete process.env.VPF_IMAGE_ADAPTER_MODULE;
    else process.env.VPF_IMAGE_ADAPTER_MODULE = previousAdapter;
    if (previousKey === undefined) delete process.env.IMAGE_PROVIDER_API_KEY;
    else process.env.IMAGE_PROVIDER_API_KEY = previousKey;
  }
});
