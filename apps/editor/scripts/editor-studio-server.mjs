import {createServer} from "node:http";
import {copyFile, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {materializeProjectCommand} from "./materialize-editor-project.mjs";
import {sha256File} from "@vpf/editor-materializer";

const APP_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const DEFAULT_PORT=4318;
const MAX_BODY_BYTES=5*1024*1024;
const PROJECT_ID=/^[a-z0-9][a-z0-9_-]{0,99}$/;
const MEDIA_TYPES=new Set(["VIDEO","IMAGE","TTS","CLIP_AUDIO","BGM","SFX"]);

const fail=(status,error)=>({status,error});
const json=(response,status,value)=>{
  response.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, PUT, OPTIONS","Access-Control-Allow-Headers":"Content-Type"});
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
const referenceProject=materialized.executionProject;
const reviewPath=resolve(materialized.canonicalProjectAbsolutePath,"..","studio_edit_project.json");

const quarantineIncompatibleDraft=async error=>{
  const quarantinePath=`${reviewPath}.incompatible-${Date.now()}.json`;
  await rename(reviewPath,quarantinePath);
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
  try{
    assertEditableProject(saved,projectId,referenceProject);
    return saved;
  }catch(error){
    return quarantineIncompatibleDraft(error);
  }
};
const endpoint=`/api/editor/project/${encodeURIComponent(projectId)}`;
const server=createServer(async(request,response)=>{
  try{
    if(request.method==="OPTIONS"){json(response,204,{});return;}
    const origin=new URL(request.url??"/","http://127.0.0.1");
    if(origin.pathname!==endpoint){json(response,404,fail(404,"Not found"));return;}
    if(request.method==="GET"){
      json(response,200,{success:true,project:await loadProject(),path:reviewPath,status:"REVIEW_DRAFT"});
      return;
    }
    if(request.method!=="PUT"){json(response,405,fail(405,"Method not allowed"));return;}
    const submitted=JSON.parse(await readBody(request));
    assertEditableProject(submitted,projectId,referenceProject);
    await writeJson(reviewPath,submitted);
    json(response,200,{success:true,path:reviewPath,savedAt:new Date().toISOString(),status:"REVIEW_DRAFT"});
  }catch(error){
    json(response,400,{success:false,error:error instanceof Error?error.message:String(error)});
  }
});
server.listen(port,"127.0.0.1",()=>{
  const api=`http://127.0.0.1:${port}`;
  const studio=`http://localhost:3000/GenericVideoEditor?vpfProject=${encodeURIComponent(projectId)}&vpfEditorApi=${encodeURIComponent(api)}&vpfFrames=${referenceProject.project.durationInFrames}`;
  console.log(`[editor-studio-server] READY project=${projectId} api=${api}`);
  console.log(`[editor-studio-server] Open ${studio}`);
  console.log(`[editor-studio-server] mode=${materialized.reviewMode??"MATERIALIZED_REVIEW"} saves=${reviewPath}`);
  console.log("[editor-studio-server] project.db and the approved assembly remain unchanged. UNASSEMBLED_REVIEW cannot be rendered until a formal TimelineAssemblyRecord exists.");
});
