import type {EditProject} from "../editorTypes";

declare global {interface Window {__VPF_EDITOR_API_BASE__?:string}}
export type EditorProductionIssue={code:string;message:string;data?:Record<string,unknown>};
type Envelope={success:boolean;project?:EditProject;path?:string;savedAt?:string;status?:string;projectSha256?:string;outputPath?:string;errors?:EditorProductionIssue[];warnings?:EditorProductionIssue[];error?:string};

const configuredBase=()=>typeof window!=="undefined"?window.__VPF_EDITOR_API_BASE__?.replace(/\/$/,""):undefined;
export const hasEditorPersistenceAdapter=()=>Boolean(configuredBase());
const requireBase=()=>{const base=configuredBase();if(!base)throw new Error("Unified editor persistence is not bound yet; MIG-09 owns project materialization/runtime binding.");return base;};
const parse=async(response:Response)=>{const payload=await response.json() as Envelope;if(!response.ok||!payload.success)throw new Error(payload.error??`Editor persistence failed (${response.status})`);return payload;};
export const loadPersistedEditorProject=async(projectId:string):Promise<EditProject|null>=>{const base=configuredBase();if(!base)return null;const response=await fetch(`${base}/api/editor/project/${encodeURIComponent(projectId)}`);if(response.status===404)return null;const payload=await parse(response);if(!payload.project)throw new Error("Saved editor project payload is missing");return payload.project;};
export const savePersistedEditorProject=async(project:EditProject):Promise<{path:string;savedAt:string}>=>{const response=await fetch(`${requireBase()}/api/editor/project/${encodeURIComponent(project.project.id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(project)});const payload=await parse(response);return{path:payload.path??"",savedAt:payload.savedAt??new Date().toISOString()};};
const production=async(projectId:string,action:"gate"|"render")=>{const response=await fetch(`${requireBase()}/api/editor/project/${encodeURIComponent(projectId)}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({allowRemote:false,allowVisualGaps:false})});return parse(response);};
export const runEditorProductionGate=(projectId:string)=>production(projectId,"gate");
export const runEditorFinalRender=(projectId:string)=>production(projectId,"render");
export const assertCompatibleEditorProject=(initial:EditProject,loaded:EditProject)=>{if(initial.schemaVersion!==1||loaded.schemaVersion!==1)throw new Error("Only Generic Editor schemaVersion 1 is supported");if(initial.project.id!==loaded.project.id)throw new Error(`Saved project id mismatch: ${loaded.project.id}`);for(const key of ["fps","width","height","durationInFrames"] as const){if(initial.project[key]!==loaded.project[key])throw new Error(`Saved project ${key} does not match the current composition`);}};
