import test from "node:test";
import assert from "node:assert/strict";
import {cinematicShortsSubtitleStyle} from "@vpf/domain";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");

test("P1-08 subtitle style editor exposes full typography position background and preset controls",async()=>{const editor=await read("src/studio/editor/subtitles/SubtitleStyleEditor.tsx");for(const token of ["data-editor-subtitle-font-family","data-editor-subtitle-font-size","data-editor-subtitle-font-weight","data-editor-subtitle-fill","data-editor-subtitle-stroke","data-editor-subtitle-stroke-width","data-editor-subtitle-align","data-editor-subtitle-line-height","data-editor-subtitle-width","data-editor-subtitle-max-lines","data-editor-subtitle-x","data-editor-subtitle-y","data-editor-subtitle-background-enabled","data-editor-subtitle-preset","save-subtitle-preset","apply-custom-subtitle-preset"])assert.ok(editor.includes(token),`missing ${token}`);});

test("P1-08 subtitle presets are data driven and include the shared cinematic-shorts preset",async()=>{const presets=await read("src/studio/editor/subtitleStylePresets.ts");const tokens=await read("../../packages/domain/src/subtitle-visual-presets.ts");assert.match(presets,/cinematic-shorts/);assert.match(presets,/cinematicShortsSubtitleStyle/);assert.match(presets,/resolveSubtitleStylePreset/);assert.match(tokens,/VPF Noto Sans KR/);assert.match(tokens,/height\*\.92/);assert.match(tokens,/width\*\.9/);assert.match(tokens,/strokeWidth:6/);assert.match(tokens,/cinematicLineHeight:1\.24/);});

test("cinematic-shorts preset scales from project dimensions",()=>{const portrait=cinematicShortsSubtitleStyle({width:1080,height:1920});assert.deepEqual({x:portrait.x,y:portrait.y,width:portrait.width,fontSize:portrait.fontSize,fontWeight:portrait.fontWeight,strokeWidth:portrait.strokeWidth,lineHeight:portrait.lineHeight,maxLines:portrait.maxLines},{x:540,y:1766,width:972,fontSize:100,fontWeight:800,strokeWidth:6,lineHeight:1.24,maxLines:2});const square=cinematicShortsSubtitleStyle({width:720,height:720});assert.deepEqual({x:square.x,y:square.y,width:square.width,fontSize:square.fontSize},{x:360,y:662,width:648,fontSize:67});});

test("canonical assembly and shared renderer use the cinematic subtitle contract",async()=>{const assembly=await read("../../cli/vpf/src/editor-assembly-service.ts");const timeline=await read("../../packages/editor-timeline/src/index.ts");const renderer=await read("src/editor/TextItemRenderer.tsx");assert.match(assembly,/style: cinematicShortsSubtitleStyle\(input\.profile\)/);assert.match(timeline,/cinematicShortsSubtitleStyle\(\{width, height\}\)/);assert.match(renderer,/VPF_SUBTITLE_VISUAL_TOKENS\.cinematicShadow/);});

test("P1-08 Inspector delegates subtitle styling to the full style editor",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");assert.match(inspector,/SubtitleStyleEditor/);assert.match(inspector,/<SubtitleStyleEditor item=\{subtitle\}\/>/);});
