import type {
  EditProject,
  EditorTrack,
  GraphicTimelineItem,
  GraphicType,
  TextRole,
  TextTimelineItem,
} from "../editorTypes";

export type OverlayPreset =
  | "TOP_TITLE"
  | "LOWER_INFO"
  | "TOP_BLUR"
  | "BOTTOM_BLUR"
  | "GRADIENT"
  | "PANEL"
  | "DIM_LAYER";

const nextUniqueId = (
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

const nextTrackId = (
  project: EditProject,
  preferred: string,
): string => {
  const used = new Set(project.tracks.map((track) => track.id));
  if (!used.has(preferred)) {
    return preferred;
  }
  let index = 2;
  while (used.has(`${preferred}${index}`)) {
    index += 1;
  }
  return `${preferred}${index}`;
};

export const planOverlayTracks = (
  project: EditProject,
): {
  textTrackId: string;
  graphicTrackId: string;
  tracksToAdd: EditorTrack[];
} => {
  const existingText = project.tracks
    .filter((track) => track.type === "TEXT")
    .sort((left, right) => left.order - right.order)[0];
  const existingGraphic = project.tracks
    .filter((track) => track.type === "GRAPHIC")
    .sort((left, right) => left.order - right.order)[0];

  const maxOrder = project.tracks.reduce(
    (maximum, track) => Math.max(maximum, track.order),
    -1,
  );

  let graphicOrder = existingGraphic?.order;
  let textOrder = existingText?.order;

  if (graphicOrder === undefined && textOrder === undefined) {
    graphicOrder = maxOrder + 1;
    textOrder = maxOrder + 2;
  } else if (graphicOrder === undefined && textOrder !== undefined) {
    graphicOrder = textOrder - 0.5;
  } else if (textOrder === undefined && graphicOrder !== undefined) {
    textOrder = graphicOrder + 0.5;
  }

  const graphicTrackId =
    existingGraphic?.id ?? nextTrackId(project, "G_STUDIO");
  const textTrackId = existingText?.id ?? nextTrackId(project, "T_STUDIO");
  const tracksToAdd: EditorTrack[] = [];

  if (!existingGraphic) {
    tracksToAdd.push({
      id: graphicTrackId,
      type: "GRAPHIC",
      name: "Studio Graphics",
      enabled: true,
      locked: false,
      order: graphicOrder ?? maxOrder + 1,
    });
  }
  if (!existingText) {
    tracksToAdd.push({
      id: textTrackId,
      type: "TEXT",
      name: "Studio Text",
      enabled: true,
      locked: false,
      order: textOrder ?? maxOrder + 2,
    });
  }

  return {textTrackId, graphicTrackId, tracksToAdd};
};

const textBase = ({
  project,
  trackId,
  startFrame,
  textRole,
  idPrefix,
  text,
  y,
  fontSize,
  width,
}: {
  project: EditProject;
  trackId: string;
  startFrame: number;
  textRole: TextRole;
  idPrefix: string;
  text: string;
  y: number;
  fontSize: number;
  width: number;
}): TextTimelineItem => ({
  id: nextUniqueId(project, idPrefix),
  type: "TEXT",
  trackId,
  timelineStartFrame: startFrame,
  durationInFrames: Math.max(
    1,
    Math.min(
      Math.round(project.project.fps * 5),
      project.project.durationInFrames - startFrame,
    ),
  ),
  enabled: true,
  locked: false,
  zIndex: 100,
  text,
  textRole,
  x: project.project.width / 2,
  y,
  width,
  fontFamily: "VITRO",
  fontSize,
  fontWeight: 800,
  color: "#FFFDF7",
  strokeColor: "#17130F",
  strokeWidth: 3,
  textAlign: "center",
  lineHeight: 1.12,
  maxLines: 2,
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.35,
});

const graphicBase = ({
  project,
  trackId,
  startFrame,
  idPrefix,
  graphicType,
  x,
  y,
  width,
  height,
  opacity,
  blurPx,
  backgroundColor,
  borderRadius,
}: {
  project: EditProject;
  trackId: string;
  startFrame: number;
  idPrefix: string;
  graphicType: GraphicType;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blurPx: number;
  backgroundColor: string;
  borderRadius: number;
}): GraphicTimelineItem => ({
  id: nextUniqueId(project, idPrefix),
  type: "GRAPHIC",
  trackId,
  timelineStartFrame: startFrame,
  durationInFrames: Math.max(
    1,
    project.project.durationInFrames - startFrame,
  ),
  enabled: true,
  locked: false,
  zIndex: 20,
  graphicType,
  x,
  y,
  width,
  height,
  opacity,
  blurPx,
  backgroundColor,
  borderRadius,
});

export const createOverlayPreset = ({
  project,
  preset,
  startFrame,
  textTrackId,
  graphicTrackId,
}: {
  project: EditProject;
  preset: OverlayPreset;
  startFrame: number;
  textTrackId: string;
  graphicTrackId: string;
}): TextTimelineItem | GraphicTimelineItem => {
  const start = Math.max(
    0,
    Math.min(
      Math.round(startFrame),
      Math.max(0, project.project.durationInFrames - 1),
    ),
  );
  const width = project.project.width;
  const height = project.project.height;

  if (preset === "TOP_TITLE") {
    return textBase({
      project,
      trackId: textTrackId,
      startFrame: start,
      textRole: "TOP_TITLE",
      idPrefix: "top-title",
      text: "상단 제목",
      y: height * 0.105,
      fontSize: Math.round(width * 0.062),
      width: width * 0.86,
    });
  }

  if (preset === "LOWER_INFO") {
    return textBase({
      project,
      trackId: textTrackId,
      startFrame: start,
      textRole: "LOWER_THIRD",
      idPrefix: "lower-info",
      text: "하단 정보",
      y: height * 0.79,
      fontSize: Math.round(width * 0.045),
      width: width * 0.82,
    });
  }

  if (preset === "TOP_BLUR") {
    return graphicBase({
      project,
      trackId: graphicTrackId,
      startFrame: start,
      idPrefix: "top-blur",
      graphicType: "BLUR_PANEL",
      x: 0,
      y: 0,
      width,
      height: height * 0.22,
      opacity: 0.48,
      blurPx: 28,
      backgroundColor: "rgba(12,15,18,0.26)",
      borderRadius: 0,
    });
  }

  if (preset === "BOTTOM_BLUR") {
    return graphicBase({
      project,
      trackId: graphicTrackId,
      startFrame: start,
      idPrefix: "bottom-blur",
      graphicType: "BLUR_PANEL",
      x: 0,
      y: height * 0.75,
      width,
      height: height * 0.25,
      opacity: 0.5,
      blurPx: 30,
      backgroundColor: "rgba(12,15,18,0.3)",
      borderRadius: 0,
    });
  }

  if (preset === "GRADIENT") {
    return {
      ...graphicBase({
        project,
        trackId: graphicTrackId,
        startFrame: start,
        idPrefix: "gradient",
        graphicType: "GRADIENT",
        x: 0,
        y: height * 0.68,
        width,
        height: height * 0.32,
        opacity: 1,
        blurPx: 0,
        backgroundColor:
          "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 100%)",
        borderRadius: 0,
      }),
      gradientStartColor: "rgba(0,0,0,0)",
      gradientEndColor: "rgba(0,0,0,0.78)",
      gradientAngleDeg: 180,
    };
  }

  if (preset === "DIM_LAYER") {
    return graphicBase({
      project,
      trackId: graphicTrackId,
      startFrame: start,
      idPrefix: "dim-layer",
      graphicType: "DIM_LAYER",
      x: 0,
      y: 0,
      width,
      height,
      opacity: 0.28,
      blurPx: 0,
      backgroundColor: "#000000",
      borderRadius: 0,
    });
  }

  return graphicBase({
    project,
    trackId: graphicTrackId,
    startFrame: start,
    idPrefix: "panel",
    graphicType: "SOLID_PANEL",
    x: width * 0.08,
    y: height * 0.72,
    width: width * 0.84,
    height: height * 0.14,
    opacity: 0.72,
    blurPx: 0,
    backgroundColor: "#17130F",
    borderRadius: 24,
  });
};
