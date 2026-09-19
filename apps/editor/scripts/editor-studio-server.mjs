import {createHash} from "node:crypto";
import {createServer} from "node:http";
import {copyFile, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {defaultProjectRoot,materializeProjectCommand} from "./materialize-editor-project.mjs";
import {buildSubtitleAudioSyncPreview,transcribeFinalAudio} from "./subtitle-audio-sync.mjs";
import {promoteStudioSubtitleSync} from "./promote-studio-subtitle-sync.mjs";
import {sha256File} from "@vpf/editor-materializer";

const APP_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const DEFAULT_PORT=4318;
const MAX_BODY_BYTES=5*1024*1024;
const PROJECT_ID=/^[a-z0-9][a-z0-9_-]{0,99}$/;
const MEDIA_TYPES=new Set(["VIDEO","IMAGE","TTS","CLIP_AUDIO","BGM","SFX"]);

const fail=(status,error)=>({status,error});
const json=(response,status,value)=>{
  response.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, PUT, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"});
  response.end(JSON.stringify(value));
};
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>{
  const temporary=`${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,"utf8");
  await rename(temporary,path);
};
const parseArgs=argv=>{
  const [projectId,...rest]=argv;
  if(!projectId||!PROJECT_ID.test(projectId))throw new Error("Usage: editor-studio-server.mjs <project_id> [--port <1-65535>]");
  let port=DEFAULT_PORT;
  while(rest.length){
    const arg=rest.shift();
    if(arg!=="--port")throw new Error(`Unknown argument: ${arg}`);
    const value=Number(rest.shift());
    if(!Number.isInteger(value)||value<1||value>65535)throw new Error("--port requires an integer from 1 through 65535");
    port=value;
  }
  return {projectId,port};
};
const readBody=request=>new Promise((resolveBody,reject)=>{
  let size=0;const chunks=[];
  request.on("data",chunk=>{size+=chunk.length;if(size>MAX_BODY_BYTES){reject(new Error("Request body exceeds 5 MiB"));request.destroy();return;}chunks.push(chunk);});
  request.once("error",reject);request.once("end",()=>resolveBody(Buffer.concat(chunks).toString("utf8")));
});
const assertEditableProject=(project,projectId,referenceProject)=>{
  if(!project||project.schemaVersion!==1||!project.project||project.project.id!==projectId||!Array.isArray(project.items)||!Array.isArray(project.tracks))throw new Error("Payload is not a schemaVersion 1 editor project for this project ID.");
  for(const key of ["fps","width","height","durationInFrames"]){if(project.project[key]!==referenceProject.project[key])throw new Error(`Project ${key} cannot be changed in Studio review mode.`);}
  const allowedPrefixes=[`projects/${projectId}/media/`,`projects/${projectId}/studio-review/media/`];
  for(const item of project.items){
    if(!item||typeof item!=="object"||typeof item.id!=="string"||typeof item.type!=="string")throw new Error("Timeline contains an invalid item.");
    if(MEDIA_TYPES.has(item.type)&&(typeof item.src!=="string"||!allowedPrefixes.some(prefix=>item.src.startsWith(prefix))))throw new Error(`Media item ${item.id} must retain a materialized project media source.`);
  }
};

const isInside=(root,candidate)=>{const path=relative(root,candidate);return path!==""&&!path.startsWith("..")&&!path.includes(":");};
const reviewFallback=async projectId=>{
  const projectRoot=resolve(APP_ROOT,"..","..","workspace","projects",projectId);
  const canonicalPath=resolve(projectRoot,"08_editor","edit-project.json");
  const canonical=await readJson(canonicalPath);
  if(canonical?.schemaVersion!==1||canonical?.project?.id!==projectId||!Array.isArray(canonical.items))throw new Error("No valid editor assembly is available for Studio review.");
  const executionProject=structuredClone(canonical);
  const reviewRoot=resolve(APP_ROOT,"public","projects",projectId,"studio-review");
  await rm(reviewRoot,{recursive:true,force:true});
  await mkdir(resolve(reviewRoot,"media"),{recursive:true});
  const copied=new Map();
  for(const item of executionProject.items){
    if(!MEDIA_TYPES.has(item.type))continue;
    if(typeof item.src!=="string")throw new Error(`Media item ${item.id} has no source path.`);
    let source=resolve(projectRoot,"08_editor",item.src);
    if(!isInside(projectRoot,source)){
      const projectRelative=item.src.replace(/^(?:\.\.\/)+/,"");
      if(projectRelative===item.src)throw new Error(`Media item ${item.id} escapes the project workspace.`);
      source=resolve(projectRoot,projectRelative);
    }
    if(!isInside(projectRoot,source))throw new Error(`Media item ${item.id} escapes the project workspace.`);
    const sourceInfo=await stat(source);
    if(!sourceInfo.isFile()||sourceInfo.size<=0)throw new Error(`Media item ${item.id} is missing or empty.`);
    let destination=copied.get(source);
    if(!destination){
      const hash=await sha256File(source);
      const relativeDestination=`projects/${projectId}/studio-review/media/${hash}/${basename(source)}`;
      destination=resolve(APP_ROOT,"public",relativeDestination);
      await mkdir(dirname(destination),{recursive:true});
      await copyFile(source,destination);
      copied.set(source,destination);
      item.src=relativeDestination;
    }else{
      item.src=relative(APP_ROOT+"/public",destination).replaceAll("\\\\","/");
    }
  }
  await writeJson(resolve(reviewRoot,"edit_project.json"),executionProject);
  return {executionProject,canonicalProjectAbsolutePath:canonicalPath,reviewMode:"UNASSEMBLED_REVIEW"};
};

const {projectId,port}=parseArgs(process.argv.slice(2));
let materialized;
try{materialized=await materializeProjectCommand({projectId});}
catch(error){
  if(!(error&&typeof error==="object"&&"code" in error&&error.code==="ASSEMBLY_NOT_FOUND"))throw error;
  materialized=await reviewFallback(projectId);
}
let referenceProject=materialized.executionProject;
let referenceSha256=createHash("sha256").update(JSON.stringify(referenceProject)).digest("hex");
const reviewPath=resolve(materialized.canonicalProjectAbsolutePath,"..","studio_edit_project.json");
const reviewBasePath=resolve(materialized.canonicalProjectAbsolutePath,"..","studio_edit_project.base.json");
const studioRenderSnapshotPath=resolve(APP_ROOT,"public","vpf-active-editor-project.json");
const studioConnectionPath=resolve(APP_ROOT,"public","vpf-active-editor-connection.json");
const api=`http://127.0.0.1:${port}`;

const quarantineIncompatibleDraft=async error=>{
  const stamp=Date.now();
  const quarantinePath=`${reviewPath}.incompatible-${stamp}.json`;
  const quarantineBasePath=`${reviewBasePath}.incompatible-${stamp}.json`;
  await rename(reviewPath,quarantinePath);
  await rename(reviewBasePath,quarantineBasePath).catch(()=>undefined);
  console.warn(`[editor-studio-server] incompatible Studio draft quarantined: ${quarantinePath}`);
  console.warn(`[editor-studio-server] draft reason: ${error instanceof Error?error.message:String(error)}`);
  return referenceProject;
};
const loadProject=async()=>{
  let saved;
  try{
    saved=await readJson(reviewPath);
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT")return referenceProject;
    if(error instanceof SyntaxError)return quarantineIncompatibleDraft(error);
    throw error;
  }
  let base;
  try{
    base=await readJson(reviewBasePath);
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT")return quarantineIncompatibleDraft(new Error("Studio draft has no canonical base fingerprint."));
    if(error instanceof SyntaxError)return quarantineIncompatibleDraft(error);
    throw error;
  }
  if(base?.referenceSha256!==referenceSha256)return quarantineIncompatibleDraft(new Error("Studio draft belongs to a different canonical assembly revision."));
  try{
    assertEditableProject(saved,projectId,referenceProject);
    return saved;
  }catch(error){
    return quarantineIncompatibleDraft(error);
  }
};
// The Studio renderer is a separate browser process and may not retain the
// editing URL query parameters. This snapshot is the exact last saved draft.
await writeJson(studioRenderSnapshotPath,await loadProject());
await writeJson(studioConnectionPath,{schemaVersion:1,projectId,apiBase:api});
const projectEndpoint=`/api/editor/project/${encodeURIComponent(projectId)}`;
const subtitleSyncEndpoint=`${projectEndpoint}/subtitle-sync/preview`;
const subtitleSyncCommitEndpoint=`${projectEndpoint}/subtitle-sync/commit`;
const activeEndpoint="/api/editor/active";
const projectEnvelope=async()=>({success:true,projectId,project:await loadProject(),path:reviewPath,status:"REVIEW_DRAFT"});
let canonicalPromotionRunning=false;
const server=createServer(async(request,response)=>{
  try{
    if(request.method==="OPTIONS"){json(response,204,{});return;}
    const origin=new URL(request.url??"/","http://127.0.0.1");
    if(origin.pathname===activeEndpoint){
      if(request.method!=="GET"){json(response,405,fail(405,"Method not allowed"));return;}
      json(response,200,await projectEnvelope());
      return;
    }
    if(origin.pathname===subtitleSyncEndpoint){
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      const submitted=JSON.parse(await readBody(request));
      assertEditableProject(submitted,projectId,referenceProject);
      const tts=submitted.items.find(item=>item.type==="TTS"&&item.trackId==="A1");
      if(!tts)throw new Error("A1 TTS narration is required for final-audio subtitle sync.");
      const root=defaultProjectRoot(projectId);
      const report=await readJson(resolve(root,"08_editor","materialization_report.json"));
      const media=Array.isArray(report?.media)?report.media.find(item=>item?.editorRelativePath===tts.src):null;
      if(!media||typeof media.sourceRelativePath!=="string")throw new Error("The materialization report does not map the A1 TTS source.");
      const audioPath=resolve(root,media.sourceRelativePath);
      if(!isInside(root,audioPath))throw new Error("The A1 TTS source escapes the project workspace.");
      const subtitles=submitted.items.filter(item=>item.type==="SUBTITLE"&&item.trackId==="T1");
      if(subtitles.length===0)throw new Error("T1 has no subtitles to synchronize.");
      const transcription=await transcribeFinalAudio({audioPath,prompt:subtitles.map(item=>item.text).join(" ")});
      const preview=buildSubtitleAudioSyncPreview({subtitles,words:transcription.words,fps:submitted.project.fps,projectDurationInFrames:submitted.project.durationInFrames});
      json(response,200,{success:true,projectId,model:transcription.model,language:transcription.language,...preview});
      return;
    }
    if(origin.pathname===subtitleSyncCommitEndpoint){
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      if(canonicalPromotionRunning)throw new Error("A subtitle sync promotion is already running.");
      canonicalPromotionRunning=true;
      try{
        const submitted=JSON.parse(await readBody(request));
        assertEditableProject(submitted,projectId,referenceProject);
        // Save the exact reviewed state first, then promote only its approved
        // TTS_TRANSCRIBE timings into the canonical cue source and project.db.
        await writeJson(reviewPath,submitted);
        await writeJson(reviewBasePath,{schemaVersion:1,referenceSha256});
        await writeJson(studioRenderSnapshotPath,submitted);
        const promoted=await promoteStudioSubtitleSync({projectId,apply:true,draft:submitted});
        // Canonical assembly owns visual defaults. Re-materialize it after a
        // timing promotion so a stale Studio review draft cannot keep old
        // subtitle styling in either the editor preview or its render snapshot.
        materialized=await materializeProjectCommand({projectId});
        referenceProject=materialized.executionProject;
        referenceSha256=createHash("sha256").update(JSON.stringify(referenceProject)).digest("hex");
        await writeJson(reviewPath,referenceProject);
        await writeJson(reviewBasePath,{schemaVersion:1,referenceSha256});
        await writeJson(studioRenderSnapshotPath,referenceProject);
        json(response,200,{success:true,projectId,status:"CANONICAL_PROMOTED",project:referenceProject,changes:promoted.changes.length,backupPath:promoted.backupPath});
      }finally{canonicalPromotionRunning=false;}
      return;
    }
    if(origin.pathname!==projectEndpoint){json(response,404,fail(404,"Not found"));return;}
    if(request.method==="GET"){
      json(response,200,await projectEnvelope());
      return;
    }
    if(request.method!=="PUT"){json(response,405,fail(405,"Method not allowed"));return;}
    const submitted=JSON.parse(await readBody(request));
    assertEditableProject(submitted,projectId,referenceProject);
    await writeJson(reviewPath,submitted);
    await writeJson(reviewBasePath,{schemaVersion:1,referenceSha256});
    await writeJson(studioRenderSnapshotPath,submitted);
    json(response,200,{success:true,projectId,path:reviewPath,savedAt:new Date().toISOString(),status:"REVIEW_DRAFT"});
  }catch(error){
    json(response,400,{success:false,error:error instanceof Error?error.message:String(error)});
  }
});
server.listen(port,"127.0.0.1",()=>{
  const studio=`http://localhost:3000/GenericVideoEditor?vpfProject=${encodeURIComponent(projectId)}&vpfEditorApi=${encodeURIComponent(api)}&vpfFrames=${referenceProject.project.durationInFrames}`;
  console.log(`[editor-studio-server] READY project=${projectId} api=${api}`);
  console.log(`[editor-studio-server] active=${api}${activeEndpoint}`);
  console.log(`[editor-studio-server] canonical-sha256=${referenceSha256}`);
  console.log(`[editor-studio-server] Open ${studio}`);
  console.log(`[editor-studio-server] mode=${materialized.reviewMode??"MATERIALIZED_REVIEW"} saves=${reviewPath}`);
  console.log("[editor-studio-server] project.db and the approved assembly remain unchanged. UNASSEMBLED_REVIEW cannot be rendered until a formal TimelineAssemblyRecord exists.");
});
