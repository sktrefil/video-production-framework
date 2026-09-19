import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {copyFile, mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {defaultProjectRoot} from "./materialize-editor-project.mjs";

const APP_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const REPOSITORY_ROOT=resolve(APP_ROOT,"../..");
const subtitleItemId=cueId=>`subtitle-${cueId}`;
const millisecondsForFrame=(frame,fps)=>Math.round((frame*1000)/fps);
const readJson=async filename=>JSON.parse(await readFile(filename,"utf8"));
const sha256=value=>createHash("sha256").update(value).digest("hex");

function assert(value,message){if(!value)throw new Error(message);}

export function buildSubtitleSyncPromotion({draft,cueDocument}){
  assert(draft?.schemaVersion===1&&draft?.project&&Array.isArray(draft.items),"Studio review draft is invalid.");
  assert(Array.isArray(cueDocument?.cues)&&cueDocument.cues.length>0,"subtitle-cues.json is invalid.");
  const fps=draft.project.fps;
  assert(Number.isSafeInteger(fps)&&fps>0,"Studio review draft has an invalid fps.");
  const items=new Map(draft.items.filter(item=>item?.type==="SUBTITLE").map(item=>[item.id,item]));
  const cues=cueDocument.cues.map(cue=>({...cue}));
  const changes=[];
  for(const cue of cues){
    const item=items.get(subtitleItemId(cue.id));
    if(item===undefined||item.generationSource!=="TTS_TRANSCRIBE")continue;
    assert(item.text===cue.text,`Subtitle text changed during review and cannot be promoted automatically: ${cue.id}`);
    assert(Number.isSafeInteger(item.timelineStartFrame)&&item.timelineStartFrame>=0&&Number.isSafeInteger(item.durationInFrames)&&item.durationInFrames>0,`Invalid reviewed timing: ${cue.id}`);
    const startMs=millisecondsForFrame(item.timelineStartFrame,fps);
    const endMs=millisecondsForFrame(item.timelineStartFrame+item.durationInFrames,fps);
    if(cue.startMs!==startMs||cue.endMs!==endMs||cue.generationSource!=="TTS_TRANSCRIBE"){
      changes.push({id:cue.id,text:cue.text,previous:{startMs:cue.startMs,endMs:cue.endMs},next:{startMs,endMs}});
      cue.startMs=startMs;
      cue.endMs=endMs;
      cue.generationSource="TTS_TRANSCRIBE";
    }
  }
  assert(changes.length>0,"No approved TTS_TRANSCRIBE subtitle timings exist in the Studio review draft.");
  for(let index=0;index<cues.length;index++){
    const cue=cues[index];
    assert(Number.isFinite(cue.startMs)&&Number.isFinite(cue.endMs)&&cue.startMs>=0&&cue.endMs>cue.startMs,`Invalid promoted cue timing: ${cue.id}`);
    const next=cues[index+1];
    assert(next===undefined||cue.endMs<=next.startMs,`Promoted cue overlaps its next cue: ${cue.id}`);
  }
  const audioDurationMs=cueDocument.source?.audioDurationMs;
  const last=cues.at(-1);
  assert(!Number.isFinite(audioDurationMs)||last.endMs<=audioDurationMs,`Promoted subtitles exceed narration duration (${audioDurationMs}ms).`);
  return {fps,changes,promotedDocument:{...cueDocument,cues}};
}

async function writeJsonAtomically(filename,value){
  await mkdir(dirname(filename),{recursive:true});
  const temporary=`${filename}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,`utf8`);
  await rename(temporary,filename);
}

async function runCanonicalAssembly({projectId,header}){
  const entry=resolve(REPOSITORY_ROOT,"cli","vpf","dist","entry.js");
  await new Promise((resolveRun,rejectRun)=>{
    const child=spawn(process.execPath,[entry,"editor","assemble",projectId,"--header",header],{cwd:REPOSITORY_ROOT,stdio:"inherit",windowsHide:true,shell:false,env:{...process.env}});
    child.once("error",rejectRun);
    child.once("exit",(code,signal)=>code===0?resolveRun():rejectRun(new Error(signal?`Canonical assembly terminated by ${signal}`:`Canonical assembly failed with exit code ${code??"unknown"}`)));
  });
}

function parseArgs(argv){
  if(argv.length===0||argv.includes("--help")||argv.includes("-h"))return null;
  const result={projectId:argv.shift(),apply:false};
  while(argv.length){
    const arg=argv.shift();
    if(arg==="--apply")result.apply=true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

export async function promoteStudioSubtitleSync({projectId,apply=false,projectRoot=defaultProjectRoot(projectId),draft:providedDraft}){
  const editorRoot=resolve(projectRoot,"08_editor");
  const draftPath=resolve(editorRoot,"studio_edit_project.json");
  const canonicalPath=resolve(editorRoot,"edit_project.json");
  const cuesPath=resolve(projectRoot,"03_tts","subtitle-cues.json");
  const [draft,cueDocument,canonical]=await Promise.all([providedDraft??readJson(draftPath),readJson(cuesPath),readJson(canonicalPath)]);
  assert(draft.project?.id===projectId,`Studio review draft project mismatch: ${draft.project?.id??"unknown"}`);
  const promotion=buildSubtitleSyncPromotion({draft,cueDocument});
  const result={projectId,apply,changes:promotion.changes,sourceSha256:sha256(JSON.stringify(cueDocument)),promotedSha256:sha256(JSON.stringify(promotion.promotedDocument))};
  if(!apply)return result;

  const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
  const backupPath=resolve(projectRoot,"03_tts",`subtitle-cues.pre-studio-sync-${stamp}.json`);
  await copyFile(cuesPath,backupPath);
  await writeJsonAtomically(cuesPath,promotion.promotedDocument);
  const header=canonical.items?.find(item=>item.id==="text-top-title")?.text??canonical.project?.name??"로마 제9군단의 미스터리";
  try{
    await runCanonicalAssembly({projectId,header});
  }catch(error){
    await copyFile(backupPath,cuesPath);
    throw error;
  }
  return {...result,backupPath};
}

if(resolve(process.argv[1]??"")===fileURLToPath(import.meta.url)){
  const args=parseArgs(process.argv.slice(2));
  if(args===null){
    console.log("Usage: node scripts/promote-studio-subtitle-sync.mjs <project_id> [--apply]");
    process.exitCode=process.argv.length<=2?1:0;
  }else{
    void promoteStudioSubtitleSync(args).then(result=>{
      console.log(`[subtitle-sync-promote] ${result.apply?"PROMOTED":"DRY_RUN"} · changes=${result.changes.length}`);
      for(const change of result.changes)console.log(`  ${change.id}: ${change.previous.startMs}-${change.previous.endMs}ms -> ${change.next.startMs}-${change.next.endMs}ms`);
      if(result.backupPath)console.log(`[subtitle-sync-promote] backup=${result.backupPath}`);
    }).catch(error=>{
      console.error(`[subtitle-sync-promote] BLOCKED: ${error instanceof Error?error.message:String(error)}`);
      process.exitCode=1;
    });
  }
}
