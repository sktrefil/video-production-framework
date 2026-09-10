import type {EditProject} from "../editorTypes";

export const TIMELINE_LABEL_WIDTH = 148;
export const BASE_PIXELS_PER_FRAME = 2;

export const clampTimelineFrame = (
  value: number,
  durationInFrames: number,
): number =>
  Math.min(
    Math.max(0, Math.round(value)),
    Math.max(0, Math.round(durationInFrames) - 1),
  );

export const frameToPixels = (
  frame: number,
  pixelsPerFrame: number,
): number => frame * pixelsPerFrame;

export const pixelsToFrame = (
  pixels: number,
  pixelsPerFrame: number,
): number =>
  Math.round(pixels / Math.max(0.0001, pixelsPerFrame));

export const formatFrameTimecode = (
  frame: number,
  fps: number,
): string => {
  const nominalFps = Math.max(1, Math.round(fps));
  const safeFrame = Math.max(0, Math.round(frame));
  const frames = safeFrame % nominalFps;
  const totalSeconds = Math.floor(safeFrame / nominalFps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return [hours, minutes, seconds, frames]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

export const getRulerStepFrames = (
  pixelsPerFrame: number,
  fps: number,
  minimumPixels = 84,
): number => {
  const safePpf = Math.max(0.0001, pixelsPerFrame);
  const nominalFps = Math.max(1, Math.round(fps));
  const candidates = [
    1,
    2,
    5,
    10,
    15,
    nominalFps,
    nominalFps * 2,
    nominalFps * 5,
    nominalFps * 10,
    nominalFps * 15,
    nominalFps * 30,
    nominalFps * 60,
  ]
    .filter((value, index, array) => value > 0 && array.indexOf(value) === index)
    .sort((left, right) => left - right);

  return (
    candidates.find((candidate) => candidate * safePpf >= minimumPixels) ??
    candidates[candidates.length - 1] ??
    nominalFps
  );
};

export const getSnapCandidates = (
  project: EditProject,
  excludeItemId?: string,
): number[] => {
  const candidates = new Set<number>([
    0,
    Math.max(0, project.project.durationInFrames),
  ]);

  for (const item of project.items) {
    if (!item.enabled || item.id === excludeItemId) {
      continue;
    }
    candidates.add(item.timelineStartFrame);
    candidates.add(item.timelineStartFrame + item.durationInFrames);
  }

  return [...candidates].sort((left, right) => left - right);
};

export const snapFrameToCandidates = (
  targetFrame: number,
  candidates: number[],
  toleranceFrames: number,
): number => {
  const safeTarget = Math.max(0, Math.round(targetFrame));
  const tolerance = Math.max(0, Math.round(toleranceFrames));
  let best = safeTarget;
  let bestDistance = tolerance + 1;

  for (const candidate of candidates) {
    const rounded = Math.max(0, Math.round(candidate));
    const distance = Math.abs(rounded - safeTarget);
    if (
      distance <= tolerance &&
      (distance < bestDistance || (distance === bestDistance && rounded < best))
    ) {
      best = rounded;
      bestDistance = distance;
    }
  }

  return best;
};

export const timelinePixelsPerFrame = (zoom: number): number =>
  BASE_PIXELS_PER_FRAME * Math.max(0.05, zoom);

export const snapMovedItemStart = (
  rawStartFrame: number,
  itemDurationInFrames: number,
  candidates: number[],
  toleranceFrames: number,
): number => {
  const start = Math.max(0, Math.round(rawStartFrame));
  const duration = Math.max(1, Math.round(itemDurationInFrames));
  const end = start + duration;
  const tolerance = Math.max(0, Math.round(toleranceFrames));

  let bestStart = start;
  let bestDistance = tolerance + 1;

  for (const candidate of candidates) {
    const rounded = Math.max(0, Math.round(candidate));

    const startDistance = Math.abs(rounded - start);
    if (
      startDistance <= tolerance &&
      (startDistance < bestDistance ||
        (startDistance === bestDistance && rounded < bestStart))
    ) {
      bestStart = rounded;
      bestDistance = startDistance;
    }

    const endDistance = Math.abs(rounded - end);
    const endAlignedStart = Math.max(0, rounded - duration);
    if (
      endDistance <= tolerance &&
      (endDistance < bestDistance ||
        (endDistance === bestDistance && endAlignedStart < bestStart))
    ) {
      bestStart = endAlignedStart;
      bestDistance = endDistance;
    }
  }

  return bestStart;
};
