import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {
  buildFlowManualManifest,
  buildTailEditProject
} from "../src/production-tail-runtime-service.js";

const root=resolve(import.meta.dirname,"../../..");
const read=(relative:string)=>readFileSync(resolve(root,relative),"utf8");

test("production tail builds a deterministic Google Flow manual manifest",()=>{
  const manifest=buildFlowManualManifest({
    projectId:"tail_fixture",
    generatedAt:"2026-09-25T06:00:00.000Z",
    promptBundle:{
      schema_version:"1.0",
      project_id:"tail_fixture",
      compiler_version:"AGENT3_PROMPT_COMPILER_V1",
      image_prompts:[],
      video_prompts:[{
        clip_id:"CLIP 01",
        scene_id:"SCENE_01",
        entry_state_image_id:"STATE_ENTRY",
        mid_state_image_id:"STATE_MID",
        target_state_image_id:"STATE_TARGET",
        prompt_ko:"한국어 프롬프트",
        prompt_en:"English prompt",
        provider_prompt_en:"Use the approved states exactly.",
        editorial_duration_sec:6,
        narrative_deadline_sec:5,
        target_state_deadline_sec:5.5,
        safe_trim_start_sec:6
      }]
    },
    approvedImages:{
      schema_version:"1.0",
      project_id:"tail_fixture",
      provider:"CHATGPT_BROWSER",
      source_prompt_bundle_sha256:"a".repeat(64),
      images:[
        {
          state_image_id:"STATE_ENTRY",
          scene_id:"SCENE_01",
          relative_path:"05_images/generated/STATE_ENTRY.png",
          sha256:"1".repeat(64),
          width:1536,
          height:864,
          provider_request_ids:[],
          reference_roles:[]
        },
        {
          state_image_id:"STATE_MID",
          scene_id:"SCENE_01",
          relative_path:"05_images/generated/STATE_MID.png",
          sha256:"2".repeat(64),
          width:1536,
          height:864,
          provider_request_ids:[],
          reference_roles:[]
        },
        {
          state_image_id:"STATE_TARGET",
          scene_id:"SCENE_01",
          relative_path:"05_images/generated/STATE_TARGET.png",
          sha256:"3".repeat(64),
          width:1536,
          height:864,
          provider_request_ids:[],
          reference_roles:[]
        }
      ]
    }
  });

  assert.equal(manifest.execution_mode,"MANUAL_EXTERNAL");
  assert.equal(manifest.generated_at,"2026-09-25T06:00:00.000Z");
  assert.equal(manifest.items.length,1);
  assert.equal(manifest.items[0]!.entry_image_relative_path,"05_images/generated/STATE_ENTRY.png");
  assert.equal(manifest.items[0]!.mid_image_relative_path,"05_images/generated/STATE_MID.png");
  assert.equal(manifest.items[0]!.target_image_relative_path,"05_images/generated/STATE_TARGET.png");
  assert.equal(manifest.items[0]!.expected_output_relative_path,"06_clips/generated/CLIP_01.mp4");
  assert.equal(manifest.items[0]!.provider_prompt_en,"Use the approved states exactly.");
});

test("production tail builds V1 A1 T1 edit project from unified artifacts",()=>{
  const project=buildTailEditProject({
    projectId:"tail_fixture",
    projectName:"Tail Fixture",
    fps:30,
    width:1920,
    height:1080,
    clips:[{
      clip_id:"CLIP_01",
      scene_id:"SCENE_01",
      relative_path:"06_clips/generated/CLIP_01.mp4",
      public_src:"runtime/tail_fixture/clips/CLIP_01.mp4",
      sha256:"4".repeat(64),
      source_duration_sec:8,
      editorial_duration_sec:6,
      width:1920,
      height:1080
    }],
    tts:{
      schema_version:"1.0",
      project_id:"tail_fixture",
      provider:"ELEVENLABS",
      voice_id:"REDACTED",
      model_id:"eleven_v3",
      total_duration_sec:6,
      sections:[{
        section_id:"tts-SCENE_01",
        timeline_start_sec:0,
        timeline_end_sec:6,
        text:"내레이션",
        audio_relative_path:"03_tts/sections/section_001.mp3",
        audio_sha256:"5".repeat(64),
        audio_duration_sec:6
      }]
    },
    ttsPublicSrc:{
      "tts-SCENE_01":"runtime/tail_fixture/tts/tts-SCENE_01.mp3"
    },
    subtitles:{
      schema_version:"1.0",
      project_id:"tail_fixture",
      cues:[{
        subtitle_id:"SUB_01",
        scene_id:"SCENE_01",
        start_sec:1,
        end_sec:3,
        text_ko:"자막"
      }]
    }
  });

  assert.deepEqual(project.tracks.map(track=>track.id),["V1","A1","T1"]);
  assert.equal(project.project.durationInFrames,180);
  const video=project.items.find(item=>item.id==="video-CLIP_01");
  assert.equal(video?.type,"VIDEO");
  assert.equal(video?.timelineStartFrame,0);
  assert.equal(video?.durationInFrames,180);
  const narration=project.items.find(item=>item.id==="tts-tts-SCENE_01");
  assert.equal(narration?.type,"TTS");
  assert.equal(narration?.trackId,"A1");
  const subtitle=project.items.find(item=>item.id==="subtitle-SUB_01");
  assert.equal(subtitle?.type,"SUBTITLE");
  assert.equal(subtitle?.timelineStartFrame,30);
  assert.equal(subtitle?.durationInFrames,60);
});

test("production run starts or resumes the T070-T100 tail and pauses before consuming T080",()=>{
  const index=read("cli/vpf/src/index.ts");
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");

  assert.match(index,/service\.upgradeRuntime\(projectId\)/);
  assert.match(index,/productionTailRuntime\.runAll\(projectId\)/);
  assert.match(index,/AWAITING_MANUAL_EXTERNAL/);

  const prepare=tail.indexOf('if\(taskId==="T080"\)');
  const dispatch=tail.indexOf("const result=await this.runTask(projectId,taskId)");
  assert.ok(prepare>=0);
  assert.ok(dispatch>prepare);
  assert.match(tail,/Google Flow manual-external clips are required before T080 can continue/);
  assert.match(tail,/manifest_relative_path:manual\.manifestRelativePath/);
});

test("migration 0024 and workflow resolver persist every tail artifact needed by T070-T100",()=>{
  const migration=read("migrations/0024_production_tail_runtime.sql");
  const resolver=read("packages/storage/src/workflow-orchestrator.ts");
  const storage=read("packages/storage/src/production-tail.ts");

  assert.match(migration,/CREATE TABLE IF NOT EXISTS production_tail_artifacts/);
  assert.match(migration,/source_task_id TEXT NOT NULL CHECK\(source_task_id IN \('T070','T080','T090','T100'\)\)/);

  for(const artifact of [
    "generated_images",
    "image_qc_result",
    "approved_images",
    "generated_clips",
    "clip_qc_result",
    "timeline_spec",
    "preview_render",
    "final_qc_result"
  ]){
    assert.match(resolver,new RegExp("\\\""+artifact+"\\\""));
    assert.match(storage,new RegExp("\\\""+artifact+"\\\""));
  }
});
