import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPackageRoot = fileURLToPath(new URL("../", import.meta.url));

async function execCli(args: string[], env: NodeJS.ProcessEnv) {
  return execFileAsync(process.execPath, [path.join(cliPackageRoot, "dist", "index.js"), ...args], { env });
}

test("compiled vpf binary executes WF-07 FINAL script and story generation against project.db", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-wf07-binary-"));
  const workspaceRoot = path.join(root, "workspace");
  const env = { ...process.env, VPF_WORKSPACE_ROOT: workspaceRoot };

  const createdRun = await execCli([
    "project", "create", "wf07_binary",
    "--title", "WF07 Binary",
    "--format", "shortform"
  ], env);
  const created = JSON.parse(createdRun.stdout) as any;
  assert.equal(created.status, "CREATED");

  const scriptPath = path.join(created.projectRoot, "02_script", "final.txt");
  const planPath = path.join(created.projectRoot, "02_script", "story-plan.json");
  await writeFile(scriptPath, "A lantern appeared. The door opened.", "utf8");
  await writeFile(planPath, JSON.stringify({
    structure: { chapters: [{ key: "ch1", displayNumber: 1, title: "Hook" }] },
    sequences: { sequences: [{
      key: "seq1",
      chapterKey: "ch1",
      displayNumber: 1,
      title: "Hook",
      storyPurpose: "HOOK"
    }] },
    scenes: { scenes: [
      {
        key: "sc1",
        sequenceKey: "seq1",
        displayNumber: 1,
        scriptSegment: "A lantern appeared.",
        stateIn: "darkness",
        stateCurrent: "lantern visible",
        stateOut: "attention on door",
        primaryVisualIdea: "A lantern emerges from darkness",
        mustBeSeen: ["lantern"],
        canBeNarrated: [],
        canBeImplied: [],
        requiredIdentityAnchorIds: []
      },
      {
        key: "sc2",
        sequenceKey: "seq1",
        displayNumber: 2,
        scriptSegment: "The door opened.",
        stateIn: "door closed",
        stateCurrent: "door opening",
        stateOut: "door open",
        primaryVisualIdea: "An old door opens",
        mustBeSeen: ["door"],
        canBeNarrated: [],
        canBeImplied: [],
        requiredIdentityAnchorIds: []
      }
    ] }
  }, null, 2), "utf8");

  const scriptRun = await execCli([
    "script", "create", "wf07_binary",
    "--file", scriptPath,
    "--kind", "FINAL"
  ], env);
  const script = JSON.parse(scriptRun.stdout) as any;
  assert.equal(script.kind, "FINAL");

  const approvalRun = await execCli([
    "script", "approve", "wf07_binary", script.id,
    "--approved-by", "binary-test"
  ], env);
  const approval = JSON.parse(approvalRun.stdout) as any;
  assert.equal(approval.approval.approvalState, "HUMAN_APPROVED");

  const generatedRun = await execCli([
    "story", "generate", "wf07_binary",
    "--plan", planPath
  ], env);
  const generated = JSON.parse(generatedRun.stdout) as any;
  assert.equal(generated.sceneCount, 2);

  await execCli(["story", "approve-structure", "wf07_binary"], env);
  await execCli(["story", "approve-scenes", "wf07_binary", "--all"], env);

  const statusRun = await execCli(["story", "status", "wf07_binary"], env);
  const status = JSON.parse(statusRun.stdout) as any;
  assert.equal(status.chapters.length, 1);
  assert.equal(status.sequences.length, 1);
  assert.equal(status.scenes.length, 2);
  assert.ok(status.scenes.every((scene: any) => scene.sceneStatus === "APPROVED"));
});
