import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1-07 canvas helper calculates safe guides and transform-aware rectangles",async()=>{const {canvasItemRect,safeAreaGuideFrames,snapCanvasValue}=await importTs("src/studio/editor/canvasDirectEdit.ts");const project={width:1080,height:1920};assert.deepEqual(safeAreaGuideFrames(project),{top:345.59999999999997,bottom:1382.3999999999999,centerX:540,centerY:960});assert.equal(snapCanvasValue(536,[540],12),540);const video={type:"VIDEO",x:10,y:20,scale:.5};assert.deepEqual(canvasItemRect(video,project),{left:280,top:500,width:540,height:960});const graphic={type:"GRAPHIC",x:100,y:200,width:300,height:400};assert.deepEqual(canvasItemRect(graphic,project),{left:100,top:200,width:300,height:400});});

test("P1-07 composition uses one direct canvas overlay for media text subtitle and graphic editing",async()=>{const composition=await read("src/editor/GenericEditorComposition.tsx");const overlay=await read("src/studio/editor/canvas/StudioCanvasDirectOverlay.tsx");assert.match(composition,/StudioCanvasDirectOverlay/);for(const token of ["item.type===\"VIDEO\"","item.type===\"IMAGE\"","item.type===\"SUBTITLE\"","item.type===\"TEXT\"","item.type===\"GRAPHIC\""])assert.ok(overlay.includes(token.replace("===","==="))||overlay.includes(token.replace("===","==")),`missing ${token}`);for(const token of ["data-editor-canvas-selection","data-editor-canvas-resize-handle","data-editor-canvas-rotate-handle","data-editor-canvas-aspect-lock","data-editor-safe-guide=\"top\"","data-editor-safe-guide=\"bottom\"","data-editor-center-guide=\"x\"","beginEditTransaction","endEditTransaction","updateTransform","updateSubtitleStyle","updateTextStyle","updateGraphicStyle"])assert.ok(overlay.includes(token),`missing ${token}`);});

test("P1-07 direct canvas is Studio-only and respects locked items or tracks",async()=>{const overlay=await read("src/studio/editor/canvas/StudioCanvasDirectOverlay.tsx");assert.match(overlay,/isStudio/);assert.match(overlay,/isReadOnlyStudio/);assert.match(overlay,/track\?\.locked===true/);assert.match(overlay,/if\(locked\)return/);});
