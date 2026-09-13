import {createHash, randomUUID} from "node:crypto";
import {existsSync, readFileSync, statSync} from "node:fs";
import {relative, resolve} from "node:path";
import {SqliteSceneAssetRepository} from "@vpf/storage/scene-assets";

export class EditorMediaImportError extends Error { constructor(message:string){super(message);} }
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
export function importEditorMedia(projectId:string, projectRoot:string) {
  const root=resolve(projectRoot), dbPath=resolve(root,"project.db");
  if(!existsSync(dbPath)) throw new EditorMediaImportError("project.db missing");
  const items=[...Array.from({length:10},(_,i)=>({path:`06_clips/CLIP ${String(i+1).padStart(2,"0")}.mp4`,type:"VIDEO",mime:"video/mp4"})),{path:"03_tts/narration.mp3",type:"AUDIO",mime:"audio/mpeg"},{path:"03_tts/character_alignment.json",type:"DOCUMENT",mime:"application/json"}];
  const repo=new SqliteSceneAssetRepository(dbPath); const now=new Date().toISOString(); const imported:any[]=[];
  try { for(const item of items){ const absolute=resolve(root,item.path); if(!existsSync(absolute)||statSync(absolute).size<=0) throw new EditorMediaImportError(`missing or empty: ${item.path}`); const checksum=sha(absolute), existing=repo.db.prepare("SELECT id FROM media_artifacts WHERE project_id=? AND relative_path=? AND checksum=? AND lifecycle_status='ACTIVE' LIMIT 1").get(projectId,item.path,checksum) as any; if(existing){imported.push({path:item.path,mediaId:existing.id,reused:true});continue;} const id=`media_${randomUUID().replaceAll("-","")}`; repo.db.prepare("INSERT INTO media_artifacts (id,project_id,revision,lifecycle_status,media_type,relative_path,mime_type,width,height,duration_ms,checksum,source_job_id,media_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,projectId,1,"ACTIVE",item.type,item.path,item.mime,null,null,null,checksum,null,"AVAILABLE",now,now); imported.push({path:item.path,mediaId:id,reused:false}); } return {imported}; } finally {repo.close();}
}
