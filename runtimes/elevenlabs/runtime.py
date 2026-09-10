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
        text=c.get("text") if isinstance(c,dict) else None
        if not isinstance(c,dict) or c.get("index")!=i or not isinstance(text,str) or not text or len(text)>MAX_CHARS or c.get("textCharacterCount")!=len(text): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","Invalid/oversized TTS chunk.")
        safe_rel(str(c.get("outputRelativePath") or ""))
    paths=plan.get("outputPaths")
    if not isinstance(paths,dict): raise RuntimeFailure("RUNTIME_CONFIG_INVALID","outputPaths required.")
    for name in ("narration","characterAlignment","metadata","resolvedVoiceProfile"): safe_rel(str(paths.get(name) or ""))
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

def combine(chunks:list[Path],output:Path)->None:
    output.parent.mkdir(parents=True,exist_ok=True)
    if len(chunks)==1: output.write_bytes(chunks[0].read_bytes()); return
    fd,name=tempfile.mkstemp(prefix=".tts_concat.",suffix=".txt",dir=output.parent); os.close(fd); listing=Path(name)
    try:
        listing.write_text("".join(f"file '{p.resolve().as_posix().replace(chr(39),chr(39)+chr(92)+chr(39)+chr(39))}'\n" for p in chunks),encoding="utf-8")
        cmd=shlex.split(os.environ.get("VPF_FFMPEG_COMMAND","ffmpeg"),posix=os.name!="nt")
        if not cmd: raise RuntimeFailure("RUNTIME_CONFIG_INVALID","VPF_FFMPEG_COMMAND empty.")
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
    chunk_paths=[]; parts=[]; request_ids=[]
    for c in plan["chunks"]:
        audio,rid,a=request_tts(c["text"],voice,key,dict(plan.get("effectiveVoiceSettings") or {}),timeout,retries); p=project_path(root,c["outputRelativePath"]); p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(audio); chunk_paths.append(p); parts.append((c["text"],a)); request_ids += [rid] if rid else []
    paths=plan["outputPaths"]; narration=project_path(root,paths["narration"]); combine(chunk_paths,narration); alignment=aggregate(parts); expected="\n\n".join(c["text"] for c in plan["chunks"])
    if "".join(alignment["characters"])!=expected: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Aggregated alignment text mismatch.")
    duration=int(round(max(alignment["character_end_times_seconds"] or [0])*1000))
    if duration<=0: raise RuntimeFailure("PROVIDER_RESULT_INVALID","Alignment duration invalid.")
    ap=project_path(root,paths["characterAlignment"]); mp=project_path(root,paths["metadata"]); vp=project_path(root,paths["resolvedVoiceProfile"])
    for p in (ap,mp,vp): p.parent.mkdir(parents=True,exist_ok=True)
    ap.write_bytes(json_bytes(alignment)); audio_sha=sha(narration.read_bytes()); align_sha=sha(ap.read_bytes()); completed=now_iso()
    metadata={"schemaVersion":1,"provider":"ELEVENLABS","providerProfile":{"resourceId":PROFILE_ID,"version":PROFILE_VERSION,"contentHash":job["input"]["providerProfile"]["contentHash"]},"modelId":MODEL_ID,"endpoint":ENDPOINT,"outputFormat":OUTPUT_FORMAT,"jobId":job["jobId"],"jobRevision":job["jobRevision"],"attempt":job["attempt"],"planId":plan["id"],"planRevision":plan["revision"],"inputHash":job["inputHash"],"requestIds":request_ids,"chunkCount":len(plan["chunks"]),"audioSha256":audio_sha,"characterAlignmentSha256":align_sha,"startedAt":started,"completedAt":completed}
    voice_profile={"schemaVersion":1,"voicePreset":plan["voicePreset"],"voiceId":"REDACTED","voiceIdSource":voice_source,"modelId":MODEL_ID,"configuredVoiceSettings":plan.get("configuredVoiceSettings") or {},"effectiveVoiceSettings":plan.get("effectiveVoiceSettings") or {},"preserveProviderCadence":True}
    mp.write_bytes(json_bytes(metadata)); vp.write_bytes(json_bytes(voice_profile))
    outputs=[artifact("narration",narration,root,"audio/mpeg",duration),artifact("character_alignment",ap,root,"application/json"),artifact("tts_metadata",mp,root,"application/json"),artifact("resolved_voice_profile",vp,root,"application/json")]
    return {"schemaVersion":1,"jobId":job["jobId"],"jobRevision":job["jobRevision"],"projectId":job["projectId"],"attempt":job["attempt"],"status":"COMPLETE","providerRequestIds":request_ids,"outputs":outputs,"startedAt":started,"completedAt":now_iso()}

def failure_result(job:dict[str,Any],f:RuntimeFailure,started:str)->dict[str,Any]|None:
    ident={k:job.get(k) for k in ("jobId","jobRevision","projectId","attempt")}
    if not isinstance(ident["jobId"],str) or not isinstance(ident["jobRevision"],int) or not isinstance(ident["projectId"],str) or not isinstance(ident["attempt"],int): return None
    return {"schemaVersion":1,**ident,"status":"FAILED","providerRequestIds":[],"outputs":[],"startedAt":started,"completedAt":now_iso(),"error":{"code":f.code,"detail":f.detail[:1000]}}

def main(argv:list[str]|None=None)->int:
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
