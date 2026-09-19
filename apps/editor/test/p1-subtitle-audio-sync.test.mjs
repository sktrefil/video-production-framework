import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildSubtitleAudioSyncPreview,normalizeSubtitleText} from "../scripts/subtitle-audio-sync.mjs";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const read=path=>readFile(resolve(root,path),"utf8");
const subtitle=(id,text,start,duration=30)=>({id,text,timelineStartFrame:start,durationInFrames:duration,type:"SUBTITLE",trackId:"T1",locked:false});

test("final-audio sync normalizes Korean punctuation while retaining numbers",()=>{
  assert.equal(normalizeSubtitleText("서기 107년에서 108년,"),"서기107년에서108년");
});

test("final-audio sync independently repairs local offset and accumulated drift",()=>{
  const subtitles=[subtitle("s1","첫 문장",0),subtitle("s2","서기 107년",90),subtitle("s3","마지막 기록",180)];
  const words=[
    {text:"첫",startSeconds:.1,endSeconds:.3,probability:.99},{text:"문장",startSeconds:.3,endSeconds:.8,probability:.99},
    {text:"서기",startSeconds:4,endSeconds:4.3,probability:.99},{text:"107년",startSeconds:4.3,endSeconds:5,probability:.99},
    {text:"마지막",startSeconds:8,endSeconds:8.5,probability:.99},{text:"기록",startSeconds:8.5,endSeconds:9,probability:.99}
  ];
  const result=buildSubtitleAudioSyncPreview({subtitles,words,fps:30,projectDurationInFrames:300});
  assert.equal(result.proposals[0].suggestedStartFrame,1);
  assert.equal(result.proposals[1].suggestedStartFrame,118);
  assert.equal(result.proposals[1].deltaFrames,28);
  assert.equal(result.proposals[2].suggestedStartFrame,238);
  assert.ok(result.proposals.every(item=>item.status==="READY"));
  for(let index=0;index<result.proposals.length-1;index++){
    const current=result.proposals[index];const next=result.proposals[index+1];
    assert.ok(current.suggestedStartFrame+current.suggestedDurationInFrames<next.suggestedStartFrame);
  }
});

test("final-audio sync flags weak text matches instead of silently applying them",()=>{
  const result=buildSubtitleAudioSyncPreview({subtitles:[subtitle("s1","완전히 다른 문장",0)],words:[{text:"불일치",startSeconds:1,endSeconds:2,probability:.9}],fps:30,projectDurationInFrames:100});
  assert.equal(result.proposals[0].status,"LOW_CONFIDENCE");
});

test("Whisper fallback remains isolated from the production gate",async()=>{
  const worker=await readFile(resolve(root,"../../runtimes/whisper/transcribe.py"),"utf8");
  const gate=await readFile(resolve(root,"scripts/editor-production-gate.mjs"),"utf8");
  assert.match(worker,/word_timestamps=True/);
  assert.doesNotMatch(gate,/whisper/i);
});

test("Studio exposes preview scopes and applies accepted timings as one undoable action",async()=>{
  const panel=await read("src/studio/editor/subtitles/SubtitleGeneratorPanel.tsx");
  const server=await read("scripts/editor-studio-server.mjs");
  const actions=await read("src/studio/editor/editorActions.ts");
  const reducer=await read("src/studio/editor/editorReducer.ts");
  for(const token of ["SELECTED","FROM_HERE","ALL","preview-subtitle-audio-sync","apply-subtitle-audio-sync"])assert.match(panel,new RegExp(token));
  assert.match(panel,/approvedIds/);
  assert.match(panel,/Resolve unchecked cue overlap before Apply/);
  assert.match(panel,/type="checkbox"/);
  assert.match(panel,/promoteSubtitleAudioSync/);
  assert.match(panel,/Saving canonical/);
  assert.match(server,/subtitle-sync\/preview/);
  assert.match(server,/subtitle-sync\/commit/);
  assert.match(server,/promoteStudioSubtitleSync/);
  assert.match(server,/transcribeFinalAudio/);
  assert.match(actions,/APPLY_SUBTITLE_SYNC/);
  assert.match(reducer,/generationSource:"TTS_TRANSCRIBE"/);
});
