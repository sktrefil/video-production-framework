import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import ts from "typescript";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=(path)=>readFile(resolve(root,path),"utf8");
const importTs=async(path)=>{const source=await read(path);const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);};

test("A2 master volume defaults to 100 percent and persists as one project setting",async()=>{
  const {createEditorState,editorReducer}=await importTs("src/studio/editor/editorReducer.ts");
  const project={schemaVersion:1,project:{id:"p",name:"A2",fps:30,width:1080,height:1920,durationInFrames:30},tracks:[{id:"A2",type:"AUDIO",name:"Clip Audio",enabled:true,locked:false,order:5}],items:[],settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};
  let state=createEditorState(project);
  assert.equal(state.project.settings.clipAudioMasterVolume,1);
  state=editorReducer(state,{type:"SET_CLIP_AUDIO_MASTER_VOLUME",volume:.35});
  assert.equal(state.project.settings.clipAudioMasterVolume,.35);
  assert.equal(JSON.parse(JSON.stringify(state.project)).settings.clipAudioMasterVolume,.35);
});

test("A2 slider and renderer apply the setting only to the A2 audio track",async()=>{
  const timeline=await read("src/studio/editor/timeline/Timeline.tsx");
  const renderer=await read("src/editor/ProjectRenderer.tsx");
  const audioRenderer=await read("src/editor/AudioItemRenderer.tsx");
  assert.match(timeline,/data-editor-a2-master-volume/);
  assert.match(timeline,/aria-label="A2 전체 볼륨"/);
  assert.match(timeline,/setClipAudioMasterVolume/);
  assert.match(timeline,/beginEditTransaction/);
  assert.match(timeline,/endEditTransaction/);
  assert.match(renderer,/item\.trackId==="A2"\?clipAudioMasterVolume:1/);
  assert.match(renderer,/masterVolume\*trackVolume/);
  assert.match(audioRenderer,/Html5Audio/);
  assert.doesNotMatch(audioRenderer,/@remotion\/media/);
});

test("selected audio can audition only its source window outside timeline playback",async()=>{
  const inspector=await read("src/studio/editor/inspector/Inspector.tsx");
  const audition=await read("src/studio/editor/audio/auditionAudio.ts");
  assert.match(inspector,/data-editor-command="audition-audio-source"/);
  assert.match(inspector,/data-editor-command="stop-audio-audition"/);
  assert.match(inspector,/auditionAudioClip\(audio,state\.project\.project\.fps/);
  assert.match(audition,/new Audio\(resolveEditorMediaSrc\(item\.src\)\)/);
  assert.match(audition,/item\.sourceStartFrame/);
  assert.match(audition,/item\.sourceDurationInFrames/);
});
