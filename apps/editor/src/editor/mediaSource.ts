import {staticFile} from "remotion";

const ABSOLUTE_MEDIA_PATTERN = /^(?:https?:|data:|blob:)/i;

export const resolveEditorMediaSrc = (src: string): string => {
  if (ABSOLUTE_MEDIA_PATTERN.test(src)) {
    return src;
  }

  return staticFile(src.replace(/^\/+/, ""));
};
