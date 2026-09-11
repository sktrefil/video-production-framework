import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { runCli } from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function fixture(projectId = "wf07_short") {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf07-cli-"));
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
    "--title", "WF07 Short",
    "--format", "shortform"
  ], io, service), 0);
  const status = await service.getStatus(projectId);
  return { service, output, errors, io, status, projectId };
}

function parseLast(output: string[]): any {
  return JSON.parse(output.at(-1)!);
}

test("WF-07 CLI persists research, facts, FINAL script and approved story in project.db", async () => {
  const f = await fixture();

  assert.equal(await runCli([
    "research", "add", f.projectId,
    "--title", "Primary source",
    "--type", "WEB",
    "--url", "https://example.com/history"
  ], f.io, f.service), 0);
  const source = parseLast(f.output);
  assert.match(source.id, /^src_/);

  assert.equal(await runCli([
    "fact", "add", f.projectId,
    "--classification", "FACT",
    "--statement", "The bell rang before the gate opened.",
    "--source", source.id
  ], f.io, f.service), 0);
  const fact = parseLast(f.output);
  assert.equal(fact.status, "DRAFT");

  assert.equal(await runCli([
    "fact", "approve", f.projectId, fact.id
  ], f.io, f.service), 0);
  assert.equal(parseLast(f.output).status, "APPROVED");

  const draftPath = path.join(f.status.projectRoot, "02_script", "draft.txt");
  const finalPath = path.join(f.status.projectRoot, "02_script", "final.txt");
  const planPath = path.join(f.status.projectRoot, "02_script", "story-plan.json");
  await writeFile(draftPath, "The bell rang. The gate opened.", "utf8");
  await writeFile(finalPath, "The bell rang. The gate opened.", "utf8");

  assert.equal(await runCli([
    "script", "create", f.projectId,
    "--file", draftPath
  ], f.io, f.service), 0);
  const draft = parseLast(f.output);
  assert.equal(draft.kind, "DRAFT");

  assert.equal(await runCli([
    "script", "approve", f.projectId, draft.id
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /FINAL_SCRIPT_REQUIRED/);

  assert.equal(await runCli([
    "script", "revise", f.projectId, draft.id,
    "--file", finalPath,
    "--kind", "FINAL"
  ], f.io, f.service), 0);
  const finalScript = parseLast(f.output);
  assert.equal(finalScript.kind, "FINAL");
  assert.equal(finalScript.revision, 2);

  const plan = {
    structure: {
      chapters: [
        { key: "ch1", displayNumber: 1, title: "Mystery" }
      ]
    },
    sequences: {
      sequences: [
        {
          key: "seq1",
          chapterKey: "ch1",
          displayNumber: 1,
          title: "Hook",
          storyPurpose: "HOOK"
        }
      ]
    },
    scenes: {
      scenes: [
        {
          key: "sc1",
          sequenceKey: "seq1",
          displayNumber: 1,
          scriptSegment: "The bell rang.",
          stateIn: "Quiet courtyard",
          stateCurrent: "Bell ringing",
          stateOut: "Attention shifts to gate",
          primaryVisualIdea: "A bell swings above a dark gate",
          mustBeSeen: ["bell"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        },
        {
          key: "sc2",
          sequenceKey: "seq1",
          displayNumber: 2,
          scriptSegment: "The gate opened.",
          stateIn: "Closed gate",
          stateCurrent: "Gate opening",
          stateOut: "Open passage",
          primaryVisualIdea: "The gate opens into darkness",
          mustBeSeen: ["gate"],
          canBeNarrated: [],
          canBeImplied: [],
          requiredIdentityAnchorIds: []
        }
      ]
    }
  };
  await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

  assert.equal(await runCli([
    "story", "generate", f.projectId,
    "--plan", planPath
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /FINAL_SCRIPT_APPROVAL_REQUIRED/);

  assert.equal(await runCli([
    "script", "approve", f.projectId, finalScript.id,
    "--approved-by", "operator"
  ], f.io, f.service), 0);

  assert.equal(await runCli([
    "story", "generate", f.projectId,
    "--plan", planPath
  ], f.io, f.service), 0);
  const generated = parseLast(f.output);
  assert.equal(generated.chapterCount, 1);
  assert.equal(generated.sequenceCount, 1);
  assert.equal(generated.sceneCount, 2);

  assert.equal(await runCli([
    "story", "approve-structure", f.projectId,
    "--approved-by", "operator"
  ], f.io, f.service), 0);

  assert.equal(await runCli([
    "story", "approve-scenes", f.projectId,
    "--all",
    "--approved-by", "operator"
  ], f.io, f.service), 0);

  assert.equal(await runCli([
    "story", "status", f.projectId
  ], f.io, f.service), 0);
  const story = parseLast(f.output);
  assert.equal(story.facts.length, 1);
  assert.equal(story.scripts.length, 2);
  assert.equal(story.chapters.length, 1);
  assert.equal(story.sequences.length, 1);
  assert.equal(story.scenes.length, 2);
  assert.equal(story.structureApproval.approvalState, "HUMAN_APPROVED");
  assert.ok(story.scenes.every((scene: any) => scene.sceneStatus === "APPROVED"));
  assert.ok(story.scenes.every((scene: any) => scene.approval?.approvalState === "HUMAN_APPROVED"));
});

test("WF-07 CLI blocks unsupported or unsafe inputs without weakening story contracts", async () => {
  const f = await fixture("wf07_negative");

  assert.equal(await runCli([
    "fact", "add", f.projectId,
    "--classification", "FACT",
    "--statement", "A sourced fact is required."
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /FACT_SOURCE_REQUIRED/);

  const outside = path.join(path.dirname(f.status.projectRoot), "outside.txt");
  await writeFile(outside, "Outside project", "utf8");
  assert.equal(await runCli([
    "script", "create", f.projectId,
    "--file", outside
  ], f.io, f.service), 1);
  assert.match(f.errors.at(-1)!, /WF07_INPUT_PATH/);

  assert.equal(await runCli([
    "research", "add", f.projectId,
    "--title", "A citation may mention video-production/run.py as prose",
    "--type", "WEB",
    "--url", "https://example.com/video-production/run.py"
  ], f.io, f.service), 0);
});

test("approving a new FINAL script revision stales existing story structure instead of deleting history", async () => {
  const f = await fixture("wf07_stale");
  const finalPath = path.join(f.status.projectRoot, "02_script", "final.txt");
  const revisedPath = path.join(f.status.projectRoot, "02_script", "revised.txt");
  const planPath = path.join(f.status.projectRoot, "02_script", "story-plan.json");
  await writeFile(finalPath, "First sentence. Second sentence.", "utf8");
  await writeFile(revisedPath, "First sentence. Second sentence. Third sentence.", "utf8");
  await writeFile(planPath, JSON.stringify({
    structure: { chapters: [{ key: "ch1", displayNumber: 1, title: "One" }] },
    sequences: { sequences: [{ key: "seq1", chapterKey: "ch1", displayNumber: 1, title: "One", storyPurpose: "HOOK" }] },
    scenes: { scenes: [
      {
        key: "sc1", sequenceKey: "seq1", displayNumber: 1,
        scriptSegment: "First sentence.",
        stateIn: "before", stateCurrent: "during", stateOut: "after",
        primaryVisualIdea: "first", mustBeSeen: [], canBeNarrated: [], canBeImplied: [], requiredIdentityAnchorIds: []
      },
      {
        key: "sc2", sequenceKey: "seq1", displayNumber: 2,
        scriptSegment: "Second sentence.",
        stateIn: "before2", stateCurrent: "during2", stateOut: "after2",
        primaryVisualIdea: "second", mustBeSeen: [], canBeNarrated: [], canBeImplied: [], requiredIdentityAnchorIds: []
      }
    ] }
  }, null, 2), "utf8");

  assert.equal(await runCli(["script", "create", f.projectId, "--file", finalPath, "--kind", "FINAL"], f.io, f.service), 0);
  const script = parseLast(f.output);
  assert.equal(await runCli(["script", "approve", f.projectId, script.id], f.io, f.service), 0);
  assert.equal(await runCli(["story", "generate", f.projectId, "--plan", planPath], f.io, f.service), 0);

  assert.equal(await runCli([
    "script", "revise", f.projectId, script.id,
    "--file", revisedPath,
    "--kind", "FINAL"
  ], f.io, f.service), 0);
  assert.equal(await runCli(["script", "approve", f.projectId, script.id], f.io, f.service), 0);
  const approval = parseLast(f.output);
  assert.equal(approval.impact.requiresStructureReview, true);

  assert.equal(await runCli(["story", "status", f.projectId], f.io, f.service), 0);
  const story = parseLast(f.output);
  assert.equal(story.chapters[0].stale, true);
  assert.equal(story.sequences[0].stale, true);
  assert.equal(story.scenes.length, 2);
});
