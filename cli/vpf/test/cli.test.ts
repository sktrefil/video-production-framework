import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { runCli } from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "vpf-cli-"));
  const service = new ProjectBootstrapService({
    repositoryRoot,
    workspaceRoot: path.join(root, "workspace"),
    clock: { nowIso: () => "2026-09-10T05:30:00.000Z" }
  });
  const output: string[] = [];
  const errors: string[] = [];
  return {
    service,
    output,
    errors,
    io: {
      out: (message: string) => output.push(message),
      error: (message: string) => errors.push(message)
    }
  };
}

test("CLI creates SHORTFORM and reports status from project.db", async () => {
  const f = await fixture();
  assert.equal(await runCli([
    "project", "create", "cli_short",
    "--title", "CLI Short",
    "--format", "shortform"
  ], f.io, f.service), 0);

  assert.equal(await runCli([
    "project", "status", "cli_short"
  ], f.io, f.service), 0);

  const status = JSON.parse(f.output.at(-1)!) as any;
  assert.equal(status.projectId, "cli_short");
  assert.equal(status.format, "SHORTFORM");
  assert.equal(status.pipeline, "VPF_UNIFIED_V1");
  assert.equal(status.legacyAllowed, false);
});

test("CLI creates LONGFORM and doctor returns healthy", async () => {
  const f = await fixture();
  assert.equal(await runCli([
    "project", "create", "cli_long",
    "--title", "CLI Long",
    "--format", "longform"
  ], f.io, f.service), 0);
  assert.equal(await runCli(["doctor", "cli_long"], f.io, f.service), 0);

  const doctor = JSON.parse(f.output.at(-1)!) as any;
  assert.equal(doctor.healthy, true);
});

test("future unified commands fail explicitly as NOT_IMPLEMENTED", async () => {
  const f = await fixture();
  const code = await runCli(["run", "demo", "--to", "tts"], f.io, f.service);
  assert.equal(code, 2);
  assert.match(f.errors.at(-1)!, /NOT_IMPLEMENTED/);
});
