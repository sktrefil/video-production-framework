import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1-09 text role presets cover every title role and create generic text items",async()=>{const {TEXT_ROLE_PRESETS,createTextRoleItem}=await importTs("src/studio/editor/textRolePresets.ts");assert.deepEqual(TEXT_ROLE_PRESETS.map((preset)=>preset.role),["TOP_TITLE","LOWER_THIRD","SOURCE","LABEL","FREE_TEXT"]);const item=createTextRoleItem({id:"t1",trackId:"T1",role:"LOWER_THIRD",timelineStartFrame:12,durationInFrames:60});assert.equal(item.type,"TEXT");assert.equal(item.textRole,"LOWER_THIRD");assert.equal(item.timelineStartFrame,12);assert.equal(item.durationInFrames,60);});

test("P1-09 overlay panel can add every role at playhead and edit selected text",async()=>{const panel=await read("src/studio/editor/overlays/OverlayGeneratorPanel.tsx");for(const token of ["data-editor-text-role-add","data-editor-add-text-role","createTextRoleItem","state.playheadFrame","editorActions.addItem","TextTitleEditor"])assert.ok(panel.includes(token),`missing ${token}`);});

test("P1-09 text editor exposes style, role, duplicate and delete controls",async()=>{const editor=await read("src/studio/editor/overlays/TextTitleEditor.tsx");for(const token of ["data-editor-text-role","data-editor-text-font-family","data-editor-text-font-size","data-editor-text-font-weight","data-editor-text-fill","data-editor-text-stroke","data-editor-text-align","data-editor-text-width","data-editor-text-x","data-editor-text-y","data-editor-command=\"duplicate-text\"","data-editor-command=\"delete-text\"","updateTextStyle","duplicateItem","deleteItem"])assert.ok(editor.includes(token),`missing ${token}`);});

test("P1-09 direct canvas editing continues to include TEXT items",async()=>{const canvas=await read("src/studio/editor/canvas/StudioCanvasDirectOverlay.tsx");assert.match(canvas,/item\.type===\"TEXT\"/);assert.match(canvas,/updateTextStyle/);});
