import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");

test("P0-09 Studio keyboard routes playback, frame stepping, boundaries, split, delete and undo redo",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");for(const token of ["play as playStudio","pause as pauseStudio","key===\"s\"","key===\"d\"","arrowleft","arrowright","key===\"home\"","key===\"end\"","key===\"delete\"","isNotSplitShortcut","key===\"z\"","key===\"y\"","editorActions.undo()","editorActions.redo()","editorActions.deleteItem"])assert.ok(studio.includes(token),`missing ${token}`);assert.match(studio,/event\.shiftKey\?5:1/);assert.doesNotMatch(studio,/key===\" \"\|\|event\.code===\"Space\"/);assert.doesNotMatch(studio,/key===\"f\"/);});

test("P0-09 shortcuts never hijack text inputs and multi-delete is one edit transaction",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");assert.match(studio,/isEditableKeyboardTarget\(event\.target\)/);assert.match(studio,/beginEditTransaction\(\)/);assert.match(studio,/for\(const itemId of state\.selectedItemIds\)dispatch\(editorActions\.deleteItem\(itemId\)\)/);assert.match(studio,/endEditTransaction\(\)/);});

test("P0-09 playback and frame-step commands are available from UI as well as keyboard",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");for(const command of ["play-playback","stop-playback","open-preview-popup","step-back","step-forward"])assert.ok(studio.includes(`data-editor-command=\"${command}\"`));assert.match(studio,/Play \(S\)/);assert.match(studio,/Stop \(D\)/);assert.match(studio,/Preview Pop-out/);assert.match(studio,/-1f/);assert.match(studio,/\+1f/);});

test("P0-09 uses the official Remotion Studio playback, pause and seek APIs",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");assert.match(studio,/pause as pauseStudio/);assert.match(studio,/play as playStudio/);assert.match(studio,/seek as seekStudio/);assert.match(studio,/const startPlayback=useCallback\(\(\)=>playStudio\(\),\[\]\)/);assert.match(studio,/const stopPlayback=useCallback\(\(\)=>pauseStudio\(\),\[\]\)/);assert.match(studio,/stopPlayback\(\);\s*seekStudio\(target\)/);assert.match(studio,/seekStudio\(target\)/);});

test("P0-09 pop-out preserves the project canvas scale and updates it on resize",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");assert.match(studio,/const popupPreviewScale=/);assert.match(studio,/const \[previewScale,setPreviewScale\]=useState\(1\)/);assert.match(studio,/previewPopup\.addEventListener\("resize",resizePreview\)/);assert.match(studio,/transform:`scale\(\$\{previewScale\}\)`/);assert.match(studio,/<ProjectRenderer project=\{state\.project\} muted\/>/);});
