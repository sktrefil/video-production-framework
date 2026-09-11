import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repositoryRoot, "cli", "vpf", "dist", "index.js");

const requiredDocs = [
  "docs/operations/PILOT_RUNBOOK_SHORTFORM.md",
  "docs/operations/PILOT_RUNBOOK_LONGFORM.md",
  "docs/operations/REAL_PROJECT_01_RUNBOOK.md",
  "docs/operations/PILOT_OPERATOR_CHECKLIST.md",
  "docs/operations/FAILURE_RETURN_MAP.md"
];

async function verifyDocs() {
  for (const relative of requiredDocs) {
    const text = await readFile(join(repositoryRoot, relative), "utf8");
    assert.match(text, /video-production-framework/u, `${relative} must identify the unified repository`);
    assert.doesNotMatch(
      text,
      /\bcd\s+[^\n]*(?:[\\/]|^)video-production(?:[\\/\s]|$)/iu,
      `${relative} must never instruct operators to change into the old repository`
    );
  }

  const short = await readFile(join(repositoryRoot, requiredDocs[0]), "utf8");
  const long = await readFile(join(repositoryRoot, requiredDocs[1]), "utf8");
  const real = await readFile(join(repositoryRoot, requiredDocs[2]), "utf8");
  const checklist = await readFile(join(repositoryRoot, requiredDocs[3]), "utf8");
  const failureMap = await readFile(join(repositoryRoot, requiredDocs[4]), "utf8");

  for (const [name, text] of [["SHORTFORM", short], ["LONGFORM", long]]) {
    for (const required of ["env check", "pilot preflight", "WF-17", "WF-18", "IMAGE_QC", "MANUAL_EXTERNAL"]) {
      assert.match(text, new RegExp(required.replace("-", "\\-"), "u"), `${name} runbook missing ${required}`);
    }
  }
  for (const required of ["REAL PROJECT 01", "WF-18", "pilot preflight"]) {
    assert.match(real, new RegExp(required, "u"));
  }
  for (const required of ["Repository", "Project", "Script / TTS", "Visual", "Clips", "Editor", "Final"]) {
    assert.match(checklist, new RegExp(required.replace("/", "\\/"), "u"));
  }
  for (const required of ["RESOURCE_HASH_MISMATCH", "RUNTIME_SECRET_MISSING", "IMAGE_QC", "TECHNICAL_QC", "owning MIG"]) {
    assert.match(failureMap, new RegExp(required, "u"));
  }
}

async function verifyCli() {
  const tempRoot = await mkdtemp(join(tmpdir(), "vpf-mig13-readiness-"));
  const workspaceRoot = join(tempRoot, "workspace");
  const adapterPath = join(tempRoot, "image-adapter.mjs");
  await writeFile(adapterPath, "export default { async generate() { throw new Error('readiness only'); } };\n");
  const env = {
    ...process.env,
    VPF_WORKSPACE_ROOT: workspaceRoot,
    ELEVENLABS_API_KEY: "mig13-ci-elevenlabs-secret",
    IMAGE_PROVIDER_API_KEY: "mig13-ci-image-secret",
    VPF_IMAGE_ADAPTER_MODULE: adapterPath
  };
  try {
    const environment = await execFileAsync(process.execPath, [
      cli, "env", "check", "--format", "shortform", "--min-free-gb", "0"
    ], {cwd: repositoryRoot, env});
    const envResult = JSON.parse(environment.stdout);
    assert.equal(envResult.ready, true);
    assert.equal(envResult.scope, "ENVIRONMENT");
    assert.doesNotMatch(environment.stdout, /mig13-ci-elevenlabs-secret|mig13-ci-image-secret/u);

    const created = await execFileAsync(process.execPath, [
      cli, "project", "create", "mig13_readiness_ci",
      "--title", "MIG-13 Pilot Readiness CI",
      "--format", "shortform"
    ], {cwd: repositoryRoot, env});
    assert.equal(JSON.parse(created.stdout).status, "CREATED");

    const preflight = await execFileAsync(process.execPath, [
      cli, "pilot", "preflight", "mig13_readiness_ci", "--min-free-gb", "0"
    ], {cwd: repositoryRoot, env});
    const result = JSON.parse(preflight.stdout);
    assert.equal(result.ready, true);
    assert.equal(result.scope, "PROJECT");
    assert.equal(result.projectId, "mig13_readiness_ci");
    assert.ok(result.resourcePins.every((pin) => pin.status === "CURRENT"));
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
}

await verifyDocs();
await verifyCli();
console.log("[pilot-readiness] PASS · runbooks/checklist/failure-map + env/project preflight");
