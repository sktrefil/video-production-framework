import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {copyFile, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import * as path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import type {GenericEditProject} from "@vpf/domain";
import type {ProjectBootstrapService, ProjectStatus} from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type FormatProfilePayload,
  type ResourcePin
} from "@vpf/resource-registry";
import {
  probeImageBytes,
  type ImageProviderAdapter
} from "@vpf/provider-orchestrator/image-runtime";
import type {
  Agent2SubtitleTimingSpec,
  Agent2TtsManifest,
  ClipProductionDocument,
  PromptBundleDocument,
  SceneVisualDocument,
  StateImageDocument
} from "@vpf/production-spec";
import {Agent2StoryAudioRepository} from "@vpf/storage/agent2-story-audio";
import {Agent3VisualProductionRepository} from "@vpf/storage/agent3-visual-production";
import {ProductionTailRepository} from "@vpf/storage/production-tail";
import {ProductionSpecRepository} from "@vpf/storage/production-spec";
import {WorkflowOrchestratorRepository} from "@vpf/storage/workflow-orchestrator";
import {Agent1WorkflowOrchestratorService} from "./workflow-orchestrator-service.js";
import {CodexManagerRuntimeService} from "./codex-manager-runtime-service.js";
import {CodexProcessRunner} from "./codex-process-runner.js";
import {ProductionProgressReporter} from "./production-progress.js";

const DEFAULT_REPOSITORY_ROOT=path.resolve(fileURLToPath(new URL("../../..",import.meta.url)));

type TailTaskId="T070"|"T080"|"T090"|"T100";

type GeneratedImage={
  state_image_id:string;
  scene_id:string;
  relative_path:string;
  sha256:string;
  width:number;
  height:number;
  provider_request_ids:string[];
  reference_roles:string[];
};

type GeneratedImagesArtifact={
  schema_version:"1.0";
  project_id:string;
  provider:string;
  source_prompt_bundle_sha256:string;
  images:GeneratedImage[];
};

export type T070Phase=
  |"SEED_GENERATION"
  |"SEED_QC"
  |"FULL_GENERATION"
  |"FINAL_QC"
  |"COMPLETE";

type T070ExecutionResult="COMPLETE_READY"|"AWAITING_SEED_QC";

type T070SeedVisualQcArtifact={
  schema_version:"1.0";
  policy_version:"T070_IMAGE_POLICY_V1";
  project_id:string;
  seed_set_sha256:string;
  source_prompt_bundle_sha256:string;
  seed_image_ids:string[];
  verdict:"PASS"|"REVISE"|"FAIL";
  summary:string;
  cross_seed_diversity:"PASS"|"FAIL";
  style_coherence:"PASS"|"FAIL";
  checks:Array<{
    state_image_id:string;
    verdict:"PASS"|"REVISE"|"FAIL";
    prompt_alignment:"PASS"|"FAIL";
    visual_consistency:"PASS"|"FAIL";
    factual_constraints:"PASS"|"FAIL";
    continuity_readiness:"PASS"|"FAIL";
    artifact_quality:"PASS"|"FAIL";
    fantasy_control:"PASS"|"FAIL";
    video_readiness:"PASS"|"FAIL";
    notes:string[];
  }>;
  revision_instruction:string;
  reviewed_at:string;
};

type T070SceneVisualQcResultRecord={
  scene_id:string;
  scene_image_set_sha256:string;
  attempt:number;
  verdict:"PASS"|"REVISE"|"FAIL";
  summary:string;
  continuity_verdict:"PASS"|"FAIL";
  handoff_verdict:"PASS"|"FAIL";
  checks:Array<{
    state_image_id:string;
    verdict:"PASS"|"REVISE"|"FAIL";
    prompt_alignment:"PASS"|"FAIL";
    visual_consistency:"PASS"|"FAIL";
    factual_constraints:"PASS"|"FAIL";
    continuity_readiness:"PASS"|"FAIL";
    artifact_quality:"PASS"|"FAIL";
    fantasy_control:"PASS"|"FAIL";
    video_readiness:"PASS"|"FAIL";
    notes:string[];
  }>;
  revision_instruction:string;
  reviewed_at:string;
};

type T070SceneVisualQcArtifact={
  schema_version:"1.0";
  policy_version:"T070_IMAGE_POLICY_V1";
  project_id:string;
  source_prompt_bundle_sha256:string;
  scene_results:T070SceneVisualQcResultRecord[];
  updated_at:string;
};

type T070FinalVisualQcArtifact={
  schema_version:"1.0";
  policy_version:"T070_IMAGE_POLICY_V1";
  project_id:string;
  image_set_sha256:string;
  source_prompt_bundle_sha256:string;
  expected_image_count:number;
  checked_image_count:number;
  verdict:"PASS"|"REVISE"|"FAIL";
  summary:string;
  failed_scene_ids:string[];
  failed_image_ids:string[];
  scene_results:Array<{
    scene_id:string;
    verdict:"PASS"|"REVISE"|"FAIL";
    summary:string;
    continuity_verdict:"PASS"|"FAIL";
    handoff_verdict:"PASS"|"FAIL";
    checks:Array<{
      state_image_id:string;
      verdict:"PASS"|"REVISE"|"FAIL";
      prompt_alignment:"PASS"|"FAIL";
      visual_consistency:"PASS"|"FAIL";
      factual_constraints:"PASS"|"FAIL";
      continuity_readiness:"PASS"|"FAIL";
      artifact_quality:"PASS"|"FAIL";
      fantasy_control:"PASS"|"FAIL";
      video_readiness:"PASS"|"FAIL";
      notes:string[];
    }>;
    revision_instruction:string;
  }>;
  revision_instructions:string[];
  reviewed_at:string;
};

type T070Checkpoint={
  schema_version:"1.0";
  project_id:string;
  source_prompt_bundle_sha256:string;
  width:number;
  height:number;
  phase:T070Phase;
  seed_image_ids:string[];
  scene_qc_passed_ids:string[];
  scene_qc_attempts:Record<string,number>;
  revision_feedback_by_state:Record<string,string>;
  images:GeneratedImage[];
  updated_at:string;
};

type T070CheckpointLoad={
  exists:boolean;
  value:T070Checkpoint|null;
};

const T070_CHECKPOINT_RELATIVE_PATH="05_images/generated/t070-checkpoint.json";
const T070_ITEM_MAX_ATTEMPTS=3;

type FlowManifestItem={
  clip_id:string;
  scene_id:string;
  entry_state_image_id:string;
  mid_state_image_id:string|null;
  target_state_image_id:string;
  provider_prompt_en:string;
  editorial_duration_sec:number;
  narrative_deadline_sec:number;
  target_state_deadline_sec:number;
  safe_trim_start_sec:number;
  entry_image_relative_path:string;
  mid_image_relative_path:string|null;
  target_image_relative_path:string;
  fantasy_mode:"OFF"|"RESTRAINED"|"EDITORIAL"|"HEIGHTENED"|null;
  camera:{
    purpose:string;
    movement:string;
    shot_size_start:string;
    shot_size_end:string;
    movement_curve:string;
  }|null;
  transition_in:string|null;
  transition_out:string|null;
  continuity:{
    movement_direction:string;
    screen_direction:string;
    camera_energy:string;
  }|null;
  handoff:{
    entry_anchor:string;
    exit_anchor:string;
    preserve_elements:string[];
    next_cut_intent:string;
  }|null;
  expected_output_relative_path:string;
};

export type FlowManualManifest={
  schema_version:"1.0";
  project_id:string;
  provider:"GOOGLE_FLOW";
  execution_mode:"MANUAL_EXTERNAL";
  generated_at:string;
  items:FlowManifestItem[];
};

type GeneratedClip={
  clip_id:string;
  scene_id:string;
  relative_path:string;
  sha256:string;
  source_duration_sec:number;
  editorial_duration_sec:number;
  width:number|null;
  height:number|null;
};

type GeneratedClipsArtifact={
  schema_version:"1.0";
  project_id:string;
  provider:"GOOGLE_FLOW";
  clips:GeneratedClip[];
};

type PreviewRenderArtifact={
  schema_version:"1.0";
  project_id:string;
  relative_path:string;
  sha256:string;
  size_bytes:number;
  duration_sec:number;
  width:number|null;
  height:number|null;
};

function effectiveT070FantasyMode(scene:SceneVisualDocument["scenes"][number]):"OFF"|"RESTRAINED"|"EDITORIAL"|"HEIGHTENED"{
  if(scene.fantasy_mode!==undefined)return scene.fantasy_mode;
  if(
    scene.factuality_mode==="EVIDENCE"||
    scene.factuality_mode==="HISTORICAL_RECONSTRUCTION"
  )return"RESTRAINED";
  if(scene.factuality_mode==="LEGEND_RECONSTRUCTION")return"HEIGHTENED";
  return"EDITORIAL";
}

function buildT070RuntimeProviderPrompt(input:{
  basePrompt:string;
  scene:SceneVisualDocument["scenes"][number];
  state:StateImageDocument["state_images"][number];
  revisionFeedback?:string;
}):string{
  const fantasyMode=effectiveT070FantasyMode(input.scene);
  const fantasyPolicy=
    fantasyMode==="OFF"
      ?"Keep the frame observational and materially plausible; do not add symbolic fantasy."
      :fantasyMode==="RESTRAINED"
        ?"Allow restrained cinematic atmosphere, mist, light, texture and subtle symbolism, but no invented historical evidence, event or supernatural cause."
        :fantasyMode==="HEIGHTENED"
          ?"Allow heightened editorial atmosphere and symbolic spatial treatment, while every historical claim remains evidence-compatible and visibly non-literal."
          :"Allow editorial fantasy through non-textual atmosphere, light, mist, texture and symbolic motifs; do not change the historical claim or invent evidence.";

  return[
    input.basePrompt,
    "T070 IMAGE POLICY V1.",
    "Content authority is the approved Scene/State meaning; compose this state from its own narrative purpose rather than from any reference-image composition.",
    "Global visual grammar is text-only: cinematic editorial framing, layered depth, generous negative space, restrained subject scale, terrain/traces/light/weather as narrative devices, and mystery-compatible ambiguity.",
    "Fantasy mode "+fantasyMode+": "+fantasyPolicy,
    "The frame must be video-ready with a clear continuable motion vector and preserve the stated handoff anchor.",
    "Do not repeat a master composition from another scene. Do not imitate or reconstruct any GLOBAL reference image.",
    input.revisionFeedback?.trim()
      ?"REVISION FEEDBACK FOR THIS STATE: "+input.revisionFeedback.trim()
      :""
  ].filter(Boolean).join(" ");
}

export class ProductionTailRuntimeError extends Error{
  constructor(
    public readonly code:
      |"TAIL_MIGRATION_REQUIRED"
      |"TAIL_PREREQUISITE"
      |"TAIL_IMAGE_PROVIDER"
      |"TAIL_IMAGE_INVALID"
      |"TAIL_MANUAL_RESULT_INVALID"
      |"TAIL_FFPROBE_FAILED"
      |"TAIL_EDITOR_RENDER_FAILED"
      |"TAIL_MANAGER_QC_REJECTED"
      |"TAIL_FINAL_QC_REJECTED",
    message:string
  ){
    super(message);
    this.name="ProductionTailRuntimeError";
  }
}

function sha256Bytes(bytes:Uint8Array):string{
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFileSegment(value:string):string{
  const safe=value.trim().replace(/[^A-Za-z0-9._-]+/gu,"_").replace(/^_+|_+$/gu,"");
  return safe||"artifact";
}

async function atomicWrite(filename:string,bytes:Uint8Array):Promise<void>{
  await mkdir(path.dirname(filename),{recursive:true});
  const temporary=filename+".tmp-"+String(process.pid)+"-"+String(Date.now());
  await writeFile(temporary,bytes);
  await rename(temporary,filename);
}

async function writeJson(filename:string,value:unknown):Promise<void>{
  await mkdir(path.dirname(filename),{recursive:true});
  const temporary=filename+".tmp-"+String(process.pid)+"-"+String(Date.now());
  await writeFile(temporary,JSON.stringify(value,null,2)+"\n","utf8");
  await rename(temporary,filename);
}

async function readyFile(filename:string):Promise<boolean>{
  try{
    const info=await stat(filename);
    return info.isFile()&&info.size>0;
  }catch{
    return false;
  }
}

async function fileSha256(filename:string):Promise<string>{
  return sha256Bytes(await readFile(filename));
}

function isT070Phase(value:unknown):value is T070Phase{
  return value==="SEED_GENERATION"||
    value==="SEED_QC"||
    value==="FULL_GENERATION"||
    value==="FINAL_QC"||
    value==="COMPLETE";
}

async function readT070Checkpoint(filename:string):Promise<T070CheckpointLoad>{
  try{
    const parsed=JSON.parse(await readFile(filename,"utf8")) as Partial<T070Checkpoint>;
    const valid=
      parsed.schema_version==="1.0"&&
      typeof parsed.project_id==="string"&&
      typeof parsed.source_prompt_bundle_sha256==="string"&&
      typeof parsed.width==="number"&&
      typeof parsed.height==="number"&&
      Array.isArray(parsed.images)&&
      typeof parsed.updated_at==="string";
    if(!valid)return{exists:true,value:null};

    // Checkpoints written before phased T070 existed are still authoritative
    // for their generated image set. They resume as FULL_GENERATION so the
    // migration never discards or regenerates already-produced images.
    const normalized:T070Checkpoint={
      schema_version:"1.0",
      project_id:parsed.project_id!,
      source_prompt_bundle_sha256:parsed.source_prompt_bundle_sha256!,
      width:parsed.width!,
      height:parsed.height!,
      phase:isT070Phase(parsed.phase)?parsed.phase:"FULL_GENERATION",
      seed_image_ids:Array.isArray(parsed.seed_image_ids)
        ?parsed.seed_image_ids.filter((value):value is string=>typeof value==="string")
        :[],
      scene_qc_passed_ids:Array.isArray(parsed.scene_qc_passed_ids)
        ?parsed.scene_qc_passed_ids.filter((value):value is string=>typeof value==="string")
        :[],
      scene_qc_attempts:
        typeof parsed.scene_qc_attempts==="object"&&parsed.scene_qc_attempts!==null
          ?parsed.scene_qc_attempts as Record<string,number>
          :{},
      revision_feedback_by_state:
        typeof parsed.revision_feedback_by_state==="object"&&parsed.revision_feedback_by_state!==null
          ?parsed.revision_feedback_by_state as Record<string,string>
          :{},
      images:parsed.images as GeneratedImage[],
      updated_at:parsed.updated_at!
    };
    return{exists:true,value:normalized};
  }catch(error){
    const code=(error as NodeJS.ErrnoException).code;
    if(code==="ENOENT")return{exists:false,value:null};
    return{exists:true,value:null};
  }
}

async function inspectReusableImage(input:{
  projectRoot:string;
  relativePath:string;
  expectedWidth:number;
  expectedHeight:number;
  expectedSha256?:string;
}):Promise<{sha256:string;width:number;height:number}|null>{
  try{
    const absolute=path.resolve(input.projectRoot,input.relativePath);
    if(!(await readyFile(absolute)))return null;
    const bytes=await readFile(absolute);
    const probe=probeImageBytes(bytes);
    if(
      probe.mimeType!=="image/png"||
      probe.width!==input.expectedWidth||
      probe.height!==input.expectedHeight
    )return null;
    const sha256=sha256Bytes(bytes);
    if(input.expectedSha256!==undefined&&sha256!==input.expectedSha256)return null;
    return{sha256,width:probe.width,height:probe.height};
  }catch{
    return null;
  }
}

async function writeT070Checkpoint(
  filename:string,
  input:{
    projectId:string;
    promptBundleSha256:string;
    width:number;
    height:number;
    phase?:T070Phase;
    seedImageIds?:string[];
    sceneQcPassedIds?:string[];
    sceneQcAttempts?:Record<string,number>;
    revisionFeedbackByState?:Record<string,string>;
    images:GeneratedImage[];
  }
):Promise<void>{
  const checkpoint:T070Checkpoint={
    schema_version:"1.0",
    project_id:input.projectId,
    source_prompt_bundle_sha256:input.promptBundleSha256,
    width:input.width,
    height:input.height,
    phase:input.phase??"FULL_GENERATION",
    seed_image_ids:[...new Set(input.seedImageIds??[])],
    scene_qc_passed_ids:[...new Set(input.sceneQcPassedIds??[])],
    scene_qc_attempts:{...(input.sceneQcAttempts??{})},
    revision_feedback_by_state:{...(input.revisionFeedbackByState??{})},
    images:input.images,
    updated_at:new Date().toISOString()
  };
  await writeJson(filename,checkpoint);
}

async function runProcess(command:string,args:string[],cwd:string):Promise<void>{
  await new Promise<void>((resolveRun,rejectRun)=>{
    const child=spawn(command,args,{
      cwd,
      stdio:"inherit",
      windowsHide:true,
      shell:false,
      env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"}
    });
    child.once("error",rejectRun);
    child.once("exit",(code,signal)=>{
      if(code===0)resolveRun();
      else rejectRun(new Error(signal!==null
        ?"Process terminated by "+signal
        :"Process exited with code "+String(code??"unknown")));
    });
  });
}

async function probeVideo(filename:string):Promise<{
  durationSec:number;
  width:number|null;
  height:number|null;
}>{
  const script=path.join(
    DEFAULT_REPOSITORY_ROOT,
    "apps","editor","scripts","probe-tail-video.mjs"
  );
  const stdout:Buffer[]=[];
  const stderr:Buffer[]=[];
  await new Promise<void>((resolveRun,rejectRun)=>{
    const child=spawn(process.execPath,[script,filename],{
      cwd:DEFAULT_REPOSITORY_ROOT,
      stdio:["ignore","pipe","pipe"],
      windowsHide:true,
      shell:false,
      env:{...process.env}
    });
    child.stdout.on("data",chunk=>stdout.push(Buffer.from(chunk)));
    child.stderr.on("data",chunk=>stderr.push(Buffer.from(chunk)));
    child.once("error",error=>rejectRun(new ProductionTailRuntimeError(
      "TAIL_FFPROBE_FAILED",
      "Tail video probe could not start: "+error.message
    )));
    child.once("exit",code=>{
      if(code===0)resolveRun();
      else rejectRun(new ProductionTailRuntimeError(
        "TAIL_FFPROBE_FAILED",
        Buffer.concat(stderr).toString("utf8").trim()||"Tail video probe failed."
      ));
    });
  });
  let parsed:{durationSec?:number;width?:number|null;height?:number|null};
  try{
    parsed=JSON.parse(Buffer.concat(stdout).toString("utf8")) as typeof parsed;
  }catch{
    throw new ProductionTailRuntimeError(
      "TAIL_FFPROBE_FAILED",
      "Tail video probe returned invalid JSON."
    );
  }
  const durationSec=Number(parsed.durationSec??0);
  if(!Number.isFinite(durationSec)||durationSec<=0){
    throw new ProductionTailRuntimeError(
      "TAIL_MANUAL_RESULT_INVALID",
      "Video duration is missing or invalid: "+filename
    );
  }
  return{
    durationSec,
    width:typeof parsed.width==="number"&&Number.isFinite(parsed.width)?parsed.width:null,
    height:typeof parsed.height==="number"&&Number.isFinite(parsed.height)?parsed.height:null
  };
}

function requireFormatPin(status:ProjectStatus):ResourcePin{
  const pin=status.resourcePins.find(item=>item.resourceType==="FORMAT_PROFILE");
  if(pin===undefined)throw new ProductionTailRuntimeError("TAIL_PREREQUISITE","FORMAT_PROFILE pin is missing.");
  return pin;
}

async function importImageAdapter(moduleSpec:string):Promise<ImageProviderAdapter>{
  const trimmed=moduleSpec.trim()||path.join(
    DEFAULT_REPOSITORY_ROOT,
    "runtimes","image","adapters","chatgpt-browser-adapter.mjs"
  );
  const specifier=path.isAbsolute(trimmed)||path.win32.isAbsolute(trimmed)
    ?pathToFileURL(trimmed).href
    :trimmed.startsWith(".")
      ?pathToFileURL(path.resolve(trimmed)).href
      :trimmed;
  let loaded:Record<string,unknown>;
  try{
    loaded=await import(specifier) as Record<string,unknown>;
  }catch(error){
    throw new ProductionTailRuntimeError(
      "TAIL_IMAGE_PROVIDER",
      "Could not load image adapter: "+(error instanceof Error?error.message:String(error))
    );
  }
  let candidate=loaded.default;
  if(candidate===undefined&&typeof loaded.createImageProviderAdapter==="function"){
    candidate=await (loaded.createImageProviderAdapter as ()=>Promise<unknown>|unknown)();
  }
  if(typeof candidate!=="object"||candidate===null||typeof (candidate as {generate?:unknown}).generate!=="function"){
    throw new ProductionTailRuntimeError("TAIL_IMAGE_PROVIDER","Image adapter must expose generate(request).");
  }
  return candidate as ImageProviderAdapter;
}

function imageByState(images:GeneratedImage[],stateId:string):GeneratedImage{
  const image=images.find(item=>item.state_image_id===stateId);
  if(image===undefined)throw new ProductionTailRuntimeError(
    "TAIL_PREREQUISITE",
    "Approved image is missing for state "+stateId+"."
  );
  return image;
}

export function selectT070SeedImageIds(
  prompts:Array<{state_image_id:string;scene_id?:string}>,
  seedCount=3
):string[]{
  if(prompts.length===0||seedCount<=0)return[];
  const target=Math.min(Math.max(1,Math.floor(seedCount)),prompts.length);
  if(target===1)return[prompts[0]!.state_image_id];

  const indices=Array.from({length:target},(_,index)=>
    Math.round((index*(prompts.length-1))/(target-1))
  );
  const selected:string[]=[];
  const seen=new Set<string>();
  for(const index of indices){
    const id=prompts[index]!.state_image_id;
    if(seen.has(id))continue;
    seen.add(id);
    selected.push(id);
  }
  return selected;
}

export function selectT070RepresentativeSeedImageIds(
  prompts:Array<{state_image_id:string;scene_id:string}>,
  states:StateImageDocument["state_images"],
  seedCount=3
):string[]{
  if(prompts.length===0||seedCount<=0)return[];
  const target=Math.min(Math.max(1,Math.floor(seedCount)),prompts.length);
  const promptById=new Map(prompts.map(prompt=>[prompt.state_image_id,prompt] as const));
  const stateById=new Map(states.map(state=>[state.state_image_id,state] as const));
  const sceneOrder:string[]=[];
  for(const prompt of prompts){
    if(!sceneOrder.includes(prompt.scene_id))sceneOrder.push(prompt.scene_id);
  }

  const pickFromScene=(sceneId:string,preferredRole:"ENTRY"|"MID"|"TARGET"):string|null=>{
    const candidates=states
      .filter(state=>state.scene_id===sceneId&&promptById.has(state.state_image_id))
      .sort((a,b)=>a.sequence_order-b.sequence_order);
    if(candidates.length===0)return null;
    if(preferredRole==="MID"){
      const mids=candidates.filter(state=>state.role==="MID");
      if(mids.length>0)return mids[Math.floor((mids.length-1)/2)]!.state_image_id;
    }
    const preferred=candidates.find(state=>state.role===preferredRole);
    return (preferred??candidates[Math.floor((candidates.length-1)/2)]!)!.state_image_id;
  };

  const selected:string[]=[];
  const add=(id:string|null)=>{
    if(id!==null&&!selected.includes(id)&&selected.length<target)selected.push(id);
  };

  if(sceneOrder.length>=1)add(pickFromScene(sceneOrder[0]!,"ENTRY"));
  if(target>=2&&sceneOrder.length>=2){
    const middleScene=sceneOrder[Math.floor((sceneOrder.length-1)/2)]!;
    add(pickFromScene(middleScene,"MID"));
  }
  if(target>=3&&sceneOrder.length>=1){
    add(pickFromScene(sceneOrder.at(-1)!,"TARGET"));
  }

  // Fill any remaining slots from evenly distributed prompt positions while
  // preserving deterministic output and avoiding duplicate scene/state picks.
  for(const id of selectT070SeedImageIds(prompts,target)){
    add(id);
  }
  for(const prompt of prompts){
    add(prompt.state_image_id);
  }

  // Ignore stale state rows that are not represented by the current prompt set.
  return selected.filter(id=>stateById.has(id)&&promptById.has(id)).slice(0,target);
}

export function buildT070GenerationStateIds(
  prompts:Array<{state_image_id:string}>,
  phase:T070Phase,
  seedImageIds:Iterable<string>
):string[]{
  if(phase==="SEED_QC"||phase==="FINAL_QC"||phase==="COMPLETE")return[];
  if(phase==="FULL_GENERATION")return prompts.map(prompt=>prompt.state_image_id);
  const seeds=new Set(seedImageIds);
  return prompts
    .filter(prompt=>seeds.has(prompt.state_image_id))
    .map(prompt=>prompt.state_image_id);
}

export function buildT070PendingOrdinals(
  prompts:Array<{state_image_id:string}>,
  completedStateIds:Iterable<string>
):number[]{
  const completed=new Set(completedStateIds);
  return prompts.flatMap((prompt,index)=>
    completed.has(prompt.state_image_id)?[]:[index+1]
  );
}

export function buildFlowManualManifest(input:{
  projectId:string;
  promptBundle:PromptBundleDocument;
  approvedImages:GeneratedImagesArtifact;
  sceneVisual?:SceneVisualDocument|null;
  clipProduction?:ClipProductionDocument|null;
  generatedAt?:string;
}):FlowManualManifest{
  return{
    schema_version:"1.0",
    project_id:input.projectId,
    provider:"GOOGLE_FLOW",
    execution_mode:"MANUAL_EXTERNAL",
    generated_at:input.generatedAt??new Date().toISOString(),
    items:input.promptBundle.video_prompts.map(prompt=>{
      const entry=imageByState(input.approvedImages.images,prompt.entry_state_image_id);
      const target=imageByState(input.approvedImages.images,prompt.target_state_image_id);
      const mid=prompt.mid_state_image_id===null
        ?null
        :imageByState(input.approvedImages.images,prompt.mid_state_image_id);
      const scene=input.sceneVisual?.scenes.find(
        item=>item.scene_id===prompt.scene_id
      );
      const clip=input.clipProduction?.clips.find(
        item=>item.clip_id===prompt.clip_id
      );
      return{
        clip_id:prompt.clip_id,
        scene_id:prompt.scene_id,
        entry_state_image_id:prompt.entry_state_image_id,
        mid_state_image_id:prompt.mid_state_image_id,
        target_state_image_id:prompt.target_state_image_id,
        provider_prompt_en:prompt.provider_prompt_en,
        editorial_duration_sec:prompt.editorial_duration_sec,
        narrative_deadline_sec:prompt.narrative_deadline_sec,
        target_state_deadline_sec:prompt.target_state_deadline_sec,
        safe_trim_start_sec:prompt.safe_trim_start_sec,
        entry_image_relative_path:entry.relative_path,
        mid_image_relative_path:mid?.relative_path??null,
        target_image_relative_path:target.relative_path,
        fantasy_mode:scene===undefined?null:effectiveT070FantasyMode(scene),
        camera:clip===undefined?null:{
          purpose:clip.camera.purpose,
          movement:clip.camera.movement,
          shot_size_start:clip.camera.shot_size_start,
          shot_size_end:clip.camera.shot_size_end,
          movement_curve:clip.camera.movement_curve
        },
        transition_in:clip?.transition_in??null,
        transition_out:clip?.transition_out??null,
        continuity:scene===undefined?null:{
          movement_direction:scene.continuity.movement_direction,
          screen_direction:scene.continuity.screen_direction,
          camera_energy:scene.continuity.camera_energy
        },
        handoff:scene===undefined?null:{
          entry_anchor:scene.handoff.entry_anchor,
          exit_anchor:scene.handoff.exit_anchor,
          preserve_elements:[...scene.handoff.preserve_elements],
          next_cut_intent:scene.handoff.next_cut_intent
        },
        expected_output_relative_path:"06_clips/generated/"+safeFileSegment(prompt.clip_id)+".mp4"
      };
    })
  };
}

function frames(seconds:number,fps:number):number{
  return Math.max(1,Math.round(seconds*fps));
}

export function buildTailEditProject(input:{
  projectId:string;
  projectName:string;
  fps:number;
  width:number;
  height:number;
  clips:Array<GeneratedClip&{public_src:string}>;
  tts:Agent2TtsManifest;
  ttsPublicSrc:Record<string,string>;
  subtitles:Agent2SubtitleTimingSpec;
}):GenericEditProject{
  const tracks=[
    {id:"V1",type:"VIDEO" as const,name:"Video",enabled:true,locked:false,order:10},
    {id:"A1",type:"AUDIO" as const,name:"Narration",enabled:true,locked:false,order:20},
    {id:"T1",type:"TEXT" as const,name:"Subtitles",enabled:true,locked:false,order:30}
  ];
  const items:GenericEditProject["items"]=[];
  let cursorFrame=0;
  for(const clip of input.clips){
    const durationFrames=frames(clip.editorial_duration_sec,input.fps);
    const sourceFrames=Math.max(durationFrames,frames(clip.source_duration_sec,input.fps));
    items.push({
      id:"video-"+clip.clip_id,
      type:"VIDEO",
      trackId:"V1",
      timelineStartFrame:cursorFrame,
      durationInFrames:durationFrames,
      enabled:true,
      locked:false,
      src:clip.public_src,
      sourceStartFrame:0,
      sourceDurationInFrames:durationFrames,
      sourceAssetDurationInFrames:sourceFrames,
      playbackRate:1,
      volume:0,
      x:0,
      y:0,
      scale:1,
      rotation:0,
      opacity:1,
      fit:"cover"
    });
    cursorFrame+=durationFrames;
  }
  for(const section of input.tts.sections){
    const src=input.ttsPublicSrc[section.section_id];
    if(src===undefined)throw new ProductionTailRuntimeError(
      "TAIL_PREREQUISITE",
      "Public TTS source is missing for "+section.section_id+"."
    );
    const durationFrames=frames(section.audio_duration_sec,input.fps);
    items.push({
      id:"tts-"+safeFileSegment(section.section_id),
      type:"TTS",
      trackId:"A1",
      timelineStartFrame:frames(section.timeline_start_sec,input.fps),
      durationInFrames:durationFrames,
      enabled:true,
      locked:false,
      src,
      sourceStartFrame:0,
      sourceDurationInFrames:durationFrames,
      sourceAssetDurationInFrames:durationFrames,
      volume:1,
      muted:false,
      fadeInFrames:0,
      fadeOutFrames:0
    });
  }
  const subtitleX=Math.round(input.width*0.05);
  const subtitleY=Math.round(input.height*0.78);
  const subtitleWidth=Math.round(input.width*0.9);
  const fontSize=Math.max(32,Math.round(input.height*0.046));
  for(const cue of input.subtitles.cues){
    items.push({
      id:"subtitle-"+safeFileSegment(cue.subtitle_id),
      type:"SUBTITLE",
      trackId:"T1",
      timelineStartFrame:frames(cue.start_sec,input.fps),
      durationInFrames:Math.max(1,frames(cue.end_sec-cue.start_sec,input.fps)),
      enabled:true,
      locked:false,
      text:cue.text_ko,
      x:subtitleX,
      y:subtitleY,
      width:subtitleWidth,
      fontFamily:"VPF Noto Sans KR",
      fontSize,
      fontWeight:700,
      color:"#FFFFFF",
      strokeColor:"#000000",
      strokeWidth:2,
      textAlign:"center",
      lineHeight:1.25,
      maxLines:2,
      backgroundEnabled:false,
      backgroundColor:"#000000",
      backgroundOpacity:0,
      generationSource:"SCRIPT_TTS_ALIGN"
    });
  }
  const narrationFrames=frames(input.tts.total_duration_sec,input.fps);
  return{
    schemaVersion:1,
    project:{
      id:input.projectId,
      name:input.projectName,
      fps:input.fps,
      width:input.width,
      height:input.height,
      durationInFrames:Math.max(cursorFrame,narrationFrames)
    },
    tracks,
    items,
    settings:{
      snapEnabled:true,
      snapToleranceFrames:4,
      timelineZoom:1,
      masterVolume:1,
      clipAudioMasterVolume:1
    }
  };
}

const FINAL_QC_SCHEMA={
  type:"object",
  additionalProperties:false,
  required:["schema_version","verdict","summary","issues","limitations"],
  properties:{
    schema_version:{type:"string",enum:["1.0"]},
    verdict:{type:"string",enum:["APPROVE","BLOCK","ESCALATE"]},
    summary:{type:"string"},
    issues:{type:"array",items:{type:"string"}},
    limitations:{type:"array",items:{type:"string"}}
  }
} as const;

export class ProductionTailRuntimeService{
  private readonly manager:Agent1WorkflowOrchestratorService;
  private readonly codexManager:CodexManagerRuntimeService;
  private readonly codexRunner:CodexProcessRunner;
  private readonly registry=new FileSystemResourceRegistry(path.join(DEFAULT_REPOSITORY_ROOT,"resources"));

  constructor(
    private readonly projects:ProjectBootstrapService,
    private readonly environment:NodeJS.ProcessEnv=process.env,
    private readonly progress:ProductionProgressReporter=new ProductionProgressReporter()
  ){
    this.manager=new Agent1WorkflowOrchestratorService(projects);
    this.codexManager=new CodexManagerRuntimeService(projects,environment);
    this.codexRunner=new CodexProcessRunner(environment);
  }

  async resetT070ForRegeneration(projectId:string):Promise<{
    project_id:string;
    status:"RESET_FOR_T070_REGENERATION";
    removed_files:string[];
    superseded_artifacts:number;
    reset_tasks:string[];
  }>{
    const status=await this.projects.getStatus(projectId);
    const agent3=new Agent3VisualProductionRepository(status.projectDbPath,{readonly:true});
    const tail=new ProductionTailRepository(status.projectDbPath);
    const workflow=new WorkflowOrchestratorRepository(status.projectDbPath);
    try{
      const prompts=agent3.getActive<PromptBundleDocument>(projectId,"prompt_bundle_spec");
      if(prompts===null||prompts.value.image_prompts.length===0){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 regeneration reset requires an active prompt_bundle_spec."
        );
      }

      const removeTargets=new Set<string>([
        T070_CHECKPOINT_RELATIVE_PATH,
        "06_clips/google-flow-manifest.json",
        "08_editor/edit_project.json",
        "09_render/preview.mp4",
        "09_render/final.mp4"
      ]);
      for(const prompt of prompts.value.image_prompts){
        removeTargets.add(
          "05_images/generated/"+safeFileSegment(prompt.state_image_id)+".png"
        );
      }
      for(const prompt of prompts.value.video_prompts){
        removeTargets.add(
          "06_clips/generated/"+safeFileSegment(prompt.clip_id)+".mp4"
        );
      }

      const removedFiles:string[]=[];
      for(const relativePath of removeTargets){
        const absolute=path.resolve(status.projectRoot,relativePath);
        if(await readyFile(absolute)){
          await rm(absolute,{force:true});
          removedFiles.push(relativePath);
        }
      }

      const supersededArtifacts=tail.supersedeActive(projectId,[
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
      ]);

      const at=new Date().toISOString();
      const resetTasks:string[]=[];
      for(const taskId of ["T070","T080","T090","T100"] as const){
        const task=workflow.getTask(projectId,taskId);
        if(task===null)continue;
        workflow.updateTask({
          projectId,
          taskId,
          status:taskId==="T070"?"READY":"BLOCKED",
          attempt:0,
          inputRefs:[],
          outputRefs:[],
          lastGateId:null,
          lastGateStatus:null,
          startedAt:null,
          completedAt:null,
          updatedAt:at
        });
        resetTasks.push(taskId);
      }

      return{
        project_id:projectId,
        status:"RESET_FOR_T070_REGENERATION",
        removed_files:removedFiles,
        superseded_artifacts:supersededArtifacts,
        reset_tasks:resetTasks
      };
    }finally{
      workflow.close();
      tail.close();
      agent3.close();
    }
  }

  async runAll(projectId:string):Promise<{
    project_id:string;
    status:"COMPLETE"|"HANDOFF"|"AWAITING_MANUAL_EXTERNAL"|"AWAITING_SEED_QC"|"AWAITING_FINAL_IMAGE_QC";
    steps:Array<{task_id:TailTaskId;status:string}>;
    next_task:string|null;
    final_image_qc_action?:{
      task_id:"T070";
      expected_image_count:number;
      checked_image_count:number;
      verdict:"REVISE"|"FAIL";
      failed_scene_ids:string[];
      failed_image_ids:string[];
      summary:string;
      revision_instructions:string[];
    };
    seed_qc_action?:{
      task_id:"T070";
      checkpoint_relative_path:string;
      seed_image_ids:string[];
      verdict?:"PASS"|"REVISE"|"FAIL";
      summary?:string;
      revision_instruction?:string;
    };
    manual_action?:{
      task_id:"T080";
      manifest_relative_path:string;
      missing_outputs:string[];
    };
  }>{
    const status=await this.projects.getStatus(projectId);
    if(!status.migrations.appliedMigrationIds.includes("0024")){
      throw new ProductionTailRuntimeError(
        "TAIL_MIGRATION_REQUIRED",
        "Production tail runtime requires migration 0024."
      );
    }
    const steps:Array<{task_id:TailTaskId;status:string}>=[];
    let guard=0;
    while(guard<16){
      guard+=1;
      const workflow=await this.manager.status(projectId);
      const ordinaryNext=workflow.tasks.find(task=>
        ["T070","T080","T090","T100"].includes(task.task_id)&&
        (task.status==="READY"||task.status==="REVISION_REQUIRED")
      )??null;
      const interruptedT070=workflow.tasks.find(task=>
        task.task_id==="T070"&&
        (task.status==="FAILED"||task.status==="RUNNING")
      )??null;
      const recoverableInterruptedT070=
        ordinaryNext===null&&
        interruptedT070!==null&&
        await this.hasT070ResumeEvidence(projectId)
          ?interruptedT070
          :null;
      const next=ordinaryNext??recoverableInterruptedT070;
      if(next===null){
        if(await this.isProductionFinalized(projectId,workflow.tasks)){
          return{
            project_id:projectId,
            status:"COMPLETE",
            steps,
            next_task:null
          };
        }
        const incomplete=workflow.tasks
          .filter(task=>
            ["T070","T080","T090","T100"].includes(task.task_id)&&
            task.status!=="COMPLETE"
          )
          .map(task=>task.task_id+"="+task.status+"(attempt "+String(task.attempt)+")")
          .join(", ");
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "Production tail has no runnable task but is not complete: "+(incomplete||"unknown tail state")
        );
      }
      const taskId=next.task_id as TailTaskId;
      if(taskId==="T080"){
        const finalImageQc=await this.runT070FinalVisualQcGate(
          projectId,
          Math.max(1,(next.attempt??0)+1)
        );
        if(finalImageQc.verdict!=="PASS"){
          const project=await this.projects.getStatus(projectId);
          await rm(
            path.resolve(project.projectRoot,"06_clips/google-flow-manifest.json"),
            {force:true}
          );
          return{
            project_id:projectId,
            status:"AWAITING_FINAL_IMAGE_QC",
            steps,
            next_task:"T080",
            final_image_qc_action:{
              task_id:"T070",
              expected_image_count:finalImageQc.expected_image_count,
              checked_image_count:finalImageQc.checked_image_count,
              verdict:finalImageQc.verdict,
              failed_scene_ids:finalImageQc.failed_scene_ids,
              failed_image_ids:finalImageQc.failed_image_ids,
              summary:finalImageQc.summary,
              revision_instructions:finalImageQc.revision_instructions
            }
          };
        }
        const manual=await this.prepareT080Manual(projectId);
        if(!manual.ready){
          await this.progress.emit({
            event:"HANDOFF",
            project_id:projectId,
            next_task:"T080",
            next_agent:"AGENT3_VISUAL_PRODUCTION",
            message:"Google Flow manual-external clips are required before T080 can continue."
          });
          return{
            project_id:projectId,
            status:"AWAITING_MANUAL_EXTERNAL",
            steps,
            next_task:"T080",
            manual_action:{
              task_id:"T080",
              manifest_relative_path:manual.manifestRelativePath,
              missing_outputs:manual.missing
            }
          };
        }
      }
      if(taskId==="T070"){
        const project=await this.projects.getStatus(projectId);
        const checkpointPath=path.resolve(project.projectRoot,T070_CHECKPOINT_RELATIVE_PATH);
        const checkpoint=await readT070Checkpoint(checkpointPath);
        if(checkpoint.value?.phase==="SEED_QC"){
          const seedQc=await this.runT070SeedVisualQcGate(
            projectId,
            Math.max(1,next.attempt??1),
            checkpoint.value
          );
          if(seedQc.verdict!=="PASS"){
            return{
              project_id:projectId,
              status:"AWAITING_SEED_QC",
              steps,
              next_task:"T070",
              seed_qc_action:{
                task_id:"T070",
                checkpoint_relative_path:T070_CHECKPOINT_RELATIVE_PATH,
                seed_image_ids:checkpoint.value.seed_image_ids,
                verdict:seedQc.verdict,
                summary:seedQc.summary,
                revision_instruction:seedQc.revision_instruction
              }
            };
          }
          await writeT070Checkpoint(checkpointPath,{
            projectId,
            promptBundleSha256:checkpoint.value.source_prompt_bundle_sha256,
            width:checkpoint.value.width,
            height:checkpoint.value.height,
            phase:"FULL_GENERATION",
            seedImageIds:checkpoint.value.seed_image_ids,
            images:checkpoint.value.images
          });
          await this.progress.taskProgress({
            project_id:projectId,
            task_id:"T070",
            agent:"AGENT3_VISUAL_PRODUCTION",
            attempt:Math.max(1,next.attempt??1),
            phase:"FULL_GENERATION",
            completed:checkpoint.value.images.length,
            total:Math.max(checkpoint.value.images.length,checkpoint.value.seed_image_ids.length),
            message:"Seed visual QC passed. T070 full image generation is now unlocked."
          });
        }
      }
      try{
        const hasResumeEvidence=
          taskId==="T070"&&await this.hasT070ResumeEvidence(projectId);
        const resumeCurrentAttempt=
          taskId==="T070"&&
          hasResumeEvidence&&
          (
            (next.status==="RUNNING"&&(next.attempt??0)>0)||
            (
              (next.status==="REVISION_REQUIRED"||next.status==="FAILED")&&
              (next.attempt??0)>=3
            )
          );
        const result=await this.runTask(projectId,taskId,resumeCurrentAttempt);
        steps.push({task_id:taskId,status:result});
        if(taskId==="T070"&&result==="AWAITING_SEED_QC"){
          const project=await this.projects.getStatus(projectId);
          const checkpoint=await readT070Checkpoint(
            path.resolve(project.projectRoot,T070_CHECKPOINT_RELATIVE_PATH)
          );
          return{
            project_id:projectId,
            status:"AWAITING_SEED_QC",
            steps,
            next_task:"T070",
            seed_qc_action:{
              task_id:"T070",
              checkpoint_relative_path:T070_CHECKPOINT_RELATIVE_PATH,
              seed_image_ids:checkpoint.value?.seed_image_ids??[]
            }
          };
        }
      }catch(error){
        const after=await this.manager.status(projectId);
        const current=after.tasks.find(item=>item.task_id===taskId);
        const retryable=current?.status==="REVISION_REQUIRED"&&(current.attempt??0)<3;
        if(retryable){
          await this.progress.emit({
            event:"TASK_RETRY",
            project_id:projectId,
            task_id:taskId,
            agent:next.assigned_agent,
            ...(current===undefined?{}:{attempt:current.attempt}),
            message:error instanceof Error?error.message:String(error)
          });
          continue;
        }
        throw error;
      }
    }
    throw new ProductionTailRuntimeError("TAIL_PREREQUISITE","Production tail guard limit was exceeded.");
  }

  private async runTask(
    projectId:string,
    taskId:TailTaskId,
    resumeCurrentAttempt=false
  ):Promise<string>{
    const requestedAgent=taskId==="T090"
      ?"EDITOR_REMOTION" as const
      :taskId==="T100"
        ?"AGENT1_MANAGER" as const
        :"AGENT3_VISUAL_PRODUCTION" as const;
    const dispatch=await this.manager.dispatch(
      projectId,
      taskId,
      requestedAgent,
      {resumeCurrentAttempt}
    );
    await this.progress.emit({
      event:"TASK_STARTED",
      project_id:projectId,
      task_id:taskId,
      agent:requestedAgent,
      attempt:dispatch.attempt
    });
    await this.progress.taskProgress({
      project_id:projectId,
      task_id:taskId,
      agent:requestedAgent,
      attempt:dispatch.attempt,
      phase:"RUNTIME_EXECUTION",
      completed:5,
      total:100,
      message:"Tail runtime execution started."
    });
    try{
      if(taskId==="T070"){
        const t070Result=await this.executeT070(projectId,dispatch.attempt);
        if(t070Result==="AWAITING_SEED_QC")return"AWAITING_SEED_QC";
      }else if(taskId==="T080")await this.executeT080(projectId,dispatch.attempt);
      else if(taskId==="T090")await this.executeT090(projectId,dispatch.attempt);
      else return await this.executeT100(projectId,dispatch.attempt);

      await this.manager.recordGate(projectId,taskId,true);
      await this.progress.emit({
        event:"QC_STARTED",
        project_id:projectId,
        task_id:taskId,
        agent:"CODEX_1_MANAGER",
        attempt:dispatch.attempt,
        qc_kind:"SUCCESS",
        phase:"CODEX1_SUCCESS_QC"
      });
      const review=await this.codexManager.reviewSuccess({
        projectId,
        taskId,
        attempt:dispatch.attempt,
        workerRole:taskId==="T090"?"EDITOR_REMOTION":"CODEX_3_VISUAL_PRODUCTION",
        gateStatus:"PASS",
        gateId:dispatch.completion_gate,
        warnings:[]
      });
      await this.progress.emit({
        event:"QC_COMPLETED",
        project_id:projectId,
        task_id:taskId,
        agent:"CODEX_1_MANAGER",
        attempt:dispatch.attempt,
        qc_kind:"SUCCESS",
        verdict:review.verdict,
        phase:"CODEX1_SUCCESS_QC"
      });
      if(review.verdict!=="APPROVE"){
        await this.manager.applyManagerVerdict(
          projectId,
          taskId,
          dispatch.attempt,
          review.verdict
        );
        throw new ProductionTailRuntimeError(
          "TAIL_MANAGER_QC_REJECTED",
          "Codex1 success QC returned "+review.verdict+" for "+taskId+": "+review.root_cause
        );
      }
      const completed=await this.manager.complete(projectId,taskId);
      await this.progress.taskProgress({
        project_id:projectId,
        task_id:taskId,
        agent:requestedAgent,
        attempt:dispatch.attempt,
        phase:"COMPLETE",
        completed:100,
        total:100,
        message:"Task completed."
      });
      await this.progress.emit({
        event:"TASK_COMPLETED",
        project_id:projectId,
        task_id:taskId,
        agent:requestedAgent,
        attempt:dispatch.attempt,
        message:taskId+" completed with "+String(completed.last_gate_status??"PASS")+"."
      });
      return"COMPLETE";
    }catch(error){
      if(
        error instanceof ProductionTailRuntimeError&&
        (
          error.code==="TAIL_MANAGER_QC_REJECTED"||
          error.code==="TAIL_FINAL_QC_REJECTED"
        )
      )throw error;
      try{
        if(taskId!=="T100"){
          const review=await this.codexManager.reviewFailure({
            projectId,
            taskId,
            attempt:dispatch.attempt,
            workerRole:taskId==="T090"?"EDITOR_REMOTION":"CODEX_3_VISUAL_PRODUCTION",
            errorCode:error instanceof ProductionTailRuntimeError?error.code:"TAIL_RUNTIME_FAILURE",
            errorDetail:error instanceof Error?error.message:String(error)
          });
          await this.manager.applyManagerVerdict(
            projectId,
            taskId,
            dispatch.attempt,
            review.verdict
          );
        }else{
          await this.manager.requestRevision(projectId,taskId);
        }
      }catch{
        await this.manager.requestRevision(projectId,taskId);
      }
      throw error;
    }
  }

  private async resolveFormat(status:ProjectStatus):Promise<FormatProfilePayload>{
    return(await this.registry.resolvePinned<FormatProfilePayload>(requireFormatPin(status))).payload;
  }

  private async isProductionFinalized(
    projectId:string,
    tasks:Array<{task_id:string;status:string}>
  ):Promise<boolean>{
    const t100=tasks.find(task=>task.task_id==="T100");
    if(t100?.status!=="COMPLETE")return false;
    const status=await this.projects.getStatus(projectId);
    const tail=new ProductionTailRepository(status.projectDbPath,{readonly:true});
    try{
      const finalQc=tail.getActive<Record<string,unknown>>(projectId,"final_qc_result");
      if(finalQc===null)return false;
      return await readyFile(path.resolve(status.projectRoot,"09_render/final.mp4"));
    }finally{
      tail.close();
    }
  }

  private async runT070SceneVisualQc(
    projectId:string,
    attempt:number,
    promptBundleSha256:string,
    sceneId:string,
    images:GeneratedImage[],
    reviewCycle:number
  ):Promise<T070SceneVisualQcResultRecord>{
    const status=await this.projects.getStatus(projectId);
    const tail=new ProductionTailRepository(status.projectDbPath);
    try{
      const sceneImageSetSha256=createHash("sha256")
        .update(
          promptBundleSha256+"\n"+
          images.map(image=>image.state_image_id+":"+image.sha256).join("\n"),
          "utf8"
        )
        .digest("hex");
      const existing=tail.getActive<T070SceneVisualQcArtifact>(
        projectId,
        "t070_scene_visual_qc"
      );
      const cached=existing?.value.policy_version==="T070_IMAGE_POLICY_V1"&&
        existing.value.source_prompt_bundle_sha256===promptBundleSha256
        ?existing.value.scene_results.find(result=>
          result.scene_id===sceneId&&
          result.scene_image_set_sha256===sceneImageSetSha256
        )
        :undefined;
      if(cached!==undefined)return cached;

      await this.progress.emit({
        event:"QC_STARTED",
        project_id:projectId,
        task_id:"T070",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        phase:"SCENE_IMAGE_VISUAL_QC",
        message:"Codex1 is visually inspecting "+sceneId+" before T070 continues."
      });
      const review=await this.codexManager.reviewT070FinalVisualScene({
        projectId,
        attempt,
        sceneId,
        reviewKind:"SCENE",
        reviewCycle,
        images:images.map(image=>({
          stateImageId:image.state_image_id,
          absolutePath:path.resolve(status.projectRoot,image.relative_path),
          sha256:image.sha256
        }))
      });
      const result:T070SceneVisualQcResultRecord={
        scene_id:sceneId,
        scene_image_set_sha256:sceneImageSetSha256,
        attempt:reviewCycle,
        verdict:review.verdict,
        summary:review.summary,
        continuity_verdict:review.continuity_verdict,
        handoff_verdict:review.handoff_verdict,
        checks:review.checks,
        revision_instruction:review.revision_instruction,
        reviewed_at:new Date().toISOString()
      };
      const priorResults=
        existing?.value.policy_version==="T070_IMAGE_POLICY_V1"&&
        existing.value.source_prompt_bundle_sha256===promptBundleSha256
          ?existing.value.scene_results.filter(item=>item.scene_id!==sceneId)
          :[];
      const artifact:T070SceneVisualQcArtifact={
        schema_version:"1.0",
        policy_version:"T070_IMAGE_POLICY_V1",
        project_id:projectId,
        source_prompt_bundle_sha256:promptBundleSha256,
        scene_results:[...priorResults,result],
        updated_at:result.reviewed_at
      };
      tail.save(
        projectId,
        "t070_scene_visual_qc",
        artifact,
        "T070",
        result.reviewed_at
      );
      await this.progress.emit({
        event:"QC_COMPLETED",
        project_id:projectId,
        task_id:"T070",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        verdict:result.verdict,
        phase:"SCENE_IMAGE_VISUAL_QC",
        message:
          result.verdict==="PASS"
            ?sceneId+" passed scene-level image QC."
            :sceneId+" requires targeted image regeneration before T070 continues."
      });
      return result;
    }finally{
      tail.close();
    }
  }

  private async runT070FinalVisualQcGate(
    projectId:string,
    attempt:number
  ):Promise<T070FinalVisualQcArtifact>{
    const status=await this.projects.getStatus(projectId);
    const agent3=new Agent3VisualProductionRepository(status.projectDbPath,{readonly:true});
    const tail=new ProductionTailRepository(status.projectDbPath);
    try{
      const prompts=agent3.getActive<PromptBundleDocument>(projectId,"prompt_bundle_spec");
      const approved=tail.getActive<GeneratedImagesArtifact>(projectId,"approved_images");
      if(prompts===null||approved===null){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 final visual QC requires prompt_bundle_spec and approved_images."
        );
      }
      if(approved.value.source_prompt_bundle_sha256!==prompts.sha256){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 final visual QC refuses approved_images from a stale prompt bundle."
        );
      }

      const checkpointPath=path.resolve(status.projectRoot,T070_CHECKPOINT_RELATIVE_PATH);
      const checkpoint=await readT070Checkpoint(checkpointPath);
      if(
        checkpoint.value!==null&&
        checkpoint.value.project_id===projectId&&
        checkpoint.value.source_prompt_bundle_sha256===prompts.sha256
      ){
        await writeT070Checkpoint(checkpointPath,{
          projectId,
          promptBundleSha256:checkpoint.value.source_prompt_bundle_sha256,
          width:checkpoint.value.width,
          height:checkpoint.value.height,
          phase:"FINAL_QC",
          seedImageIds:checkpoint.value.seed_image_ids,
          sceneQcPassedIds:checkpoint.value.scene_qc_passed_ids,
          sceneQcAttempts:checkpoint.value.scene_qc_attempts,
          revisionFeedbackByState:checkpoint.value.revision_feedback_by_state,
          images:checkpoint.value.images
        });
      }

      const expectedPrompts=prompts.value.image_prompts;
      const approvedById=new Map(
        approved.value.images.map(image=>[image.state_image_id,image] as const)
      );
      if(
        approvedById.size!==expectedPrompts.length||
        approved.value.images.length!==expectedPrompts.length
      ){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 final visual QC requires exact approved-image coverage: "+
            String(approvedById.size)+"/"+String(expectedPrompts.length)+"."
        );
      }

      const orderedImages:GeneratedImage[]=[];
      for(const prompt of expectedPrompts){
        const image=approvedById.get(prompt.state_image_id);
        if(image===undefined||image.scene_id!==prompt.scene_id){
          throw new ProductionTailRuntimeError(
            "TAIL_PREREQUISITE",
            "T070 final visual QC image lineage mismatch for "+prompt.state_image_id+"."
          );
        }
        const inspected=await inspectReusableImage({
          projectRoot:status.projectRoot,
          relativePath:image.relative_path,
          expectedWidth:image.width,
          expectedHeight:image.height,
          expectedSha256:image.sha256
        });
        if(inspected===null){
          throw new ProductionTailRuntimeError(
            "TAIL_IMAGE_INVALID",
            "T070 final visual QC cannot verify approved PNG "+image.state_image_id+"."
          );
        }
        orderedImages.push(image);
      }

      const imageSetSha256=createHash("sha256")
        .update(
          prompts.sha256+"\n"+
          orderedImages.map(image=>image.state_image_id+":"+image.sha256).join("\n"),
          "utf8"
        )
        .digest("hex");
      const cached=tail.getActive<T070FinalVisualQcArtifact>(
        projectId,
        "t070_final_visual_qc"
      );
      if(
        cached?.value.policy_version==="T070_IMAGE_POLICY_V1"&&
        cached.value.image_set_sha256===imageSetSha256&&
        cached.value.expected_image_count===expectedPrompts.length&&
        cached.value.checked_image_count===expectedPrompts.length
      ){
        if(cached.value.verdict==="PASS"&&checkpoint.value!==null){
          await writeT070Checkpoint(checkpointPath,{
            projectId,
            promptBundleSha256:checkpoint.value.source_prompt_bundle_sha256,
            width:checkpoint.value.width,
            height:checkpoint.value.height,
            phase:"COMPLETE",
            seedImageIds:checkpoint.value.seed_image_ids,
            sceneQcPassedIds:checkpoint.value.scene_qc_passed_ids,
            sceneQcAttempts:checkpoint.value.scene_qc_attempts,
            revisionFeedbackByState:checkpoint.value.revision_feedback_by_state,
            images:checkpoint.value.images
          });
        }
        return cached.value;
      }

      const sceneOrder:string[]=[];
      const imagesByScene=new Map<string,GeneratedImage[]>();
      for(const prompt of expectedPrompts){
        if(!imagesByScene.has(prompt.scene_id)){
          sceneOrder.push(prompt.scene_id);
          imagesByScene.set(prompt.scene_id,[]);
        }
        imagesByScene.get(prompt.scene_id)!.push(approvedById.get(prompt.state_image_id)!);
      }

      await this.progress.emit({
        event:"QC_STARTED",
        project_id:projectId,
        task_id:"T070",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        phase:"FINAL_IMAGE_VISUAL_QC",
        message:
          "Codex1 is visually inspecting all "+String(expectedPrompts.length)+
          " approved T070 images before T080."
      });

      const sceneResults:T070FinalVisualQcArtifact["scene_results"]=[];
      for(const [index,sceneId] of sceneOrder.entries()){
        const sceneImages=imagesByScene.get(sceneId)!;
        const review=await this.codexManager.reviewT070FinalVisualScene({
          projectId,
          attempt,
          sceneId,
          images:sceneImages.map(image=>({
            stateImageId:image.state_image_id,
            absolutePath:path.resolve(status.projectRoot,image.relative_path),
            sha256:image.sha256
          }))
        });
        sceneResults.push(review);
        await this.progress.taskProgress({
          project_id:projectId,
          task_id:"T070",
          agent:"CODEX_1_MANAGER",
          attempt,
          phase:"FINAL_IMAGE_VISUAL_QC",
          completed:index+1,
          total:sceneOrder.length,
          message:
            "Visual QC completed for "+sceneId+" ("+
            String(sceneImages.length)+" images): "+review.verdict+"."
        });
      }

      const checkedIds=sceneResults.flatMap(scene=>
        scene.checks.map(check=>check.state_image_id)
      );
      const uniqueChecked=new Set(checkedIds);
      const expectedIds=expectedPrompts.map(prompt=>prompt.state_image_id);
      if(
        checkedIds.length!==expectedIds.length||
        uniqueChecked.size!==expectedIds.length||
        expectedIds.some(id=>!uniqueChecked.has(id))
      ){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 final visual QC did not inspect every approved image exactly once."
        );
      }

      const hasFail=sceneResults.some(scene=>scene.verdict==="FAIL");
      const hasRevise=sceneResults.some(scene=>scene.verdict==="REVISE");
      const verdict:T070FinalVisualQcArtifact["verdict"]=
        hasFail?"FAIL":hasRevise?"REVISE":"PASS";
      const failedSceneIds=sceneResults
        .filter(scene=>scene.verdict!=="PASS")
        .map(scene=>scene.scene_id);
      const failedImageIds=sceneResults
        .flatMap(scene=>scene.checks)
        .filter(check=>check.verdict!=="PASS")
        .map(check=>check.state_image_id);
      const revisionInstructions=sceneResults
        .filter(scene=>scene.verdict!=="PASS"&&scene.revision_instruction.trim())
        .map(scene=>scene.scene_id+": "+scene.revision_instruction);
      const artifact:T070FinalVisualQcArtifact={
        schema_version:"1.0",
        policy_version:"T070_IMAGE_POLICY_V1",
        project_id:projectId,
        image_set_sha256:imageSetSha256,
        source_prompt_bundle_sha256:prompts.sha256,
        expected_image_count:expectedPrompts.length,
        checked_image_count:uniqueChecked.size,
        verdict,
        summary:
          verdict==="PASS"
            ?"All "+String(expectedPrompts.length)+
              " approved T070 images passed pixel-grounded scene and continuity QC."
            :"Final T070 image QC requires correction in "+
              failedSceneIds.join(", ")+".",
        failed_scene_ids:failedSceneIds,
        failed_image_ids:[...new Set(failedImageIds)],
        scene_results:sceneResults,
        revision_instructions:revisionInstructions,
        reviewed_at:new Date().toISOString()
      };
      tail.save(
        projectId,
        "t070_final_visual_qc",
        artifact,
        "T070",
        artifact.reviewed_at
      );
      await this.progress.emit({
        event:"QC_COMPLETED",
        project_id:projectId,
        task_id:"T070",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        verdict:artifact.verdict,
        phase:"FINAL_IMAGE_VISUAL_QC",
        message:
          artifact.verdict==="PASS"
            ?"All approved T070 images passed final visual QC; T080 is unlocked."
            :"T080 remains locked until failed T070 images/scenes are corrected."
      });
      if(artifact.verdict==="PASS"&&checkpoint.value!==null){
        await writeT070Checkpoint(checkpointPath,{
          projectId,
          promptBundleSha256:checkpoint.value.source_prompt_bundle_sha256,
          width:checkpoint.value.width,
          height:checkpoint.value.height,
          phase:"COMPLETE",
          seedImageIds:checkpoint.value.seed_image_ids,
          sceneQcPassedIds:checkpoint.value.scene_qc_passed_ids,
          sceneQcAttempts:checkpoint.value.scene_qc_attempts,
          revisionFeedbackByState:checkpoint.value.revision_feedback_by_state,
          images:checkpoint.value.images
        });
      }
      return artifact;
    }finally{
      tail.close();
      agent3.close();
    }
  }

  private async runT070SeedVisualQcGate(
    projectId:string,
    attempt:number,
    checkpoint:T070Checkpoint
  ):Promise<T070SeedVisualQcArtifact>{
    if(checkpoint.phase!=="SEED_QC"||checkpoint.seed_image_ids.length===0){
      throw new ProductionTailRuntimeError(
        "TAIL_PREREQUISITE",
        "T070 seed visual QC requires a SEED_QC checkpoint with seed images."
      );
    }
    const status=await this.projects.getStatus(projectId);
    const seedImages=checkpoint.seed_image_ids.map(stateImageId=>{
      const image=checkpoint.images.find(item=>item.state_image_id===stateImageId);
      if(image===undefined){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 seed visual QC is missing generated seed image "+stateImageId+"."
        );
      }
      return image;
    });
    for(const image of seedImages){
      const inspected=await inspectReusableImage({
        projectRoot:status.projectRoot,
        relativePath:image.relative_path,
        expectedWidth:checkpoint.width,
        expectedHeight:checkpoint.height,
        expectedSha256:image.sha256
      });
      if(inspected===null){
        throw new ProductionTailRuntimeError(
          "TAIL_IMAGE_INVALID",
          "T070 seed visual QC cannot verify seed PNG "+image.state_image_id+"."
        );
      }
    }

    const seedSetSha256=createHash("sha256")
      .update(
        checkpoint.source_prompt_bundle_sha256+"\n"+
        seedImages.map(image=>image.state_image_id+":"+image.sha256).join("\n"),
        "utf8"
      )
      .digest("hex");
    const tail=new ProductionTailRepository(status.projectDbPath);
    try{
      const cached=tail.getActive<T070SeedVisualQcArtifact>(
        projectId,
        "t070_seed_visual_qc"
      );
      if(
        cached?.value.seed_set_sha256===seedSetSha256&&
        cached.value.policy_version==="T070_IMAGE_POLICY_V1"
      ){
        return cached.value;
      }

      await this.progress.emit({
        event:"QC_STARTED",
        project_id:projectId,
        task_id:"T070",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        phase:"SEED_VISUAL_QC",
        message:"Codex1 is visually inspecting the actual T070 seed image pixels."
      });
      const review=await this.codexManager.reviewT070SeedVisuals({
        projectId,
        attempt,
        seedImages:seedImages.map(image=>({
          stateImageId:image.state_image_id,
          absolutePath:path.resolve(status.projectRoot,image.relative_path),
          sha256:image.sha256
        }))
      });
      const artifact:T070SeedVisualQcArtifact={
        schema_version:"1.0",
        policy_version:"T070_IMAGE_POLICY_V1",
        project_id:projectId,
        seed_set_sha256:seedSetSha256,
        source_prompt_bundle_sha256:checkpoint.source_prompt_bundle_sha256,
        seed_image_ids:[...checkpoint.seed_image_ids],
        verdict:review.verdict,
        summary:review.summary,
        cross_seed_diversity:review.cross_seed_diversity,
        style_coherence:review.style_coherence,
        checks:review.checks,
        revision_instruction:review.revision_instruction,
        reviewed_at:new Date().toISOString()
      };
      tail.save(
        projectId,
        "t070_seed_visual_qc",
        artifact,
        "T070",
        artifact.reviewed_at
      );
      await this.progress.emit({
        event:"QC_COMPLETED",
        project_id:projectId,
        task_id:"T070",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        verdict:artifact.verdict,
        phase:"SEED_VISUAL_QC",
        message:
          artifact.verdict==="PASS"
            ?"T070 seed visual QC passed."
            :"T070 seed visual QC requires correction before full generation."
      });
      return artifact;
    }finally{
      tail.close();
    }
  }

  private async hasT070ResumeEvidence(projectId:string):Promise<boolean>{
    const status=await this.projects.getStatus(projectId);
    const agent3=new Agent3VisualProductionRepository(status.projectDbPath,{readonly:true});
    try{
      const prompts=agent3.getActive<PromptBundleDocument>(projectId,"prompt_bundle_spec");
      if(prompts===null||prompts.value.image_prompts.length===0)return false;
      const total=prompts.value.image_prompts.length;
      const checkpointPath=path.resolve(status.projectRoot,T070_CHECKPOINT_RELATIVE_PATH);
      const checkpoint=await readT070Checkpoint(checkpointPath);
      if(
        checkpoint.value!==null&&
        checkpoint.value.project_id===projectId&&
        checkpoint.value.source_prompt_bundle_sha256===prompts.sha256
      ){
        const completed=new Set(checkpoint.value.images.map(item=>item.state_image_id)).size;
        if(
          checkpoint.value.phase==="SEED_GENERATION"||
          checkpoint.value.phase==="SEED_QC"
        )return completed<total;
        return completed>0&&completed<total;
      }
      if(checkpoint.exists)return false;

      let existing=0;
      for(const prompt of prompts.value.image_prompts){
        const relativePath="05_images/generated/"+safeFileSegment(prompt.state_image_id)+".png";
        if(await readyFile(path.resolve(status.projectRoot,relativePath)))existing+=1;
      }
      return existing>0&&existing<total;
    }finally{
      agent3.close();
    }
  }

  private async executeT070(projectId:string,attempt:number):Promise<T070ExecutionResult>{
    const status=await this.projects.getStatus(projectId);
    const format=await this.resolveFormat(status);
    const agent3=new Agent3VisualProductionRepository(status.projectDbPath,{readonly:true});
    const tail=new ProductionTailRepository(status.projectDbPath);
    try{
      const promptRecord=agent3.getActive<PromptBundleDocument>(projectId,"prompt_bundle_spec");
      const states=agent3.getActive<StateImageDocument>(projectId,"state_image_spec");
      const visual=agent3.getActive<SceneVisualDocument>(projectId,"scene_visual_spec");
      if(promptRecord===null||states===null||visual===null){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 requires prompt_bundle_spec, state_image_spec and scene_visual_spec."
        );
      }
      const total=promptRecord.value.image_prompts.length;
      if(total===0){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T070 requires at least one image prompt."
        );
      }

      const checkpointAbsolute=path.resolve(status.projectRoot,T070_CHECKPOINT_RELATIVE_PATH);
      const loadedCheckpoint=await readT070Checkpoint(checkpointAbsolute);
      const completedByState=new Map<string,GeneratedImage>();

      const checkpointCurrent=
        loadedCheckpoint.value!==null&&
        loadedCheckpoint.value.project_id===projectId&&
        loadedCheckpoint.value.source_prompt_bundle_sha256===promptRecord.sha256&&
        loadedCheckpoint.value.width===format.imageGeneration.width&&
        loadedCheckpoint.value.height===format.imageGeneration.height;
      const legacyAdoption=!loadedCheckpoint.exists&&attempt>1;
      let phase:T070Phase=checkpointCurrent
        ?loadedCheckpoint.value!.phase
        :legacyAdoption
          ?"FULL_GENERATION"
          :"SEED_GENERATION";
      const seedImageIds=checkpointCurrent&&loadedCheckpoint.value!.seed_image_ids.length>0
        ?[...loadedCheckpoint.value!.seed_image_ids]
        :phase==="SEED_GENERATION"
          ?selectT070RepresentativeSeedImageIds(
            promptRecord.value.image_prompts,
            states.value.state_images,
            3
          )
          :[];
      const sceneQcPassedIds=new Set(
        checkpointCurrent?loadedCheckpoint.value!.scene_qc_passed_ids:[]
      );
      const sceneQcAttempts:Record<string,number>={
        ...(checkpointCurrent?loadedCheckpoint.value!.scene_qc_attempts:{})
      };
      const revisionFeedbackByState:Record<string,string>={
        ...(checkpointCurrent?loadedCheckpoint.value!.revision_feedback_by_state:{})
      };

      if(checkpointCurrent){
        for(const image of loadedCheckpoint.value!.images){
          const expectedPrompt=promptRecord.value.image_prompts.find(
            item=>item.state_image_id===image.state_image_id&&item.scene_id===image.scene_id
          );
          if(expectedPrompt===undefined)continue;
          const expectedRelativePath=
            "05_images/generated/"+safeFileSegment(expectedPrompt.state_image_id)+".png";
          if(image.relative_path!==expectedRelativePath)continue;
          const inspected=await inspectReusableImage({
            projectRoot:status.projectRoot,
            relativePath:expectedRelativePath,
            expectedWidth:format.imageGeneration.width,
            expectedHeight:format.imageGeneration.height,
            expectedSha256:image.sha256
          });
          if(inspected===null)continue;
          completedByState.set(image.state_image_id,{
            ...image,
            sha256:inspected.sha256,
            width:inspected.width,
            height:inspected.height
          });
        }
      }else if(legacyAdoption){
        // Backward-compatible adoption for projects that produced PNGs before
        // item-level checkpoints existed. This is allowed only on a retry of
        // the same T070 lineage; a stale/mismatched checkpoint is never adopted.
        for(const prompt of promptRecord.value.image_prompts){
          const relativePath="05_images/generated/"+safeFileSegment(prompt.state_image_id)+".png";
          const inspected=await inspectReusableImage({
            projectRoot:status.projectRoot,
            relativePath,
            expectedWidth:format.imageGeneration.width,
            expectedHeight:format.imageGeneration.height
          });
          if(inspected===null)continue;
          completedByState.set(prompt.state_image_id,{
            state_image_id:prompt.state_image_id,
            scene_id:prompt.scene_id,
            relative_path:relativePath,
            sha256:inspected.sha256,
            width:inspected.width,
            height:inspected.height,
            provider_request_ids:[],
            reference_roles:[]
          });
        }
      }

      const checkpointImages=()=>promptRecord.value.image_prompts
        .map(prompt=>completedByState.get(prompt.state_image_id)??null)
        .filter((image):image is GeneratedImage=>image!==null);
      const writeCurrentCheckpoint=()=>writeT070Checkpoint(checkpointAbsolute,{
        projectId,
        promptBundleSha256:promptRecord.sha256,
        width:format.imageGeneration.width,
        height:format.imageGeneration.height,
        phase,
        seedImageIds,
        sceneQcPassedIds:[...sceneQcPassedIds],
        sceneQcAttempts,
        revisionFeedbackByState,
        images:checkpointImages()
      });

      if(!checkpointCurrent&&!legacyAdoption){
        await writeCurrentCheckpoint();
        await this.progress.taskProgress({
          project_id:projectId,
          task_id:"T070",
          agent:"AGENT3_VISUAL_PRODUCTION",
          attempt,
          phase:"SEED_GENERATION",
          completed:0,
          total:seedImageIds.length,
          message:
            "T070 seed calibration started with "+String(seedImageIds.length)+
            " representative state images."
        });
      }

      if(phase==="SEED_QC"){
        await writeCurrentCheckpoint();
        await this.progress.taskProgress({
          project_id:projectId,
          task_id:"T070",
          agent:"AGENT3_VISUAL_PRODUCTION",
          attempt,
          phase:"SEED_QC",
          completed:seedImageIds.filter(id=>completedByState.has(id)).length,
          total:seedImageIds.length,
          message:"T070 seed images are complete and awaiting visual QC before full generation."
        });
        return"AWAITING_SEED_QC";
      }

      const pendingOrdinals=buildT070PendingOrdinals(
        promptRecord.value.image_prompts,
        completedByState.keys()
      );

      if(completedByState.size>0){
        await writeCurrentCheckpoint();
        await this.progress.taskProgress({
          project_id:projectId,
          task_id:"T070",
          agent:"AGENT3_VISUAL_PRODUCTION",
          attempt,
          phase:"RUNTIME_EXECUTION",
          completed:10+Math.round((completedByState.size/total)*60),
          total:100,
          message:
            "Resuming T070 from "+String(completedByState.size)+"/"+String(total)+
            " generated state images; next pending "+String(pendingOrdinals[0]??"none")+
            "/"+String(total)+"."
        });
      }

      const generationStateIds=new Set(buildT070GenerationStateIds(
        promptRecord.value.image_prompts,
        phase,
        seedImageIds
      ));
      const adapter=await importImageAdapter(this.environment.VPF_IMAGE_ADAPTER_MODULE?.trim()??"");
      // GLOBAL_VISUAL files are grammar sources, not generation exemplars.
      // Their approved composition/narrative/closure rules are compiled into
      // provider_prompt_en by Agent3. T070 therefore sends no GLOBAL image
      // attachments, preventing one reference composition from being copied
      // across the whole production.
      const imageSessionKey=
        projectId+":T070:"+promptRecord.sha256+":TEXT_VISUAL_GRAMMAR_ONLY";
      await this.progress.taskProgress({
        project_id:projectId,
        task_id:"T070",
        agent:"AGENT3_VISUAL_PRODUCTION",
        attempt,
        phase:"RUNTIME_EXECUTION",
        completed:10+Math.round((completedByState.size/total)*60),
        total:100,
        message:"T070 is using text-only GLOBAL visual grammar; no GLOBAL reference image is attached."
      });

      const promptIndexById=new Map(
        promptRecord.value.image_prompts.map((prompt,index)=>[prompt.state_image_id,index] as const)
      );
      const stateById=new Map(
        states.value.state_images.map(state=>[state.state_image_id,state] as const)
      );
      const sceneOrder:string[]=[];
      for(const prompt of promptRecord.value.image_prompts){
        if(
          generationStateIds.has(prompt.state_image_id)&&
          !sceneOrder.includes(prompt.scene_id)
        )sceneOrder.push(prompt.scene_id);
      }

      for(const sceneId of sceneOrder){
        const scene=visual.value.scenes.find(item=>item.scene_id===sceneId);
        if(scene===undefined){
          throw new ProductionTailRuntimeError(
            "TAIL_PREREQUISITE",
            "T070 scene is missing from scene_visual_spec: "+sceneId
          );
        }
        const scenePrompts=promptRecord.value.image_prompts
          .filter(prompt=>
            prompt.scene_id===sceneId&&generationStateIds.has(prompt.state_image_id)
          )
          .sort((left,right)=>
            (stateById.get(left.state_image_id)?.sequence_order??0)-
            (stateById.get(right.state_image_id)?.sequence_order??0)
          );
        if(
          phase==="FULL_GENERATION"&&
          scenePrompts.some(prompt=>!completedByState.has(prompt.state_image_id))
        ){
          sceneQcPassedIds.delete(sceneId);
        }

        let sceneComplete=false;
        while(!sceneComplete){
          for(const prompt of scenePrompts){
            const state=stateById.get(prompt.state_image_id);
            if(state===undefined){
              throw new ProductionTailRuntimeError(
                "TAIL_PREREQUISITE",
                "T070 prompt references missing state: "+prompt.state_image_id
              );
            }

            const reusable=completedByState.get(prompt.state_image_id);
            if(reusable!==undefined){
              completedByState.set(prompt.state_image_id,{
                ...reusable,
                reference_roles:[]
              });
              continue;
            }

            let generatedImage:GeneratedImage|null=null;
            let lastError:unknown=null;
            const globalIndex=(promptIndexById.get(prompt.state_image_id)??0)+1;
            for(let itemAttempt=1;itemAttempt<=T070_ITEM_MAX_ATTEMPTS;itemAttempt+=1){
              try{
                const result=await adapter.generate({
                  prompt:buildT070RuntimeProviderPrompt({
                    basePrompt:prompt.provider_prompt_en,
                    scene,
                    state,
                    revisionFeedback:revisionFeedbackByState[prompt.state_image_id]
                  }),
                  negativePrompt:prompt.negative_prompt_en,
                  width:format.imageGeneration.width,
                  height:format.imageGeneration.height,
                  aspectRatio:format.aspectRatio,
                  references:[],
                  sessionKey:imageSessionKey
                });
                const bytes=Buffer.from(result.bytes);
                const probe=probeImageBytes(bytes);
                if(
                  result.mimeType!=="image/png"||
                  probe.mimeType!=="image/png"||
                  probe.width!==format.imageGeneration.width||
                  probe.height!==format.imageGeneration.height
                ){
                  throw new ProductionTailRuntimeError(
                    "TAIL_IMAGE_INVALID",
                    "Generated state image does not match the pinned format profile: "+
                      prompt.state_image_id
                  );
                }
                const relativePath=
                  "05_images/generated/"+safeFileSegment(prompt.state_image_id)+".png";
                await atomicWrite(path.resolve(status.projectRoot,relativePath),bytes);
                generatedImage={
                  state_image_id:prompt.state_image_id,
                  scene_id:prompt.scene_id,
                  relative_path:relativePath,
                  sha256:sha256Bytes(bytes),
                  width:probe.width,
                  height:probe.height,
                  provider_request_ids:[...(result.providerRequestIds??[])],
                  reference_roles:[]
                };
                break;
              }catch(error){
                lastError=error;
                if(itemAttempt>=T070_ITEM_MAX_ATTEMPTS)break;
                await this.progress.taskProgress({
                  project_id:projectId,
                  task_id:"T070",
                  agent:"AGENT3_VISUAL_PRODUCTION",
                  attempt,
                  phase:"RUNTIME_EXECUTION",
                  completed:10+Math.round((completedByState.size/total)*60),
                  total:100,
                  message:
                    "Retrying state image "+String(globalIndex)+"/"+String(total)+
                    " after provider failure ("+String(itemAttempt)+"/"+
                    String(T070_ITEM_MAX_ATTEMPTS)+")."
                });
              }
            }

            if(generatedImage===null){
              if(lastError instanceof Error)throw lastError;
              throw new ProductionTailRuntimeError(
                "TAIL_IMAGE_PROVIDER",
                "Image provider failed for state "+prompt.state_image_id+"."
              );
            }

            completedByState.set(prompt.state_image_id,generatedImage);
            await writeCurrentCheckpoint();
            await this.progress.taskProgress({
              project_id:projectId,
              task_id:"T070",
              agent:"AGENT3_VISUAL_PRODUCTION",
              attempt,
              phase:"RUNTIME_EXECUTION",
              completed:10+Math.round((completedByState.size/total)*60),
              total:100,
              message:
                "Generated state image "+String(globalIndex)+"/"+String(total)+
                " in "+sceneId+"."
            });
          }

          if(phase!=="FULL_GENERATION"){
            sceneComplete=true;
            continue;
          }
          if(sceneQcPassedIds.has(sceneId)){
            sceneComplete=true;
            continue;
          }

          const sceneImages=scenePrompts.map(prompt=>{
            const image=completedByState.get(prompt.state_image_id);
            if(image===undefined){
              throw new ProductionTailRuntimeError(
                "TAIL_PREREQUISITE",
                "Scene-level QC requires every state image for "+sceneId+"."
              );
            }
            return image;
          });
          const reviewCycle=(sceneQcAttempts[sceneId]??0)+1;
          sceneQcAttempts[sceneId]=reviewCycle;
          await writeCurrentCheckpoint();
          const sceneQc=await this.runT070SceneVisualQc(
            projectId,
            attempt,
            promptRecord.sha256,
            sceneId,
            sceneImages,
            reviewCycle
          );
          if(sceneQc.verdict==="PASS"){
            sceneQcPassedIds.add(sceneId);
            for(const prompt of scenePrompts){
              delete revisionFeedbackByState[prompt.state_image_id];
            }
            await writeCurrentCheckpoint();
            await this.progress.taskProgress({
              project_id:projectId,
              task_id:"T070",
              agent:"CODEX_1_MANAGER",
              attempt,
              phase:"SCENE_IMAGE_VISUAL_QC",
              completed:sceneQcPassedIds.size,
              total:sceneOrder.length,
              message:sceneId+" passed scene-level visual QC; continuing T070."
            });
            sceneComplete=true;
            continue;
          }

          let failedIds=sceneQc.checks
            .filter(check=>
              check.verdict!=="PASS"||
              check.fantasy_control!=="PASS"||
              check.video_readiness!=="PASS"
            )
            .map(check=>check.state_image_id);
          if(failedIds.length===0){
            failedIds=scenePrompts.map(prompt=>prompt.state_image_id);
          }
          for(const stateImageId of new Set(failedIds)){
            const previous=completedByState.get(stateImageId);
            if(previous!==undefined){
              await rm(path.resolve(status.projectRoot,previous.relative_path),{force:true});
            }
            completedByState.delete(stateImageId);
            const notes=sceneQc.checks.find(check=>check.state_image_id===stateImageId)?.notes??[];
            revisionFeedbackByState[stateImageId]=[
              sceneQc.revision_instruction,
              ...notes
            ].filter(Boolean).join(" ");
          }
          sceneQcPassedIds.delete(sceneId);
          await writeCurrentCheckpoint();

          if(reviewCycle>=3){
            throw new ProductionTailRuntimeError(
              "TAIL_MANAGER_QC_REJECTED",
              sceneId+" failed scene-level visual QC after "+
                String(reviewCycle)+" targeted regeneration cycles: "+
                sceneQc.summary
            );
          }
          await this.progress.taskProgress({
            project_id:projectId,
            task_id:"T070",
            agent:"AGENT3_VISUAL_PRODUCTION",
            attempt,
            phase:"SCENE_REVISION",
            completed:sceneQcPassedIds.size,
            total:sceneOrder.length,
            message:
              sceneId+" visual QC requested targeted regeneration of "+
              String(new Set(failedIds).size)+" state image(s)."
          });
        }
      }

      if(phase==="SEED_GENERATION"){
        const completedSeeds=seedImageIds.filter(id=>completedByState.has(id));
        if(completedSeeds.length!==seedImageIds.length){
          throw new ProductionTailRuntimeError(
            "TAIL_IMAGE_PROVIDER",
            "T070 seed checkpoint is incomplete: "+String(completedSeeds.length)+
            "/"+String(seedImageIds.length)+"."
          );
        }
        phase="SEED_QC";
        await writeCurrentCheckpoint();
        await this.progress.taskProgress({
          project_id:projectId,
          task_id:"T070",
          agent:"AGENT3_VISUAL_PRODUCTION",
          attempt,
          phase:"SEED_QC",
          completed:seedImageIds.length,
          total:seedImageIds.length,
          message:
            "Generated "+String(seedImageIds.length)+
            " seed images. Full image generation is blocked until seed visual QC passes."
        });
        return"AWAITING_SEED_QC";
      }

      const images=checkpointImages();
      if(images.length!==total){
        throw new ProductionTailRuntimeError(
          "TAIL_IMAGE_PROVIDER",
          "T070 checkpoint is incomplete: "+String(images.length)+"/"+String(total)+"."
        );
      }
      const generated:GeneratedImagesArtifact={
        schema_version:"1.0",
        project_id:projectId,
        provider:"CHATGPT_BROWSER",
        source_prompt_bundle_sha256:promptRecord.sha256,
        images
      };
      const qc={
        schema_version:"1.0",
        project_id:projectId,
        status:"PASS",
        qc_scope:"PROVIDER_OUTPUT_CONTRACT",
        checks:images.map(image=>({
          state_image_id:image.state_image_id,
          status:"PASS",
          width:image.width,
          height:image.height,
          sha256:image.sha256,
          reference_count:image.reference_roles.length
        }))
      };
      const approved={
        ...generated,
        approval_basis:"T070_PROVIDER_CONTRACT_AND_CODEX1_SUCCESS_QC"
      };
      const at=new Date().toISOString();
      tail.save(projectId,"generated_images",generated,"T070",at);
      tail.save(projectId,"image_qc_result",qc,"T070",at);
      tail.save(projectId,"approved_images",approved,"T070",at);
      return"COMPLETE_READY";
    }finally{
      tail.close();
      agent3.close();
    }
  }

  private async prepareT080Manual(projectId:string):Promise<{
    ready:boolean;
    manifestRelativePath:string;
    missing:string[];
  }>{
    const status=await this.projects.getStatus(projectId);
    const agent3=new Agent3VisualProductionRepository(status.projectDbPath,{readonly:true});
    const production=new ProductionSpecRepository(status.projectDbPath,{readonly:true});
    const tail=new ProductionTailRepository(status.projectDbPath,{readonly:true});
    try{
      const prompts=agent3.getActive<PromptBundleDocument>(projectId,"prompt_bundle_spec");
      const sceneVisual=agent3.getActive<SceneVisualDocument>(projectId,"scene_visual_spec");
      const clipProduction=production.getClipProduction(projectId);
      const approved=tail.getActive<GeneratedImagesArtifact>(projectId,"approved_images");
      if(prompts===null||sceneVisual===null||clipProduction===null||approved===null){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T080 requires prompt_bundle_spec, scene_visual_spec, clip_production_spec and approved_images."
        );
      }
      const manifest=buildFlowManualManifest({
        projectId,
        promptBundle:prompts.value,
        approvedImages:approved.value,
        sceneVisual:sceneVisual.value,
        clipProduction
      });
      const manifestRelativePath="06_clips/google-flow-manifest.json";
      await writeJson(path.resolve(status.projectRoot,manifestRelativePath),manifest);
      const missing:string[]=[];
      for(const item of manifest.items){
        if(!(await readyFile(path.resolve(status.projectRoot,item.expected_output_relative_path)))){
          missing.push(item.expected_output_relative_path);
        }
      }
      return{ready:missing.length===0,manifestRelativePath,missing};
    }finally{
      tail.close();
      production.close();
      agent3.close();
    }
  }

  private async executeT080(projectId:string,attempt:number):Promise<void>{
    const status=await this.projects.getStatus(projectId);
    const manifest=JSON.parse(
      await readFile(path.resolve(status.projectRoot,"06_clips/google-flow-manifest.json"),"utf8")
    ) as FlowManualManifest;
    const clips:GeneratedClip[]=[];
    for(const [index,item] of manifest.items.entries()){
      const absolute=path.resolve(status.projectRoot,item.expected_output_relative_path);
      if(!(await readyFile(absolute))){
        throw new ProductionTailRuntimeError(
          "TAIL_MANUAL_RESULT_INVALID",
          "Google Flow result is missing: "+item.expected_output_relative_path
        );
      }
      const probe=await probeVideo(absolute);
      if(probe.durationSec+0.05<item.editorial_duration_sec){
        throw new ProductionTailRuntimeError(
          "TAIL_MANUAL_RESULT_INVALID",
          "Google Flow clip is shorter than its editorial duration: "+item.clip_id
        );
      }
      clips.push({
        clip_id:item.clip_id,
        scene_id:item.scene_id,
        relative_path:item.expected_output_relative_path,
        sha256:await fileSha256(absolute),
        source_duration_sec:probe.durationSec,
        editorial_duration_sec:item.editorial_duration_sec,
        width:probe.width,
        height:probe.height
      });
      await this.progress.taskProgress({
        project_id:projectId,
        task_id:"T080",
        agent:"AGENT3_VISUAL_PRODUCTION",
        attempt,
        phase:"RUNTIME_EXECUTION",
        completed:10+Math.round(((index+1)/manifest.items.length)*60),
        total:100,
        message:"Validated Flow clip "+String(index+1)+"/"+String(manifest.items.length)+"."
      });
    }
    const artifact:GeneratedClipsArtifact={
      schema_version:"1.0",
      project_id:projectId,
      provider:"GOOGLE_FLOW",
      clips
    };
    const qc={
      schema_version:"1.0",
      project_id:projectId,
      status:"PASS",
      qc_scope:"FILE_AND_EDITORIAL_DURATION",
      results:clips.map(clip=>({
        clip_id:clip.clip_id,
        status:"PASS",
        source_duration_sec:clip.source_duration_sec,
        editorial_duration_sec:clip.editorial_duration_sec,
        sha256:clip.sha256
      }))
    };
    const tail=new ProductionTailRepository(status.projectDbPath);
    try{
      const at=new Date().toISOString();
      tail.save(projectId,"generated_clips",artifact,"T080",at);
      tail.save(projectId,"clip_qc_result",qc,"T080",at);
    }finally{
      tail.close();
    }
  }

  private async executeT090(projectId:string,attempt:number):Promise<void>{
    const status=await this.projects.getStatus(projectId);
    const format=await this.resolveFormat(status);
    const tail=new ProductionTailRepository(status.projectDbPath);
    const agent2=new Agent2StoryAudioRepository(status.projectDbPath,{readonly:true});
    try{
      const clips=tail.getActive<GeneratedClipsArtifact>(projectId,"generated_clips");
      const tts=agent2.getActive<Agent2TtsManifest>(projectId,"tts_manifest");
      const subtitles=agent2.getActive<Agent2SubtitleTimingSpec>(projectId,"subtitle_timing");
      if(clips===null||tts===null||subtitles===null){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T090 requires generated_clips, tts_manifest and subtitle_timing."
        );
      }
      const publicRoot=path.join(
        DEFAULT_REPOSITORY_ROOT,
        "apps","editor","public","runtime",projectId
      );
      const publicClips:Array<GeneratedClip&{public_src:string}>=[];
      for(const clip of clips.value.clips){
        const fileName=safeFileSegment(clip.clip_id)+".mp4";
        const target=path.join(publicRoot,"clips",fileName);
        await mkdir(path.dirname(target),{recursive:true});
        await copyFile(path.resolve(status.projectRoot,clip.relative_path),target);
        publicClips.push({
          ...clip,
          public_src:"runtime/"+projectId+"/clips/"+fileName
        });
      }
      const ttsPublicSrc:Record<string,string>={};
      for(const section of tts.value.sections){
        const extension=path.extname(section.audio_relative_path)||".mp3";
        const fileName=safeFileSegment(section.section_id)+extension;
        const target=path.join(publicRoot,"tts",fileName);
        await mkdir(path.dirname(target),{recursive:true});
        await copyFile(path.resolve(status.projectRoot,section.audio_relative_path),target);
        ttsPublicSrc[section.section_id]="runtime/"+projectId+"/tts/"+fileName;
      }
      const editProject=buildTailEditProject({
        projectId,
        projectName:status.project.title,
        fps:format.fpsPreference,
        width:format.width,
        height:format.height,
        clips:publicClips,
        tts:tts.value,
        ttsPublicSrc,
        subtitles:subtitles.value
      });
      const editRelativePath="08_editor/edit_project.json";
      await writeJson(path.resolve(status.projectRoot,editRelativePath),editProject);
      await this.progress.taskProgress({
        project_id:projectId,
        task_id:"T090",
        agent:"EDITOR_REMOTION",
        attempt,
        phase:"RUNTIME_EXECUTION",
        completed:45,
        total:100,
        message:"Canonical edit_project.json materialized."
      });
      try{
        await runProcess(
          process.execPath,
          [
            path.join(DEFAULT_REPOSITORY_ROOT,"apps","editor","scripts","render-tail-preview.mjs"),
            status.projectRoot,
            projectId
          ],
          DEFAULT_REPOSITORY_ROOT
        );
      }catch(error){
        throw new ProductionTailRuntimeError(
          "TAIL_EDITOR_RENDER_FAILED",
          error instanceof Error?error.message:String(error)
        );
      }
      const previewRelativePath="09_render/preview.mp4";
      const previewAbsolute=path.resolve(status.projectRoot,previewRelativePath);
      const info=await stat(previewAbsolute);
      if(!info.isFile()||info.size<=0){
        throw new ProductionTailRuntimeError("TAIL_EDITOR_RENDER_FAILED","Remotion preview render is missing or empty.");
      }
      const probe=await probeVideo(previewAbsolute);
      const preview:PreviewRenderArtifact={
        schema_version:"1.0",
        project_id:projectId,
        relative_path:previewRelativePath,
        sha256:await fileSha256(previewAbsolute),
        size_bytes:info.size,
        duration_sec:probe.durationSec,
        width:probe.width,
        height:probe.height
      };
      const timeline={
        schema_version:"1.0",
        project_id:projectId,
        edit_project_relative_path:editRelativePath,
        fps:format.fpsPreference,
        width:format.width,
        height:format.height,
        duration_in_frames:editProject.project.durationInFrames,
        clip_count:publicClips.length,
        narration_section_count:tts.value.sections.length,
        subtitle_count:subtitles.value.cues.length
      };
      const at=new Date().toISOString();
      tail.save(projectId,"timeline_spec",timeline,"T090",at);
      tail.save(projectId,"preview_render",preview,"T090",at);
    }finally{
      agent2.close();
      tail.close();
    }
  }

  private async executeT100(projectId:string,attempt:number):Promise<string>{
    const status=await this.projects.getStatus(projectId);
    const tail=new ProductionTailRepository(status.projectDbPath);
    try{
      const timeline=tail.getActive(projectId,"timeline_spec");
      const preview=tail.getActive<PreviewRenderArtifact>(projectId,"preview_render");
      if(timeline===null||preview===null){
        throw new ProductionTailRuntimeError(
          "TAIL_PREREQUISITE",
          "T100 requires timeline_spec and preview_render."
        );
      }
      await this.progress.emit({
        event:"QC_STARTED",
        project_id:projectId,
        task_id:"T100",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        phase:"CODEX1_SUCCESS_QC"
      });
      const result=await this.codexRunner.execute<{
        schema_version:"1.0";
        verdict:"APPROVE"|"BLOCK"|"ESCALATE";
        summary:string;
        issues:string[];
        limitations:string[];
      }>({
        projectId,
        projectRoot:status.projectRoot,
        dbPath:status.projectDbPath,
        roleId:"CODEX_1_MANAGER",
        taskId:"T100",
        attempt,
        instructions:[
          "Act as Agent 1 final production QC.",
          "Review the supplied canonical timeline summary and technical preview-render evidence.",
          "Do not claim direct visual or audio perception that is not present in the supplied evidence.",
          "APPROVE only if timing, lineage, render dimensions, duration and artifact integrity are coherent.",
          "BLOCK when an upstream artifact or render must be regenerated before approval.",
          "ESCALATE only when an explicit human editorial judgment is required.",
          "List evidence limitations explicitly."
        ],
        input:{
          project_id:projectId,
          timeline_spec:timeline.value,
          preview_render:preview.value
        },
        outputSchema:FINAL_QC_SCHEMA,
        webSearchMode:"disabled"
      });
      const qc={
        ...result.output,
        schema_version:"1.0" as const,
        preview_sha256:preview.value.sha256,
        reviewed_at:new Date().toISOString()
      };
      await this.progress.emit({
        event:"QC_COMPLETED",
        project_id:projectId,
        task_id:"T100",
        agent:"CODEX_1_MANAGER",
        attempt,
        qc_kind:"SUCCESS",
        verdict:result.output.verdict,
        phase:"CODEX1_SUCCESS_QC"
      });
      if(result.output.verdict!=="APPROVE"){
        tail.save(projectId,"final_qc_result",qc,"T100",new Date().toISOString());
        await this.manager.applyManagerVerdict(
          projectId,
          "T100",
          attempt,
          result.output.verdict
        );
        throw new ProductionTailRuntimeError(
          "TAIL_FINAL_QC_REJECTED",
          "T100 returned "+result.output.verdict+": "+result.output.summary
        );
      }
      const previewAbsolute=path.resolve(status.projectRoot,preview.value.relative_path);
      const finalRelativePath="09_render/final.mp4";
      const finalAbsolute=path.resolve(status.projectRoot,finalRelativePath);
      await mkdir(path.dirname(finalAbsolute),{recursive:true});
      await copyFile(previewAbsolute,finalAbsolute);
      const finalQc={
        ...qc,
        final_output_relative_path:finalRelativePath,
        final_output_sha256:await fileSha256(finalAbsolute)
      };
      tail.save(projectId,"final_qc_result",finalQc,"T100",new Date().toISOString());
      await this.manager.recordGate(projectId,"T100",true);
      const completed=await this.manager.complete(projectId,"T100");
      await this.progress.taskProgress({
        project_id:projectId,
        task_id:"T100",
        agent:"AGENT1_MANAGER",
        attempt,
        phase:"COMPLETE",
        completed:100,
        total:100,
        message:"Final QC approved and final.mp4 was sealed."
      });
      await this.progress.emit({
        event:"TASK_COMPLETED",
        project_id:projectId,
        task_id:"T100",
        agent:"AGENT1_MANAGER",
        attempt,
        message:"T100 completed with "+String(completed.last_gate_status??"PASS")+"."
      });
      return"COMPLETE";
    }finally{
      tail.close();
    }
  }
}
