export type WaveformPeakData={peaks:Float32Array;durationSeconds:number};

const MAX_CACHE_PEAKS=4096;
const peakCache=new Map<string,Promise<WaveformPeakData>>();

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export const buildPeakEnvelope=(channels:Float32Array[],peakCount:number=MAX_CACHE_PEAKS):Float32Array=>{
  const length=channels[0]?.length??0;
  const bins=Math.max(1,Math.min(Math.max(1,Math.round(peakCount)),Math.max(1,length)));
  const peaks=new Float32Array(bins);
  if(length===0||channels.length===0)return peaks;
  for(let bin=0;bin<bins;bin++){
    const start=Math.floor((bin*length)/bins);
    const end=Math.max(start+1,Math.floor(((bin+1)*length)/bins));
    let peak=0;
    for(const channel of channels){
      const limit=Math.min(channel.length,end);
      for(let index=start;index<limit;index++)peak=Math.max(peak,Math.abs(channel[index]??0));
    }
    peaks[bin]=peak;
  }
  return peaks;
};

export const sampleWaveformWindow=(peaks:Float32Array,sourceStartFrame:number,sourceDurationInFrames:number,sourceAssetDurationInFrames:number,displayBins:number):Float32Array=>{
  const bins=Math.max(1,Math.round(displayBins));
  const sampled=new Float32Array(bins);
  if(peaks.length===0)return sampled;
  const assetFrames=Math.max(1,Math.round(sourceAssetDurationInFrames));
  const startFrame=clamp(Math.round(sourceStartFrame),0,assetFrames);
  const endFrame=clamp(startFrame+Math.max(1,Math.round(sourceDurationInFrames)),startFrame,assetFrames);
  const startIndex=Math.min(peaks.length-1,Math.floor((startFrame/assetFrames)*peaks.length));
  const endIndex=Math.max(startIndex+1,Math.min(peaks.length,Math.ceil((endFrame/assetFrames)*peaks.length)));
  const span=Math.max(1,endIndex-startIndex);
  for(let bin=0;bin<bins;bin++){
    const from=startIndex+Math.floor((bin*span)/bins);
    const to=Math.max(from+1,startIndex+Math.floor(((bin+1)*span)/bins));
    let peak=0;
    for(let index=from;index<Math.min(endIndex,to);index++)peak=Math.max(peak,peaks[index]??0);
    sampled[bin]=peak;
  }
  return sampled;
};

export const loadWaveformPeaks=(src:string):Promise<WaveformPeakData>=>{
  const cached=peakCache.get(src);
  if(cached)return cached;
  const pending=(async()=>{
    if(typeof window==="undefined"||typeof AudioContext==="undefined")throw new Error("Web Audio API is unavailable.");
    const response=await fetch(src);
    if(!response.ok)throw new Error(`Waveform media fetch failed: ${response.status}`);
    const bytes=await response.arrayBuffer();
    const context=new AudioContext();
    try{
      const decoded=await context.decodeAudioData(bytes.slice(0));
      const channels=Array.from({length:decoded.numberOfChannels},(_,index)=>decoded.getChannelData(index));
      return{peaks:buildPeakEnvelope(channels),durationSeconds:decoded.duration};
    }finally{
      void context.close();
    }
  })().catch((error)=>{peakCache.delete(src);throw error;});
  peakCache.set(src,pending);
  return pending;
};

export const clearWaveformPeakCache=()=>peakCache.clear();
