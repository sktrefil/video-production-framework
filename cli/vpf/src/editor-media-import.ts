import {createHash, randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {existsSync, readFileSync, statSync} from "node:fs";
import {resolve} from "node:path";
import {SqliteSceneAssetRepository} from "@vpf/storage/scene-assets";

export class EditorMediaImportError extends Error { constructor(message:string){super(message);} }
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");

function probeDurationMs(path:string): number | null {
  const probe=spawnSync("ffprobe",[
    "-v","error",
    "-show_entries","format=duration",
    "-of","default=noprint_wrappers=1:nokey=1",
    path
  ],{encoding:"utf8",windowsHide:true});
  if(probe.status!==0) return null;
  const seconds=Number(String(probe.stdout??"").trim());
  if(!Number.isFinite(seconds)||seconds<=0) return null;
  return Math.max(1,Math.round(seconds*1000));
}

function subtitleDurationFallback(root:string): number | null {
  const file=resolve(root,"03_tts","subtitle-cues.json");
  if(!existsSync(file)) return null;
  try {
    const parsed=JSON.parse(readFileSync(file,"utf8")) as {source?:{audioDurationMs?:number}};
    const value=parsed.source?.audioDurationMs;
    return typeof value==="number"&&Number.isFinite(value)&&value>0?Math.round(value):null;
  } catch { return null; }
}

export function importEditorMedia(projectId:string, projectRoot:string) {
  const root=resolve(projectRoot), dbPath=resolve(root,"project.db");
  if(!existsSync(dbPath)) throw new EditorMediaImportError("project.db missing");
  const items=[
    ...Array.from({length:11},(_,i)=>({path:`06_clips/CLIP ${String(i).padStart(2,"0")}.mp4`,type:"VIDEO",mime:"video/mp4"})),
    {path:"03_tts/narration.mp3",type:"AUDIO",mime:"audio/mpeg"},
    {path:"03_tts/character_alignment.json",type:"DOCUMENT",mime:"application/json"}
  ];
  const repo=new SqliteSceneAssetRepository(dbPath); const now=new Date().toISOString(); const imported:any[]=[];
  try {
    for(const item of items){
      const absolute=resolve(root,item.path);
      if(!existsSync(absolute)||statSync(absolute).size<=0) throw new EditorMediaImportError(`missing or empty: ${item.path}`);
      const checksum=sha(absolute);
      const durationMs=item.type==="VIDEO"||item.type==="AUDIO"
        ? (probeDurationMs(absolute) ?? (item.path==="03_tts/narration.mp3"?subtitleDurationFallback(root):null))
        : null;
      const existing=repo.db.prepare(
        "SELECT id,duration_ms FROM media_artifacts WHERE project_id=? AND relative_path=? AND checksum=? AND lifecycle_status='ACTIVE' LIMIT 1"
      ).get(projectId,item.path,checksum) as {id:string;duration_ms:number|null}|undefined;
      if(existing){
        if(durationMs!==null&&existing.duration_ms!==durationMs){
          repo.db.prepare("UPDATE media_artifacts SET duration_ms=?, updated_at=? WHERE id=? AND project_id=? AND lifecycle_status='ACTIVE'")
            .run(durationMs,now,existing.id,projectId);
        }
        imported.push({path:item.path,mediaId:existing.id,reused:true,durationMs:durationMs??existing.duration_ms});
        continue;
      }
      const id=`media_${randomUUID().replaceAll("-","")}`;
      repo.db.prepare("INSERT INTO media_artifacts (id,project_id,revision,lifecycle_status,media_type,relative_path,mime_type,width,height,duration_ms,checksum,source_job_id,media_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id,projectId,1,"ACTIVE",item.type,item.path,item.mime,null,null,durationMs,checksum,null,"AVAILABLE",now,now);
      imported.push({path:item.path,mediaId:id,reused:false,durationMs});
    }
    return {
      imported,
      missingDuration: imported.filter(item => (item.path.endsWith(".mp4")||item.path.endsWith(".mp3")) && !(typeof item.durationMs==="number"&&item.durationMs>0)).map(item=>item.path)
    };
  } finally {repo.close();}
}
