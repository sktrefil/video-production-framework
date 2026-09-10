import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {
  repositoryRoot,
  countNamedFiles
} from "./support.mjs";
import {runUpstreamFixture} from "./upstream.mjs";
import {runEditorFixture} from "./editor.mjs";

const execFileAsync = promisify(execFile);

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), "vpf-mig12-e2e-"));
  const workspaceRoot = join(tempRoot, "workspace");
  const ids = ["mig12_shortform", "mig12_longform"];
  const results = [];
  try {
    const short = await runUpstreamFixture({
      workspaceRoot,
      format: "SHORTFORM",
      projectId: ids[0],
      negativeCases: true
    });
    const shortEditor = await runEditorFixture(short, {negativeCases: true});
    results.push({...shortEditor, providerCalls: short.providerCalls});

    const long = await runUpstreamFixture({
      workspaceRoot,
      format: "LONGFORM",
      projectId: ids[1],
      negativeCases: false
    });
    const longEditor = await runEditorFixture(long);
    results.push({...longEditor, providerCalls: long.providerCalls});

    assert.equal(await countNamedFiles(workspaceRoot, "project.db"), 2);
    for (const fixture of [short, long]) {
      assert.deepEqual(fixture.providerCalls, {image: 2, tts: 1});
      assert.equal(fixture.counters.oldRepoOperationalCalls, 0);
      assert.equal(fixture.counters.legacyIoAccesses, 0);
    }
    assert.equal(shortEditor.staleGateVerified, true);
    assert.equal(longEditor.publishHandoffReady, true);

    const boundary = await execFileAsync(process.execPath, [
      join(repositoryRoot, "scripts", "check-no-legacy-paths.mjs"),
      repositoryRoot
    ]);
    assert.match(boundary.stdout, /repository-boundary.*PASS/u);

    console.log(JSON.stringify({
      workItem: "MIG-12",
      status: "PASS",
      projects: results,
      projectDbCount: 2,
      oldRepoOperationalCalls: 0,
      legacyResourceAccesses: 0
    }, null, 2));
  } finally {
    if (process.env.VPF_E2E_KEEP !== "1") {
      await rm(tempRoot, {recursive: true, force: true});
      for (const projectId of ids) {
        await rm(join(repositoryRoot, "apps", "editor", "public", "projects", projectId), {
          recursive: true,
          force: true
        });
      }
    } else {
      console.log(`[mig12-e2e] kept fixture root: ${tempRoot}`);
    }
  }
}

main().catch(error => {
  console.error(`[mig12-e2e] FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
