import {parseMedia} from "@remotion/media-parser";
import {nodeReader} from "@remotion/media-parser/node";
import {resolve} from "node:path";

const [input]=process.argv.slice(2);
if(!input){
  console.error("Usage: node scripts/probe-tail-video.mjs <video_path>");
  process.exitCode=2;
}else{
  try{
    const result=await parseMedia({
      src:resolve(input),
      reader:nodeReader,
      fields:{
        dimensions:true,
        slowDurationInSeconds:true,
        videoCodec:true
      },
      logLevel:"error",
      acknowledgeRemotionLicense:true
    });
    const durationSec=Number(result?.slowDurationInSeconds??0);
    const width=Number(result?.dimensions?.width??0);
    const height=Number(result?.dimensions?.height??0);
    if(!Number.isFinite(durationSec)||durationSec<=0){
      throw new Error("Video duration is missing or invalid.");
    }
    console.log(JSON.stringify({
      durationSec,
      width:Number.isFinite(width)&&width>0?width:null,
      height:Number.isFinite(height)&&height>0?height:null,
      videoCodec:String(result?.videoCodec??"")
    }));
  }catch(error){
    console.error("[tail-video-probe] "+(error instanceof Error?error.message:String(error)));
    process.exitCode=1;
  }
}
