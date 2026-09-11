import assert from "node:assert/strict";
import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {ProjectBootstrapService} from "@vpf/project-bootstrap";
import {PilotReadinessService} from "../src/pilot-readiness.js";
import {runCli} from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function readinessFixture(overrides: NodeJS.ProcessEnv = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-pilot-readiness-"));
  const workspaceRoot = path.join(root, "workspace");
  const adapterPath = path.join(root, "image-adapter.mjs");
  await mkdir(workspaceRoot, {recursive: true});
  await writeFile(adapterPath, "export default { async generate() { throw new Error('pilot preflight only'); } };\n");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VPF_WORKSPACE_ROOT: workspaceRoot,
    ELEVENLABS_API_KEY: "secret-elevenlabs-test-value",
    IMAGE_PROVIDER_API_KEY: "secret-image-test-value",
    VPF_IMAGE_ADAPTER_MODULE: adapterPath,
    ...overrides
  };
  const bootstrap = new ProjectBootstrapService({
    repositoryRoot,
    workspaceRoot,
    env,
    clock: {nowIso: () => "2026-09-11T00:10:00.000Z"}
  });
  const readiness = new PilotReadinessService(bootstrap, {
    repositoryRoot,
    workspaceRoot,
    env,
    minimumFreeBytes: {SHORTFORM: 1n, LONGFORM: 1n}
  });
  return {root, workspaceRoot, adapterPath, env, bootstrap, readiness};
}

test("environment preflight resolves canonical providers without exposing secret values", async () => {
  const f = await readinessFixture();
  const result = await f.readiness.checkEnvironment("shortform");
  assert.equal(result.ready, true);
  assert.equal(result.format, "SHORTFORM");
  assert.ok(result.providers.some(provider => provider.provider === "ELEVENLABS"));
  assert.ok(result.providers.some(provider => provider.provider === "IMAGE_PROVIDER"));
  assert.ok(result.providers.some(provider => provider.provider === "GOOGLE_FLOW"));
  assert.ok(result.providers.every(provider => provider.missingSecretNames.length === 0));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-elevenlabs-test-value/u);
  assert.doesNotMatch(serialized, /secret-image-test-value/u);
});

test("project preflight requires doctor, current pins, storage and runtime secrets", async () => {
  const f = await readinessFixture();
  await f.bootstrap.createProject({projectId: "pilot_ready", title: "Pilot Ready", format: "longform"});
  const result = await f.readiness.checkProject("pilot_ready");
  assert.equal(result.ready, true);
  assert.equal(result.format, "LONGFORM");
  assert.ok(result.resourcePins.length > 0);
  assert.ok(result.resourcePins.every(pin => pin.status === "CURRENT"));
  assert.equal(result.checks.find(item => item.code === "PROJECT_DOCTOR")?.status, "PASS");
  assert.equal(result.checks.find(item => item.code === "UNIFIED_PROJECT_POLICY")?.status, "PASS");
});

test("environment preflight is NO-GO when an automated provider secret is missing", async () => {
  const f = await readinessFixture({ELEVENLABS_API_KEY: ""});
  const result = await f.readiness.checkEnvironment("shortform");
  assert.equal(result.ready, false);
  const provider = result.providers.find(item => item.provider === "ELEVENLABS");
  assert.equal(provider?.status, "MISSING_SECRET");
  assert.deepEqual(provider?.missingSecretNames, ["ELEVENLABS_API_KEY"]);
});

test("environment preflight blocks a legacy image adapter path before pilot execution", async () => {
  const f = await readinessFixture({VPF_IMAGE_ADAPTER_MODULE: path.join(tmpdir(), "video-production", "adapter.mjs")});
  const result = await f.readiness.checkEnvironment("longform");
  assert.equal(result.ready, false);
  assert.equal(result.checks.find(item => item.code === "IMAGE_ADAPTER_MODULE")?.status, "FAIL");
});

test("CLI env check and pilot preflight return machine-readable GO results", async () => {
  const f = await readinessFixture();
  const output: string[] = [];
  const errors: string[] = [];
  const io = {
    out: (message: string) => output.push(message),
    error: (message: string) => errors.push(message)
  };

  assert.equal(await runCli([
    "env", "check", "--format", "shortform", "--min-free-gb", "0"
  ], io, f.bootstrap, f.readiness), 0);
  const envResult = JSON.parse(output.at(-1)!) as {ready: boolean; scope: string};
  assert.equal(envResult.ready, true);
  assert.equal(envResult.scope, "ENVIRONMENT");

  await f.bootstrap.createProject({projectId: "pilot_cli", title: "Pilot CLI", format: "shortform"});
  assert.equal(await runCli([
    "pilot", "preflight", "pilot_cli", "--min-free-gb", "0"
  ], io, f.bootstrap, f.readiness), 0);
  const projectResult = JSON.parse(output.at(-1)!) as {ready: boolean; scope: string; projectId: string};
  assert.equal(projectResult.ready, true);
  assert.equal(projectResult.scope, "PROJECT");
  assert.equal(projectResult.projectId, "pilot_cli");
  assert.deepEqual(errors, []);
});
