import type {TransformPatch} from "./editorActions";

export const RESET_TRANSFORM:Required<TransformPatch>={x:0,y:0,scale:1,rotation:0,opacity:1};

export const normalizeTransformValue=(key:keyof Required<TransformPatch>,value:number)=>{
  const finite=Number.isFinite(value)?value:RESET_TRANSFORM[key];
  if(key==="scale")return Math.max(.01,finite);
  if(key==="opacity")return Math.min(1,Math.max(0,finite));
  return finite;
};
