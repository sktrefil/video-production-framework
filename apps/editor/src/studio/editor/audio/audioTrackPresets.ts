import type {
  AudioTimelineItem,
  EditProject,
  EditorTrack,
} from "../editorTypes";

const uniqueTrackId = (
  project: EditProject,
  preferred: string,
): string => {
  const used = new Set(project.tracks.map((track) => track.id));
  if (!used.has(preferred)) {
    return preferred;
  }
  let index = 2;
  while (used.has(`${preferred}_${index}`)) {
    index += 1;
  }
  return `${preferred}_${index}`;
};

const uniqueItemId = (
  project: EditProject,
  prefix: string,
): string => {
  const used = new Set(project.items.map((item) => item.id));
  let index = 1;
  while (used.has(`${prefix}-${String(index).padStart(2, "0")}`)) {
    index += 1;
  }
  return `${prefix}-${String(index).padStart(2, "0")}`;
};

export const planAudioTracks = (
  project: EditProject,
): {
  bgmTrackId: string;
  sfxTrackId: string;
  tracksToAdd: EditorTrack[];
} => {
  const audioTracks = project.tracks
    .filter((track) => track.type === "AUDIO")
    .slice()
    .sort((left, right) => left.order - right.order);
  const existingBgm = audioTracks.find((track) => /\bBGM\b/i.test(track.name));
  const existingSfx = audioTracks.find((track) => /\bSFX\b/i.test(track.name));
  const maxOrder = project.tracks.reduce(
    (maximum, track) => Math.max(maximum, track.order),
    -1,
  );

  const bgmTrackId =
    existingBgm?.id ?? uniqueTrackId(project, "A3_BGM");
  const sfxTrackId =
    existingSfx?.id ?? uniqueTrackId(project, "A4_SFX");
  const tracksToAdd: EditorTrack[] = [];

  if (!existingBgm) {
    tracksToAdd.push({
      id: bgmTrackId,
      type: "AUDIO",
      name: "BGM",
      enabled: true,
      locked: false,
      order: maxOrder + 1,
    });
  }
  if (!existingSfx) {
    tracksToAdd.push({
      id: sfxTrackId,
      type: "AUDIO",
      name: "SFX",
      enabled: true,
      locked: false,
      order: maxOrder + 2,
    });
  }

  return {bgmTrackId, sfxTrackId, tracksToAdd};
};

export const createBgmTimelineItem = ({
  project,
  trackId,
  src,
  startFrame,
  sourceAssetDurationInFrames,
  volume,
}: {
  project: EditProject;
  trackId: string;
  src: string;
  startFrame: number;
  sourceAssetDurationInFrames: number;
  volume: number;
}): AudioTimelineItem => {
  const start = Math.max(
    0,
    Math.min(
      Math.round(startFrame),
      Math.max(0, project.project.durationInFrames - 1),
    ),
  );
  const assetFrames = Math.max(1, Math.round(sourceAssetDurationInFrames));
  return {
    id: uniqueItemId(project, "bgm"),
    type: "BGM",
    trackId,
    timelineStartFrame: start,
    durationInFrames: Math.max(
      1,
      project.project.durationInFrames - start,
    ),
    enabled: true,
    locked: false,
    src,
    sourceStartFrame: 0,
    sourceDurationInFrames: assetFrames,
    sourceAssetDurationInFrames: assetFrames,
    volume: Math.max(0, volume),
    muted: false,
    fadeInFrames: Math.min(
      Math.round(project.project.fps * 0.5),
      Math.max(1, project.project.durationInFrames - start),
    ),
    fadeOutFrames: Math.min(
      Math.round(project.project.fps * 1.2),
      Math.max(1, project.project.durationInFrames - start),
    ),
    loop: true,
  };
};

export const createSfxTimelineItem = ({
  project,
  trackId,
  src,
  startFrame,
  sourceAssetDurationInFrames,
  volume,
  preferredDurationInFrames,
}: {
  project: EditProject;
  trackId: string;
  src: string;
  startFrame: number;
  sourceAssetDurationInFrames: number;
  volume: number;
  preferredDurationInFrames?: number;
}): AudioTimelineItem => {
  const start = Math.max(
    0,
    Math.min(
      Math.round(startFrame),
      Math.max(0, project.project.durationInFrames - 1),
    ),
  );
  const assetFrames = Math.max(1, Math.round(sourceAssetDurationInFrames));
  const remaining = Math.max(1, project.project.durationInFrames - start);
  const duration = Math.min(
    remaining,
    Math.max(
      1,
      Math.round(preferredDurationInFrames ?? assetFrames),
    ),
  );

  return {
    id: uniqueItemId(project, "sfx"),
    type: "SFX",
    trackId,
    timelineStartFrame: start,
    durationInFrames: duration,
    enabled: true,
    locked: false,
    src,
    sourceStartFrame: 0,
    sourceDurationInFrames: Math.min(assetFrames, duration),
    sourceAssetDurationInFrames: assetFrames,
    volume: Math.max(0, volume),
    muted: false,
    fadeInFrames: 0,
    fadeOutFrames: Math.min(
      Math.round(project.project.fps * 0.08),
      duration,
    ),
    loop: false,
  };
};

export const createDuplicateAudioId = (
  project: EditProject,
  item: AudioTimelineItem,
): string => {
  const base = `${item.id}-copy`;
  const used = new Set(project.items.map((entry) => entry.id));
  if (!used.has(base)) {
    return base;
  }
  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
};
