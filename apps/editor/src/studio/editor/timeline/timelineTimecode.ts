export const formatTimelinePosition=(frame:number,fps:number):string=>{
  const safe=Math.max(0,Math.round(frame));
  return `${String(Math.floor(safe/(fps*60))).padStart(2,"0")}:${String(Math.floor(safe/fps)%60).padStart(2,"0")}:${String(safe%fps).padStart(2,"0")}`;
};

// Frame number, mm:ss:ff, and mm:ss.ff are supported for precise seeking.
export const parseTimelinePosition=(value:string,fps:number,lastFrame:number):number|null=>{
  const text=value.trim();
  if(/^\d+$/.test(text))return Math.min(lastFrame,Math.max(0,Number(text)));
  const match=/^(\d+):(\d{1,2})(?::|\.)(\d{1,2})$/.exec(text);
  if(!match)return null;
  const [,minutes,seconds,frames]=match;
  if(Number(seconds)>=60||Number(frames)>=fps)return null;
  return Math.min(lastFrame,Math.max(0,Number(minutes)*fps*60+Number(seconds)*fps+Number(frames)));
};
