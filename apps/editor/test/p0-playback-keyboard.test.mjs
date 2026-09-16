import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");

test("P0-09 Studio keyboard routes playback, frame stepping, boundaries, split, delete and undo redo",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");for(const token of ["toggle as toggleStudio","toggleStudio()","arrowleft","arrowright","event.shiftKey?5:1","key===\"home\"","key===\"end\"","key===\"delete\"","key===\"s\"","key===\"z\"","key===\"y\"","editorActions.undo()","editorActions.redo()","editorActions.deleteItem"])assert.match(studio,new RegExp(token.replace(/[()]/g,"\\$&")));});

test("P0-09 shortcuts never hijack text inputs and multi-delete is one edit transaction",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");assert.match(studio,/isEditableKeyboardTarget\(event\.target\)/);assert.match(studio,/beginEditTransaction\(\)/);assert.match(studio,/for\(const itemId of state\.selectedItemIds\)dispatch\(editorActions\.deleteItem\(itemId\)\)/);assert.match(studio,/endEditTransaction\(\)/);});

test("P0-09 playback and frame-step commands are available from UI as well as keyboard",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");for(const command of ["toggle-playback","step-back","step-forward"])assert.match(studio,new RegExp(`data-editor-command=\\"${command}\\"`));assert.match(studio,/Play\/Pause/);assert.match(studio,/-1f/);assert.match(studio,/\+1f/);});

test("P0-09 uses the official Remotion Studio playback and seek APIs",async()=>{const studio=await read("src/studio/editor/StudioEditor.tsx");assert.match(studio,/seek as seekStudio/);assert.match(studio,/toggle as toggleStudio/);assert.match(studio,/seekStudio\(target\)/);});
