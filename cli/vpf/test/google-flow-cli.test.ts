import assert from "node:assert/strict";
import test from "node:test";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { runCli, type GoogleFlowCliService } from "../src/index.js";

function ioFixture() {
  const output: string[] = [];
  const errors: string[] = [];
  return {
    output,
    errors,
    io: {
      out: (message: string) => output.push(message),
      error: (message: string) => errors.push(message)
    }
  };
}

function flowFixture() {
  const calls: Array<{ action: string; input: unknown }> = [];
  const service: GoogleFlowCliService = {
    async exportJob(input) {
      calls.push({ action: "export", input });
      return { status: "EXPORTED", jobId: input.jobId, projectId: input.projectId ?? null };
    },
    async importResult(input) {
      calls.push({ action: "import", input });
      return {
        status: "IMPORTED",
        jobId: input.jobId,
        generatedFile: input.generatedFile,
        projectId: input.projectId ?? null,
        clipStatus: "QC_PENDING"
      };
    }
  };
  return { calls, service };
}

test("job export dispatches to the Google Flow manual service", async () => {
  const out = ioFixture();
  const flow = flowFixture();
  const code = await runCli(
    ["job", "export", "job_123", "--project", "project_1"],
    out.io,
    new ProjectBootstrapService(),
    undefined,
    flow.service
  );
  assert.equal(code, 0);
  assert.deepEqual(flow.calls, [
    { action: "export", input: { jobId: "job_123", projectId: "project_1" } }
  ]);
  assert.equal(JSON.parse(out.output.at(-1)!).status, "EXPORTED");
  assert.equal(out.errors.length, 0);
});

test("job import-result dispatches exact generated path and preserves QC_PENDING result", async () => {
  const out = ioFixture();
  const flow = flowFixture();
  const code = await runCli(
    ["job", "import-result", "job_123", "C:\\exports\\flow-result.mp4", "--project", "project_1"],
    out.io,
    new ProjectBootstrapService(),
    undefined,
    flow.service
  );
  assert.equal(code, 0);
  assert.deepEqual(flow.calls, [
    {
      action: "import",
      input: {
        jobId: "job_123",
        generatedFile: "C:\\exports\\flow-result.mp4",
        projectId: "project_1"
      }
    }
  ]);
  assert.equal(JSON.parse(out.output.at(-1)!).clipStatus, "QC_PENDING");
  assert.equal(out.errors.length, 0);
});

test("Google Flow job commands reject missing required arguments without invoking the service", async () => {
  const out = ioFixture();
  const flow = flowFixture();
  assert.equal(
    await runCli(
      ["job", "export"],
      out.io,
      new ProjectBootstrapService(),
      undefined,
      flow.service
    ),
    2
  );
  assert.equal(
    await runCli(
      ["job", "import-result", "job_123"],
      out.io,
      new ProjectBootstrapService(),
      undefined,
      flow.service
    ),
    2
  );
  assert.equal(flow.calls.length, 0);
  assert.ok(out.errors.every((message) => message.includes("CLI_USAGE")));
});
