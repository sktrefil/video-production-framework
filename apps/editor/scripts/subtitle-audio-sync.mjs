import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const APP_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const REPOSITORY_ROOT=resolve(APP_ROOT,"../..");
const WORKER_PATH=resolve(REPOSITORY_ROOT,"runtimes/whisper/transcribe.py");

export const normalizeSubtitleText=value=>[...String(value??"").normalize("NFKC").toLowerCase()].filter(character=>/[\p{L}\p{N}]/u.test(character)).join("");

const alignCharacters=(expected,observed)=>{
  const left=[...expected];const right=[...observed];
  const width=right.length+1;
  const cost=new Uint16Array((left.length+1)*width);
  const step=new Uint8Array((left.length+1)*width);
  for(let i=1;i<=left.length;i++){cost[i*width]=i;step[i*width]=1;}
  for(let j=1;j<=right.length;j++){cost[j]=j;step[j]=2;}
  for(let i=1;i<=left.length;i++)for(let j=1;j<=right.length;j++){
    const diagonal=cost[(i-1)*width+j-1]+(left[i-1]===right[j-1]?0:1);
    const deletion=cost[(i-1)*width+j]+1;
    const insertion=cost[i*width+j-1]+1;
    const best=Math.min(diagonal,deletion,insertion);cost[i*width+j]=best;
    step[i*width+j]=best===diagonal?0:best===deletion?1:2;
  }
  const mapping=new Map();let exact=0;let i=left.length;let j=right.length;
  while(i>0||j>0){const direction=step[i*width+j];if(i>0&&j>0&&direction===0){mapping.set(i-1,j-1);if(left[i-1]===right[j-1])exact++;i--;j--;}else if(i>0&&(j===0||direction===1))i--;else j--;}
  return{mapping,exact,distance:cost[left.length*width+right.length]};
};

export const buildSubtitleAudioSyncPreview=({subtitles,words,fps,projectDurationInFrames,leadFrames=2,tailFrames=2,minimumConfidence=.72})=>{
  const ordered=[...subtitles].sort((a,b)=>a.timelineStartFrame-b.timelineStartFrame||a.id.localeCompare(b.id));
  const cueRanges=[];let expected="";
  for(const subtitle of ordered){const normalized=normalizeSubtitleText(subtitle.text);const start=expected.length;expected+=normalized;cueRanges.push({subtitle,start,end:expected.length,normalized});}
  const observedCharacters=[];let observed="";
  for(const word of words){const normalized=normalizeSubtitleText(word.text);for(const character of normalized){observedCharacters.push({character,word});observed+=character;}}
  const expectedCharacters=[...expected];
  const alignment=alignCharacters(expected,observed);
  const proposals=cueRanges.map(({subtitle,start,end,normalized})=>{
    const mapped=[];let exact=0;
    for(let index=start;index<end;index++){const observedIndex=alignment.mapping.get(index);if(observedIndex===undefined)continue;const entry=observedCharacters[observedIndex];if(!entry)continue;mapped.push(entry.word);if(expectedCharacters[index]===entry.character)exact++;}
    const confidence=normalized.length===0?0:exact/normalized.length;
    if(mapped.length===0)return{id:subtitle.id,text:subtitle.text,currentStartFrame:subtitle.timelineStartFrame,currentDurationInFrames:subtitle.durationInFrames,suggestedStartFrame:subtitle.timelineStartFrame,suggestedDurationInFrames:subtitle.durationInFrames,deltaFrames:0,confidence,status:"LOW_CONFIDENCE"};
    const first=mapped[0];const last=mapped.at(-1);
    const suggestedStartFrame=Math.max(0,Math.floor(first.startSeconds*fps)-leadFrames);
    const rawEnd=Math.min(projectDurationInFrames,Math.ceil(last.endSeconds*fps)+tailFrames);
    const suggestedDurationInFrames=Math.max(1,rawEnd-suggestedStartFrame);
    return{id:subtitle.id,text:subtitle.text,currentStartFrame:subtitle.timelineStartFrame,currentDurationInFrames:subtitle.durationInFrames,suggestedStartFrame,suggestedDurationInFrames,deltaFrames:suggestedStartFrame-subtitle.timelineStartFrame,confidence,status:confidence>=minimumConfidence?"READY":"LOW_CONFIDENCE"};
  });
  for(let index=0;index<proposals.length-1;index++){
    const current=proposals[index];const next=proposals[index+1];
    const maximumEnd=Math.max(current.suggestedStartFrame+1,next.suggestedStartFrame-1);
    current.suggestedDurationInFrames=Math.min(current.suggestedDurationInFrames,maximumEnd-current.suggestedStartFrame);
  }
  return{modelAlignmentConfidence:expected.length===0?0:alignment.exact/expected.length,distance:alignment.distance,proposals};
};

const defaultPython=()=>process.env.VPF_WHISPER_PYTHON?.trim()||resolve(REPOSITORY_ROOT,process.platform==="win32"?".venv-whisper/Scripts/python.exe":".venv-whisper/bin/python");

export const transcribeFinalAudio=({audioPath,prompt,model="small",pythonPath=defaultPython(),timeoutMs=10*60*1000})=>new Promise((resolvePromise,reject)=>{
  if(!existsSync(pythonPath))return reject(new Error(`Whisper Python is missing: ${pythonPath}. Create .venv-whisper and install runtimes/whisper/requirements.txt.`));
  if(!existsSync(WORKER_PATH))return reject(new Error(`Whisper worker is missing: ${WORKER_PATH}`));
  const child=spawn(pythonPath,[WORKER_PATH],{cwd:REPOSITORY_ROOT,stdio:["pipe","pipe","pipe"],windowsHide:true});
  let stdout="";let stderr="";let settled=false;
  const timer=setTimeout(()=>{if(settled)return;settled=true;child.kill();reject(new Error("Whisper analysis timed out."));},timeoutMs);
  child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
  child.stdout.on("data",chunk=>{stdout+=chunk;});child.stderr.on("data",chunk=>{stderr+=chunk;});
  child.once("error",error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  child.once("close",code=>{if(settled)return;settled=true;clearTimeout(timer);try{const payload=JSON.parse(stdout);if(code!==0||payload.success!==true)throw new Error(payload.error||stderr||`Whisper exited with code ${code}`);resolvePromise(payload);}catch(error){reject(error instanceof Error?error:new Error(String(error)));}});
  child.stdin.end(JSON.stringify({audioPath,prompt,model,language:"ko"}));
});
