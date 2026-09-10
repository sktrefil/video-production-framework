import assert from "node:assert/strict";
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import type {MediaArtifact, ProviderJob} from "@vpf/domain";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";
import type {RuntimeExecutionReceipt, RuntimePersistencePort} from "../src/index.js";
import {RuntimeExecutorRegistry, RuntimeOrchestrator} from "../src/index.js";
import {registerElevenLabsRuntimeExecutor, ElevenLabsProcessRuntimeExecutor} from "../src/elevenlabs-runtime.js";

test("MIG-11 rejects arbitrary and old process entrypoints before spawn",()=>{
  for (const runtimePath of ["/tmp/custom.py","D:\\git\\video-production\\main.py","src/lived_sentences/cli.py"])
    assert.throws(()=>new ElevenLabsProcessRuntimeExecutor({runtimePath}),{code:"LEGACY_RUNTIME_FORBIDDEN"});
});

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const profileHash = "sha256:" + "a".repeat(64);

function runtimeOptions() {
  return {
    expectedOutputs: [
      {role: "narration", mediaType: "AUDIO" as const, required: true, acceptedMimeTypes: ["audio/mpeg"]},
      {role: "character_alignment", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"]},
      {role: "tts_metadata", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"]},
      {role: "resolved_voice_profile", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"]}
    ],
    secretRequirements: [{envName: "ELEVENLABS_API_KEY", required: true}]
  };
}

class FakeRuntimePersistence implements RuntimePersistencePort {
  async getProjectPolicy() { return {pipeline: "VPF_UNIFIED_V1", legacyAllowed: false}; }
  current: ProviderJob;
  receipts: RuntimeExecutionReceipt[] = [];
  media: MediaArtifact[] = [];
  constructor(job: ProviderJob) { this.current = structuredClone(job); }
  async getLatestProviderJob(projectId: string, jobId: string) {
    return this.current.projectId === projectId && this.current.id === jobId ? structuredClone(this.current) : null;
  }
  async recordRuntimeReceipt(input: {receipt: RuntimeExecutionReceipt; event: WorkflowEvent; outbox: OutboxRecord}) {
    this.receipts.push(structuredClone(input.receipt));
  }
  async commitProviderTransition(input: {previousJob: ProviderJob; nextJob: ProviderJob; receipt: RuntimeExecutionReceipt; media: MediaArtifact[]; event: WorkflowEvent; outbox: OutboxRecord}) {
    assert.equal(this.current.revision, input.previousJob.revision);
    this.current = structuredClone(input.nextJob);
    this.receipts.push(structuredClone(input.receipt));
    this.media.push(...structuredClone(input.media));
  }
}

function runtimeIds() { let n=0; return {next: (prefix: "med"|"runtime_receipt"|"evt"|"outbox") => `${prefix}_${++n}`}; }
function inputFor(chunks: string[], preset = "HISTORY_MYSTERY_LONGFORM") {
  return {
    schemaVersion: 1,
    providerProfile: {resourceId: "ELEVENLABS_V3_HISTORY_V1", version: "1.0.0", contentHash: profileHash},
    plan: {
      id: "tts-plan-1", revision: 1,
      sourceScript: {id: "script-1", revision: 1, sha256: "b".repeat(64)},
      contentFormat: preset.endsWith("SHORTS") ? "SHORTFORM" : "LONGFORM",
      endpoint: "/v1/text-to-speech/{voice_id}/with-timestamps", modelId: "eleven_v3", outputFormat: "mp3_44100_128",
      voiceIdResolution: "VOICE_PRESET_THEN_ENV", voiceIdFallbackEnv: "ELEVENLABS_VOICE_ID", voicePreset: preset,
      configuredVoiceSettings: {stability: 0.62, similarityBoost: 0.8, style: 0.04, speed: 1, useSpeakerBoost: true},
      effectiveVoiceSettings: {stability: 0.62, style: 0.04},
      droppedVoiceSettings: ["similarity_boost", "speed", "use_speaker_boost"], preserveProviderCadence: true,
      chunks: chunks.map((text,index)=>({index:index+1,text,textCharacterCount:text.length,outputRelativePath:`03_tts/chunks/chunk_${String(index+1).padStart(3,"0")}.mp3`})),
      outputPaths: {narration:"03_tts/narration.mp3",characterAlignment:"03_tts/character_alignment.json",metadata:"03_tts/tts_metadata.json",resolvedVoiceProfile:"03_tts/resolved_voice_profile.json"}
    }
  };
}
function providerJob(chunks:string[],attempt=2,preset?:string): ProviderJob {
  const now="2026-09-10T06:00:00.000Z";
  return {id:"tts-job-1",projectId:"p1",revision:1,lifecycleStatus:"ACTIVE",createdAt:now,updatedAt:now,jobType:"TTS_GENERATION",provider:"ELEVENLABS",providerProfileVersion:"1.0.0",targetType:"AUDIO",targetId:"tts-plan-1",targetRevision:1,executionMode:"AUTOMATED",status:"READY",attempt,inputPayload:inputFor(chunks,preset),resultMediaIds:[]};
}
async function requestBody(req: IncomingMessage) { let body=""; for await (const c of req) body += c.toString("utf8"); return body; }
async function listen(handler:(req:IncomingMessage,res:ServerResponse)=>void|Promise<void>) {
  const server=createServer((req,res)=>void handler(req,res)); await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  const a=server.address(); if(a===null||typeof a==="string") throw new Error("address missing");
  return {url:`http://127.0.0.1:${a.port}/v1`,close:async()=>await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()))};
}
function alignment(text:string){return {characters:[...text],character_start_times_seconds:[...text].map((_,i)=>i*.02),character_end_times_seconds:[...text].map((_,i)=>(i+1)*.02)};}
async function fakeFfmpeg(root:string){const p=path.join(root,"fake_ffmpeg.py");await writeFile(p,"import sys\nfrom pathlib import Path\na=sys.argv[1:]\nl=Path(a[a.index('-i')+1])\nout=Path(a[-1])\ndata=b''\nfor line in l.read_text(encoding='utf-8').splitlines():\n p=line.strip()[6:-1]\n data += Path(p).read_bytes()\nout.parent.mkdir(parents=True,exist_ok=True)\nout.write_bytes(data)\n","utf8");return `python3 ${JSON.stringify(p)}`;}
function orchestrator(job:ProviderJob,tempRoot:string,environment:NodeJS.ProcessEnv){
  const persistence=new FakeRuntimePersistence(job); const registry=new RuntimeExecutorRegistry();
  registerElevenLabsRuntimeExecutor(registry,{repositoryRoot,workspaceOptions:{workspaceRoot:path.join(tempRoot,"workspace")},environment});
  const service=new RuntimeOrchestrator(persistence,{getCurrentTargetRevision:async()=>1},registry,{nowIso:()=>new Date().toISOString()},runtimeIds(),{repositoryRoot,workspaceRoot:path.join(tempRoot,"workspace")});
  return {service,persistence};
}

test("ElevenLabs process runtime executes v3 /with-timestamps, combines LONGFORM chunks, and preserves request IDs/hashes", async()=>{
  const tempRoot=await mkdtemp(path.join(tmpdir(),"vpf-mig05-")); const requests:Array<{url:string;body:any;apiKey?:string}>=[]; let no=0;
  const server=await listen(async(req,res)=>{const body=JSON.parse(await requestBody(req));requests.push({url:req.url??"",body,apiKey:Array.isArray(req.headers["xi-api-key"])?req.headers["xi-api-key"]![0]:req.headers["xi-api-key"]});no++;res.statusCode=200;res.setHeader("content-type","application/json");res.setHeader("request-id",`req-${no}`);res.end(JSON.stringify({audio_base64:Buffer.from(`FAKE_MP3_${body.text}`).toString("base64"),alignment:alignment(body.text)}));});
  try {
    const secret="sk-mig05-test-secret", voiceId="voice-test-123"; const job=providerJob(["첫 번째 청크입니다.","두 번째 청크입니다."],2);
    const {service,persistence}=orchestrator(job,tempRoot,{ELEVENLABS_API_KEY:secret,ELEVENLABS_VOICE_ID_HISTORY_MYSTERY_LONGFORM:voiceId,ELEVENLABS_API_BASE_URL:server.url,ELEVENLABS_REQUEST_RETRIES:"0",VPF_FFMPEG_COMMAND:await fakeFfmpeg(tempRoot)});
    const outcome=await service.executeAutomated("p1",job.id,runtimeOptions());
    assert.equal(outcome.result.status,"COMPLETE"); assert.equal(outcome.result.attempt,2); assert.deepEqual(outcome.result.providerRequestIds,["req-1","req-2"]); assert.equal(outcome.providerJob.status,"COMPLETE"); assert.equal(requests.length,2);
    for(const r of requests){assert.match(r.url,/^\/v1\/text-to-speech\/voice-test-123\/with-timestamps\?output_format=mp3_44100_128$/);assert.equal(r.body.model_id,"eleven_v3");assert.deepEqual(r.body.voice_settings,{stability:.62,style:.04});assert.equal(r.apiKey,secret);}
    const narration=outcome.result.outputs.find(x=>x.role==="narration")!, audio=outcome.media.find(x=>x.mediaType==="AUDIO")!; assert.equal(audio.relativePath,"03_tts/narration.mp3");assert.equal(audio.mediaStatus,"AVAILABLE");assert.equal(audio.checksum,narration.sha256);assert.equal(audio.sourceJobId,job.id);assert.ok((audio.durationMs??0)>0);
    const root=path.join(tempRoot,"workspace","projects","p1"); const a=JSON.parse(await readFile(path.join(root,"03_tts/character_alignment.json"),"utf8"));assert.equal(a.characters.join(""),"첫 번째 청크입니다.\n\n두 번째 청크입니다.");
    const meta=await readFile(path.join(root,"03_tts/tts_metadata.json"),"utf8"), voice=await readFile(path.join(root,"03_tts/resolved_voice_profile.json"),"utf8");
    assert.equal(meta.includes(secret),false);assert.equal(meta.includes(voiceId),false);assert.equal(voice.includes(secret),false);assert.equal(voice.includes(voiceId),false);assert.equal(JSON.parse(voice).voiceId,"REDACTED");assert.equal(JSON.stringify(outcome.runtimeJob).includes(secret),false);assert.equal(JSON.stringify(outcome.runtimeJob).includes(voiceId),false);assert.ok(persistence.receipts.some(x=>x.attempt===2&&x.stage==="COMPLETE"));
  } finally { await server.close(); }
});

test("SHORTFORM uses exactly one /with-timestamps request without chunk concatenation", async()=>{
  const tempRoot=await mkdtemp(path.join(tmpdir(),"vpf-mig05-short-"));let count=0;const server=await listen(async(req,res)=>{const body=JSON.parse(await requestBody(req));count++;res.statusCode=200;res.setHeader("content-type","application/json");res.setHeader("request-id","req-short");res.end(JSON.stringify({audio_base64:Buffer.from("ONE_CHUNK").toString("base64"),alignment:alignment(body.text)}));});
  try {const job=providerJob(["짧은 내레이션입니다."],1,"HISTORY_MYSTERY_SHORTS");const {service}=orchestrator(job,tempRoot,{ELEVENLABS_API_KEY:"short-secret",ELEVENLABS_VOICE_ID_HISTORY_MYSTERY_SHORTS:"voice-short",ELEVENLABS_API_BASE_URL:server.url,ELEVENLABS_REQUEST_RETRIES:"0"});const outcome=await service.executeAutomated("p1",job.id,runtimeOptions());assert.equal(outcome.result.status,"COMPLETE");assert.equal(count,1);assert.deepEqual(outcome.result.providerRequestIds,["req-short"]);} finally {await server.close();}
});

test("provider HTTP failure is mapped to a stable RuntimeResult error without media",async()=>{
  const tempRoot=await mkdtemp(path.join(tmpdir(),"vpf-mig05-fail-"));const server=await listen(async(_req,res)=>{res.statusCode=400;res.end("bad request");});
  try {const job=providerJob(["실패 테스트"],3);const {service}=orchestrator(job,tempRoot,{ELEVENLABS_API_KEY:"failure-secret",ELEVENLABS_VOICE_ID_HISTORY_MYSTERY_LONGFORM:"voice-fail",ELEVENLABS_API_BASE_URL:server.url,ELEVENLABS_REQUEST_RETRIES:"0"});const outcome=await service.executeAutomated("p1",job.id,runtimeOptions());assert.equal(outcome.result.status,"FAILED");assert.equal(outcome.result.error?.code,"PROVIDER_REQUEST_FAILED");assert.equal(outcome.result.attempt,3);assert.equal(outcome.media.length,0);assert.equal(outcome.providerJob.status,"FAILED");} finally {await server.close();}
});
