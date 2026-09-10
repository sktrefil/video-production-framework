import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");const read=(path)=>readFile(resolve(root,path),"utf8");
const sample=JSON.parse(await read("src/generated/edit_project.sample.json"));

test("schemaVersion 1 fixture preserves every canonical item type",()=>{assert.equal(sample.schemaVersion,1);assert.deepEqual([...new Set(sample.items.map((i)=>i.type))].sort(),["BGM","CLIP_AUDIO","GRAPHIC","IMAGE","SFX","SUBTITLE","TEXT","TTS","VIDEO"].sort());});
test("fixture preserves VIDEO AUDIO TEXT GRAPHIC track contracts",()=>assert.deepEqual([...new Set(sample.tracks.map((t)=>t.type))].sort(),["AUDIO","GRAPHIC","TEXT","VIDEO"].sort()));
test("ProjectRenderer uses independent Sequence routing and no Series",async()=>{const src=await read("src/editor/ProjectRenderer.tsx");assert.match(src,/Sequence/);assert.match(src,/item\.timelineStartFrame/);assert.match(src,/item\.durationInFrames/);assert.doesNotMatch(src,/\bSeries\b/);});
test("image motion is deterministic from/to frame interpolation",async()=>{const src=await read("src/editor/ProjectRenderer.tsx");assert.match(src,/useCurrentFrame/);assert.match(src,/interpolate/);assert.match(src,/motion\.from\.scale/);assert.match(src,/motion\.to\.scale/);assert.match(src,/Easing\.inOut/);});
test("video audio text and graphic renderers remain separate",async()=>{for(const file of ["VideoItemRenderer.tsx","AudioItemRenderer.tsx","TextItemRenderer.tsx","GraphicItemRenderer.tsx"])await read(`src/editor/${file}`);});
test("Preview and final render share ProjectRenderer",async()=>{const preview=await read("src/editor/GenericEditorComposition.tsx");const final=await read("src/editor/GenericFinalRender.tsx");assert.match(preview,/ProjectRenderer/);assert.match(final,/ProjectRenderer/);});
test("Root registers only canonical generic compositions",async()=>{const src=await read("src/Root.tsx");assert.match(src,/id=\"GenericVideoEditor\"/);assert.match(src,/id=\"GenericFinalRender\"/);assert.doesNotMatch(src,/SadoPrince|HistoryMysteryShorts/);});
test("Generic Studio includes timeline, audio, subtitle and overlay panels",async()=>{const src=await read("src/studio/editor/StudioEditor.tsx");for(const token of ["Timeline","AudioAssetPanel","SubtitleGeneratorPanel","OverlayGeneratorPanel","Inspector"])assert.match(src,new RegExp(token));});
test("persistence is an injected unified adapter and has no old localhost authority",async()=>{const src=await read("src/studio/editor/persistence/editorPersistenceApi.ts");assert.match(src,/__VPF_EDITOR_API_BASE__/);assert.doesNotMatch(src,/127\.0\.0\.1:4317/);});
test("production source has zero legacy project-specific dependency",async()=>{const forbidden=[/sado_prince/i,/SadoPrince/,/history_mystery_shorts_style/i,/HISTORY_MYSTERY_STYLIZED_V1/,/Youtubu_projects/];const walk=async(dir)=>{const entries=await readdir(dir,{withFileTypes:true});const files=[];for(const e of entries){const p=resolve(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(/\.(?:ts|tsx|js|mjs|json)$/.test(e.name))files.push(p);}return files;};for(const file of await walk(resolve(root,"src"))){const src=await readFile(file,"utf8");for(const pattern of forbidden)assert.doesNotMatch(src,pattern,`${pattern} leaked into ${file}`);}});
