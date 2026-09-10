import {staticFile} from "remotion";

const ABSOLUTE_MEDIA_PATTERN=/^(?:https?:|data:|blob:)/i;
export const resolveEditorMediaSrc=(src:string):string=>ABSOLUTE_MEDIA_PATTERN.test(src)?src:staticFile(src.replace(/^\/+/,""));
