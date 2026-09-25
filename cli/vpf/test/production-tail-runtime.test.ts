import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {
  buildFlowManualManifest,
  buildT070GenerationStateIds,
  buildT070PendingOrdinals,
  buildTailEditProject,
  selectT070RepresentativeSeedImageIds,
  selectT070SeedImageIds
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

test("T070 seed plan deterministically samples early, middle and late states",()=>{
  const prompts=Array.from({length:43},(_,index)=>({
    state_image_id:"STATE_"+String(index+1).padStart(2,"0")
  }));

  assert.deepEqual(
    selectT070SeedImageIds(prompts),
    ["STATE_01","STATE_22","STATE_43"]
  );
  assert.deepEqual(
    selectT070SeedImageIds(prompts.slice(0,2)),
    ["STATE_01","STATE_02"]
  );
  assert.deepEqual(selectT070SeedImageIds([],3),[]);
});

test("T070 representative seed plan samples ENTRY, middle MID and final TARGET",()=>{
  const prompts=[
    {state_image_id:"SC01_ENTRY",scene_id:"SC01"},
    {state_image_id:"SC01_TARGET",scene_id:"SC01"},
    {state_image_id:"SC02_ENTRY",scene_id:"SC02"},
    {state_image_id:"SC02_MID",scene_id:"SC02"},
    {state_image_id:"SC02_TARGET",scene_id:"SC02"},
    {state_image_id:"SC03_ENTRY",scene_id:"SC03"},
    {state_image_id:"SC03_TARGET",scene_id:"SC03"}
  ];
  const states=[
    {state_image_id:"SC01_ENTRY",scene_id:"SC01",role:"ENTRY",sequence_order:1},
    {state_image_id:"SC01_TARGET",scene_id:"SC01",role:"TARGET",sequence_order:2},
    {state_image_id:"SC02_ENTRY",scene_id:"SC02",role:"ENTRY",sequence_order:1},
    {state_image_id:"SC02_MID",scene_id:"SC02",role:"MID",sequence_order:2},
    {state_image_id:"SC02_TARGET",scene_id:"SC02",role:"TARGET",sequence_order:3},
    {state_image_id:"SC03_ENTRY",scene_id:"SC03",role:"ENTRY",sequence_order:1},
    {state_image_id:"SC03_TARGET",scene_id:"SC03",role:"TARGET",sequence_order:2}
  ] as any;

  assert.deepEqual(
    selectT070RepresentativeSeedImageIds(prompts,states,3),
    ["SC01_ENTRY","SC02_MID","SC03_TARGET"]
  );
});

test("T070 seed generation targets only three seeds and blocks later phases",()=>{
  const prompts=Array.from({length:43},(_,index)=>({
    state_image_id:"STATE_"+String(index+1).padStart(2,"0")
  }));
  const seeds=selectT070SeedImageIds(prompts);

  assert.deepEqual(
    buildT070GenerationStateIds(prompts,"SEED_GENERATION",seeds),
    ["STATE_01","STATE_22","STATE_43"]
  );
  assert.deepEqual(buildT070GenerationStateIds(prompts,"SEED_QC",seeds),[]);
  assert.equal(buildT070GenerationStateIds(prompts,"FULL_GENERATION",seeds).length,43);
  assert.deepEqual(buildT070GenerationStateIds(prompts,"FINAL_QC",seeds),[]);
});

test("new T070 execution pauses at SEED_QC before completion gate or full generation",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const index=read("cli/vpf/src/index.ts");

  assert.match(tail,/const legacyAdoption=!loadedCheckpoint\.exists&&attempt>1/);
  assert.match(tail,/\?"FULL_GENERATION"\s*:\s*"SEED_GENERATION"/);
  assert.match(tail,/selectT070RepresentativeSeedImageIds\(/);
  assert.match(tail,/const sceneOrder:string\[\]=\[\]/);
  assert.match(tail,/scenePrompts=promptRecord\.value\.image_prompts/);
  assert.match(tail,/phase="SEED_QC"/);
  assert.match(tail,/Full image generation is blocked until seed visual QC passes/);
  assert.match(tail,/status:"AWAITING_SEED_QC"/);
  assert.match(index,/const awaitingSeedQc = tailResult\.status === "AWAITING_SEED_QC"/);
  assert.match(index,/Production paused at the T070 seed visual-QC gate/);

  const t070Start=tail.indexOf('if(taskId==="T070"){');
  const seedReturn=tail.indexOf('if(t070Result==="AWAITING_SEED_QC")return"AWAITING_SEED_QC"',t070Start);
  const completionGate=tail.indexOf("await this.manager.recordGate(projectId,taskId,true)",t070Start);
  assert.ok(t070Start>=0);
  assert.ok(seedReturn>t070Start);
  assert.ok(completionGate>seedReturn);
});

test("T070 seed visual QC inspects actual pixels and only PASS unlocks full generation",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const manager=read("cli/vpf/src/codex-manager-runtime-service.ts");
  const runner=read("cli/vpf/src/codex-process-runner.ts");
  const storage=read("packages/storage/src/production-tail.ts");

  assert.match(tail,/runT070SeedVisualQcGate/);
  assert.match(tail,/expectedSha256:image\.sha256/);
  assert.match(tail,/reviewT070SeedVisuals\(/);
  assert.match(tail,/if\(seedQc\.verdict!=="PASS"\)/);
  assert.match(tail,/phase:"FULL_GENERATION"/);
  assert.match(tail,/Seed visual QC passed\. T070 full image generation is now unlocked/);
  assert.match(tail,/"t070_seed_visual_qc"/);
  assert.match(tail,/seed_set_sha256/);

  assert.match(manager,/taskId: "MANAGER_VISUAL:T070_SEED"/);
  assert.match(manager,/imagePaths: input\.seedImages\.map\(item => item\.absolutePath\)/);
  assert.match(manager,/Do not approve from prompt text, metadata, filenames, dimensions, or hashes alone/);
  assert.match(manager,/PASS only when every attached seed is visually suitable/);
  assert.match(runner,/imagePaths\?: string\[\]/);
  assert.match(runner,/args\.push\("--image", \.\.\.attachedImages, "--"\)/);
  assert.match(runner,/Inspect every attached image directly/);
  assert.match(storage,/\| "t070_seed_visual_qc"/);

  const qcIndex=tail.indexOf("const seedQc=await this.runT070SeedVisualQcGate");
  const passGuard=tail.indexOf('if(seedQc.verdict!=="PASS")',qcIndex);
  const unlock=tail.indexOf('phase:"FULL_GENERATION"',passGuard);
  const dispatch=tail.indexOf("const result=await this.runTask(projectId,taskId,resumeCurrentAttempt)",unlock);
  assert.ok(qcIndex>=0);
  assert.ok(passGuard>qcIndex);
  assert.ok(unlock>passGuard);
  assert.ok(dispatch>unlock);
});

test("T080 is locked behind pixel-grounded final QC of every approved T070 image",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const manager=read("cli/vpf/src/codex-manager-runtime-service.ts");
  const index=read("cli/vpf/src/index.ts");
  const storage=read("packages/storage/src/production-tail.ts");
  const resolver=read("packages/storage/src/workflow-orchestrator.ts");

  assert.match(tail,/runT070FinalVisualQcGate/);
  assert.match(tail,/approvedById\.size!==expectedPrompts\.length/);
  assert.match(tail,/expectedSha256:image\.sha256/);
  assert.match(tail,/reviewT070FinalVisualScene/);
  assert.match(tail,/checkedIds\.length!==expectedIds\.length/);
  assert.match(tail,/uniqueChecked\.size!==expectedIds\.length/);
  assert.match(tail,/status:"AWAITING_FINAL_IMAGE_QC"/);
  assert.match(tail,/T080 remains locked until failed T070 images\/scenes are corrected/);
  assert.match(tail,/rm\([\s\S]*?"06_clips\/google-flow-manifest\.json"[\s\S]*?\{force:true\}/);
  assert.match(tail,/"t070_final_visual_qc"/);

  assert.match(manager,/"MANAGER_VISUAL:T070_" \+ \(input\.reviewKind \?\? "FINAL"\)/);
  assert.match(manager,/imagePaths: input\.images\.map\(item => item\.absolutePath\)/);
  assert.match(manager,/Inspect every attachment directly and compare them with one another/);
  assert.match(manager,/ENTRY\/MID\/TARGET progression/);
  assert.match(manager,/PASS only when every attached image is individually acceptable/);

  assert.match(storage,/\| "t070_final_visual_qc"/);
  assert.match(resolver,/"t070_final_visual_qc"/);
  assert.match(index,/const awaitingFinalImageQc = tailResult\.status === "AWAITING_FINAL_IMAGE_QC"/);
  assert.match(index,/Production paused at the T070 final image visual-QC gate/);

  const t080=tail.indexOf('if(taskId==="T080")');
  const finalQc=tail.indexOf("await this.runT070FinalVisualQcGate",t080);
  const verdictGate=tail.indexOf('if(finalImageQc.verdict!=="PASS")',finalQc);
  const manifest=tail.indexOf("await this.prepareT080Manual(projectId)",verdictGate);
  assert.ok(t080>=0);
  assert.ok(finalQc>t080);
  assert.ok(verdictGate>finalQc);
  assert.ok(manifest>verdictGate);
});

test("T070 checkpoint persists phased seed state and remains backward compatible",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");

  assert.match(tail,/export type T070Phase=/);
  for(const phase of ["SEED_GENERATION","SEED_QC","FULL_GENERATION","FINAL_QC","COMPLETE"]){
    assert.match(tail,new RegExp("\\|\\\""+phase+"\\\""));
  }
  assert.match(tail,/phase:T070Phase/);
  assert.match(tail,/seed_image_ids:string\[\]/);
  assert.match(tail,/phase:isT070Phase\(parsed\.phase\)\?parsed\.phase:"FULL_GENERATION"/);
  assert.match(tail,/seed_image_ids:Array\.isArray\(parsed\.seed_image_ids\)/);
  assert.match(tail,/phase:input\.phase\?\?"FULL_GENERATION"/);
  assert.match(tail,/seed_image_ids:\[\.\.\.new Set\(input\.seedImageIds\?\?\[\]\)\]/);
});

test("T070 resume plan starts at 7/43 when the first six state images are checkpointed",()=>{
  const prompts=Array.from({length:43},(_,index)=>({
    state_image_id:"STATE_"+String(index+1).padStart(2,"0")
  }));
  const completed=prompts.slice(0,6).map(item=>item.state_image_id);
  const pending=buildT070PendingOrdinals(prompts,completed);

  assert.equal(pending.length,37);
  assert.equal(pending[0],7);
  assert.equal(pending.at(-1),43);
});

test("T070 runtime persists item checkpoints, skips completed states and can resume an exhausted attempt",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const workflow=read("cli/vpf/src/workflow-orchestrator-service.ts");

  assert.match(tail,/T070_CHECKPOINT_RELATIVE_PATH="05_images\/generated\/t070-checkpoint\.json"/);
  assert.match(tail,/writeT070Checkpoint\(checkpointAbsolute/);
  assert.match(tail,/const legacyAdoption=!loadedCheckpoint\.exists&&attempt>1/);
  assert.match(tail,/const reusable=completedByState\.get\(prompt\.state_image_id\)/);
  assert.match(tail,/T070_ITEM_MAX_ATTEMPTS=3/);
  assert.match(tail,/await this\.hasT070ResumeEvidence\(projectId\)/);
  assert.match(tail,/\{resumeCurrentAttempt\}/);

  const reusableIndex=tail.indexOf("const reusable=completedByState.get(prompt.state_image_id)");
  const continueIndex=tail.indexOf("continue;",reusableIndex);
  const generateIndex=tail.indexOf("const result=await adapter.generate",reusableIndex);
  assert.ok(reusableIndex>=0);
  assert.ok(continueIndex>reusableIndex);
  assert.ok(generateIndex>continueIndex);

  assert.match(workflow,/options: \{ resumeCurrentAttempt\?: boolean \} = \{\}/);
  assert.match(workflow,/Only an incomplete T070 revision\/failed\/running attempt can resume without consuming a new attempt/);
  assert.match(workflow,/task\.status === "FAILED" \|\| task\.status === "RUNNING"/);
  assert.match(workflow,/const attempt = resumeCurrentAttempt \? task\.attempt : task\.attempt \+ 1/);
});

test("T070 uses text-only GLOBAL visual grammar and attaches no GLOBAL reference image",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const compiler=read("packages/production-spec/src/agent3-prompt-compiler.ts");
  const imageRuntime=read("packages/provider-orchestrator/src/image-runtime.ts");

  assert.doesNotMatch(tail,/ThreeTierFilesystemReferenceSelector/);
  assert.doesNotMatch(tail,/REFERENCE_LIBRARY:GLOBAL_VISUAL:/);
  assert.doesNotMatch(tail,/PINNED_GLOBAL_VISUAL_2/);
  assert.match(tail,/TEXT_VISUAL_GRAMMAR_ONLY/);
  assert.match(tail,/references:\[\]/);
  assert.match(tail,/reference_roles:\[\]/);
  assert.match(tail,/no GLOBAL reference image is attached/);

  assert.match(compiler,/GLOBAL_VISUAL_GRAMMAR_EN/);
  assert.match(compiler,/GLOBAL_VISUAL_GRAMMAR_KO/);
  assert.match(compiler,/Do not imitate, reconstruct, or reuse the composition of any reference image/);
  assert.match(compiler,/direct imitation of any reference image/);

  assert.match(imageRuntime,/sessionKey\?: string/);
});

test("T070 full generation is scene-batched with targeted pixel-QC regeneration",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const manager=read("cli/vpf/src/codex-manager-runtime-service.ts");

  assert.match(tail,/const sceneOrder:string\[\]=\[\]/);
  assert.match(tail,/for\(const sceneId of sceneOrder\)/);
  assert.match(tail,/runT070SceneVisualQc\(/);
  assert.match(tail,/reviewKind:"SCENE"/);
  assert.match(tail,/sceneQcPassedIds\.add\(sceneId\)/);
  assert.match(tail,/revisionFeedbackByState\[stateImageId\]/);
  assert.match(tail,/completedByState\.delete\(stateImageId\)/);
  assert.match(tail,/await rm\(path\.resolve\(status\.projectRoot,previous\.relative_path\),\{force:true\}\)/);
  assert.match(tail,/if\(reviewCycle>=3\)/);
  assert.match(tail,/buildT070RuntimeProviderPrompt/);
  assert.match(tail,/Fantasy mode /);
  assert.match(tail,/Do not repeat a master composition from another scene/);

  assert.match(manager,/reviewKind\?: "SCENE" \| "FINAL"/);
  assert.match(manager,/fantasy_control/);
  assert.match(manager,/video_readiness/);
  assert.match(manager,/T070_SCENE/);
});

test("T070 cannot complete workflow before full final pixel QC passes",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");

  const runTask=tail.indexOf("private async runTask(");
  const execute=tail.indexOf("const t070Result=await this.executeT070",runTask);
  const finalQc=tail.indexOf("const finalImageQc=await this.runT070FinalVisualQcGate",execute);
  const gate=tail.indexOf("await this.manager.recordGate(projectId,taskId,true)",finalQc);
  const complete=tail.indexOf("const completed=await this.manager.complete(projectId,taskId)",gate);

  assert.ok(runTask>=0);
  assert.ok(execute>runTask);
  assert.ok(finalQc>execute);
  assert.ok(gate>finalQc);
  assert.ok(complete>gate);
  assert.match(tail,/prepareT070FinalQcRevision\(projectId,finalImageQc\)/);
  assert.match(tail,/for\(let finalCycle=1;finalCycle<=3;finalCycle\+=1\)/);
  assert.match(tail,/phase:"FINAL_QC_REVISION"/);
});

test("T070 final QC is policy-versioned and marks checkpoint COMPLETE only after PASS",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");

  assert.match(tail,/policy_version:"T070_IMAGE_POLICY_V1"/);
  assert.match(tail,/cached\?\.value\.policy_version==="T070_IMAGE_POLICY_V1"/);
  assert.match(tail,/phase:"FINAL_QC"/);
  assert.match(tail,/phase:"COMPLETE"/);
  assert.match(tail,/checkedIds\.length!==expectedIds\.length/);
  assert.match(tail,/uniqueChecked\.size!==expectedIds\.length/);
});

test("T080 manifest carries state, camera, transition, continuity, handoff and fantasy metadata",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");

  for(const field of [
    "entry_state_image_id",
    "mid_state_image_id",
    "target_state_image_id",
    "fantasy_mode",
    "camera",
    "transition_in",
    "transition_out",
    "continuity",
    "handoff"
  ]){
    assert.match(tail,new RegExp(field));
  }
  assert.match(tail,/clipProduction:ClipProductionDocument/);
  assert.match(tail,/sceneVisual:SceneVisualDocument/);
  assert.match(tail,/effectiveT070FantasyMode\(scene\)/);
  assert.match(tail,/purpose:clip\.camera\.purpose/);
  assert.match(tail,/movement_direction:scene\.continuity\.movement_direction/);
  assert.match(tail,/entry_anchor:scene\.handoff\.entry_anchor/);
});

test("confirmed regeneration reset removes stale T070 outputs and preserves upstream planning",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const index=read("cli/vpf/src/index.ts");
  const storage=read("packages/storage/src/production-tail.ts");

  assert.match(tail,/async resetT070ForRegeneration/);
  assert.match(tail,/T070_CHECKPOINT_RELATIVE_PATH/);
  assert.match(tail,/"06_clips\/google-flow-manifest\.json"/);
  assert.match(tail,/"09_render\/preview\.mp4"/);
  assert.match(tail,/tail\.supersedeActive\(projectId,\[/);
  assert.match(tail,/"t070_scene_visual_qc"/);
  assert.match(tail,/status:taskId==="T070"\?"READY":"BLOCKED"/);
  assert.match(tail,/for\(const taskId of \["T070","T080","T090","T100"\]/);
  assert.doesNotMatch(
    tail.slice(
      tail.indexOf("async resetT070ForRegeneration"),
      tail.indexOf("async runAll",tail.indexOf("async resetT070ForRegeneration"))
    ),
    /research_spec|story_spec|script|tts_manifest|scene_visual_spec|state_image_spec|prompt_bundle_spec/
  );

  assert.match(storage,/supersedeActive\(/);
  assert.match(index,/production regenerate-images <project_id> --confirm/);
  assert.match(index,/args\[1\] === "regenerate-images"/);
  assert.match(index,/resetT070ForRegeneration\(projectId\)/);
});

test("T070 checkpoint resume accepts an orphaned RUNNING attempt without incrementing it",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const workflow=read("cli/vpf/src/workflow-orchestrator-service.ts");

  assert.match(tail,/task\.status==="FAILED"\|\|task\.status==="RUNNING"/);
  assert.match(tail,/recoverableInterruptedT070/);
  assert.match(tail,/next\.status==="RUNNING"&&\(next\.attempt\?\?0\)>0/);
  assert.match(tail,/checkpoint\.value\?\.phase==="SEED_QC"/);
  assert.match(workflow,/\["REVISION_REQUIRED","FAILED","RUNNING"\]\.includes\(task\.status\)/);
  assert.match(workflow,/const attempt = resumeCurrentAttempt \? task\.attempt : task\.attempt \+ 1/);
});

test("production tail never reports COMPLETE merely because no task is READY",()=>{
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");
  const index=read("cli/vpf/src/index.ts");

  assert.match(tail,/if\(await this\.isProductionFinalized\(projectId,workflow\.tasks\)\)/);
  assert.match(tail,/Production tail has no runnable task but is not complete/);
  assert.match(tail,/task\.task_id==="T070"&&[\s\S]*?task\.status==="FAILED"\|\|task\.status==="RUNNING"/);
  assert.match(tail,/status:"AWAITING_SEED_QC"/);

  assert.match(index,/const awaitingSeedQc = tailResult\.status === "AWAITING_SEED_QC"/);
  assert.match(index,/const runComplete = tailResult\.status === "COMPLETE"/);
  assert.match(index,/Production run reached verified final completion/);
  assert.match(index,/\? "AWAITING_SEED_QC"/);
});

test("production run starts or resumes the T070-T100 tail and pauses before consuming T080",()=>{
  const index=read("cli/vpf/src/index.ts");
  const tail=read("cli/vpf/src/production-tail-runtime-service.ts");

  assert.match(index,/service\.upgradeRuntime\(projectId\)/);
  assert.match(index,/productionTailRuntime\.runAll\(projectId\)/);
  assert.match(index,/AWAITING_MANUAL_EXTERNAL/);
  assert.match(index,/AWAITING_FINAL_IMAGE_QC/);

  const prepare=tail.indexOf('if(taskId==="T080")');
  const resume=tail.indexOf("const resumeCurrentAttempt=",prepare);
  const dispatch=tail.indexOf(
    "const result=await this.runTask(projectId,taskId,resumeCurrentAttempt)",
    resume
  );
  assert.ok(prepare>=0);
  assert.ok(resume>prepare);
  assert.ok(dispatch>resume);
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
    "t070_seed_visual_qc",
    "t070_scene_visual_qc",
    "t070_final_visual_qc",
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


test("standalone CLI lifecycle builds storage before loading production-tail",()=>{
  const cliPackage=JSON.parse(read("cli/vpf/package.json")) as {
    scripts?:Record<string,string>;
  };
  const expectedCliPrereqBuild=
    "npm run build --workspace @vpf/provider-orchestrator && npm run build --workspace @vpf/storage";
  assert.equal(cliPackage.scripts?.prebuild,expectedCliPrereqBuild);
  assert.equal(cliPackage.scripts?.pretypecheck,expectedCliPrereqBuild);
  assert.equal(cliPackage.scripts?.pretest,expectedCliPrereqBuild);

  const storagePackage=JSON.parse(read("packages/storage/package.json")) as {
    exports?:Record<string,string>;
  };
  assert.equal(
    storagePackage.exports?.["./production-tail"],
    "./dist/production-tail.js"
  );
});
