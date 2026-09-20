import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1 cut position accepts exact frames and mm:ss:ff timecodes",async()=>{
  const {formatTimelinePosition,parseTimelinePosition}=await importTs("src/studio/editor/timeline/timelineTimecode.ts");
  assert.equal(formatTimelinePosition(1097,30),"00:36:17");
  assert.equal(parseTimelinePosition("1097",30,2000),1097);
  assert.equal(parseTimelinePosition("00:36:17",30,2000),1097);
  assert.equal(parseTimelinePosition("00:36.17",30,2000),1097);
  assert.equal(parseTimelinePosition("00:60:00",30,2000),null);
});

test("P1 timeline exposes a direct cut-position control and synchronized playhead",async()=>{
  const timeline=await read("src/studio/editor/timeline/Timeline.tsx");
  for(const token of ["data-editor-cut-position","data-editor-cut-timecode","data-editor-playhead-timecode","parseTimelinePosition","commitPositionInput","Exact cut","data-editor-playhead","currentFrame*ppf","#f23b30"])assert.ok(timeline.includes(token),`missing ${token}`);
});
