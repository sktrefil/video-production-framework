import type {SubtitleEmphasisRange,SubtitleTimelineItem} from "./editorTypes";

export const DEFAULT_SUBTITLE_EMPHASIS_COLOR="#D79A32";

const validColor=(color:string|undefined)=>color?.trim()||DEFAULT_SUBTITLE_EMPHASIS_COLOR;

/**
 * Keeps only explicit, valid ranges. It never finds or infers important words.
 * Overlapping ranges are deterministically resolved in source order.
 */
export const normalizeSubtitleEmphasisRanges=(text:string,ranges:SubtitleEmphasisRange[]|undefined):SubtitleEmphasisRange[]|undefined=>{
  if(!ranges?.length)return undefined;
  const normalized=ranges
    .filter((range)=>Number.isFinite(range.start)&&Number.isFinite(range.end))
    .map((range)=>({start:Math.max(0,Math.min(text.length,Math.round(range.start))),end:Math.max(0,Math.min(text.length,Math.round(range.end))),color:validColor(range.color),enabled:range.enabled===true}))
    .filter((range)=>range.end>range.start)
    .sort((a,b)=>a.start-b.start||a.end-b.end)
    .reduce<SubtitleEmphasisRange[]>((accepted,range)=>range.start>=(accepted.at(-1)?.end??0)?[...accepted,range]:accepted,[]);
  return normalized.length?normalized:undefined;
};

export type SubtitleTextSegment={text:string;color?:string;emphasized:boolean};

/** Turns only authored ranges into render segments; ordinary text remains unmodified. */
export const subtitleTextSegments=(text:string,ranges:SubtitleEmphasisRange[]|undefined):SubtitleTextSegment[]=>{
  const normalized=normalizeSubtitleEmphasisRanges(text,ranges);
  if(!normalized)return[{text,emphasized:false}];
  const segments:SubtitleTextSegment[]=[];
  let cursor=0;
  for(const range of normalized){
    if(range.start>cursor)segments.push({text:text.slice(cursor,range.start),emphasized:false});
    segments.push({text:text.slice(range.start,range.end),color:range.color,emphasized:range.enabled});
    cursor=range.end;
  }
  if(cursor<text.length)segments.push({text:text.slice(cursor),emphasized:false});
  return segments;
};

export const subtitleEmphasisEditorValue=(item:SubtitleTimelineItem)=>{
  const range=normalizeSubtitleEmphasisRanges(item.text,item.emphasisRanges)?.[0];
  return{ text:range?item.text.slice(range.start,range.end):"",color:range?.color??DEFAULT_SUBTITLE_EMPHASIS_COLOR,enabled:range?.enabled??false };
};

export const replaceSubtitleEmphasis=(item:SubtitleTimelineItem,input:{text:string;color:string;enabled:boolean}):SubtitleEmphasisRange[]|undefined=>{
  const text=input.text;
  const start=text?item.text.indexOf(text):-1;
  if(start<0)return undefined;
  return[{start,end:start+text.length,color:validColor(input.color),enabled:input.enabled}];
};
