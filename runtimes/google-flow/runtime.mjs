#!/usr/bin/env node
import { GoogleFlowManualService } from "../../packages/storage/dist/google-flow-manual.js";

const [action, jobId, value, projectId] = process.argv.slice(2);
const service = new GoogleFlowManualService();

function usage() {
  process.stderr.write(
    "Usage:\n" +
      "  node runtimes/google-flow/runtime.mjs export <job_id> [project_id]\n" +
      "  node runtimes/google-flow/runtime.mjs import-result <job_id> <generated.mp4> [project_id]\n"
  );
}

try {
  if (action === "export" && jobId) {
    const result = await service.exportJob({
      jobId,
      ...(value === undefined ? {} : { projectId: value })
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (action === "import-result" && jobId && value) {
    const result = await service.importResult({
      jobId,
      generatedFile: value,
      ...(projectId === undefined ? {} : { projectId })
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(
    `[google-flow-manual] ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
