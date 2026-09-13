import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";

export class EditorAssembleError extends Error {
  constructor(message: string) { super(message); this.name = "EditorAssembleError"; }
}

type SubtitleCue = {id:string; startMs:number; endMs:number; text:string; generationSource?:string};
type SubtitleDocument = {source:{audioDurationMs:number; narrationRelativePath:string; characterAlignmentRelativePath:string}; cues:SubtitleCue[]};

function required(path:string, label:string): void {
  if (!existsSync(path)) throw new EditorAssembleError(`EDITOR_ASSEMBLE_INPUT_MISSING: ${label} (${path})`);
}
function readJson<T>(path:string, label:string): T {
  required(path,label);
  try { return JSON.parse(readFileSync(path,"utf8")) as T; }
  catch { throw new EditorAssembleError(`EDITOR_ASSEMBLE_INPUT_INVALID: ${label}`); }
}
const frameAt=(ms:number)=>Math.round(ms/1000*30);

export function assembleEditorProject(input:{projectId:string; projectRoot:string; header:string}) {
  const root=resolve(input.projectRoot);
  const tts=resolve(root,"03_tts");
  const clips=resolve(root,"06_clips");
  const subtitles=readJson<SubtitleDocument>(resolve(tts,"subtitle-cues.json"),"subtitle-cues.json");
  required(resolve(tts,"narration.mp3"),"narration.mp3");
  if (!Number.isFinite(subtitles.source?.audioDurationMs)||subtitles.source.audioDurationMs<=0||!Array.isArray(subtitles.cues)||!subtitles.cues.length) throw new EditorAssembleError("EDITOR_ASSEMBLE_TTS_INVALID");
  let previousEnd=0;
  for(const cue of subtitles.cues){
    if(!cue.id?.trim()||!cue.text?.trim()||!Number.isFinite(cue.startMs)||!Number.isFinite(cue.endMs)||cue.startMs<0||cue.endMs<=cue.startMs||cue.endMs>subtitles.source.audioDurationMs||cue.startMs<previousEnd) throw new EditorAssembleError(`EDITOR_ASSEMBLE_T1_INVALID: ${cue.id||"unknown"}`);
    previousEnd=cue.endMs;
  }
  const header=input.header.trim();
  const headerY=180; if(!header||headerY<120||headerY>330) throw new EditorAssembleError("EDITOR_ASSEMBLE_T2_INVALID");
  const clipFrames=150, totalFrames=1500;
  const tracks=[["V1","VIDEO","Main Visual"],["G1","GRAPHIC","Graphics"],["T1","TEXT","Subtitles"],["T2","TEXT","Text"],["A1","AUDIO","TTS"],["A2","AUDIO","Clip Audio"],["A3","AUDIO","BGM"],["A4","AUDIO","SFX"]].map(([id,type,name],order)=>({id,type,name,enabled:true,locked:false,order}));
  const items:any[]=[];
  for(let index=1;index<=10;index++){
    const name=`CLIP ${String(index).padStart(2,"0")}.mp4`; required(resolve(clips,name),name);
    items.push({id:`video-clip-${String(index).padStart(2,"0")}`,type:"VIDEO",trackId:"V1",timelineStartFrame:(index-1)*clipFrames,durationInFrames:clipFrames,enabled:true,locked:false,src:`../../06_clips/${name}`,sourceStartFrame:0,sourceDurationInFrames:clipFrames,sourceAssetDurationInFrames:clipFrames,playbackRate:1,volume:0,x:0,y:0,scale:1,rotation:0,opacity:1,fit:"cover"});
  }
  const audioFrames=frameAt(subtitles.source.audioDurationMs);
  items.push({id:"tts-narration",type:"TTS",trackId:"A1",timelineStartFrame:0,durationInFrames:audioFrames,enabled:true,locked:false,src:"../../03_tts/narration.mp3",sourceStartFrame:0,sourceDurationInFrames:audioFrames,sourceAssetDurationInFrames:audioFrames,volume:1,muted:false,fadeInFrames:0,fadeOutFrames:0});
  for(const cue of subtitles.cues){const start=frameAt(cue.startMs),end=frameAt(cue.endMs);items.push({id:`subtitle-${cue.id}`,type:"SUBTITLE",trackId:"T1",timelineStartFrame:start,durationInFrames:Math.max(1,end-start),enabled:true,locked:false,text:cue.text,x:540,y:1650,width:900,fontFamily:"VITRO",fontSize:72,fontWeight:700,color:"#FFFFFF",strokeColor:"#17130F",strokeWidth:4,textAlign:"center",lineHeight:1.16,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:0.4,generationSource:cue.generationSource??"SCRIPT_TTS_ALIGN",generatedFromTtsIds:["tts-narration"]});}
  items.push({id:"text-top-header",type:"TEXT",trackId:"T2",timelineStartFrame:0,durationInFrames:totalFrames,enabled:true,locked:false,text:header,textRole:"TOP_TITLE",x:540,y:headerY,width:920,fontFamily:"VITRO",fontSize:58,fontWeight:800,color:"#FFFDF7",strokeColor:"#17130F",strokeWidth:3,textAlign:"center",lineHeight:1.1,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:0.2});
  const project={schemaVersion:1,project:{id:input.projectId,name:`${input.projectId} — Editorial Assembly`,fps:30,width:1080,height:1920,durationInFrames:totalFrames},tracks,items,settings:{snapEnabled:true,snapToleranceFrames:4,timelineZoom:1,masterVolume:1}};
  const output=resolve(root,"08_editor","edit-project.json"); mkdirSync(dirname(output),{recursive:true}); writeFileSync(output,JSON.stringify(project,null,2)+"\n","utf8");
  return {output,clipCount:10,subtitleCount:subtitles.cues.length,audioDurationMs:subtitles.source.audioDurationMs,projectDurationMs:50000};
}
