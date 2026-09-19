import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=await readFile(resolve(root,"src/studio/editor/StudioEditor.tsx"),"utf8");

test("Studio editor panel is vertically resizable, scrollable and collapsible",()=>{
  assert.match(source,/data-editor-panel-resizer=\"true\"/);
  assert.match(source,/cursor:panelCollapsed\?\"default\":\"ns-resize\"/);
  assert.match(source,/setPanelHeight\(clampPanelHeight/);
  assert.match(source,/maxHeight:\"85vh\"/);
  assert.match(source,/data-editor-panel-content=\"true\"/);
  assert.match(source,/overflow:\"auto\"/);
  assert.match(source,/data-editor-command=\"toggle-panel-collapse\"/);
  assert.match(source,/panelCollapsed\?\"Expand\":\"Minimize\"/);
});
