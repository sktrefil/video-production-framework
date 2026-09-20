import {staticFile} from "remotion";

const ABSOLUTE_MEDIA_PATTERN=/^(?:https?:|data:|blob:)/i;
// staticFile() owns URL encoding. Encoding here as well turns spaces into
// %2520 and makes browser media requests fail.
export const resolveEditorMediaSrc=(src:string):string=>ABSOLUTE_MEDIA_PATTERN.test(src)?src:staticFile(src.replace(/^\/+/,""));
