import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};
const video={id:"visual-binding-1-r3",type:"VIDEO",trackId:"V1",timelineStartFrame:0,durationInFrames:60,enabled:true,locked:false,src:"video.mp4",sourceStartFrame:30,sourceDurationInFrames:60,sourceAssetDurationInFrames:180,playbackRate:1,volume:0,x:0,y:0,scale:1,rotation:0,opacity:1,fit:"cover"};
const project={schemaVersion:1,project:{id:"p",name:"p",fps:30,width:1080,height:1920,durationInFrames:300},tracks:[{id:"V1",type:"VIDEO",name:"Video",enabled:true,locked:false,order:0}],items:[video],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};

test("P0-04 normalizes a canonical source-window baseline without changing the active window",async()=>{const {createEditorState}=await importTs("src/studio/editor/editorReducer.ts");const state=createEditorState(project);const item=state.project.items[0];assert.equal(item.sourceStartFrame,30);assert.equal(item.sourceDurationInFrames,60);assert.equal(item.canonicalSourceStartFrame,30);assert.equal(item.canonicalSourceDurationInFrames,60);assert.equal(item.sourceUsagePolicy,"QC_TRIM");assert.equal(item.sourceWindowApprovalRequired,false);});

test("P0-04 source-window edits clamp to the asset and retain timeline duration",async()=>{const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");const state=createEditorState(project);const next=editorReducer(state,{type:"CHANGE_VIDEO_SOURCE_WINDOW",itemId:video.id,sourceStartFrame:170,sourceDurationInFrames:50});const item=next.project.items[0];assert.equal(item.sourceStartFrame,170);assert.equal(item.sourceDurationInFrames,10);assert.equal(item.durationInFrames,60);const low=editorReducer(next,{type:"CHANGE_VIDEO_SOURCE_WINDOW",itemId:video.id,sourceStartFrame:-20,sourceDurationInFrames:0}).project.items[0];assert.equal(low.sourceStartFrame,0);assert.equal(low.sourceDurationInFrames,1);});

test("P0-04 source info exposes out frame, use percent, canonical window and binding provenance",async()=>{const {videoSourceOutFrame,videoSourceUsePercent,videoCanonicalWindow,videoSourceProvenanceLabel}=await importTs("src/studio/editor/videoSourceInfo.ts");assert.equal(videoSourceOutFrame(video),90);assert.ok(Math.abs(videoSourceUsePercent(video)-33.3333333333)<.001);assert.deepEqual(videoCanonicalWindow({...video,canonicalSourceStartFrame:20,canonicalSourceDurationInFrames:80}),{start:20,duration:80,end:100});assert.equal(videoSourceProvenanceLabel(video),"Canonical binding binding-1 r3");});

test("P0-04 inspector exposes source in/out, asset, used, timeline, rate and canonical provenance",async()=>{const src=await read("src/studio/editor/inspector/Inspector.tsx");for(const token of ["Source In","Source Out","Asset ","Used ","Timeline ","Rate ","data-editor-video-provenance","data-editor-canonical-source-window","changeVideoSourceWindow"])assert.match(src,new RegExp(token));});
