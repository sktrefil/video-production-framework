import {existsSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const environment=resolve(root,".venv-whisper");
const python=process.env.VPF_SYSTEM_PYTHON?.trim()||"python";
const runtimePython=resolve(environment,process.platform==="win32"?"Scripts/python.exe":"bin/python");
const requirements=resolve(root,"runtimes/whisper/requirements.txt");
const run=(command,args)=>{const result=spawnSync(command,args,{cwd:root,stdio:"inherit",windowsHide:true});if(result.error)throw result.error;if(result.status!==0)throw new Error(`${command} exited with code ${result.status}`);};

if(!existsSync(runtimePython))run(python,["-m","venv",environment]);
run(runtimePython,["-m","pip","install","-r",requirements]);
console.log(`[subtitle-sync] Whisper runtime ready: ${runtimePython}`);
console.log("[subtitle-sync] The configured model downloads on the first Auto Sync T1 preview.");
