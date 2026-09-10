import type {
  EditorState,
  EditorTrack,
  TimelineItem,
} from "./editorTypes";

export const selectItemById = (
  state: EditorState,
  itemId: string,
): TimelineItem | undefined =>
  state.project.items.find((item) => item.id === itemId);

export const selectTrackById = (
  state: EditorState,
  trackId: string,
): EditorTrack | undefined =>
  state.project.tracks.find((track) => track.id === trackId);

export const selectItemsForTrack = (
  state: EditorState,
  trackId: string,
): TimelineItem[] =>
  state.project.items
    .filter((item) => item.trackId === trackId)
    .slice()
    .sort(
      (left, right) =>
        left.timelineStartFrame - right.timelineStartFrame ||
        (left.zIndex ?? 0) - (right.zIndex ?? 0) ||
        left.id.localeCompare(right.id),
    );

export const selectSelectedItems = (
  state: EditorState,
): TimelineItem[] => {
  const selected = new Set(state.selectedItemIds);
  return state.project.items.filter((item) => selected.has(item.id));
};

export const selectItemsAtFrame = (
  state: EditorState,
  targetFrame: number,
): TimelineItem[] => {
  const frame = Math.max(0, Math.round(targetFrame));
  return state.project.items.filter(
    (item) =>
      item.enabled &&
      frame >= item.timelineStartFrame &&
      frame < item.timelineStartFrame + item.durationInFrames,
  );
};

export const selectContentEndFrame = (state: EditorState): number =>
  state.project.items.reduce(
    (end, item) =>
      Math.max(end, item.timelineStartFrame + item.durationInFrames),
    0,
  );

export const selectEffectiveDurationInFrames = (
  state: EditorState,
): number =>
  Math.max(
    state.project.project.durationInFrames,
    selectContentEndFrame(state),
  );

export const framesToSeconds = (
  frames: number,
  fps: number,
): number => frames / Math.max(1, fps);
