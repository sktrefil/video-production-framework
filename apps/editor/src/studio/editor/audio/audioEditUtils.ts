import type {EditorState} from "../editorTypes";

export const createSplitItemId = (
  state: EditorState,
  itemId: string,
  splitFrame: number,
): string => {
  const base = `${itemId}-split-${Math.max(0, Math.round(splitFrame))}`;
  const used = new Set(state.project.items.map((item) => item.id));
  if (!used.has(base)) {
    return base;
  }

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
};

export const canSplitItemAtFrame = (
  state: EditorState,
  itemId: string,
  frame: number,
): boolean => {
  const item = state.project.items.find(
    (candidate) => candidate.id === itemId,
  );
  if (!item || item.type !== "TTS" || item.locked) {
    return false;
  }

  return (
    frame > item.timelineStartFrame &&
    frame < item.timelineStartFrame + item.durationInFrames
  );
};
