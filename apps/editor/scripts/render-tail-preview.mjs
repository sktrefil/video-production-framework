import {spawn} from "node:child_process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const APP_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");

async function runRemotion(args){
  const candidates=[
    resolve(APP_ROOT,"node_modules","@remotion","cli","remotion-cli.js"),
    resolve(APP_ROOT,"..","..","node_modules","@remotion","cli","remotion-cli.js")
  ];
  let cli=null;
  for(const candidate of candidates){
    try{await readFile(candidate);cli=candidate;break;}catch{}
  }
  if(cli===null)throw new Error("Remotion CLI entry could not be resolved from the workspace.");
  await new Promise((resolveRun,rejectRun)=>{
    const child=spawn(process.execPath,[cli,...args],{
      cwd:APP_ROOT,
      stdio:"inherit",
      windowsHide:true,
      shell:false,
      env:{...process.env}
    });
    child.once("error",rejectRun);
    child.once("exit",(code,signal)=>{
      if(code===0)resolveRun();
      else rejectRun(new Error(signal ? "Remotion preview render terminated by "+signal : "Remotion preview render failed with exit code "+String(code??"unknown")));
    });
  });
}

const [projectRootArg,projectId]=process.argv.slice(2);
if(!projectRootArg||!projectId){
  console.error("Usage: node scripts/render-tail-preview.mjs <project_root> <project_id>");
  process.exitCode=2;
}else{
  const projectRoot=resolve(projectRootArg);
  const editPath=resolve(projectRoot,"08_editor","edit_project.json");
  const propsPath=resolve(projectRoot,"09_render","tail_preview_props.json");
  const outputPath=resolve(projectRoot,"09_render","preview.mp4");
  try{
    const project=JSON.parse(await readFile(editPath,"utf8"));
    await mkdir(dirname(propsPath),{recursive:true});
    await writeFile(propsPath,JSON.stringify({project},null,2)+"\n","utf8");
    const args=[
      "render",
      "src/index.ts",
      "GenericFinalRender",
      outputPath,
      "--props",
      propsPath,
      "--codec=h264",
      "--audio-codec=aac",
      "--pixel-format=yuv420p",
      "--crf=18",
      "--overwrite=true"
    ];
    if(process.env.REMOTION_CONCURRENCY)args.push("--concurrency="+process.env.REMOTION_CONCURRENCY);
    await runRemotion(args);
    console.log(JSON.stringify({projectId,status:"RENDERED",outputPath}));
  }catch(error){
    console.error("[tail-preview] "+(error instanceof Error?error.message:String(error)));
    process.exitCode=1;
  }
}
