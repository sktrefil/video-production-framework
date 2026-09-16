import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1-11 additive selection toggles items and normal selection preserves an existing drag group",async()=>{const {selectionAfterItemPointer}=await importTs("src/studio/editor/multiSelect.ts");assert.deepEqual(selectionAfterItemPointer(["a"],"b",true),["a","b"]);assert.deepEqual(selectionAfterItemPointer(["a","b"],"a",true),["b"]);assert.deepEqual(selectionAfterItemPointer(["a","b"],"a",false),["a","b"]);assert.deepEqual(selectionAfterItemPointer(["a","b"],"c",false),["c"]);});

test("P1-11 group movement clamps at project frame zero and preserves relative starts",async()=>{const {clampGroupMoveDelta,groupNudgeTargets}=await importTs("src/studio/editor/multiSelect.ts");const items=[{id:"a",timelineStartFrame:5},{id:"b",timelineStartFrame:12}];assert.equal(clampGroupMoveDelta(items,-20),-5);const targets=groupNudgeTargets(items,-20);assert.equal(targets.get("a"),0);assert.equal(targets.get("b"),7);});

test("P1-11 timeline exposes ctrl shift multi-selection, marquee, group drag nudge and delete as transactions",async()=>{const timeline=await read("src/studio/editor/timeline/Timeline.tsx");for(const token of ["event.ctrlKey","event.metaKey","event.shiftKey","data-editor-marquee-surface","data-editor-marquee-selection","data-editor-selection-count","data-editor-command=\"group-nudge-left\"","data-editor-command=\"group-nudge-right\"","data-editor-command=\"group-delete\"","beginEditTransaction","endEditTransaction","selectedIds","starts"] )assert.ok(timeline.includes(token),`missing ${token}`);});

test("P1-11 group operations keep reducer lock enforcement instead of bypassing MOVE_ITEM DELETE_ITEM",async()=>{const timeline=await read("src/studio/editor/timeline/Timeline.tsx");assert.match(timeline,/editorActions\.moveItem/);assert.match(timeline,/editorActions\.deleteItem/);const reducer=await read("src/studio/editor/editorReducer.ts");assert.match(reducer,/case \"MOVE_ITEM\"[\s\S]*itemLocked/);assert.match(reducer,/case \"DELETE_ITEM\"[\s\S]*itemLocked/);});
