import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
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

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf09-reset-"));
  const projectId = "wf09_reset_short";
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
    "--title", "WF09 Reset Short",
    "--format", "shortform"
  ], io, service), 0, errors.join("\n"));
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
  ], io, service), 0, errors.join("\n"));
  const script = lastJson(output);
  assert.equal(await runUnifiedCli([
    "script", "approve", projectId, script.id,
    "--approved-by", "operator"
  ], io, service), 0, errors.join("\n"));
  assert.equal(await runUnifiedCli([
    "story", "generate", projectId,
    "--plan", storyPath
  ], io, service), 0, errors.join("\n"));
  const story = lastJson(output);
  assert.equal(await runUnifiedCli([
    "story", "approve-scenes", projectId,
    "--all",
    "--approved-by", "operator"
  ], io, service), 0, errors.join("\n"));

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
  ], io, service), 0, errors.join("\n"));
  assert.equal(await runUnifiedCli([
    "visual", "style", "approve", projectId,
    "--approved-by", "operator"
  ], io, service), 0, errors.join("\n"));

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
        prompt: "Exact reset fixture Roman Britain image prompt.",
        negativePrompt: "fantasy armor, modern objects"
      }
    }]
  }, null, 2), "utf8");

  assert.equal(await runUnifiedCli([
    "asset", "design", "apply", projectId,
    "--file", assetPath
  ], io, service), 0, errors.join("\n"));
  assert.equal(await runUnifiedCli([
    "asset", "prompt", "materialize", projectId,
    "--file", assetPath
  ], io, service), 0, errors.join("\n"));

  return {
    projectId,
    service,
    projectRoot: created.projectRoot,
    projectDbPath: created.projectDbPath,
    assetPath,
    output,
    errors,
    io
  };
}

test("explicit pre-VDG reset preserves history, archives bytes and permits VDG reprepare", async () => {
  const f = await createFixture();
  const previousAdapter = process.env.VPF_IMAGE_ADAPTER_MODULE;
  const previousKey = process.env.IMAGE_PROVIDER_API_KEY;
  process.env.VPF_IMAGE_ADAPTER_MODULE = adapterPath;
  delete process.env.IMAGE_PROVIDER_API_KEY;

  try {
    assert.equal(await runUnifiedCli([
      "asset", "auto", "prepare", f.projectId,
      "--all", "--file", f.assetPath
    ], f.io, f.service), 0, f.errors.join("\n"));
    assert.equal(await runUnifiedCli([
      "asset", "auto", "run", f.projectId,
      "--all", "--file", f.assetPath
    ], f.io, f.service), 0, f.errors.join("\n"));

    assert.equal(await runUnifiedCli([
      "asset", "runtime", "status", f.projectId
    ], f.io, f.service), 0, f.errors.join("\n"));
    const generated = lastJson(f.output);
    assert.equal(generated.providerJobCount, 1);
    assert.equal(generated.candidateAvailableCount, 1);
    const assetId = generated.assets[0].assetId;
    const mediaId = generated.assets[0].candidateMediaIds[0];

    const Database = (await import("better-sqlite3")).default;
    const sqlite = new Database(f.projectDbPath);
    let originalRelativePath = "";
    try {
      const media = sqlite.prepare(`
        SELECT relative_path
        FROM media_artifacts
        WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
      `).get(f.projectId, mediaId) as { relative_path: string };
      originalRelativePath = media.relative_path;

      // Simulate the actual Roman IX boundary discovered by the pilot: an
      // image job/candidate exists, but the active design itself predates VDG.
      sqlite.prepare(`
        UPDATE production_assets
        SET composition = 'Pre-VDG composition',
            image_prompt = 'Pre-VDG prompt'
        WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'
      `).run(f.projectId, assetId);
    } finally {
      sqlite.close();
    }
    await access(path.join(f.projectRoot, originalRelativePath));

    assert.equal(await runUnifiedCli([
      "asset", "auto", "reset-pre-vdg", f.projectId
    ], f.io, f.service), 0, f.errors.join("\n"));
    const reset = lastJson(f.output);
    assert.equal(reset.reset, true);
    assert.equal(reset.reason, "PRE_VDG_PROVIDER_STATE_SUPERSEDED");
    assert.equal(reset.supersededProviderJobCount, 1);
    assert.equal(reset.supersededMediaCount, 1);
    assert.equal(reset.archivedFiles.length, 1);
    await access(path.join(f.projectRoot, reset.archivedFiles[0]));

    assert.equal(await runUnifiedCli([
      "asset", "runtime", "status", f.projectId
    ], f.io, f.service), 0, f.errors.join("\n"));
    const afterReset = lastJson(f.output);
    assert.equal(afterReset.providerJobCount, 0);
    assert.equal(afterReset.candidateAvailableCount, 0);
    assert.equal(afterReset.assets[0].assetStatus, "DESIGNED");
    assert.deepEqual(afterReset.assets[0].candidateMediaIds, []);

    const audit = new Database(f.projectDbPath, { readonly: true });
    try {
      const supersededJobs = (audit.prepare(`
        SELECT COUNT(*) AS count FROM provider_jobs
        WHERE project_id = ? AND job_type = 'IMAGE_GENERATION' AND lifecycle_status = 'SUPERSEDED'
      `).get(f.projectId) as { count: number }).count;
      const supersededMedia = (audit.prepare(`
        SELECT COUNT(*) AS count FROM media_artifacts
        WHERE project_id = ? AND media_type = 'IMAGE' AND lifecycle_status = 'SUPERSEDED'
      `).get(f.projectId) as { count: number }).count;
      const receipts = (audit.prepare(`
        SELECT COUNT(*) AS count FROM runtime_execution_receipts
        WHERE project_id = ?
      `).get(f.projectId) as { count: number }).count;
      assert.ok(supersededJobs >= 1);
      assert.ok(supersededMedia >= 1);
      assert.ok(receipts >= 1, "Runtime receipts must remain immutable audit history.");
    } finally {
      audit.close();
    }

    assert.equal(await runUnifiedCli([
      "asset", "auto", "prepare", f.projectId,
      "--all", "--file", f.assetPath
    ], f.io, f.service), 0, f.errors.join("\n"));
    const reprepared = lastJson(f.output);
    assert.equal(reprepared.visualDirectionRefresh.refreshed, true);
    assert.equal(reprepared.visualDirectionRefresh.reason, "MIGRATED_PRE_GRAMMAR_DESIGNS");
    assert.equal(reprepared.wf09Status.providerJobCount, 0);
    assert.equal(reprepared.wf09Status.assets[0].assetStatus, "DESIGNED");
    assert.match(reprepared.wf09Status.assets[0].design.composition, /VISUAL DIRECTION:/u);
    assert.match(reprepared.wf09Status.assets[0].design.imagePrompt, /VISUAL DIRECTION:/u);
  } finally {
    if (previousAdapter === undefined) delete process.env.VPF_IMAGE_ADAPTER_MODULE;
    else process.env.VPF_IMAGE_ADAPTER_MODULE = previousAdapter;
    if (previousKey === undefined) delete process.env.IMAGE_PROVIDER_API_KEY;
    else process.env.IMAGE_PROVIDER_API_KEY = previousKey;
  }
});
