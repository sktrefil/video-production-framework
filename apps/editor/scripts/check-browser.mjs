import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const command=process.platform==="win32"?"npm.cmd":"npm";
const result=spawnSync(command,["exec","--","remotion","compositions","src/index.ts"],{cwd:root,encoding:"utf8",timeout:240000,maxBuffer:10*1024*1024,env:{...process.env,CI:"1"}});
if(result.error){if(result.error.code==="EPERM")throw new Error(`spawn EPERM while launching Remotion/browser: ${result.error.message}`);throw result.error;}
assert.equal(result.status,0,`Remotion browser smoke failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
const output=`${result.stdout}\n${result.stderr}`;
assert.match(output,/GenericVideoEditor/);
assert.match(output,/GenericFinalRender/);
console.log("[editor-browser] PASS: child process spawned and Remotion browser enumerated GenericVideoEditor + GenericFinalRender");
