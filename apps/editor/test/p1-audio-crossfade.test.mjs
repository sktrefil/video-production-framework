import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

const base={type:"BGM",trackId:"A1",enabled:true,locked:false,src:"projects/p/media/a.mp3",sourceStartFrame:0,sourceDurationInFrames:60,sourceAssetDurationInFrames:60,volume:1,muted:false,loop:false};
const first={...base,id:"a1",timelineStartFrame:10,durationInFrames:40,fadeInFrames:0,fadeOutFrames:0};
const second={...base,id:"a2",timelineStartFrame:35,durationInFrames:30,fadeInFrames:0,fadeOutFrames:0};
const project={schemaVersion:1,project:{id:"p",name:"Crossfade",fps:30,width:1080,height:1920,durationInFrames:100},tracks:[{id:"A1",type:"AUDIO",name:"Audio",enabled:true,locked:false,order:0}],items:[first,second],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};

test("P1-02 crossfade helper resolves overlapping next audio and clamps duration",async()=>{const {AUDIO_CROSSFADE_CURVE,audioOverlapFrames,clampAudioCrossfadeFrames,currentAudioCrossfadeFrames,nextAudioForCrossfade}=await importTs("src/studio/editor/audioCrossfadeCommand.ts");assert.equal(AUDIO_CROSSFADE_CURVE,"linear");assert.equal(audioOverlapFrames(first,second),15);assert.equal(clampAudioCrossfadeFrames(20,15),15);assert.equal(clampAudioCrossfadeFrames(-4,15),0);const state={project,selectedItemIds:["a1"],playheadFrame:0};assert.equal(nextAudioForCrossfade(state,first).id,"a2");assert.equal(currentAudioCrossfadeFrames({...first,fadeOutFrames:12},{...second,fadeInFrames:9}),9);assert.equal(nextAudioForCrossfade({...state,project:{...project,tracks:[{...project.tracks[0],locked:true}]}},first),null);});

test("P1-02 applying a crossfade uses one edit transaction and two fade updates",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");assert.match(inspector,/data-editor-audio-crossfade/);assert.match(inspector,/data-editor-command="apply-audio-crossfade"/);assert.match(inspector,/AUDIO_CROSSFADE_CURVE/);assert.match(inspector,/beginEditTransaction/);assert.match(inspector,/changeAudioFades\(audio\.id,\{fadeOutFrames:duration\}\)/);assert.match(inspector,/changeAudioFades\(nextAudio\.id,\{fadeInFrames:duration\}\)/);assert.match(inspector,/endEditTransaction/);});

test("P1-02 reducer persistence keeps matched fade-out and fade-in values",async()=>{const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");let state=createEditorState(project);state=editorReducer(state,{type:"CHANGE_AUDIO_FADES",itemId:"a1",fadeOutFrames:15});state=editorReducer(state,{type:"CHANGE_AUDIO_FADES",itemId:"a2",fadeInFrames:15});const persisted=JSON.parse(JSON.stringify(state.project));assert.equal(persisted.items.find((item)=>item.id==="a1").fadeOutFrames,15);assert.equal(persisted.items.find((item)=>item.id==="a2").fadeInFrames,15);});

test("P1-02 renderer uses the linear fade envelope for both sides of an overlap",async()=>{const renderer=await read("src/editor/AudioItemRenderer.tsx");assert.match(renderer,/interpolate\(frame,\[0,fadeIn\],\[0,1\]/);assert.match(renderer,/interpolate\(frame,\[start,duration\],\[1,0\]/);assert.match(renderer,/Math\.min\(incoming,outgoing\)/);});
