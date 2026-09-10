import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

test("CI scan rejects a production leak but permits a negative test and migration prose",async()=>{
  const root=await mkdtemp(join(tmpdir(),"vpf-static-"));
  await mkdir(join(root,"packages","example","test"),{recursive:true});
  await writeFile(join(root,"packages","example","test","negative.ts"),'const denied = "HISTORY_MYSTERY_STYLIZED_V1";');
  const actualScanner=fileURLToPath(new URL("../../../scripts/check-no-legacy-paths.mjs",import.meta.url));
  const run=()=>spawnSync(process.execPath,[actualScanner,root],{encoding:"utf8"});
  const clean=run(); assert.equal(clean.status,0,clean.stderr);
  await writeFile(join(root,"packages","example","index.ts"),'import "src/sado_prince/editor";');
  const denied=run(); assert.equal(denied.status,1); assert.match(denied.stderr,/LEGACY_PROJECT_RENDER_PATH/);
});
