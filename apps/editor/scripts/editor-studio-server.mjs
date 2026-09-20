import {createHash,randomUUID} from "node:crypto";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, extname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {defaultProjectRoot,materializeProjectCommand} from "./materialize-editor-project.mjs";
import {buildSubtitleAudioSyncPreview,transcribeFinalAudio} from "./subtitle-audio-sync.mjs";
import {promoteStudioSubtitleSync} from "./promote-studio-subtitle-sync.mjs";
import {sha256File} from "@vpf/editor-materializer";
import {SqliteEditorTimelineRepository} from "@vpf/storage/editor-timeline";

const APP_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const DEFAULT_PORT=4318;
const MAX_BODY_BYTES=5*1024*1024;
const PROJECT_ID=/^[a-z0-9][a-z0-9_-]{0,99}$/;
const MEDIA_TYPES=new Set(["VIDEO","IMAGE","TTS","CLIP_AUDIO","BGM","SFX"]);
const DEFAULT_BGM_LIBRARY_ROOT="D:\\OneDrive\\VPF-assets\\bgm-assets\\inbox";
const BGM_LIBRARY_ROOT=resolve(process.env.VPF_BGM_LIBRARY_ROOT??DEFAULT_BGM_LIBRARY_ROOT);
const BGM_LIBRARY_EXTENSIONS=new Set([".mp3",".wav",".m4a",".aac",".flac",".ogg",".opus"]);
const TTS_UPLOAD_EXTENSIONS=BGM_LIBRARY_EXTENSIONS;

const fail=(status,error)=>({status,error});
const json=(response,status,value)=>{
  response.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, PUT, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-VPF-Filename"});
  response.end(JSON.stringify(value));
};
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>{
  const temporary=`${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,"utf8");
  await rename(temporary,path);
};
const parseArgs=argv=>{
  // Some terminals and copied documentation escape underscores as `\\_`.
  // Project IDs never use backslashes, so accept that harmless escaped form.
  const [rawProjectId,...rest]=argv;
  const projectId=typeof rawProjectId==="string"?rawProjectId.replaceAll("\\_","_"):rawProjectId;
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
const readBinaryBody=request=>new Promise((resolveBody,reject)=>{let size=0;const chunks=[];request.on("data",chunk=>{size+=chunk.length;if(size>100*1024*1024){reject(new Error("TTS upload exceeds 100 MiB"));request.destroy();return;}chunks.push(chunk);});request.once("error",reject);request.once("end",()=>resolveBody(Buffer.concat(chunks)));});
const assertEditableProject=(project,projectId,referenceProject)=>{
  if(!project||project.schemaVersion!==1||!project.project||project.project.id!==projectId||!Array.isArray(project.items)||!Array.isArray(project.tracks))throw new Error("Payload is not a schemaVersion 1 editor project for this project ID.");
  for(const key of ["fps","width","height"]){if(project.project[key]!==referenceProject.project[key])throw new Error(`Project ${key} cannot be changed in Studio review mode.`);}
  if(!Number.isSafeInteger(project.project.durationInFrames)||project.project.durationInFrames<1)throw new Error("Project durationInFrames must be a positive integer.");
  const allowedPrefixes=[`projects/${projectId}/media/`,`projects/${projectId}/studio-review/media/`];
  for(const item of project.items){
    if(!item||typeof item!=="object"||typeof item.id!=="string"||typeof item.type!=="string")throw new Error("Timeline contains an invalid item.");
    if(MEDIA_TYPES.has(item.type)&&(typeof item.src!=="string"||!allowedPrefixes.some(prefix=>item.src.startsWith(prefix))))throw new Error(`Media item ${item.id} must retain a materialized project media source.`);
    if(["VIDEO","TTS","CLIP_AUDIO","BGM","SFX"].includes(item.type)&&Number.isSafeInteger(item.sourceStartFrame)&&Number.isSafeInteger(item.sourceDurationInFrames)&&Number.isSafeInteger(item.sourceAssetDurationInFrames)){
      const available=Math.max(1,item.sourceAssetDurationInFrames-item.sourceStartFrame);
      item.sourceDurationInFrames=Math.min(item.sourceDurationInFrames,available);
      if(["TTS","CLIP_AUDIO","SFX"].includes(item.type))item.durationInFrames=Math.min(item.durationInFrames,item.sourceDurationInFrames);
    }
  }
};

const mimeTypeFor=(path)=>({
  ".mp3":"audio/mpeg", ".wav":"audio/wav", ".m4a":"audio/mp4", ".aac":"audio/aac",
  ".flac":"audio/flac", ".ogg":"audio/ogg", ".opus":"audio/ogg"
}[extname(path).toLowerCase()]??"application/octet-stream");
const assetMediaTypeFor=item=>item.type==="VIDEO"?"VIDEO":item.type==="IMAGE"?"IMAGE":"AUDIO";
const canonicalReviewMediaPath=(sourcePath,checksum)=>`08_editor/imported-media/${checksum}/${basename(sourcePath)}`;
const projectDbPath=projectId=>resolve(defaultProjectRoot(projectId),"project.db");
const promoteStudioDraftToCanonical=async draft=>{
  const root=defaultProjectRoot(projectId);
  const publicRoot=resolve(APP_ROOT,"public");
  const repository=new SqliteEditorTimelineRepository(projectDbPath(projectId));
  try{
    const previous=await repository.getLatestAssembly(projectId);
    if(!previous)throw new Error("No active timeline assembly is available to promote.");
    const canonical=structuredClone(draft);
    const imported=[];
    for(const item of canonical.items){
      if(!MEDIA_TYPES.has(item.type))continue;
      const reviewPrefix=`projects/${projectId}/studio-review/media/`;
      const mirrorPrefix=`projects/${projectId}/media/`;
      if(!item.src.startsWith(reviewPrefix)&&!item.src.startsWith(mirrorPrefix))continue;
      const reviewFile=resolve(publicRoot,item.src);
      if(!isInside(publicRoot,reviewFile))throw new Error(`Review media escapes the editor public root: ${item.id}`);
      const info=await stat(reviewFile).catch(()=>null);
      if(!info?.isFile()||info.size<=0)throw new Error(`Review media is missing or empty: ${item.src}`);
      const checksum=await sha256File(reviewFile);
      const known=repository.db.prepare("SELECT relative_path FROM media_artifacts WHERE project_id = ? AND lifecycle_status = 'ACTIVE' AND media_status = 'AVAILABLE' AND checksum = ? ORDER BY revision DESC LIMIT 1").get(projectId,checksum);
      if(known?.relative_path){item.src=known.relative_path;continue;}
      if(item.src.startsWith(mirrorPrefix))throw new Error(`Materialized media has no matching source artifact: ${item.id}`);
      const relativeDestination=canonicalReviewMediaPath(reviewFile,checksum);
      const destination=resolve(root,relativeDestination);
      if(!isInside(root,destination))throw new Error(`Canonical media destination escapes the project: ${item.id}`);
      await mkdir(dirname(destination),{recursive:true});
      await copyFile(reviewFile,destination);
      item.src=relativeDestination;
      imported.push({id:`studio-media-${checksum.slice(0,24)}`,checksum,relativePath:relativeDestination,item});
    }
    const now=new Date().toISOString();
    const assembly={
      ...previous,
      revision:previous.revision+1,
      lifecycleStatus:"ACTIVE",
      updatedAt:now,
      stale:false,
      ...(previous.staleReason===undefined?{}:{staleReason:undefined}),
      assemblyStatus:"READY",
      editProject:canonical,
      blockers:[]
    };
    const event={eventId:`evt-${randomUUID()}`,projectId,eventType:"EDITOR_STUDIO_DRAFT_PROMOTED",targetType:"PROJECT",targetId:projectId,trigger:"USER",payload:{assemblyId:assembly.id,assemblyRevision:assembly.revision,importedMediaCount:imported.length,itemCount:canonical.items.length},createdAt:now};
    const outbox={outboxId:`outbox-${randomUUID()}`,eventId:event.eventId,status:"PENDING",attempts:0,createdAt:now};
    repository.db.transaction(()=>{
      for(const media of imported){
        repository.db.prepare("INSERT OR IGNORE INTO media_artifacts (id, project_id, revision, lifecycle_status, media_type, relative_path, mime_type, width, height, duration_ms, checksum, source_job_id, media_status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, NULL, NULL, NULL, ?, NULL, 'AVAILABLE', ?, ?)").run(media.id,projectId,1,assetMediaTypeFor(media.item),media.relativePath,mimeTypeFor(media.relativePath),media.checksum,now,now);
      }
    })();
    await repository.commitAssembly({previousAssembly:previous,assembly,event,outbox});
    await writeJson(resolve(root,"08_editor","edit_project.json"),canonical);
    return {assemblyRevision:assembly.revision,importedMediaCount:imported.length};
  }finally{repository.db.close();}
};

const isInside=(root,candidate)=>{const path=relative(root,candidate);return path!==""&&!path.startsWith("..")&&!path.includes(":");};
const bgmLibraryAssets=async()=>{
  let entries;
  try{entries=await readdir(BGM_LIBRARY_ROOT,{withFileTypes:true});}
  catch(error){throw new Error(`BGM library is unavailable: ${BGM_LIBRARY_ROOT} (${error instanceof Error?error.message:String(error)})`);}
  const assets=[];
  for(const entry of entries){
    if(!entry.isFile()||!BGM_LIBRARY_EXTENSIONS.has(extname(entry.name).toLowerCase()))continue;
    const sourcePath=resolve(BGM_LIBRARY_ROOT,entry.name);
    if(!isInside(BGM_LIBRARY_ROOT,sourcePath))continue;
    const info=await stat(sourcePath);
    if(!info.isFile()||info.size<=0)continue;
    assets.push({id:createHash("sha256").update(entry.name).digest("hex"),name:entry.name,extension:extname(entry.name).toLowerCase(),sizeBytes:info.size});
  }
  return assets.sort((a,b)=>a.name.localeCompare(b.name,"ko"));
};
const importBgmLibraryAsset=async assetId=>{
  const asset=(await bgmLibraryAssets()).find(candidate=>candidate.id===assetId);
  if(!asset)throw new Error("Selected BGM asset is no longer available in the library.");
  const sourcePath=resolve(BGM_LIBRARY_ROOT,asset.name);
  if(!isInside(BGM_LIBRARY_ROOT,sourcePath))throw new Error("Selected BGM asset escapes the configured library.");
  const checksum=await sha256File(sourcePath);
  const relativeDestination=`projects/${projectId}/studio-review/media/bgm/${checksum.slice(0,16)}/${basename(asset.name)}`;
  const destination=resolve(APP_ROOT,"public",relativeDestination);
  if(!isInside(resolve(APP_ROOT,"public"),destination))throw new Error("BGM review destination escapes the editor public root.");
  await mkdir(dirname(destination),{recursive:true});
  try{await stat(destination);}catch{await copyFile(sourcePath,destination);}
  return{...asset,src:relativeDestination};
};
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
// Materialization atomically replaces public/projects/<id>. A saved Studio
// draft deliberately points at studio-review media, so restore those preview
// copies from the current canonical mirror after a server restart. Without
// this, an A3 BGM/TTS item can remain visible in the timeline but its browser
// URL becomes a 404 and therefore plays silently.
const rehydrateReviewMedia=async project=>{
  const reviewPrefix=`projects/${projectId}/studio-review/media/`;
  const publicRoot=resolve(APP_ROOT,"public");
  const canonicalMedia=new Map(referenceProject.items.filter(item=>MEDIA_TYPES.has(item.type)&&typeof item.src==="string").map(item=>[item.id,item.src]));
  for(const item of project.items){
    if(!MEDIA_TYPES.has(item.type)||typeof item.src!=="string"||!item.src.startsWith(reviewPrefix))continue;
    const destination=resolve(publicRoot,item.src);
    if(!isInside(publicRoot,destination))throw new Error(`Review media path escapes the editor public root: ${item.id}`);
    const destinationInfo=await stat(destination).catch(()=>null);
    if(destinationInfo?.isFile()&&destinationInfo.size>0)continue;
    const sourceRelative=canonicalMedia.get(item.id);
    let source;
    if(typeof sourceRelative==="string"){
      source=resolve(publicRoot,sourceRelative);
      if(!isInside(publicRoot,source))throw new Error(`Canonical preview media path escapes the editor public root: ${item.id}`);
    }else if(item.type==="BGM"){
      // A BGM can exist only in a pre-promotion Studio draft. Recover it from
      // the configured library by its original filename so the user can hear
      // it again and explicitly promote it into the next canonical revision.
      const libraryFile=resolve(BGM_LIBRARY_ROOT,basename(item.src));
      if(!isInside(BGM_LIBRARY_ROOT,libraryFile))throw new Error(`BGM library path escapes its root: ${item.id}`);
      source=libraryFile;
    }else if(item.type==="TTS"){
      // Uploaded narration can also be a pre-promotion review-only asset.
      // Preserve it across Studio restarts when the project's TTS source is
      // still available under the standard audio workspace directory.
      const narrationFile=resolve(defaultProjectRoot(projectId),"03_tts",basename(item.src));
      if(!isInside(defaultProjectRoot(projectId),narrationFile))throw new Error(`TTS source path escapes the project: ${item.id}`);
      source=narrationFile;
    }else continue;
    const sourceInfo=await stat(source).catch(()=>null);
    if(!sourceInfo?.isFile()||sourceInfo.size<=0)continue;
    await mkdir(dirname(destination),{recursive:true});
    await copyFile(source,destination);
    console.log(`[editor-studio-server] restored review media for ${item.id}`);
  }
  return project;
};
const restoreCorruptedText=project=>{
  const canonicalText=new Map(referenceProject.items.filter(item=>(item.type==="TEXT"||item.type==="SUBTITLE")&&typeof item.text==="string").map(item=>[item.id,item.text]));
  for(const item of project.items){
    if((item.type!=="TEXT"&&item.type!=="SUBTITLE")||typeof item.text!=="string"||!item.text.includes("?"))continue;
    const original=canonicalText.get(item.id);
    if(typeof original==="string"&&!original.includes("?"))item.text=original;
  }
  return project;
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
    return await rehydrateReviewMedia(restoreCorruptedText(saved));
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
const promoteDraftEndpoint=`${projectEndpoint}/promote`;
const activeEndpoint="/api/editor/active";
const bgmLibraryEndpoint="/api/editor/bgm-library";
const bgmLibraryImportEndpoint=`${bgmLibraryEndpoint}/import`;
const ttsUploadEndpoint="/api/editor/tts/upload";
const finalRenderEndpoint=`${projectEndpoint}/final-render`;
const finalRenderOpenOutputEndpoint=`${finalRenderEndpoint}/open-output`;
const projectEnvelope=async()=>({success:true,projectId,project:await loadProject(),path:reviewPath,status:"REVIEW_DRAFT"});
let canonicalPromotionRunning=false;
let finalRenderJob={status:"IDLE",message:"",startedAt:null,finishedAt:null,estimatedSeconds:null};
const finalRenderStatus=()=>({
  ...finalRenderJob,
  elapsedSeconds:finalRenderJob.startedAt===null?0:Math.max(0,Math.floor((Date.now()-Date.parse(finalRenderJob.startedAt))/1000))
});
const server=createServer(async(request,response)=>{
  try{
    if(request.method==="OPTIONS"){json(response,204,{});return;}
    const origin=new URL(request.url??"/","http://127.0.0.1");
    if(origin.pathname===bgmLibraryEndpoint){
      if(request.method!=="GET"){json(response,405,fail(405,"Method not allowed"));return;}
      json(response,200,{success:true,root:BGM_LIBRARY_ROOT,assets:await bgmLibraryAssets()});
      return;
    }
    if(origin.pathname===bgmLibraryImportEndpoint){
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      const submitted=JSON.parse(await readBody(request));
      if(!submitted||typeof submitted.assetId!=="string")throw new Error("BGM library import requires an assetId.");
      json(response,200,{success:true,projectId,asset:await importBgmLibraryAsset(submitted.assetId)});
      return;
    }
    if(origin.pathname===ttsUploadEndpoint){
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      const filename=basename(decodeURIComponent(request.headers["x-vpf-filename"]??""));
      if(!filename||!TTS_UPLOAD_EXTENSIONS.has(extname(filename).toLowerCase()))throw new Error("Upload a supported audio file for A1 TTS.");
      const body=await readBinaryBody(request);
      if(body.length===0)throw new Error("TTS upload is empty.");
      const hash=createHash("sha256").update(body).digest("hex");
      const relativeDestination=`projects/${projectId}/studio-review/media/tts/${hash.slice(0,16)}/${filename}`;
      const destination=resolve(APP_ROOT,"public",relativeDestination);
      if(!isInside(resolve(APP_ROOT,"public"),destination))throw new Error("TTS upload destination escapes the editor public root.");
      await mkdir(dirname(destination),{recursive:true});await writeFile(destination,body);
      json(response,200,{success:true,projectId,asset:{src:relativeDestination}});return;
    }
    if(origin.pathname===finalRenderEndpoint){
      if(request.method==="GET"){json(response,200,{success:true,projectId,...finalRenderStatus()});return;}
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      if(finalRenderJob.status==="RUNNING"){json(response,202,{success:true,projectId,...finalRenderStatus()});return;}
      finalRenderJob={status:"RUNNING",message:"Final render is running…",startedAt:new Date().toISOString(),finishedAt:null,estimatedSeconds:Math.max(30,Math.ceil(referenceProject.project.durationInFrames/referenceProject.project.fps*2))};
      const child=spawn(process.execPath,[resolve(APP_ROOT,"scripts","render-editor-project-canonical.mjs"),projectId,"--force","--allow-visual-gaps"],{cwd:APP_ROOT,windowsHide:true,stdio:["ignore","pipe","pipe"]});
      let output="";
      const collect=chunk=>{output+=chunk.toString();if(output.length>8000)output=output.slice(-8000);};
      child.stdout.on("data",collect);child.stderr.on("data",collect);
      child.once("error",error=>{finalRenderJob={status:"FAILED",message:error.message,startedAt:finalRenderJob.startedAt,finishedAt:new Date().toISOString(),estimatedSeconds:finalRenderJob.estimatedSeconds};});
      child.once("exit",code=>{const ready=code===0&&output.includes("DELIVERY_READY");finalRenderJob={status:ready?"DELIVERY_READY":"FAILED",message:ready?"Final delivery render completed.":output.trim().slice(-1200)||`Render failed (${code})`,startedAt:finalRenderJob.startedAt,finishedAt:new Date().toISOString(),estimatedSeconds:finalRenderJob.estimatedSeconds};});
      json(response,202,{success:true,projectId,...finalRenderStatus()});return;
    }
    if(origin.pathname===finalRenderOpenOutputEndpoint){
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      const outputDirectory=resolve(defaultProjectRoot(projectId),"09_render");
      await mkdir(outputDirectory,{recursive:true});
      const explorer=spawn("explorer.exe",[outputDirectory],{windowsHide:false,detached:true,stdio:"ignore"});
      explorer.unref();
      json(response,200,{success:true,projectId,outputDirectory});return;
    }
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
    if(origin.pathname===promoteDraftEndpoint){
      if(request.method!=="POST"){json(response,405,fail(405,"Method not allowed"));return;}
      if(canonicalPromotionRunning)throw new Error("A canonical promotion is already running.");
      canonicalPromotionRunning=true;
      try{
        const submitted=JSON.parse(await readBody(request));
        assertEditableProject(submitted,projectId,referenceProject);
        // Save the review copy first. The promotion creates a new immutable
        // TimelineAssemblyRecord used by editor:render; it never mutates the
        // previously approved assembly.
        await writeJson(reviewPath,submitted);
        await writeJson(reviewBasePath,{schemaVersion:1,referenceSha256});
        await writeJson(studioRenderSnapshotPath,submitted);
        const promoted=await promoteStudioDraftToCanonical(submitted);
        json(response,200,{success:true,projectId,status:"CANONICAL_PROMOTED",assemblyRevision:promoted.assemblyRevision,importedMediaCount:promoted.importedMediaCount});
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
  if(materialized.reviewMode==="UNASSEMBLED_REVIEW")console.log("[editor-studio-server] No approved assembly exists yet. Save edits, then use ‘최종 렌더 반영’ before editor:render.");
  else console.log("[editor-studio-server] Approved assembly is available. Current Studio edits require ‘최종 렌더 반영’ before they are included in editor:render.");
});
