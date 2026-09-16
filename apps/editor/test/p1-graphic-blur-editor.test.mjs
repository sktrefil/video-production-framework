import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("P1-10 shorts graphic regions match 0-18, 18-72 and 72-100 percent",async()=>{const {SHORTS_GRAPHIC_REGIONS,shortsGraphicRegionPatch}=await importTs("src/studio/editor/graphicPresets.ts");assert.deepEqual(SHORTS_GRAPHIC_REGIONS.map((region)=>[region.id,region.startRatio,region.endRatio]),[["TOP",0,.18],["STORY",.18,.72],["BOTTOM",.72,1]]);const project={id:"p",name:"p",fps:30,width:1080,height:1920,durationInFrames:300};assert.deepEqual(shortsGraphicRegionPatch("BOTTOM",project),{x:0,y:1382,width:1080,height:538});});

test("P1-10 graphic editor exposes blur gradient panel geometry and shorts presets",async()=>{const editor=await read("src/studio/editor/overlays/GraphicBlurEditor.tsx");for(const token of ["data-editor-graphic-type","data-editor-graphic-x","data-editor-graphic-y","data-editor-graphic-width","data-editor-graphic-height","data-editor-graphic-opacity","data-editor-graphic-blur","data-editor-graphic-color","data-editor-graphic-radius","data-editor-gradient-start","data-editor-gradient-end","data-editor-gradient-angle","data-editor-shorts-graphic-region","updateGraphicStyle"])assert.ok(editor.includes(token),`missing ${token}`);});

test("P1-10 overlay panel creates all graphic types on an unlocked graphic track",async()=>{const panel=await read("src/studio/editor/overlays/OverlayGeneratorPanel.tsx");for(const token of ["BLUR_PANEL","GRADIENT","SOLID_PANEL","DIM_LAYER","createGraphicItem","data-editor-add-graphic","GraphicBlurEditor"])assert.ok(panel.includes(token),`missing ${token}`);});

test("P1-10 renderer consumes blur, color, radius and gradient fields",async()=>{const renderer=await read("src/editor/GraphicItemRenderer.tsx");for(const token of ["item.blurPx","item.backgroundColor","item.borderRadius","item.gradientStartColor","item.gradientEndColor","item.gradientAngleDeg"])assert.ok(renderer.includes(token),`missing ${token}`);});
