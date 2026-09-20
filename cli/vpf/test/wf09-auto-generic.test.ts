import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../..");
const source=readFileSync(resolve(root,"cli/vpf/src/wf09-auto.ts"),"utf8");

test("WF09 auto is project-generic and format-aware",()=>{
  assert.doesNotMatch(source,/Roman Britain|Roman-inspired|northern Britannia|vertical 9:16 crop continuity/);
  assert.match(source,/format === "LONGFORM"/);
  assert.match(source,/horizontal 16:9 image plate/);
  assert.match(source,/vertical 9:16 image plate/);
  assert.match(source,/approved Project Style and pinned Visual Bible/);
});


test("WF09 auto cannot bypass Agent3 review for LONGFORM",()=>{
  assert.match(source,/LONGFORM visual production must use the Agent3-reviewed explicit WF09A\/WF09B prompt package path/);
});
