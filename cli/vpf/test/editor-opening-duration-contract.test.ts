import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const read=(relative:string)=>readFileSync(resolve(root,relative),"utf8");

test("migrate-opening routes through duration reconciler",()=>{
  const entry=read("cli/vpf/src/entry.ts");
  const reconciler=read("cli/vpf/src/editor-opening-duration-reconcile.ts");

  assert.match(entry,/EditorOpeningMigrationReconcilerService/);
  assert.match(entry,/--duration-ms/);
  assert.match(reconciler,/targetDurationMs/);
  assert.match(reconciler,/OPENING_CLIP_DURATION_RECONCILED/);
  assert.match(reconciler,/TRIM_PASS/);
  assert.match(reconciler,/usableInMs: 0/);
  assert.match(reconciler,/usableOutMs: targetDurationMs/);
  assert.match(reconciler,/commitClipQc/);
  assert.match(reconciler,/selectedMediaId: media\.id/);
});
