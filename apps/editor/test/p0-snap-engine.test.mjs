import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};
const item={id:"v1",type:"VIDEO",trackId:"V1",timelineStartFrame:20,durationInFrames:40,enabled:true,locked:false,src:"v.mp4",sourceStartFrame:0,sourceDurationInFrames:40,sourceAssetDurationInFrames:100,playbackRate:1,volume:0,x:0,y:0,scale:1,rotation:0,opacity:1,fit:"cover"};
const subtitle={id:"sub1",type:"SUBTITLE",trackId:"T1",timelineStartFrame:80,durationInFrames:20,enabled:true,locked:false,text:"sub",x:0,y:0,width:100,fontFamily:"sans-serif",fontSize:20,fontWeight:700,color:"#fff",strokeColor:"#000",strokeWidth:0,textAlign:"center",lineHeight:1,maxLines:2,backgroundEnabled:false,backgroundColor:"#000",backgroundOpacity:0};
const state={project:{project:{durationInFrames:200},items:[item,subtitle],settings:{snapEnabled:true,snapToleranceFrames:4}},playheadFrame:120};

test("P0-07 snap targets include playhead, project edges, item edges and subtitle edges",async()=>{const {buildSnapTargets}=await importTs("src/studio/editor/snapEngine.ts");const targets=buildSnapTargets(state,"v1");assert.deepEqual(targets.map((target)=>target.kind),["PROJECT_START","PROJECT_END","PLAYHEAD","SUBTITLE_START","SUBTITLE_END"]);assert.deepEqual(targets.map((target)=>target.frame),[0,200,120,80,100]);});

test("P0-07 move snapping can align either item edge while preserving item duration",async()=>{const {resolveSnapDelta}=await importTs("src/studio/editor/snapEngine.ts");const target={frame:100,kind:"ITEM_START"};const result=resolveSnapDelta({item,mode:"move",rawDeltaFrames:37,targets:[target],toleranceFrames:4,enabled:true});assert.equal(result.deltaFrames,40);assert.equal(result.target.frame,100);assert.equal(item.timelineStartFrame+result.deltaFrames+item.durationInFrames,100);});

test("P0-07 trim snapping obeys tolerance and Shift bypass",async()=>{const {resolveSnapDelta}=await importTs("src/studio/editor/snapEngine.ts");const target={frame:82,kind:"SUBTITLE_START"};const snapped=resolveSnapDelta({item,mode:"trim-end",rawDeltaFrames:20,targets:[target],toleranceFrames:3,enabled:true});assert.equal(snapped.deltaFrames,22);assert.equal(snapped.target.kind,"SUBTITLE_START");const bypassed=resolveSnapDelta({item,mode:"trim-end",rawDeltaFrames:20,targets:[target],toleranceFrames:3,enabled:true,bypass:true});assert.equal(bypassed.deltaFrames,20);assert.equal(bypassed.target,null);});

test("P0-07 timeline exposes snap toggle, Shift bypass and guide",async()=>{const timeline=await read("src/studio/editor/timeline/Timeline.tsx");for(const token of ["buildSnapTargets","resolveSnapDelta","event.shiftKey","snapToleranceFrames","data-editor-command=\"toggle-snap\"","data-editor-snap-guide"])assert.match(timeline,new RegExp(token));});
