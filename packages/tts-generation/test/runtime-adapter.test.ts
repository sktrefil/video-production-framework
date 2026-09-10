import assert from "node:assert/strict";
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import type {EditorContentPlan, MediaArtifact, ProviderJob, TtsGenerationPlan, TtsGenerationResult} from "@vpf/domain";
import {EditorTimelineAssemblyPipeline} from "@vpf/editor-timeline";
import {FileSystemResourceRegistry} from "@vpf/resource-registry";
import {materializeRuntimeJob, type RuntimeResult} from "@vpf/runtime-contracts";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import {
  ELEVENLABS_PROVIDER_PROFILE_ID,
  ELEVENLABS_PROVIDER_PROFILE_VERSION,
  TtsRuntimeCompletionService,
  TtsRuntimePreparationService,
  elevenLabsRuntimeExecutionOptions,
  type ElevenLabsRuntimeInput,
  type TtsRuntimeBridgeRepository,
  type TtsRuntimeIdFactory
} from "../src/runtime-adapter.js";

const now = "2026-09-10T07:00:00.000Z";
const repositoryRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function plan(): TtsGenerationPlan {
  return {
    id:"tts-plan-1",projectId:"p1",revision:1,lifecycleStatus:"ACTIVE",createdAt:now,updatedAt:now,
    sourceScriptId:"script-1",sourceScriptRevision:2,sourceScriptSha256:"c".repeat(64),contentFormat:"LONGFORM",provider:"ELEVENLABS",
    endpoint:"/v1/text-to-speech/{voice_id}/with-timestamps",apiKeyEnv:"ELEVENLABS_API_KEY",voiceIdResolution:"VOICE_PRESET_THEN_ENV",voiceIdFallbackEnv:"ELEVENLABS_VOICE_ID",voicePreset:"HISTORY_MYSTERY_LONGFORM",modelId:"eleven_v3",outputFormat:"mp3_44100_128",maxChunkCharacters:4000,
    configuredVoiceSettings:{stability:.62,similarityBoost:.8,style:.04,speed:1,useSpeakerBoost:true},effectiveVoiceSettings:{stability:.62,style:.04},droppedVoiceSettings:["similarity_boost","speed","use_speaker_boost"],preserveProviderCadence:true,
    chunks:[{index:1,text:"첫 청크",textCharacterCount:4,outputRelativePath:"03_tts/chunks/chunk_001.mp3"},{index:2,text:"둘째 청크",textCharacterCount:5,outputRelativePath:"03_tts/chunks/chunk_002.mp3"}],
    outputPaths:{narration:"03_tts/narration.mp3",characterAlignment:"03_tts/character_alignment.json",metadata:"03_tts/tts_metadata.json",resolvedVoiceProfile:"03_tts/resolved_voice_profile.json"},status:"READY"
  };
}
class FakeBridgeRepo implements TtsRuntimeBridgeRepository {
  plan:TtsGenerationPlan|null=plan(); result:TtsGenerationResult|null=null; job:ProviderJob|null=null; committedMedia:MediaArtifact[]=[];
  async getLatestApprovedFinalScript(){return null;}
  async getLatestTtsPlan(){return this.plan===null?null:structuredClone(this.plan);}
  async getLatestTtsResult(){return this.result===null?null:structuredClone(this.result);}
  async getLatestTtsProviderJob(){return this.job===null?null:structuredClone(this.job);}
  async commitTtsPlan():Promise<void>{throw new Error("not used");}
  async commitTtsProviderJob(input:{job:ProviderJob;event:WorkflowEvent;outbox:OutboxRecord}){this.job=structuredClone(input.job);}
  async commitTtsResult(input:{previousPlan:TtsGenerationPlan;nextPlan:TtsGenerationPlan;previousResult:TtsGenerationResult|null;result:TtsGenerationResult;audioMedia:MediaArtifact;event:WorkflowEvent;outbox:OutboxRecord}){this.plan=structuredClone(input.nextPlan);this.result=structuredClone(input.result);this.committedMedia.push(structuredClone(input.audioMedia));}
}
function ids():TtsRuntimeIdFactory{let n=0;return {next:prefix=>`${prefix}_${++n}`};}
async function canonicalProfile(){const registry=new FileSystemResourceRegistry(path.join(repositoryRoot,"resources"));const snapshot=await registry.resolve({resourceType:"PROVIDER_PROFILE",resourceId:ELEVENLABS_PROVIDER_PROFILE_ID,version:ELEVENLABS_PROVIDER_PROFILE_VERSION});assert.ok(snapshot);return {registry,snapshot};}

test("TTS runtime preparation resolves exact version+hash pin and persists secret-free AUTOMATED ProviderJob",async()=>{
  const repo=new FakeBridgeRepo();const {registry,snapshot}=await canonicalProfile();const service=new TtsRuntimePreparationService(repo,registry,{nowIso:()=>now},ids());
  const pin={resourceType:"PROVIDER_PROFILE" as const,resourceId:ELEVENLABS_PROVIDER_PROFILE_ID,version:ELEVENLABS_PROVIDER_PROFILE_VERSION,contentHash:snapshot!.contentHash};
  const first=await service.prepare({projectId:"p1",providerPin:pin});assert.equal(first.created,true);assert.equal(first.job.status,"READY");assert.equal(first.job.executionMode,"AUTOMATED");assert.equal(first.job.provider,"ELEVENLABS");assert.equal(first.job.providerProfileVersion,"1.0.0");assert.equal(first.job.targetType,"AUDIO");
  const durable=JSON.stringify(first.job);assert.equal(durable.includes("ELEVENLABS_API_KEY"),false);assert.equal(/voice-[A-Za-z0-9_-]+/.test(durable),false);assert.match(durable,/sha256:[a-f0-9]{64}/);assert.match(durable,/eleven_v3/);
  const second=await service.prepare({projectId:"p1",providerPin:pin});assert.equal(second.created,false);assert.equal(second.job.id,first.job.id);
});

test("runtime completion reuses Framework-ingested narration AUDIO instead of creating a second media identity",async()=>{
  const repo=new FakeBridgeRepo();const {registry,snapshot}=await canonicalProfile();const idFactory=ids();const prep=new TtsRuntimePreparationService(repo,registry,{nowIso:()=>now},idFactory);
  const prepared=await prep.prepare({projectId:"p1",providerPin:{resourceType:"PROVIDER_PROFILE",resourceId:ELEVENLABS_PROVIDER_PROFILE_ID,version:ELEVENLABS_PROVIDER_PROFILE_VERSION,contentHash:snapshot!.contentHash}});
  const options=elevenLabsRuntimeExecutionOptions();const runtimeJob=materializeRuntimeJob<ElevenLabsRuntimeInput>({job:prepared.job,expectedOutputs:options.expectedOutputs,secretRequirements:options.secretRequirements});
  const expectedText="첫 청크\n\n둘째 청크",chars=[...expectedText],audioSha="d".repeat(64),alignmentSha="e".repeat(64);
  const result:RuntimeResult={schemaVersion:1,jobId:runtimeJob.jobId,jobRevision:runtimeJob.jobRevision,projectId:runtimeJob.projectId,attempt:runtimeJob.attempt,status:"COMPLETE",providerRequestIds:["req-a","req-b"],outputs:[
    {role:"narration",relativePath:"03_tts/narration.mp3",mimeType:"audio/mpeg",sizeBytes:123,sha256:audioSha,durationMs:1200},
    {role:"character_alignment",relativePath:"03_tts/character_alignment.json",mimeType:"application/json",sizeBytes:456,sha256:alignmentSha},
    {role:"tts_metadata",relativePath:"03_tts/tts_metadata.json",mimeType:"application/json",sizeBytes:200,sha256:"f".repeat(64)},
    {role:"resolved_voice_profile",relativePath:"03_tts/resolved_voice_profile.json",mimeType:"application/json",sizeBytes:100,sha256:"1".repeat(64)}],startedAt:now,completedAt:now};
  const ingestedAudio:MediaArtifact={id:"med-runtime-narration",projectId:"p1",revision:1,lifecycleStatus:"ACTIVE",createdAt:now,updatedAt:now,mediaType:"AUDIO",relativePath:"03_tts/narration.mp3",mimeType:"audio/mpeg",durationMs:1200,checksum:audioSha,sourceJobId:runtimeJob.jobId,mediaStatus:"AVAILABLE"};
  const completion=new TtsRuntimeCompletionService(repo,{nowIso:()=>now},idFactory);const completed=await completion.complete({projectId:"p1",runtimeJob,runtimeResult:result,media:[ingestedAudio],alignmentDocument:{characters:chars,character_start_times_seconds:chars.map((_,i)=>i*.05),character_end_times_seconds:chars.map((_,i)=>(i+1)*.05)}});
  assert.equal(completed.audioMedia.id,"med-runtime-narration");assert.equal(completed.result.audioMediaId,"med-runtime-narration");assert.deepEqual(completed.result.requestIds,["req-a","req-b"]);assert.equal(completed.result.voiceId,"REDACTED");assert.equal(completed.result.audioSha256,audioSha);assert.equal(repo.committedMedia.length,1);assert.equal(repo.plan?.status,"COMPLETE");
});

test("runtime-ingested narration AUDIO is consumable as WF-16 TTS on A1",async()=>{
  const audio:MediaArtifact={id:"med-runtime-narration",projectId:"p1",revision:1,lifecycleStatus:"ACTIVE",createdAt:now,updatedAt:now,mediaType:"AUDIO",relativePath:"03_tts/narration.mp3",mimeType:"audio/mpeg",durationMs:1200,checksum:"d".repeat(64),sourceJobId:"tts-job-1",mediaStatus:"AVAILABLE"};
  const contentPlan:EditorContentPlan={id:"content-plan-1",projectId:"p1",revision:1,lifecycleStatus:"ACTIVE",createdAt:now,updatedAt:now,planStatus:"APPROVED",audio:[{id:"narration",type:"TTS",mediaId:audio.id,timelineStartMs:0,sourceInMs:0,sourceOutMs:1200,durationMs:1200,volume:1,muted:false}],subtitles:[],textOverlays:[],graphics:[]};
  let stored:any=null;const pipeline=new EditorTimelineAssemblyPipeline(
    {getLatestAssembly:async()=>null,commitAssembly:async input=>{stored=input.assembly;},markAssemblyStale:async()=>{}},
    {buildEditorHandoff:async()=>({schemaVersion:"1.0",projectId:"p1",createdAt:now,recommendedFileName:"media_binding.json",status:"READY",totalImplementations:1,boundImplementations:1,items:[{order:1,bindingId:"bind-1",bindingRevision:1,linkId:"link-1",linkRevision:1,implementationType:"CLIP",implementationId:"clip-1",implementationRevision:1,bindingKind:"EDITORIAL",clipMode:"STATIC_HOLD",mediaId:"image-1",relativePath:"05_images/scene.png",durationMs:3000,transitionMethod:"DIRECT"}],blockers:[]})},
    {nowIso:()=>now},{next:prefix=>`${prefix}-1`},{getLatestEditorContentPlan:async()=>contentPlan,getMedia:async(_p,id)=>id===audio.id?audio:null}
  );
  const assembled=await pipeline.assembleProject({projectId:"p1",projectName:"MIG-05",profile:{fps:30,width:1920,height:1080}});const tts=assembled.output.editProject.items.find(x=>x.type==="TTS");assert.ok(tts&&tts.type==="TTS");assert.equal(tts.trackId,"A1");assert.equal(tts.src,"03_tts/narration.mp3");assert.equal(stored.assemblyStatus,"READY");
});
