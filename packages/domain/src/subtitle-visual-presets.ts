export type SubtitleVisualProfile={width:number;height:number};
export type SubtitleVisualStyle={x:number;y:number;width:number;fontFamily:string;fontSize:number;fontWeight:number;color:string;strokeColor:string;strokeWidth:number;textAlign:"center";lineHeight:number;maxLines:number;backgroundEnabled:false;backgroundColor:string;backgroundOpacity:number};
export type HeaderTextVisualStyle={x:number;y:number;width:number;fontFamily:string;fontSize:number;fontWeight:number;color:string;strokeColor:string;strokeWidth:number;textAlign:"center";lineHeight:number;maxLines:number};
export type HeaderPanelVisualStyle={x:number;y:number;width:number;height:number;backgroundColor:string};

export const VPF_SUBTITLE_VISUAL_TOKENS={
  fontFamily:"VPF Noto Sans KR",
  paper:"#FFFDF7",
  ink:"#17130F",
  gold:"#D79A32",
  cinematicLineHeight:1.24,
  standardShadow:"0 2px 4px rgba(0,0,0,0.95)",
  cinematicShadow:"0 3px 8px rgba(0,0,0,0.98), 0 1px 2px rgba(0,0,0,1)"
} as const;

// Existing canonical look. Kept as a named generic preset while the cinematic
// preset is introduced, so callers never need Roman IX-specific constants.
export const standardSubtitleStyle=(profile:SubtitleVisualProfile):SubtitleVisualStyle=>({
  x:Math.round(profile.width*.5),y:Math.round(profile.height*.859375),width:Math.round(profile.width*(5/6)),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)/12),fontWeight:700,color:"#FFFFFF",strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:4,textAlign:"center",lineHeight:1.16,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.4
});

export const cinematicShortsSubtitleStyle=(profile:SubtitleVisualProfile):SubtitleVisualStyle=>({
  x:Math.round(profile.width*.5),y:Math.round(profile.height*.92),width:Math.round(profile.width*.9),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)/10.8),fontWeight:800,color:VPF_SUBTITLE_VISUAL_TOKENS.paper,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:6,textAlign:"center",lineHeight:VPF_SUBTITLE_VISUAL_TOKENS.cinematicLineHeight,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.4
});

export const cinematicLongformSubtitleStyle=(profile:SubtitleVisualProfile):SubtitleVisualStyle=>({
  x:Math.round(profile.width*.5),y:Math.round(profile.height*.885),width:Math.round(profile.width*.82),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)/22),fontWeight:750,color:VPF_SUBTITLE_VISUAL_TOKENS.paper,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:3,textAlign:"center",lineHeight:1.22,maxLines:2,backgroundEnabled:false,backgroundColor:"#000000",backgroundOpacity:.3
});

export const cinematicSubtitleStyleForFormat=(
  profile:SubtitleVisualProfile,
  format:"LONGFORM"|"SHORTFORM"
):SubtitleVisualStyle=>format==="LONGFORM"
  ? cinematicLongformSubtitleStyle(profile)
  : cinematicShortsSubtitleStyle(profile);

export type CinematicHeaderVisuals={title:HeaderTextVisualStyle;info:HeaderTextVisualStyle;panel:HeaderPanelVisualStyle;goldRule:HeaderPanelVisualStyle};
export type CinematicShortsHeaderVisuals=CinematicHeaderVisuals;

// Shared 9:16 documentary header: dark information panel, gold rule, gold
// subject title, and white scene-specific supporting information.
export const cinematicShortsHeaderVisuals=(profile:SubtitleVisualProfile):CinematicShortsHeaderVisuals=>({
  title:{x:Math.round(profile.width*.5),y:Math.round(profile.height*.064),width:Math.round(profile.width*.84),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)*.052),fontWeight:800,color:VPF_SUBTITLE_VISUAL_TOKENS.gold,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:3,textAlign:"center",lineHeight:1.1,maxLines:2},
  info:{x:Math.round(profile.width*.5),y:Math.round(profile.height*.116),width:Math.round(profile.width*.84),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)*.029),fontWeight:700,color:VPF_SUBTITLE_VISUAL_TOKENS.paper,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:2,textAlign:"center",lineHeight:1.1,maxLines:1},
  panel:{x:Math.round(profile.width*.035),y:Math.round(profile.height*.018),width:Math.round(profile.width*.93),height:Math.round(profile.height*.15),backgroundColor:"rgba(7,10,14,0.88)"},
  goldRule:{x:Math.round(profile.width*.045),y:Math.round(profile.height*.025),width:Math.round(profile.width*.91),height:Math.max(3,Math.round(profile.height*.002)),backgroundColor:VPF_SUBTITLE_VISUAL_TOKENS.gold}
});

export type SubtitleTextFitInput=Pick<SubtitleVisualStyle,"width"|"strokeWidth"|"fontSize"|"maxLines">&{text:string};
const subtitleGlyphUnits=(text:string)=>Array.from(text).reduce((units,character)=>{
  if(/\s/u.test(character))return units+.35;
  if(/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af]/u.test(character))return units+1.08;
  if(/[A-Z0-9]/u.test(character))return units+.68;
  if(/[a-z]/u.test(character))return units+.56;
  return units+.52;
},0);

// Ensures a long narration cue remains complete within the standard two-line
// subtitle area instead of being replaced by a browser ellipsis.
export const cinematicShortsSubtitleFontSize=(input:SubtitleTextFitInput):number=>{
  const usableWidth=Math.max(1,input.width-input.strokeWidth*6);
  const capacity=Math.max(1,subtitleGlyphUnits(input.text)*1.12);
  const fitted=Math.floor((usableWidth*Math.max(1,input.maxLines))/capacity);
  return Math.min(input.fontSize,Math.max(48,fitted));
};


export const cinematicLongformHeaderVisuals=(profile:SubtitleVisualProfile):CinematicHeaderVisuals=>({
  title:{x:Math.round(profile.width*.5),y:Math.round(profile.height*.055),width:Math.round(profile.width*.72),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)*.038),fontWeight:800,color:VPF_SUBTITLE_VISUAL_TOKENS.gold,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:2,textAlign:"center",lineHeight:1.08,maxLines:2},
  info:{x:Math.round(profile.width*.5),y:Math.round(profile.height*.092),width:Math.round(profile.width*.72),fontFamily:VPF_SUBTITLE_VISUAL_TOKENS.fontFamily,fontSize:Math.round(Math.min(profile.width,profile.height)*.022),fontWeight:700,color:VPF_SUBTITLE_VISUAL_TOKENS.paper,strokeColor:VPF_SUBTITLE_VISUAL_TOKENS.ink,strokeWidth:1,textAlign:"center",lineHeight:1.08,maxLines:1},
  panel:{x:Math.round(profile.width*.14),y:Math.round(profile.height*.015),width:Math.round(profile.width*.72),height:Math.round(profile.height*.105),backgroundColor:"rgba(7,10,14,0.78)"},
  goldRule:{x:Math.round(profile.width*.16),y:Math.round(profile.height*.021),width:Math.round(profile.width*.68),height:Math.max(2,Math.round(profile.height*.002)),backgroundColor:VPF_SUBTITLE_VISUAL_TOKENS.gold}
});

export const cinematicHeaderVisualsForFormat=(
  profile:SubtitleVisualProfile,
  format:"LONGFORM"|"SHORTFORM"
):CinematicHeaderVisuals=>format==="LONGFORM"
  ? cinematicLongformHeaderVisuals(profile)
  : cinematicShortsHeaderVisuals(profile);
