import type {
  EditorAction,
  GraphicStylePatch,
  SubtitleStylePatch,
  TextOverlayStylePatch,
  TransformPatch,
} from "./editorActions";
import type {
  AudioTimelineItem,
  EditProject,
  EditorState,
  EditorTrack,
  ImageMotionSpec,
  TimelineItem,
  TrackType,
  VideoTimelineItem,
} from "./editorTypes";

const MIN_DURATION_FRAMES = 1;
const MIN_PLAYBACK_RATE = 0.0625;
const MAX_PLAYBACK_RATE = 16;
const MIN_TIMELINE_ZOOM = 0.05;
const MAX_TIMELINE_ZOOM = 100;

const finiteOr = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const frame = (value: number, fallback = 0) =>
  Math.max(0, Math.round(finiteOr(value, fallback)));

const duration = (value: number, fallback = MIN_DURATION_FRAMES) =>
  Math.max(MIN_DURATION_FRAMES, Math.round(finiteOr(value, fallback)));

const volume = (value: number, fallback = 1) =>
  Math.max(0, finiteOr(value, fallback));

const playbackRate = (value: number, fallback = 1) =>
  Math.min(
    MAX_PLAYBACK_RATE,
    Math.max(MIN_PLAYBACK_RATE, finiteOr(value, fallback)),
  );

const normalizeImageMotion = (
  motion: ImageMotionSpec | undefined,
): ImageMotionSpec | undefined => {
  if (!motion || motion.kind !== "TRANSFORM") {
    return undefined;
  }

  const normalizeTransform = (
    transform: ImageMotionSpec["from"],
  ): ImageMotionSpec["from"] => ({
    x: finiteOr(transform.x, 0),
    y: finiteOr(transform.y, 0),
    scale: Math.max(0.001, finiteOr(transform.scale, 1)),
    rotation: finiteOr(transform.rotation, 0),
    opacity: Math.min(1, Math.max(0, finiteOr(transform.opacity, 1))),
  });

  return {
    kind: "TRANSFORM",
    from: normalizeTransform(motion.from),
    to: normalizeTransform(motion.to),
    easing: motion.easing === "LINEAR" ? "LINEAR" : "EASE_IN_OUT",
  };
};

const isAudioItem = (item: TimelineItem): item is AudioTimelineItem =>
  item.type === "TTS" ||
  item.type === "CLIP_AUDIO" ||
  item.type === "BGM" ||
  item.type === "SFX";

const isVideoItem = (item: TimelineItem): item is VideoTimelineItem =>
  item.type === "VIDEO";

const isMediaItem = (
  item: TimelineItem,
): item is AudioTimelineItem | VideoTimelineItem =>
  isAudioItem(item) || isVideoItem(item);

const isLoopingAudioItem = (
  item: TimelineItem,
): item is AudioTimelineItem =>
  isAudioItem(item) && item.loop === true;

const sourceFramesPerTimelineFrame = (item: TimelineItem) =>
  isVideoItem(item) ? item.playbackRate : 1;

const trackTypeForItem = (item: TimelineItem): TrackType => {
  if (item.type === "VIDEO" || item.type === "IMAGE") {
    return "VIDEO";
  }
  if (isAudioItem(item)) {
    return "AUDIO";
  }
  if (item.type === "SUBTITLE" || item.type === "TEXT") {
    return "TEXT";
  }
  return "GRAPHIC";
};

const findTrack = (tracks: EditorTrack[], trackId: string) =>
  tracks.find((track) => track.id === trackId);

const canUseTrack = (
  tracks: EditorTrack[],
  item: TimelineItem,
  trackId: string,
) => {
  const target = findTrack(tracks, trackId);
  return target ? target.type === trackTypeForItem(item) : false;
};

const normalizeItem = (item: TimelineItem): TimelineItem => {
  const timelineStartFrame = frame(item.timelineStartFrame);
  const durationInFrames = duration(item.durationInFrames);
  const enabled = item.enabled !== false;
  const locked = item.locked === true;

  if (isVideoItem(item)) {
    const assetDuration = duration(item.sourceAssetDurationInFrames);
    const start = Math.min(
      frame(item.sourceStartFrame),
      Math.max(0, assetDuration - 1),
    );
    const available = Math.max(1, assetDuration - start);
    return {
      ...item,
      timelineStartFrame,
      durationInFrames,
      enabled,
      locked,
      sourceStartFrame: start,
      sourceAssetDurationInFrames: assetDuration,
      sourceDurationInFrames: Math.min(
        duration(item.sourceDurationInFrames),
        available,
      ),
      playbackRate: playbackRate(item.playbackRate),
      volume: volume(item.volume),
      scale: Math.max(0.001, finiteOr(item.scale, 1)),
      rotation: finiteOr(item.rotation, 0),
      opacity: Math.min(1, Math.max(0, finiteOr(item.opacity, 1))),
      x: finiteOr(item.x, 0),
      y: finiteOr(item.y, 0),
    };
  }

  if (isAudioItem(item)) {
    const assetDuration = duration(item.sourceAssetDurationInFrames);
    const start = Math.min(
      frame(item.sourceStartFrame),
      Math.max(0, assetDuration - 1),
    );
    const available = Math.max(1, assetDuration - start);
    return {
      ...item,
      timelineStartFrame,
      durationInFrames,
      enabled,
      locked,
      sourceStartFrame: start,
      sourceAssetDurationInFrames: assetDuration,
      sourceDurationInFrames: Math.min(
        duration(item.sourceDurationInFrames),
        available,
      ),
      volume: volume(item.volume),
      fadeInFrames: Math.min(
        durationInFrames,
        frame(item.fadeInFrames),
      ),
      fadeOutFrames: Math.min(
        durationInFrames,
        frame(item.fadeOutFrames),
      ),
      muted: item.muted === true,
      loop: item.loop === true,
    };
  }

  if (item.type === "IMAGE") {
    return {
      ...item,
      timelineStartFrame,
      durationInFrames,
      enabled,
      locked,
      x: finiteOr(item.x, 0),
      y: finiteOr(item.y, 0),
      scale: Math.max(0.001, finiteOr(item.scale, 1)),
      rotation: finiteOr(item.rotation, 0),
      opacity: Math.min(1, Math.max(0, finiteOr(item.opacity, 1))),
      motion: normalizeImageMotion(item.motion),
    };
  }

  if (item.type === "SUBTITLE" || item.type === "TEXT") {
    return {
      ...item,
      timelineStartFrame,
      durationInFrames,
      enabled,
      locked,
      x: finiteOr(item.x, 0),
      y: finiteOr(item.y, 0),
      width: Math.max(1, finiteOr(item.width, 1)),
      fontSize: Math.max(1, finiteOr(item.fontSize, 1)),
      fontWeight: Math.max(1, finiteOr(item.fontWeight, 400)),
      strokeWidth: Math.max(0, finiteOr(item.strokeWidth, 0)),
      lineHeight: Math.max(0.1, finiteOr(item.lineHeight, 1)),
      maxLines: Math.max(1, Math.round(finiteOr(item.maxLines, 1))),
      backgroundOpacity: Math.min(
        1,
        Math.max(0, finiteOr(item.backgroundOpacity, 0)),
      ),
    };
  }

  return {
    ...item,
    timelineStartFrame,
    durationInFrames,
    enabled,
    locked,
    x: finiteOr(item.x, 0),
    y: finiteOr(item.y, 0),
    width: Math.max(1, finiteOr(item.width, 1)),
    height: Math.max(1, finiteOr(item.height, 1)),
    opacity: Math.min(1, Math.max(0, finiteOr(item.opacity, 1))),
    blurPx: Math.max(0, finiteOr(item.blurPx, 0)),
    borderRadius: Math.max(0, finiteOr(item.borderRadius, 0)),
  };
};

const normalizeProject = (project: EditProject): EditProject => ({
  schemaVersion: 1,
  project: {
    ...project.project,
    fps: Math.max(1, finiteOr(project.project.fps, 30)),
    width: Math.max(1, Math.round(finiteOr(project.project.width, 1080))),
    height: Math.max(1, Math.round(finiteOr(project.project.height, 1920))),
    durationInFrames: duration(project.project.durationInFrames),
  },
  tracks: project.tracks
    .map((track) => ({...track}))
    .sort((left, right) => left.order - right.order),
  items: project.items.map(normalizeItem),
  settings: {
    snapEnabled: project.settings.snapEnabled !== false,
    snapToleranceFrames: frame(project.settings.snapToleranceFrames, 4),
    timelineZoom: Math.min(
      MAX_TIMELINE_ZOOM,
      Math.max(
        MIN_TIMELINE_ZOOM,
        finiteOr(project.settings.timelineZoom, 1),
      ),
    ),
    masterVolume: volume(project.settings.masterVolume),
  },
});

export const createEmptyEditProject = (): EditProject => ({
  schemaVersion: 1,
  project: {
    id: "untitled",
    name: "Untitled Edit",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 1,
  },
  tracks: [],
  items: [],
  settings: {
    snapEnabled: true,
    snapToleranceFrames: 4,
    timelineZoom: 1,
    masterVolume: 1,
  },
});

export const createEditorState = (
  project: EditProject = createEmptyEditProject(),
): EditorState => {
  const normalized = normalizeProject(project);
  return {
    project: normalized,
    selectedItemIds: [],
    playheadFrame: 0,
    history: {
      past: [],
      future: [],
      transactionBase: null,
    },
    savedProjectJson: JSON.stringify(normalized),
    dirty: false,
  };
};

const replaceItem = (
  state: EditorState,
  itemId: string,
  update: (item: TimelineItem) => TimelineItem,
): EditorState => {
  const index = state.project.items.findIndex((item) => item.id === itemId);
  if (index === -1 || state.project.items[index].locked) {
    return state;
  }

  const current = state.project.items[index];
  const updated = update(current);
  if (updated === current) {
    return state;
  }

  const next = normalizeItem(updated);

  const items = [...state.project.items];
  items[index] = next;

  return {
    ...state,
    project: {
      ...state.project,
      items,
    },
  };
};

const trimStart = (
  state: EditorState,
  itemId: string,
  requestedDeltaFrames: number,
): EditorState =>
  replaceItem(state, itemId, (item) => {
    const requestedDelta = Math.round(
      finiteOr(requestedDeltaFrames, 0),
    );
    if (requestedDelta === 0) {
      return item;
    }

    const maxInward = item.durationInFrames - MIN_DURATION_FRAMES;
    let actualDelta = Math.min(requestedDelta, maxInward);

    if (actualDelta < 0) {
      let maxExpansion = item.timelineStartFrame;
      if (isMediaItem(item) && !isLoopingAudioItem(item)) {
        const sourceRate = sourceFramesPerTimelineFrame(item);
        maxExpansion = Math.min(
          maxExpansion,
          Math.floor(item.sourceStartFrame / sourceRate),
        );
      }
      actualDelta = Math.max(actualDelta, -maxExpansion);
    }

    if (actualDelta === 0) {
      return item;
    }

    if (!isMediaItem(item) || isLoopingAudioItem(item)) {
      return {
        ...item,
        timelineStartFrame: item.timelineStartFrame + actualDelta,
        durationInFrames: item.durationInFrames - actualDelta,
      };
    }

    const sourceDelta = Math.round(
      actualDelta * sourceFramesPerTimelineFrame(item),
    );

    return {
      ...item,
      timelineStartFrame: item.timelineStartFrame + actualDelta,
      durationInFrames: item.durationInFrames - actualDelta,
      sourceStartFrame: item.sourceStartFrame + sourceDelta,
      sourceDurationInFrames: item.sourceDurationInFrames - sourceDelta,
    };
  });

const trimEnd = (
  state: EditorState,
  itemId: string,
  requestedDeltaFrames: number,
): EditorState =>
  replaceItem(state, itemId, (item) => {
    const requestedDelta = Math.round(
      finiteOr(requestedDeltaFrames, 0),
    );
    if (requestedDelta === 0) {
      return item;
    }

    const maxInward = item.durationInFrames - MIN_DURATION_FRAMES;
    let actualDelta = Math.min(requestedDelta, maxInward);

    if (
      actualDelta < 0 &&
      isMediaItem(item) &&
      !isLoopingAudioItem(item)
    ) {
      const sourceRate = sourceFramesPerTimelineFrame(item);
      const sourceEnd =
        item.sourceStartFrame + item.sourceDurationInFrames;
      const remainingSource = Math.max(
        0,
        item.sourceAssetDurationInFrames - sourceEnd,
      );
      const maxExpansion = Math.floor(remainingSource / sourceRate);
      actualDelta = Math.max(actualDelta, -maxExpansion);
    }

    if (actualDelta === 0) {
      return item;
    }

    if (!isMediaItem(item) || isLoopingAudioItem(item)) {
      return {
        ...item,
        durationInFrames: item.durationInFrames - actualDelta,
      };
    }

    const sourceDelta = Math.round(
      actualDelta * sourceFramesPerTimelineFrame(item),
    );

    return {
      ...item,
      durationInFrames: item.durationInFrames - actualDelta,
      sourceDurationInFrames: item.sourceDurationInFrames - sourceDelta,
    };
  });

const updateSubtitleStyle = (
  item: TimelineItem,
  patch: SubtitleStylePatch,
): TimelineItem => {
  if (item.type !== "SUBTITLE") {
    return item;
  }

  return {
    ...item,
    ...patch,
    x: patch.x === undefined ? item.x : finiteOr(patch.x, item.x),
    y: patch.y === undefined ? item.y : finiteOr(patch.y, item.y),
    width:
      patch.width === undefined
        ? item.width
        : Math.max(1, finiteOr(patch.width, item.width)),
    fontSize:
      patch.fontSize === undefined
        ? item.fontSize
        : Math.max(1, finiteOr(patch.fontSize, item.fontSize)),
    fontWeight:
      patch.fontWeight === undefined
        ? item.fontWeight
        : Math.max(1, finiteOr(patch.fontWeight, item.fontWeight)),
    strokeWidth:
      patch.strokeWidth === undefined
        ? item.strokeWidth
        : Math.max(0, finiteOr(patch.strokeWidth, item.strokeWidth)),
    lineHeight:
      patch.lineHeight === undefined
        ? item.lineHeight
        : Math.max(0.1, finiteOr(patch.lineHeight, item.lineHeight)),
    maxLines:
      patch.maxLines === undefined
        ? item.maxLines
        : Math.max(1, Math.round(finiteOr(patch.maxLines, item.maxLines))),
    backgroundOpacity:
      patch.backgroundOpacity === undefined
        ? item.backgroundOpacity
        : Math.min(
            1,
            Math.max(
              0,
              finiteOr(patch.backgroundOpacity, item.backgroundOpacity),
            ),
          ),
  };
};

const updateTextOverlayStyle = (
  item: TimelineItem,
  patch: TextOverlayStylePatch,
): TimelineItem => {
  if (item.type !== "TEXT") {
    return item;
  }

  return {
    ...item,
    ...patch,
    x: patch.x === undefined ? item.x : finiteOr(patch.x, item.x),
    y: patch.y === undefined ? item.y : finiteOr(patch.y, item.y),
    width:
      patch.width === undefined
        ? item.width
        : Math.max(1, finiteOr(patch.width, item.width)),
    fontSize:
      patch.fontSize === undefined
        ? item.fontSize
        : Math.max(1, finiteOr(patch.fontSize, item.fontSize)),
    fontWeight:
      patch.fontWeight === undefined
        ? item.fontWeight
        : Math.max(1, finiteOr(patch.fontWeight, item.fontWeight)),
    strokeWidth:
      patch.strokeWidth === undefined
        ? item.strokeWidth
        : Math.max(0, finiteOr(patch.strokeWidth, item.strokeWidth)),
    lineHeight:
      patch.lineHeight === undefined
        ? item.lineHeight
        : Math.max(0.1, finiteOr(patch.lineHeight, item.lineHeight)),
    maxLines:
      patch.maxLines === undefined
        ? item.maxLines
        : Math.max(1, Math.round(finiteOr(patch.maxLines, item.maxLines))),
    backgroundOpacity:
      patch.backgroundOpacity === undefined
        ? item.backgroundOpacity
        : Math.min(
            1,
            Math.max(
              0,
              finiteOr(patch.backgroundOpacity, item.backgroundOpacity),
            ),
          ),
  };
};

const updateGraphicStyle = (
  item: TimelineItem,
  patch: GraphicStylePatch,
): TimelineItem => {
  if (item.type !== "GRAPHIC") {
    return item;
  }

  return {
    ...item,
    ...patch,
    x: patch.x === undefined ? item.x : finiteOr(patch.x, item.x),
    y: patch.y === undefined ? item.y : finiteOr(patch.y, item.y),
    width:
      patch.width === undefined
        ? item.width
        : Math.max(1, finiteOr(patch.width, item.width)),
    height:
      patch.height === undefined
        ? item.height
        : Math.max(1, finiteOr(patch.height, item.height)),
    opacity:
      patch.opacity === undefined
        ? item.opacity
        : Math.min(1, Math.max(0, finiteOr(patch.opacity, item.opacity))),
    blurPx:
      patch.blurPx === undefined
        ? item.blurPx
        : Math.max(0, finiteOr(patch.blurPx, item.blurPx)),
    borderRadius:
      patch.borderRadius === undefined
        ? item.borderRadius
        : Math.max(0, finiteOr(patch.borderRadius, item.borderRadius)),
    gradientAngleDeg:
      patch.gradientAngleDeg === undefined
        ? item.gradientAngleDeg
        : finiteOr(patch.gradientAngleDeg, item.gradientAngleDeg ?? 180),
  };
};

const updateTransform = (
  item: TimelineItem,
  patch: TransformPatch,
): TimelineItem => {
  const next: TimelineItem = {...item};

  if ("x" in next && patch.x !== undefined) {
    next.x = finiteOr(patch.x, next.x);
  }
  if ("y" in next && patch.y !== undefined) {
    next.y = finiteOr(patch.y, next.y);
  }
  if ("width" in next && patch.width !== undefined) {
    next.width = Math.max(1, finiteOr(patch.width, next.width));
  }
  if ("height" in next && patch.height !== undefined) {
    next.height = Math.max(1, finiteOr(patch.height, next.height));
  }
  if ("scale" in next && patch.scale !== undefined) {
    next.scale = Math.max(0.001, finiteOr(patch.scale, next.scale));
  }
  if ("rotation" in next && patch.rotation !== undefined) {
    next.rotation = finiteOr(patch.rotation, next.rotation);
  }
  if ("opacity" in next && patch.opacity !== undefined) {
    next.opacity = Math.min(
      1,
      Math.max(0, finiteOr(patch.opacity, next.opacity)),
    );
  }

  return next;
};

export const editorReducer = (
  state: EditorState,
  action: EditorAction,
): EditorState => {
  switch (action.type) {
    case "LOAD_PROJECT":
      return createEditorState(action.project);

    case "SELECT_ITEM": {
      const validIds = new Set(state.project.items.map((item) => item.id));
      const itemIds = [...new Set(action.itemIds)].filter((id) =>
        validIds.has(id),
      );
      return {...state, selectedItemIds: itemIds};
    }

    case "MOVE_ITEM":
      return replaceItem(state, action.itemId, (item) => {
        const nextTrackId = action.trackId ?? item.trackId;
        if (
          nextTrackId !== item.trackId &&
          !canUseTrack(state.project.tracks, item, nextTrackId)
        ) {
          return item;
        }
        return {
          ...item,
          timelineStartFrame: frame(
            action.timelineStartFrame,
            item.timelineStartFrame,
          ),
          trackId: nextTrackId,
        };
      });

    case "TRIM_ITEM_START":
      return trimStart(state, action.itemId, action.deltaFrames);

    case "TRIM_ITEM_END":
      return trimEnd(state, action.itemId, action.deltaFrames);

    case "CHANGE_ITEM_DURATION": {
      const item = state.project.items.find(
        (candidate) => candidate.id === action.itemId,
      );
      if (!item || item.locked) {
        return state;
      }
      const requestedDuration = duration(
        action.durationInFrames,
        item.durationInFrames,
      );
      return trimEnd(
        state,
        action.itemId,
        item.durationInFrames - requestedDuration,
      );
    }

    case "CHANGE_PLAYBACK_RATE":
      return replaceItem(state, action.itemId, (item) => {
        if (!isVideoItem(item)) {
          return item;
        }
        const nextRate = playbackRate(
          action.playbackRate,
          item.playbackRate,
        );
        return {
          ...item,
          playbackRate: nextRate,
          durationInFrames: duration(
            item.sourceDurationInFrames / nextRate,
            item.durationInFrames,
          ),
        };
      });

    case "CHANGE_VOLUME":
      return replaceItem(state, action.itemId, (item) =>
        isVideoItem(item) || isAudioItem(item)
          ? {...item, volume: volume(action.volume, item.volume)}
          : item,
      );

    case "CHANGE_VIDEO_FIT":
      return replaceItem(state, action.itemId, (item) =>
        isVideoItem(item) ? {...item, fit: action.fit} : item,
      );

    case "CHANGE_AUDIO_MUTED":
      return replaceItem(state, action.itemId, (item) =>
        isAudioItem(item) ? {...item, muted: action.muted} : item,
      );

    case "CHANGE_AUDIO_LOOP":
      return replaceItem(state, action.itemId, (item) =>
        isAudioItem(item) && item.type === "BGM"
          ? {...item, loop: action.loop}
          : item,
      );

    case "CHANGE_AUDIO_FADES":
      return replaceItem(state, action.itemId, (item) =>
        isAudioItem(item)
          ? {
              ...item,
              fadeInFrames:
                action.fadeInFrames === undefined
                  ? item.fadeInFrames
                  : Math.min(
                      item.durationInFrames,
                      frame(action.fadeInFrames, item.fadeInFrames),
                    ),
              fadeOutFrames:
                action.fadeOutFrames === undefined
                  ? item.fadeOutFrames
                  : Math.min(
                      item.durationInFrames,
                      frame(action.fadeOutFrames, item.fadeOutFrames),
                    ),
            }
          : item,
      );

    case "UPDATE_TEXT":
      return replaceItem(state, action.itemId, (item) =>
        item.type === "SUBTITLE" || item.type === "TEXT"
          ? {...item, text: action.text}
          : item,
      );

    case "UPDATE_SUBTITLE_STYLE":
      return replaceItem(state, action.itemId, (item) =>
        updateSubtitleStyle(item, action.patch),
      );

    case "UPDATE_TEXT_STYLE":
      return replaceItem(state, action.itemId, (item) =>
        updateTextOverlayStyle(item, action.patch),
      );

    case "UPDATE_GRAPHIC_STYLE":
      return replaceItem(state, action.itemId, (item) =>
        updateGraphicStyle(item, action.patch),
      );

    case "UPDATE_TRANSFORM":
      return replaceItem(state, action.itemId, (item) =>
        updateTransform(item, action.patch),
      );

    case "ADD_TRACK": {
      if (
        state.project.tracks.some((track) => track.id === action.track.id)
      ) {
        return state;
      }
      return {
        ...state,
        project: {
          ...state.project,
          tracks: [...state.project.tracks, {...action.track}].sort(
            (left, right) => left.order - right.order,
          ),
        },
      };
    }

    case "REPLACE_SUBTITLE_ITEMS": {
      const normalized = action.items
        .filter(
          (item) =>
            item.type === "SUBTITLE" &&
            canUseTrack(state.project.tracks, item, item.trackId),
        )
        .map((item) => normalizeItem(item));

      const nonSubtitleItems = state.project.items.filter(
        (item) => item.type !== "SUBTITLE",
      );
      const usedIds = new Set(nonSubtitleItems.map((item) => item.id));
      const replacementItems: TimelineItem[] = [];
      for (const item of normalized) {
        if (usedIds.has(item.id)) {
          continue;
        }
        usedIds.add(item.id);
        replacementItems.push(item);
      }

      return {
        ...state,
        selectedItemIds:
          replacementItems.length > 0 ? [replacementItems[0].id] : [],
        project: {
          ...state.project,
          items: [...nonSubtitleItems, ...replacementItems],
        },
      };
    }

    case "ADD_ITEM": {
      if (
        state.project.items.some((item) => item.id === action.item.id) ||
        !canUseTrack(
          state.project.tracks,
          action.item,
          action.item.trackId,
        )
      ) {
        return state;
      }
      return {
        ...state,
        project: {
          ...state.project,
          items: [...state.project.items, normalizeItem(action.item)],
        },
      };
    }

    case "DELETE_ITEM": {
      const item = state.project.items.find(
        (candidate) => candidate.id === action.itemId,
      );
      if (!item || item.locked) {
        return state;
      }
      return {
        ...state,
        selectedItemIds: state.selectedItemIds.filter(
          (id) => id !== action.itemId,
        ),
        project: {
          ...state.project,
          items: state.project.items.filter(
            (candidate) => candidate.id !== action.itemId,
          ),
        },
      };
    }

    case "DUPLICATE_ITEM": {
      if (
        state.project.items.some((item) => item.id === action.newItemId)
      ) {
        return state;
      }

      const source = state.project.items.find(
        (item) => item.id === action.itemId,
      );
      if (!source) {
        return state;
      }

      const targetTrackId = action.trackId ?? source.trackId;
      if (
        !canUseTrack(state.project.tracks, source, targetTrackId)
      ) {
        return state;
      }

      const duplicate = normalizeItem({
        ...source,
        id: action.newItemId,
        trackId: targetTrackId,
        timelineStartFrame:
          action.timelineStartFrame === undefined
            ? source.timelineStartFrame + source.durationInFrames
            : frame(
                action.timelineStartFrame,
                source.timelineStartFrame,
              ),
        locked: false,
      });

      return {
        ...state,
        project: {
          ...state.project,
          items: [...state.project.items, duplicate],
        },
      };
    }

    case "SPLIT_AUDIO_ITEM": {
      if (
        state.project.items.some((item) => item.id === action.newItemId)
      ) {
        return state;
      }

      const index = state.project.items.findIndex(
        (item) => item.id === action.itemId,
      );
      if (index === -1) {
        return state;
      }

      const item = state.project.items[index];
      if (!isAudioItem(item) || item.locked) {
        return state;
      }

      const splitFrame = frame(action.splitFrame);
      const itemEnd = item.timelineStartFrame + item.durationInFrames;
      if (
        splitFrame <= item.timelineStartFrame ||
        splitFrame >= itemEnd
      ) {
        return state;
      }

      const leftDuration = splitFrame - item.timelineStartFrame;
      const rightDuration = item.durationInFrames - leftDuration;

      const rawSourceLeft = Math.round(
        (item.sourceDurationInFrames * leftDuration) /
          item.durationInFrames,
      );
      const sourceLeftDuration = Math.min(
        item.sourceDurationInFrames - 1,
        Math.max(1, rawSourceLeft),
      );
      const sourceRightDuration =
        item.sourceDurationInFrames - sourceLeftDuration;

      const left: AudioTimelineItem = normalizeItem({
        ...item,
        durationInFrames: leftDuration,
        sourceDurationInFrames: sourceLeftDuration,
      }) as AudioTimelineItem;

      const right: AudioTimelineItem = normalizeItem({
        ...item,
        id: action.newItemId,
        timelineStartFrame: splitFrame,
        durationInFrames: rightDuration,
        sourceStartFrame:
          item.sourceStartFrame + sourceLeftDuration,
        sourceDurationInFrames: sourceRightDuration,
      }) as AudioTimelineItem;

      const items = [...state.project.items];
      items.splice(index, 1, left, right);

      return {
        ...state,
        project: {
          ...state.project,
          items,
        },
      };
    }

    case "SET_PLAYHEAD":
      return {
        ...state,
        playheadFrame: frame(action.frame, state.playheadFrame),
      };

    case "SET_TIMELINE_ZOOM":
      return {
        ...state,
        project: {
          ...state.project,
          settings: {
            ...state.project.settings,
            timelineZoom: Math.min(
              MAX_TIMELINE_ZOOM,
              Math.max(
                MIN_TIMELINE_ZOOM,
                finiteOr(
                  action.zoom,
                  state.project.settings.timelineZoom,
                ),
              ),
            ),
          },
        },
      };

    case "SET_SNAP":
      return {
        ...state,
        project: {
          ...state.project,
          settings: {
            ...state.project.settings,
            snapEnabled: action.enabled,
            snapToleranceFrames:
              action.toleranceFrames === undefined
                ? state.project.settings.snapToleranceFrames
                : frame(
                    action.toleranceFrames,
                    state.project.settings.snapToleranceFrames,
                  ),
          },
        },
      };

    default:
      return state;
  }
};
