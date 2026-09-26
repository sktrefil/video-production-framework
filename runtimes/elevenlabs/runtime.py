from __future__ import annotations
import argparse, base64, binascii, hashlib, json, os, shlex, subprocess, sys, tempfile, time
import urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_BASE_URL="https://api.elevenlabs.io/v1"; PROFILE_ID="ELEVENLABS_V3_HISTORY_V1"; PROFILE_VERSION="1.0.0"
MODEL_ID="eleven_v3"; ENDPOINT="/v1/text-to-speech/{voice_id}/with-timestamps"; OUTPUT_FORMAT="mp3_44100_128"; MAX_CHARS=4000

class RuntimeFailure(Exception):
    def __init__(self, code:str, detail:str): super().__init__(detail); self.code=code; self.detail=detail

def now_iso()->str: return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def sha(data:bytes)->str: return hashlib.sha256(data).hexdigest()
def json_bytes(v:Any)->bytes: return (json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode()

def load_dotenv()->None:
    """Load local runtime settings without overriding explicit process variables."""
    candidates=[Path.cwd()/".env",Path(__file__).resolve().parents[2]/".env"]
    project_root=os.environ.get("VPF_PROJECT_ROOT","").strip()
    if project_root: candidates.insert(0,Path(project_root)/".env")
    for path in dict.fromkeys(candidates):
        try: lines=path.read_text(encoding="utf-8").splitlines()
        except FileNotFoundError: continue
        except OSError: continue
        for line in lines:
            raw=line.strip()
            if not raw or raw.startswith("#") or "=" not in raw: continue
            name,value=raw.split("=",1); name=name.strip(); value=value.strip()
            if name.startswith("export "): name=name[7:].strip()
            if not name or name in os.environ: continue
            if len(value)>=2 and value[0] in "\"'" and value[-1]==value[0]: value=value[1:-1]
            os.environ[name]=value
        return

def safe_rel(value:str)->Path:
    raw=str(value or "").strip().replace("\\","/"); p=Path(raw)
    if not raw or p.is_absolute() or any(x in {"",".",".."} for x in raw.split("/")) or (len(raw)>=3 and raw[1]==":" and raw[0].isalpha()):
        raise RuntimeFailure("ARTIFACT_PATH_INVALID",f"Unsafe project-relative path: {value!r}")
    return Path(*raw.split("/"))

def project_path(root:Path, rel:str)->Path:
    base=root.resolve(); out=(base/safe_rel(rel)).resolve()
    try: out.relative_to(base)
    except ValueError as exc: raise RuntimeFailure("ARTIFACT_PATH_INVALID",f"Output escaped project root: {rel}") from exc
    return out

def read_job(filename:str|None)->dict[str,Any]:
    try: value=json.loads(Path(filename).read_text(encoding="utf-8") if filename else sys.stdin.read())
    except (OSError,UnicodeError,json.JSONDecodeError) as exc: raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"RuntimeJob JSON invalid: {exc}") from exc
    if not isinstance(value,dict): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","RuntimeJob must be an object.")
    return value

def validate_job(job:dict[str,Any])->dict[str,Any]:
    if job.get("schemaVersion")!=1 or job.get("provider")!="ELEVENLABS" or job.get("jobType")!="TTS_GENERATION": raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Unsupported RuntimeJob.")
    if job.get("executionMode")!="AUTOMATED": raise RuntimeFailure("RUNTIME_JOB_STATE_INVALID","AUTOMATED execution required.")
    if job.get("providerProfileVersion")!=PROFILE_VERSION: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Unsupported provider profile version.")
    for key in ("jobId","projectId","inputHash"):
        if not isinstance(job.get(key),str) or not job[key].strip(): raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"RuntimeJob.{key} required.")
    if not isinstance(job.get("jobRevision"),int) or job["jobRevision"]<=0 or not isinstance(job.get("attempt"),int) or job["attempt"]<=0: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Positive jobRevision/attempt required.")
    required={x.get("envName") for x in job.get("secretRequirements",[]) if isinstance(x,dict) and x.get("required") is True}
    if "ELEVENLABS_API_KEY" not in required: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","ELEVENLABS_API_KEY requirement missing.")
    inp=job.get("input"); profile=inp.get("providerProfile") if isinstance(inp,dict) else None
    if not isinstance(inp,dict) or inp.get("schemaVersion")!=1 or not isinstance(profile,dict): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Runtime input/profile invalid.")
    if profile.get("resourceId")!=PROFILE_ID or profile.get("version")!=PROFILE_VERSION or not str(profile.get("contentHash") or "").startswith("sha256:"): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Canonical provider pin required.")
    plan=inp.get("plan")
    if not isinstance(plan,dict) or plan.get("modelId")!=MODEL_ID or plan.get("endpoint")!=ENDPOINT or plan.get("outputFormat")!=OUTPUT_FORMAT or plan.get("preserveProviderCadence") is not True: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","TTS plan violates ElevenLabs v3 contract.")
    chunks=plan.get("chunks")
    if not isinstance(chunks,list) or not chunks: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","TTS chunks required.")
    for i,c in enumerate(chunks,1):
        if not isinstance(c,dict):
            raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"TTS chunk {i} must be an object.")
        text=c.get("text")
        if c.get("index")!=i:
            raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"TTS chunk {i} index is invalid.")
        if not isinstance(text,str) or not text:
            raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"TTS chunk {i} text is empty or invalid.")
        if len(text)>MAX_CHARS:
            raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"TTS chunk {i} exceeds the {MAX_CHARS}-character limit.")
        if c.get("textCharacterCount")!=len(text):
            raise RuntimeFailure(
                "RUNTIME_CONFIG_INVALID",
                f"TTS chunk {i} character count mismatch: declared={c.get('textCharacterCount')!r}, actual={len(text)}."
            )
        safe_rel(str(c.get("outputRelativePath") or ""))
    paths=plan.get("outputPaths")
    if not isinstance(paths,dict): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","outputPaths required.")
    mode=str(plan.get("narrationMode") or "SINGLE")
    if mode not in {"SINGLE","SEGMENTED"}: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Invalid narrationMode.")
    if mode=="SEGMENTED":
        sections=plan.get("sections")
        if not isinstance(sections,list) or len(sections)!=len(chunks): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","SEGMENTED sections must match chunks.")
        for i,(section,chunk) in enumerate(zip(sections,chunks),1):
            if not isinstance(section,dict) or section.get("index")!=i or section.get("id")!=chunk.get("sectionId"): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Invalid SEGMENTED section identity.")
            if str(section.get("text") or "")!=str(chunk.get("text") or ""): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Section/chunk text mismatch.")
            safe_rel(str(section.get("audioRelativePath") or ""))
            safe_rel(str(section.get("characterAlignmentRelativePath") or ""))
        safe_rel(str(paths.get("narrationManifest") or ""))
    else:
        for name in ("narration","characterAlignment"): safe_rel(str(paths.get(name) or ""))
    for name in ("metadata","resolvedVoiceProfile"): safe_rel(str(paths.get(name) or ""))
    return plan

def resolve_voice(plan:dict[str,Any])->tuple[str,str]:
    preset=str(plan.get("voicePreset") or "").strip().upper()
    if not preset: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","voicePreset required.")
    specific="ELEVENLABS_VOICE_ID_"+"".join(c if c.isalnum() else "_" for c in preset)
    for name in (specific,"ELEVENLABS_VOICE_ID"):
        value=os.environ.get(name,"").strip()
        if value:
            if not all(c.isalnum() or c in "_-" for c in value): raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"Invalid voice id in {name}.")
            return value,name
    raise RuntimeFailure("RUNTIME_CONFIG_INVALID",f"No voice id configured for {preset}.")

def validate_alignment(a:Any,text:str)->None:
    if not isinstance(a,dict): raise RuntimeFailure("PROVIDER_RESULT_INVALID","Alignment missing.")
    chars=a.get("characters"); starts=a.get("character_start_times_seconds"); ends=a.get("character_end_times_seconds")
    if not all(isinstance(x,list) for x in (chars,starts,ends)) or not chars or len(chars)!=len(starts) or len(chars)!=len(ends) or "".join(map(str,chars))!=text: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Alignment arrays/text invalid.")
    prev=0.0
    for s,e in zip(starts,ends):
        if isinstance(s,bool) or isinstance(e,bool) or not isinstance(s,(int,float)) or not isinstance(e,(int,float)) or s<0 or e<s or s+1e-9<prev: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Alignment timestamps invalid.")
        prev=float(s)

def request_tts(text:str,voice:str,key:str,settings:dict[str,Any],timeout:float,retries:int)->tuple[bytes,str|None,dict[str,Any]]:
    url=f"{os.environ.get('ELEVENLABS_API_BASE_URL',API_BASE_URL).rstrip('/')}/text-to-speech/{urllib.parse.quote(voice,safe='')}/with-timestamps?output_format={OUTPUT_FORMAT}"
    data=json.dumps({"text":text,"model_id":MODEL_ID,"voice_settings":settings},ensure_ascii=False,separators=(",",":")).encode()
    for n in range(retries+1):
        req=urllib.request.Request(url,data=data,method="POST",headers={"Accept":"application/json","Content-Type":"application/json","xi-api-key":key})
        try:
            with urllib.request.urlopen(req,timeout=timeout) as res:
                body=json.loads(res.read().decode()); rid=res.headers.get("request-id")
                if not isinstance(body,dict): raise RuntimeFailure("PROVIDER_RESULT_INVALID","Provider JSON must be object.")
                try: audio=base64.b64decode(str(body.get("audio_base64") or ""),validate=True)
                except (ValueError,binascii.Error) as exc: raise RuntimeFailure("PROVIDER_RESULT_INVALID","audio_base64 invalid.") from exc
                align=body.get("alignment"); validate_alignment(align,text)
                if not audio: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Empty audio.")
                return audio,rid,align
        except urllib.error.HTTPError as exc:
            if exc.code in {429,500,502,503,504} and n<retries: time.sleep(min(2**n,4)); continue
            raise RuntimeFailure("PROVIDER_REQUEST_FAILED",f"ElevenLabs HTTP {exc.code}.") from exc
        except (urllib.error.URLError,TimeoutError) as exc:
            if n<retries: time.sleep(min(2**n,4)); continue
            reason=getattr(exc,"reason",exc); code="PROVIDER_TIMEOUT" if isinstance(reason,TimeoutError) else "PROVIDER_REQUEST_FAILED"
            raise RuntimeFailure(code,f"ElevenLabs request failed: {reason}") from exc
        except (UnicodeError,json.JSONDecodeError) as exc: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Provider returned invalid JSON.") from exc
    raise RuntimeFailure("PROVIDER_REQUEST_FAILED","Retry limit exceeded.")

def aggregate(parts:list[tuple[str,dict[str,Any]]])->dict[str,Any]:
    chars=[]; starts=[]; ends=[]; offset=0.0
    for i,(text,a) in enumerate(parts):
        c=list(map(str,a["characters"])); s=list(map(float,a["character_start_times_seconds"])); e=list(map(float,a["character_end_times_seconds"]))
        if i: chars += ["\n","\n"]; starts += [offset,offset]; ends += [offset,offset]
        chars += c; starts += [round(offset+x,6) for x in s]; ends += [round(offset+x,6) for x in e]
        if e: offset=round(offset+max(e),6)
        if "".join(c)!=text: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Alignment aggregation drift.")
    return {"characters":chars,"character_start_times_seconds":starts,"character_end_times_seconds":ends}

def split_process_command(value:str, *, windows:bool)->list[str]:
    try:
        args=shlex.split(value,posix=not windows)
    except ValueError as exc:
        raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Invalid VPF_FFMPEG_COMMAND quoting.") from exc
    if windows:
        # subprocess receives argv, so grouping quotes must not remain literal bytes.
        args=[arg[1:-1] if len(arg)>=2 and arg[0]==arg[-1] and arg[0] in (chr(34),chr(39)) else arg for arg in args]
    if not args or not args[0].strip():
        raise RuntimeFailure("RUNTIME_CONFIG_INVALID","VPF_FFMPEG_COMMAND empty.")
    return args

def combine(chunks:list[Path],output:Path)->None:
    output.parent.mkdir(parents=True,exist_ok=True)
    if len(chunks)==1: output.write_bytes(chunks[0].read_bytes()); return
    fd,name=tempfile.mkstemp(prefix=".tts_concat.",suffix=".txt",dir=output.parent); os.close(fd); listing=Path(name)
    try:
        listing.write_text("".join(f"file '{p.resolve().as_posix().replace(chr(39),chr(39)+chr(92)+chr(39)+chr(39))}'\n" for p in chunks),encoding="utf-8")
        cmd=split_process_command(os.environ.get("VPF_FFMPEG_COMMAND","ffmpeg"),windows=os.name=="nt")
        p=subprocess.run(cmd+["-hide_banner","-y","-f","concat","-safe","0","-i",str(listing),"-c:a","libmp3lame","-b:a","128k","-ar","44100",str(output)],capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=600)
        if p.returncode or not output.is_file() or output.stat().st_size<=0: raise RuntimeFailure("ARTIFACT_WRITE_FAILED",f"MP3 combine failed: {(p.stderr or '')[-300:]}")
    except subprocess.TimeoutExpired as exc: raise RuntimeFailure("ARTIFACT_WRITE_FAILED","MP3 combine timed out.") from exc
    except OSError as exc: raise RuntimeFailure("ARTIFACT_WRITE_FAILED",f"MP3 combine failed to start: {exc}") from exc
    finally: listing.unlink(missing_ok=True)

def artifact(role:str,p:Path,root:Path,mime:str,duration:int|None=None)->dict[str,Any]:
    data=p.read_bytes(); out={"role":role,"relativePath":p.resolve().relative_to(root.resolve()).as_posix(),"mimeType":mime,"sizeBytes":len(data),"sha256":sha(data)}
    if duration is not None: out["durationMs"]=duration
    return out

def execute(job:dict[str,Any])->dict[str,Any]:
    started=now_iso(); plan=validate_job(job); root_raw=os.environ.get("VPF_PROJECT_ROOT","").strip()
    if not root_raw: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","VPF_PROJECT_ROOT not injected.")
    root=Path(root_raw); root.mkdir(parents=True,exist_ok=True); key=os.environ.get("ELEVENLABS_API_KEY","").strip()
    if not key: raise RuntimeFailure("RUNTIME_SECRET_MISSING","ELEVENLABS_API_KEY required.")
    voice,voice_source=resolve_voice(plan); timeout=float(os.environ.get("ELEVENLABS_TIMEOUT_SECONDS","120")); retries=int(os.environ.get("ELEVENLABS_REQUEST_RETRIES","2"))
    if timeout<=0 or retries<0 or retries>5: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Invalid timeout/retry config.")
    paths=plan["outputPaths"]; mode=str(plan.get("narrationMode") or "SINGLE")
    request_ids=[]; parts=[]; chunk_paths=[]; outputs=[]; section_manifest=[]

    for c in plan["chunks"]:
        audio,rid,a=request_tts(c["text"],voice,key,dict(plan.get("effectiveVoiceSettings") or {}),timeout,retries)
        p=project_path(root,c["outputRelativePath"]); p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(audio)
        chunk_paths.append(p); parts.append((c["text"],a)); request_ids += [rid] if rid else []

        if mode=="SEGMENTED":
            section=plan["sections"][c["index"]-1]
            if p.resolve()!=project_path(root,section["audioRelativePath"]).resolve(): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Section audio path must equal chunk output path.")
            duration=int(round(max(a.get("character_end_times_seconds") or [0])*1000))
            if duration<=0: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Section alignment duration invalid.")
            ap=project_path(root,section["characterAlignmentRelativePath"]); ap.parent.mkdir(parents=True,exist_ok=True); ap.write_bytes(json_bytes(a))
            suffix=str(int(section["index"])).zfill(3)
            outputs.append(artifact(f"narration_section_{suffix}",p,root,"audio/mpeg",duration))
            outputs.append(artifact(f"character_alignment_section_{suffix}",ap,root,"application/json"))
            section_manifest.append({
                "id":section["id"],"index":section["index"],"sequenceId":section.get("sequenceId"),"sceneIds":section.get("sceneIds") or [],
                "text":str(section["text"]),"textSha256":sha(str(section["text"]).encode("utf-8")),"audioRelativePath":section["audioRelativePath"],
                "audioSha256":sha(p.read_bytes()),"audioDurationMs":duration,
                "characterAlignmentRelativePath":section["characterAlignmentRelativePath"],"characterAlignmentSha256":sha(ap.read_bytes()),
                "requestIds":[rid] if rid else []
            })

    completed=now_iso()
    if mode=="SEGMENTED":
        manifest_path=project_path(root,paths["narrationManifest"]); manifest_path.parent.mkdir(parents=True,exist_ok=True)
        manifest={"schemaVersion":2,"mode":"SEGMENTED","planId":plan["id"],"planRevision":plan["revision"],"sections":section_manifest,"totalAudioDurationMs":sum(int(x["audioDurationMs"]) for x in section_manifest)}
        manifest_path.write_bytes(json_bytes(manifest))
        outputs.append(artifact("narration_manifest",manifest_path,root,"application/json"))
        audio_sha=None; align_sha=None
    else:
        narration=project_path(root,paths["narration"]); combine(chunk_paths,narration); alignment=aggregate(parts); expected="\n\n".join(c["text"] for c in plan["chunks"])
        if "".join(alignment["characters"])!=expected: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Aggregated alignment text mismatch.")
        duration=int(round(max(alignment["character_end_times_seconds"] or [0])*1000))
        if duration<=0: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Alignment duration invalid.")
        ap=project_path(root,paths["characterAlignment"]); ap.parent.mkdir(parents=True,exist_ok=True); ap.write_bytes(json_bytes(alignment))
        audio_sha=sha(narration.read_bytes()); align_sha=sha(ap.read_bytes())
        outputs += [artifact("narration",narration,root,"audio/mpeg",duration),artifact("character_alignment",ap,root,"application/json")]

    mp=project_path(root,paths["metadata"]); vp=project_path(root,paths["resolvedVoiceProfile"])
    for p in (mp,vp): p.parent.mkdir(parents=True,exist_ok=True)
    metadata={"schemaVersion":2 if mode=="SEGMENTED" else 1,"provider":"ELEVENLABS","providerProfile":{"resourceId":PROFILE_ID,"version":PROFILE_VERSION,"contentHash":job["input"]["providerProfile"]["contentHash"]},"modelId":MODEL_ID,"endpoint":ENDPOINT,"outputFormat":OUTPUT_FORMAT,"jobId":job["jobId"],"jobRevision":job["jobRevision"],"attempt":job["attempt"],"planId":plan["id"],"planRevision":plan["revision"],"inputHash":job["inputHash"],"narrationMode":mode,"requestIds":request_ids,"chunkCount":len(plan["chunks"]),"sectionCount":len(section_manifest) if mode=="SEGMENTED" else 1,"audioSha256":audio_sha,"characterAlignmentSha256":align_sha,"startedAt":started,"completedAt":completed}
    voice_profile={"schemaVersion":1,"voicePreset":plan["voicePreset"],"voiceId":"REDACTED","voiceIdSource":voice_source,"modelId":MODEL_ID,"configuredVoiceSettings":plan.get("configuredVoiceSettings") or {},"effectiveVoiceSettings":plan.get("effectiveVoiceSettings") or {},"preserveProviderCadence":True}
    mp.write_bytes(json_bytes(metadata)); vp.write_bytes(json_bytes(voice_profile))
    outputs += [artifact("tts_metadata",mp,root,"application/json"),artifact("resolved_voice_profile",vp,root,"application/json")]
    return {"schemaVersion":1,"jobId":job["jobId"],"jobRevision":job["jobRevision"],"projectId":job["projectId"],"attempt":job["attempt"],"status":"COMPLETE","providerRequestIds":request_ids,"outputs":outputs,"startedAt":started,"completedAt":now_iso()}

def failure_result(job:dict[str,Any],f:RuntimeFailure,started:str)->dict[str,Any]|None:
    ident={k:job.get(k) for k in ("jobId","jobRevision","projectId","attempt")}
    if not isinstance(ident["jobId"],str) or not isinstance(ident["jobRevision"],int) or not isinstance(ident["projectId"],str) or not isinstance(ident["attempt"],int): return None
    return {"schemaVersion":1,**ident,"status":"FAILED","providerRequestIds":[],"outputs":[],"startedAt":started,"completedAt":now_iso(),"error":{"code":f.code,"detail":f.detail[:1000]}}

def main(argv:list[str]|None=None)->int:
    load_dotenv()
    parser=argparse.ArgumentParser(); parser.add_argument("--job"); args=parser.parse_args(argv); started=now_iso(); job={}
    try: job=read_job(args.job); result=execute(job); sys.stdout.write(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n"); return 0
    except RuntimeFailure as f:
        result=failure_result(job,f,started)
        if result is None: sys.stderr.write(f"{f.code}: {f.detail}\n"); return 2
        sys.stdout.write(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n"); return 0
    except Exception as exc:
        f=RuntimeFailure("PROVIDER_REQUEST_FAILED",f"Unexpected runtime failure: {type(exc).__name__}: {exc}"); result=failure_result(job,f,started)
        if result is None: sys.stderr.write(f"{f.code}: {f.detail}\n"); return 3
        sys.stdout.write(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n"); return 0

if __name__=="__main__": raise SystemExit(main())
