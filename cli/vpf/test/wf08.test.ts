import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { runCli } from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function parseLast(output: string[]): any {
  return JSON.parse(output.at(-1)!);
}

async function fixture(projectId = "wf08_short") {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf08-cli-"));
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

  assert.equal(await runCli([
    "project", "create", projectId,
    "--title", "WF08 Short",
    "--format", "shortform"
  ], io, service), 0);
  const status = await service.getStatus(projectId);

  const finalPath = path.join(status.projectRoot, "02_script", "final.txt");
  const planPath = path.join(status.projectRoot, "02_script", "story-plan.json");
  await writeFile(finalPath, "A legion enters the fort. The same fort remains after the record ends.", "utf8");
  await writeFile(planPath, JSON.stringify({
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
          scriptSegment: "A legion enters the fort.",
          stateIn: "Fort exterior",
          stateCurrent: "Legion entering",
          stateOut: "Fort occupied",
          primaryVisualIdea: "Roman soldiers enter a northern fort",
          mustBeSeen: ["Roman fort", "legionaries"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "sc2",
          sequenceKey: "seq1",
          displayNumber: 2,
          scriptSegment: "The same fort remains after the record ends.",
          stateIn: "Occupied fort",
          stateCurrent: "Empty fort",
          stateOut: "Historical uncertainty",
          primaryVisualIdea: "The same Roman fort stands under an overcast sky",
          mustBeSeen: ["same Roman fort"],
          canBeNarrated: [],
          canBeImplied: ["uncertain fate"],
          requiredIdentityAnchorIds: []
        }
      ]
    }
  }, null, 2), "utf8");

  assert.equal(await runCli([
    "script", "create", projectId,
    "--file", finalPath,
    "--kind", "FINAL"
  ], io, service), 0);
  const script = parseLast(output);
  assert.equal(await runCli([
    "script", "approve", projectId, script.id,
    "--approved-by", "operator"
  ], io, service), 0);
  assert.equal(await runCli([
    "story", "generate", projectId,
    "--plan", planPath
  ], io, service), 0);
  const story = parseLast(output);

  return { service, output, errors, io, status, projectId, story };
}

function projectStyle() {
  return {
    eraRegion: "Roman Britain, early second century CE",
    visualApproach: "evidence-led cinematic historical reconstruction",
    realismLevel: "grounded historical realism with explicit uncertainty",
    colorLanguage: "muted stone, iron, leather and cold northern earth tones",
    lightingLanguage: "soft overcast daylight with restrained dramatic contrast",
    materialLanguage: "weathered stone, timber, iron, wool and leather",
    environmentLanguage: "wind-exposed Roman military landscapes in northern Britain",
    characterRenderingPrinciple: "natural human proportions, period-correct equipment, no heroic fantasy exaggeration",
    cameraCompositionTendency: "documentary-wide establishing frames mixed with evidence-focused close details",
    moodRange: ["investigative", "austere", "uncertain"],
    factualConstraints: ["distinguish archaeological evidence from reconstruction"],
    avoidances: ["fantasy armor", "modern objects", "unsupported certainty"]
  };
}

test("WF-08 CLI applies and approves Project Style and Identity Anchors in project.db", async () => {
  const f = await fixture();
  const stylePath = path.join(f.status.projectRoot, "04_visual_identity", "project-style.json");
  const anchorsPath = path.join(f.status.projectRoot, "04_visual_identity", "identity-anchors.json");
  await writeFile(stylePath, JSON.stringify(projectStyle(), null, 2), "utf8");

  assert.equal(await runCli([
    "visual", "style", "apply", f.projectId,
    "--file", stylePath
  ], f.io, f.service), 0);
  const style = parseLast(f.output);
  assert.match(style.id, /^sty_/);
  assert.equal(style.revision, 1);
  assert.equal(style.stale, false);

  assert.equal(await runCli([
    "visual", "style", "approve", f.projectId,
    "--approved-by", "operator"
  ], f.io, f.service), 0);
  assert.equal(parseLast(f.output).approvalState, "HUMAN_APPROVED");

  const sceneIds = f.story.scenes.map((scene: any) => scene.id);
  await writeFile(anchorsPath, JSON.stringify({
    anchors: [{
      key: "northern-fort",
      anchorType: "LOCATION",
      name: "Northern Roman Fort",
      rationale: "The same fort must remain visually stable across evidence and mystery scenes.",
      continuityReason: "RECURRING",
      productionPriority: "CRITICAL",
      requiredBySceneIds: sceneIds,
      specification: {
        locked: ["same gate geometry", "same wall masonry", "same surrounding terrain silhouette"],
        contextual: ["weather", "soldier activity", "evidence overlays"],
        temporary: ["mist", "mud", "foreground props"]
      }
    }]
  }, null, 2), "utf8");

  assert.equal(await runCli([
    "visual", "anchors", "apply", f.projectId,
    "--file", anchorsPath
  ], f.io, f.service), 0);
  const anchors = parseLast(f.output);
  assert.equal(anchors.length, 1);
  assert.match(anchors[0].id, /^anc_/);
  assert.deepEqual(anchors[0].requiredBySceneIds, sceneIds);

  assert.equal(await runCli([
    "visual", "anchors", "approve", f.projectId,
    "--all",
    "--approved-by", "operator"
  ], f.io, f.service), 0);
  const approvals = parseLast(f.output);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].approvalState, "HUMAN_APPROVED");

  assert.equal(await runCli([
    "visual", "status", f.projectId
  ], f.io, f.service), 0);
  const visual = parseLast(f.output);
  assert.equal(visual.projectStyle.approval.approvalState, "HUMAN_APPROVED");
  assert.equal(visual.identityAnchors.length, 1);
  assert.equal(visual.identityAnchors[0].approval.approvalState, "HUMAN_APPROVED");
  assert.equal(visual.readiness.projectStyleApproved, true);
  assert.equal(visual.readiness.missingApprovalAnchorIds.length, 0);
  assert.equal(visual.readiness.staleAnchorIds.length, 0);
  assert.equal(visual.readiness.ready, true);
});

test("WF-08 CLI preserves approval ordering and project workspace isolation", async () => {
  const f = await fixture("wf08_negative");
  const stylePath = path.join(f.status.projectRoot, "04_visual_identity", "project-style.json");
  const anchorsPath = path.join(f.status.projectRoot, "04_visual_identity", "identity-anchors.json");
  await writeFile(stylePath, JSON.stringify(projectStyle(), null, 2), "utf8");
  await writeFile(anchorsPath, JSON.stringify({ anchors: [] }, null, 2), "utf8");

  assert.equal(await runCli([
    "visual", "style", "apply", f.projectId,
    "--file", stylePath
  ], f.io, f.service), 0);

  assert.equal(await runCli([
    "visual", "anchors", "apply", f.projectId,
    "--file", anchorsPath
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /PROJECT_STYLE_APPROVAL_REQUIRED/);

  const outside = path.join(path.dirname(f.status.projectRoot), "outside-project-style.json");
  await writeFile(outside, JSON.stringify(projectStyle()), "utf8");
  assert.equal(await runCli([
    "visual", "style", "apply", f.projectId,
    "--file", outside
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /WF08_INPUT_PATH/);
});

test("WF-08 CLI rejects malformed decision files before persistence", async () => {
  const f = await fixture("wf08_invalid");
  const stylePath = path.join(f.status.projectRoot, "04_visual_identity", "project-style.json");
  await writeFile(stylePath, JSON.stringify({
    ...projectStyle(),
    moodRange: []
  }, null, 2), "utf8");

  assert.equal(await runCli([
    "visual", "style", "apply", f.projectId,
    "--file", stylePath
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /WF08_INPUT_INVALID/);

  assert.equal(await runCli([
    "visual", "status", f.projectId
  ], f.io, f.service), 0);
  assert.equal(parseLast(f.output).projectStyle, null);
});
