import {useCallback, useEffect, useMemo, useRef} from "react";
import type {FC, PointerEvent, WheelEvent} from "react";
import {pause} from "@remotion/studio";
import {editorActions} from "../editorActions";
import {selectItemsForTrack} from "../editorSelectors";
import type {
  AudioTimelineItem,
  GraphicTimelineItem,
  SubtitleTimelineItem,
  TextTimelineItem,
  VideoTimelineItem,
} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {TimelinePlayhead} from "./TimelinePlayhead";
import {TIMELINE_RULER_HEIGHT, TimelineRuler} from "./TimelineRuler";
import {TIMELINE_TRACK_HEIGHT, TimelineTrack} from "./TimelineTrack";
import {
  TIMELINE_LABEL_WIDTH,
  clampTimelineFrame,
  getSnapCandidates,
  pixelsToFrame,
  snapFrameToCandidates,
  snapMovedItemStart,
  timelinePixelsPerFrame,
} from "./timelineMath";

type Interaction = {
  kind: "move" | "trim-left" | "trim-right";
  itemId: string;
  startClientX: number;
  initialStartFrame: number;
  initialDurationInFrames: number;
  minimumBoundary: number;
  maximumBoundary: number;
  lastBoundary: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export const Timeline: FC<{
  currentFrame: number;
  onSeek: (frame: number) => void;
  onZoomByFactor: (factor: number) => void;
  onImportBgmFile?: (file: File, startFrame: number) => void;
  bgmImportBusy?: boolean;
}> = ({
  currentFrame,
  onSeek,
  onZoomByFactor,
  onImportBgmFile,
  bgmImportBusy = false,
}) => {
  const {state, dispatch} = useStudioEditor();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const playheadDraggingRef = useRef(false);
  const stateRef = useRef(state);
  const pixelsPerFrameRef = useRef(1);
  stateRef.current = state;

  const tracks = useMemo(
    () =>
      state.project.tracks
        .slice()
        .sort((left, right) => left.order - right.order),
    [state.project.tracks],
  );
  const pixelsPerFrame = timelinePixelsPerFrame(
    state.project.settings.timelineZoom,
  );
  pixelsPerFrameRef.current = pixelsPerFrame;
  const durationInFrames = state.project.project.durationInFrames;
  const surfaceWidth =
    TIMELINE_LABEL_WIDTH + durationInFrames * pixelsPerFrame;
  const surfaceHeight =
    TIMELINE_RULER_HEIGHT + tracks.length * TIMELINE_TRACK_HEIGHT;
  const selectItem = (itemId: string, toggle: boolean) => {
    if (!toggle) {
      dispatch(editorActions.selectItem([itemId]));
      return;
    }

    const current = state.selectedItemIds;
    dispatch(
      editorActions.selectItem(
        current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : [...current, itemId],
      ),
    );
  };

  const beginInteraction = (
    itemId: string,
    kind: Interaction["kind"],
    clientX: number,
  ) => {
    const item = state.project.items.find(
      (
        candidate,
      ): candidate is
        | VideoTimelineItem
        | AudioTimelineItem
        | SubtitleTimelineItem
        | TextTimelineItem
        | GraphicTimelineItem =>
        candidate.id === itemId &&
        (candidate.type === "VIDEO" ||
          candidate.type === "TTS" ||
          candidate.type === "BGM" ||
          candidate.type === "SFX" ||
          candidate.type === "SUBTITLE" ||
          candidate.type === "TEXT" ||
          candidate.type === "GRAPHIC"),
    );
    const track = state.project.tracks.find(
      (candidate) => candidate.id === item?.trackId,
    );
    if (!item || item.locked || track?.locked) {
      return;
    }

    pause();
    dispatch(editorActions.beginEditTransaction());

    const initialEnd = item.timelineStartFrame + item.durationInFrames;
    const sourceRate = item.type === "VIDEO" ? item.playbackRate : 1;
    const isMedia =
      item.type === "VIDEO" ||
      item.type === "TTS" ||
      item.type === "BGM" ||
      item.type === "SFX";
    const isLoopingBgm = item.type === "BGM" && item.loop === true;
    const sourceEnd = isMedia
      ? item.sourceStartFrame + item.sourceDurationInFrames
      : 0;
    const outwardLeft =
      isMedia && !isLoopingBgm
        ? Math.floor(item.sourceStartFrame / sourceRate)
        : item.timelineStartFrame;
    const outwardRight =
      isMedia && !isLoopingBgm
        ? Math.floor(
            Math.max(0, item.sourceAssetDurationInFrames - sourceEnd) /
              sourceRate,
          )
        : Math.max(
            0,
            state.project.project.durationInFrames - initialEnd,
          );

    const minimumBoundary =
      kind === "trim-left"
        ? Math.max(0, item.timelineStartFrame - outwardLeft)
        : kind === "trim-right"
          ? item.timelineStartFrame + 1
          : 0;
    const maximumBoundary =
      kind === "trim-left"
        ? initialEnd - 1
        : kind === "trim-right"
          ? Math.min(
              state.project.project.durationInFrames,
              initialEnd + outwardRight,
            )
          : Math.max(0, state.project.project.durationInFrames - 1);

    interactionRef.current = {
      kind,
      itemId,
      startClientX: clientX,
      initialStartFrame: item.timelineStartFrame,
      initialDurationInFrames: item.durationInFrames,
      minimumBoundary,
      maximumBoundary,
      lastBoundary:
        kind === "trim-right" ? initialEnd : item.timelineStartFrame,
    };
  };

  const seekPlayheadFromClientX = useCallback(
    (clientX: number) => {
      const surface = surfaceRef.current;
      if (!surface) {
        return;
      }

      const bounds = surface.getBoundingClientRect();
      const timelineX = clientX - bounds.left - TIMELINE_LABEL_WIDTH;
      const rawFrame = pixelsToFrame(
        Math.max(0, timelineX),
        pixelsPerFrameRef.current,
      );
      onSeek(clampTimelineFrame(rawFrame, durationInFrames));
    },
    [durationInFrames, onSeek],
  );

  const beginPlayheadScrub = useCallback(
    (clientX: number) => {
      pause();
      playheadDraggingRef.current = true;
      seekPlayheadFromClientX(clientX);
    },
    [seekPlayheadFromClientX],
  );

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      if (playheadDraggingRef.current) {
        event.preventDefault();
        seekPlayheadFromClientX(event.clientX);
        return;
      }
      const interaction = interactionRef.current;
      if (!interaction) {
        return;
      }

      const project = stateRef.current.project;
      const item = project.items.find(
        (
          candidate,
        ): candidate is
          | VideoTimelineItem
          | AudioTimelineItem
          | SubtitleTimelineItem
          | TextTimelineItem
          | GraphicTimelineItem =>
          candidate.id === interaction.itemId &&
          (candidate.type === "VIDEO" ||
            candidate.type === "TTS" ||
            candidate.type === "BGM" ||
            candidate.type === "SFX" ||
            candidate.type === "SUBTITLE" ||
            candidate.type === "TEXT" ||
            candidate.type === "GRAPHIC"),
      );
      if (!item) {
        interactionRef.current = null;
        dispatch(editorActions.endEditTransaction());
        return;
      }

      const deltaFrames = pixelsToFrame(
        event.clientX - interaction.startClientX,
        pixelsPerFrameRef.current,
      );
      const candidates = getSnapCandidates(project, interaction.itemId);
      const snapEnabled = project.settings.snapEnabled;
      const tolerance = project.settings.snapToleranceFrames;

      if (interaction.kind === "move") {
        let desiredStart = clamp(
          interaction.initialStartFrame + deltaFrames,
          interaction.minimumBoundary,
          interaction.maximumBoundary,
        );
        if (snapEnabled) {
          desiredStart = snapMovedItemStart(
            desiredStart,
            interaction.initialDurationInFrames,
            candidates,
            tolerance,
          );
          desiredStart = clamp(
            desiredStart,
            interaction.minimumBoundary,
            interaction.maximumBoundary,
          );
        }
        dispatch(editorActions.moveItem(item.id, desiredStart));
        interaction.lastBoundary = desiredStart;
        return;
      }

      if (interaction.kind === "trim-left") {
        let desiredStart = clamp(
          interaction.initialStartFrame + deltaFrames,
          interaction.minimumBoundary,
          interaction.maximumBoundary,
        );
        if (snapEnabled) {
          desiredStart = snapFrameToCandidates(
            desiredStart,
            candidates,
            tolerance,
          );
          desiredStart = clamp(
            desiredStart,
            interaction.minimumBoundary,
            interaction.maximumBoundary,
          );
        }
        const deltaFromLast = desiredStart - interaction.lastBoundary;
        if (deltaFromLast !== 0) {
          dispatch(editorActions.trimItemStart(item.id, deltaFromLast));
          interaction.lastBoundary = desiredStart;
        }
        return;
      }

      let desiredEnd = clamp(
        interaction.initialStartFrame +
          interaction.initialDurationInFrames +
          deltaFrames,
        interaction.minimumBoundary,
        interaction.maximumBoundary,
      );
      if (snapEnabled) {
        desiredEnd = snapFrameToCandidates(
          desiredEnd,
          candidates,
          tolerance,
        );
        desiredEnd = clamp(
          desiredEnd,
          interaction.minimumBoundary,
          interaction.maximumBoundary,
        );
      }
      const trimDelta = interaction.lastBoundary - desiredEnd;
      if (trimDelta !== 0) {
        dispatch(editorActions.trimItemEnd(item.id, trimDelta));
        interaction.lastBoundary = desiredEnd;
      }
    };

    const finishInteraction = () => {
      playheadDraggingRef.current = false;
      if (!interactionRef.current) {
        return;
      }
      interactionRef.current = null;
      dispatch(editorActions.endEditTransaction());
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", finishInteraction, true);
    window.addEventListener("pointercancel", finishInteraction, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", finishInteraction, true);
      window.removeEventListener("pointercancel", finishInteraction, true);
    };
  }, [dispatch, seekPlayheadFromClientX]);

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      target?.closest("[data-editor-timeline-item]") ||
      target?.closest("[data-editor-playhead-handle]")
    ) {
      return;
    }

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    const bounds = surface.getBoundingClientRect();
    const timelineX = event.clientX - bounds.left - TIMELINE_LABEL_WIDTH;
    if (timelineX < 0) {
      return;
    }

    event.preventDefault();
    dispatch(editorActions.selectItem([]));
    beginPlayheadScrub(event.clientX);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    onZoomByFactor(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  return (
    <div
      data-editor-timeline="true"
      onWheel={handleWheel}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        background: "#101215",
      }}
    >
      <div
        ref={surfaceRef}
        onPointerDown={seekFromPointer}
        style={{
          position: "relative",
          width: Math.max(900, surfaceWidth),
          minHeight: surfaceHeight,
          cursor: "default",
          userSelect: "none",
        }}
      >
        <TimelineRuler
          durationInFrames={durationInFrames}
          fps={state.project.project.fps}
          pixelsPerFrame={pixelsPerFrame}
        />

        {tracks.map((track) => (
          <TimelineTrack
            key={track.id}
            track={track}
            items={selectItemsForTrack(state, track.id)}
            selectedItemIds={state.selectedItemIds}
            pixelsPerFrame={pixelsPerFrame}
            onSelectItem={selectItem}
            onBeginMove={(itemId, event) =>
              beginInteraction(itemId, "move", event.clientX)
            }
            onBeginTrim={(itemId, side, event) =>
              beginInteraction(
                itemId,
                side === "left" ? "trim-left" : "trim-right",
                event.clientX,
              )
            }
            durationInFrames={durationInFrames}
            onExternalBgmDrop={onImportBgmFile}
            externalBgmImportDisabled={bgmImportBusy}
          />
        ))}

        <TimelinePlayhead
          frame={clampTimelineFrame(currentFrame, durationInFrames)}
          pixelsPerFrame={pixelsPerFrame}
          height={surfaceHeight}
          onBeginDrag={beginPlayheadScrub}
        />
      </div>
    </div>
  );
};
