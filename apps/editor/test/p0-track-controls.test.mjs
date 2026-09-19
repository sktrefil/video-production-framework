import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};
const video={id:"v1",type:"VIDEO",trackId:"V1",timelineStartFrame:10,durationInFrames:30,enabled:true,locked:false,src:"v.mp4",sourceStartFrame:0,sourceDurationInFrames:30,sourceAssetDurationInFrames:60,playbackRate:1,volume:0,x:0,y:0,scale:1,rotation:0,opacity:1,fit:"cover"};
const audio={id:"a1",type:"TTS",trackId:"A1",timelineStartFrame:0,durationInFrames:60,enabled:true,locked:false,src:"a.mp3",sourceStartFrame:0,sourceDurationInFrames:60,sourceAssetDurationInFrames:60,volume:1,muted:false,fadeInFrames:0,fadeOutFrames:0};
const project={schemaVersion:1,project:{id:"p",name:"p",fps:30,width:1080,height:1920,durationInFrames:120},tracks:[{id:"V1",type:"VIDEO",name:"Video",enabled:true,locked:false,order:0},{id:"A1",type:"AUDIO",name:"Audio",enabled:true,locked:false,order:1}],items:[video,audio],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};

test("P0-08 reducer persists track lock, visibility, mute and solo controls",async()=>{const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");let state=createEditorState(project);state=editorReducer(state,{type:"SET_TRACK_LOCKED",trackId:"V1",locked:true});assert.equal(state.project.tracks[0].locked,true);const lockedState=state;assert.strictEqual(editorReducer(state,{type:"MOVE_ITEM",itemId:"v1",timelineStartFrame:40}),lockedState);state=editorReducer(state,{type:"SET_TRACK_ENABLED",trackId:"V1",enabled:false});assert.equal(state.project.tracks[0].enabled,false);state=editorReducer(state,{type:"SET_TRACK_MUTED",trackId:"A1",muted:true});state=editorReducer(state,{type:"SET_TRACK_SOLO",trackId:"A1",solo:true});assert.equal(state.project.tracks[1].muted,true);assert.equal(state.project.tracks[1].solo,true);});

test("P0-08 non-audio tracks ignore mute and solo",async()=>{const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");const state=createEditorState(project);const muted=editorReducer(state,{type:"SET_TRACK_MUTED",trackId:"V1",muted:true});assert.equal(muted.project.tracks[0].muted,undefined);const solo=editorReducer(state,{type:"SET_TRACK_SOLO",trackId:"V1",solo:true});assert.equal(solo.project.tracks[0].solo,undefined);});

test("P0-08 timeline exposes lock hide mute solo controls and blocks locked drag/drop",async()=>{const timeline=await read("src/studio/editor/timeline/Timeline.tsx");for(const token of ["setTrackLocked","setTrackEnabled","setTrackMuted","setTrackSolo","data-editor-track-control=\"lock\"","data-editor-track-control=\"enabled\"","data-editor-track-control=\"mute\"","data-editor-track-control=\"solo\"","track.locked"])assert.match(timeline,new RegExp(token));});

test("P0-08 renderer keeps hidden tracks out and applies audio mute/solo without hiding visuals",async()=>{const renderer=await read("src/editor/ProjectRenderer.tsx");assert.match(renderer,/entry\.track\?\.enabled===true/);assert.match(renderer,/audioSoloActive/);assert.match(renderer,/track\.muted===true/);assert.match(renderer,/track\.solo!==true/);assert.match(renderer,/muted:true/);});
