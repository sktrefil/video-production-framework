import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

const audioBase={trackId:"A1",enabled:true,locked:false,src:"projects/p/media/audio.mp3",sourceStartFrame:0,sourceDurationInFrames:120,sourceAssetDurationInFrames:120,volume:1,muted:false,fadeInFrames:0,fadeOutFrames:0,loop:false};
const bgm={...audioBase,id:"bgm",type:"BGM",timelineStartFrame:0,durationInFrames:120};
const tts1={...audioBase,id:"tts1",type:"TTS",timelineStartFrame:20,durationInFrames:20};
const tts2={...audioBase,id:"tts2",type:"TTS",timelineStartFrame:43,durationInFrames:17};
const project={schemaVersion:1,project:{id:"p",name:"Ducking",fps:30,width:1080,height:1920,durationInFrames:120},tracks:[{id:"A1",type:"AUDIO",name:"Audio",enabled:true,locked:false,order:0}],items:[bgm,tts1,tts2],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};

test("P1-03 ducking settings clamp and nearby TTS ranges merge by minimum gap",async()=>{const {normalizeAudioDucking,ttsDuckingRanges}=await importTs("src/studio/editor/audioDucking.ts");const settings=normalizeAudioDucking({enabled:true,duckVolume:2,attackFrames:-2,releaseFrames:5.6,minGapFrames:4.4});assert.deepEqual(settings,{enabled:true,duckVolume:1,attackFrames:0,releaseFrames:6,minGapFrames:4});assert.deepEqual(ttsDuckingRanges(project,4),[{startFrame:20,endFrame:60}]);assert.deepEqual(ttsDuckingRanges(project,2),[{startFrame:20,endFrame:40},{startFrame:43,endFrame:60}]);});

test("P1-03 gain curve applies attack, duck level and release without baking source audio",async()=>{const {duckingGainAtFrame}=await importTs("src/studio/editor/audioDucking.ts");const settings={enabled:true,duckVolume:.25,attackFrames:10,releaseFrames:10,minGapFrames:0};const ranges=[{startFrame:20,endFrame:40}];assert.equal(duckingGainAtFrame(5,ranges,settings),1);assert.ok(Math.abs(duckingGainAtFrame(15,ranges,settings)-.625)<1e-9);assert.equal(duckingGainAtFrame(25,ranges,settings),.25);assert.ok(Math.abs(duckingGainAtFrame(45,ranges,settings)-.625)<1e-9);assert.equal(duckingGainAtFrame(55,ranges,settings),1);});

test("P1-03 BGM ducking reducer is editable, clamped and persistent",async()=>{const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");let state=createEditorState(project);state=editorReducer(state,{type:"CHANGE_AUDIO_DUCKING",itemId:"bgm",patch:{enabled:true,duckVolume:.2,attackFrames:8,releaseFrames:12,minGapFrames:3}});const item=state.project.items.find((candidate)=>candidate.id==="bgm");assert.deepEqual(item.ducking,{enabled:true,duckVolume:.2,attackFrames:8,releaseFrames:12,minGapFrames:3});state=editorReducer(state,{type:"CHANGE_AUDIO_DUCKING",itemId:"bgm",patch:{duckVolume:-1,attackFrames:-3}});const clamped=state.project.items.find((candidate)=>candidate.id==="bgm");assert.equal(clamped.ducking.duckVolume,0);assert.equal(clamped.ducking.attackFrames,0);const persisted=JSON.parse(JSON.stringify(state.project));assert.deepEqual(persisted.items.find((candidate)=>candidate.id==="bgm").ducking,clamped.ducking);const ttsState=editorReducer(state,{type:"CHANGE_AUDIO_DUCKING",itemId:"tts1",patch:{enabled:true}});assert.equal(ttsState.project.items.find((candidate)=>candidate.id==="tts1").ducking,undefined);});

test("P1-03 Inspector exposes BGM ducking controls",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");for(const token of ["data-editor-audio-ducking-enabled","data-editor-audio-ducking-level","data-editor-audio-ducking-attack","data-editor-audio-ducking-release","data-editor-audio-ducking-gap","changeAudioDucking"])assert.ok(inspector.includes(token),`missing ${token}`);});

test("P1-03 renderer derives TTS ranges and applies ducking gain inside the audio volume callback",async()=>{const projectRenderer=await read("src/editor/ProjectRenderer.tsx");const audioRenderer=await read("src/editor/AudioItemRenderer.tsx");assert.match(projectRenderer,/bgmDuckingRanges\(project,item\)/);assert.match(projectRenderer,/duckingRanges=\{duckingRanges\}/);assert.match(audioRenderer,/duckingGainAtFrame\(frame,duckingRanges,item\.ducking\)/);assert.match(audioRenderer,/volume=\{\(frame\)=>/);});
