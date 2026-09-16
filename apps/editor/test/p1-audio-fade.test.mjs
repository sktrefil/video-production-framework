import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

const audio={id:"a1",type:"BGM",trackId:"A1",timelineStartFrame:10,durationInFrames:30,enabled:true,locked:false,src:"projects/p/media/bgm.mp3",sourceStartFrame:0,sourceDurationInFrames:30,sourceAssetDurationInFrames:60,volume:1,muted:false,fadeInFrames:5,fadeOutFrames:7,loop:false};
const project={schemaVersion:1,project:{id:"p",name:"Fade",fps:30,width:1080,height:1920,durationInFrames:120},tracks:[{id:"A1",type:"AUDIO",name:"Audio",enabled:true,locked:false,order:0}],items:[audio],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};

test("P1-01 fade helpers clamp to clip duration and map handle drag direction",async()=>{const {clampAudioFadeFrames,audioFadeFramesFromDrag}=await importTs("src/studio/editor/audioFadeCommand.ts");assert.equal(clampAudioFadeFrames(-4,30),0);assert.equal(clampAudioFadeFrames(44,30),30);assert.equal(clampAudioFadeFrames(12.6,30),13);assert.equal(clampAudioFadeFrames(Number.NaN,30),0);assert.equal(audioFadeFramesFromDrag(audio,"in",10),15);assert.equal(audioFadeFramesFromDrag(audio,"in",-20),0);assert.equal(audioFadeFramesFromDrag(audio,"out",3),4);assert.equal(audioFadeFramesFromDrag(audio,"out",-50),30);});

test("P1-01 reducer stores clamped UI fade values and JSON persistence preserves them",async()=>{const {clampAudioFadeFrames}=await importTs("src/studio/editor/audioFadeCommand.ts");const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");let state=createEditorState(project);state=editorReducer(state,{type:"CHANGE_AUDIO_FADES",itemId:"a1",fadeInFrames:clampAudioFadeFrames(100,audio.durationInFrames),fadeOutFrames:clampAudioFadeFrames(12,audio.durationInFrames)});const item=state.project.items.find((candidate)=>candidate.id==="a1");assert.equal(item.fadeInFrames,30);assert.equal(item.fadeOutFrames,12);const persisted=JSON.parse(JSON.stringify(state.project));assert.equal(persisted.items[0].fadeInFrames,30);assert.equal(persisted.items[0].fadeOutFrames,12);});

test("P1-01 Inspector exposes Fade In/Out inputs with duration bounds",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");assert.match(inspector,/data-editor-audio-fade-in/);assert.match(inspector,/data-editor-audio-fade-out/);assert.match(inspector,/max=\{audio\.durationInFrames\}/);assert.match(inspector,/clampAudioFadeFrames/);assert.match(inspector,/changeAudioFades/);});

test("P1-01 Timeline exposes fade regions and transaction-backed fade handles",async()=>{const timeline=await read("src/studio/editor/timeline/Timeline.tsx");for(const token of ["data-editor-audio-fade-region=\"in\"","data-editor-audio-fade-region=\"out\"","data-editor-audio-fade-handle=\"in\"","data-editor-audio-fade-handle=\"out\"","audioFadeFramesFromDrag","beginEditTransaction","endEditTransaction","changeAudioFades"])assert.ok(timeline.includes(token),`missing ${token}`);});

test("P1-01 renderer applies fade envelope to final audio volume",async()=>{const renderer=await read("src/editor/AudioItemRenderer.tsx");assert.match(renderer,/envelope\(frame,item\.durationInFrames,item\.fadeInFrames,item\.fadeOutFrames\)/);assert.match(renderer,/interpolate/);assert.match(renderer,/item\.volume\*masterVolume/);});
