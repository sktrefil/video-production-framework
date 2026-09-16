import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

const video={id:"v1",type:"VIDEO",trackId:"V1",timelineStartFrame:0,durationInFrames:60,enabled:true,locked:false,src:"projects/p/media/v.mp4",sourceStartFrame:0,sourceDurationInFrames:90,sourceAssetDurationInFrames:120,playbackRate:1,volume:0,x:0,y:0,scale:1,rotation:0,opacity:1,fit:"cover",sourceUsagePolicy:"QC_TRIM"};

test("P1-04 playback-rate guard respects available source frames",async()=>{const {maxPlaybackRateForVideo,clampVideoPlaybackRate,playbackDurationPolicyLabel}=await importTs("src/studio/editor/videoPlaybackRate.ts");assert.equal(maxPlaybackRateForVideo(video),1.5);assert.equal(clampVideoPlaybackRate(2,video),1.5);assert.equal(clampVideoPlaybackRate(.5,video),.5);assert.equal(maxPlaybackRateForVideo({...video,loop:true}),16);assert.match(playbackDurationPolicyLabel(video),/Timeline fixed/);assert.match(playbackDurationPolicyLabel(video),/QC_TRIM/);});

test("P1-04 Inspector exposes preset, numeric, reset and duration-policy controls",async()=>{const inspector=await read("src/studio/editor/inspector/Inspector.tsx");for(const token of ["data-editor-playback-rate-preset","data-editor-playback-rate","data-editor-command=\"reset-playback-rate\"","data-editor-playback-policy","clampVideoPlaybackRate","maxPlaybackRateForVideo","changePlaybackRate"])assert.ok(inspector.includes(token),`missing ${token}`);});

test("P1-04 renderer still drives media playback from item playbackRate",async()=>{const renderer=await read("src/editor/VideoItemRenderer.tsx");assert.match(renderer,/playbackRate=\{item\.playbackRate\}/);assert.match(renderer,/trimAfter=\{item\.sourceStartFrame\+item\.sourceDurationInFrames\}/);});
