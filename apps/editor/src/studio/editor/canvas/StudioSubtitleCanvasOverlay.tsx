import {useEffect, useMemo, useRef} from "react";
import type {FC, PointerEvent} from "react";
import {pause} from "@remotion/studio";
import {
  AbsoluteFill,
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import {editorActions} from "../editorActions";
import type {SubtitleTimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";

type DragState = {
  itemId: string;
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
};

export const StudioSubtitleCanvasOverlay: FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {isStudio, isReadOnlyStudio} = useRemotionEnvironment();
  const {state, dispatch} = useStudioEditor();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const activeSubtitles = useMemo(
    () =>
      state.project.items.filter(
        (item): item is SubtitleTimelineItem =>
          item.type === "SUBTITLE" &&
          item.enabled &&
          frame >= item.timelineStartFrame &&
          frame < item.timelineStartFrame + item.durationInFrames,
      ),
    [frame, state.project.items],
  );

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      const root = rootRef.current;
      if (!drag || !root) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const scaleX = rect.width / Math.max(1, width);
      const scaleY = rect.height / Math.max(1, height);
      const x =
        drag.initialX + (event.clientX - drag.startClientX) / Math.max(scaleX, 0.0001);
      const y =
        drag.initialY + (event.clientY - drag.startClientY) / Math.max(scaleY, 0.0001);

      dispatch(
        editorActions.updateSubtitleStyle(drag.itemId, {
          x: Math.max(0, Math.min(width, x)),
          y: Math.max(0, Math.min(height, y)),
        }),
      );
    };

    const onEnd = () => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      dispatch(editorActions.endEditTransaction());
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("pointercancel", onEnd, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("pointercancel", onEnd, true);
    };
  }, [dispatch, height, width]);

  if (!isStudio || isReadOnlyStudio) {
    return null;
  }

  const beginDrag = (
    item: SubtitleTimelineItem,
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    pause();
    dispatch(editorActions.selectItem([item.id]));
    dispatch(editorActions.beginEditTransaction());
    dragRef.current = {
      itemId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialX: item.x,
      initialY: item.y,
    };
  };

  return (
    <AbsoluteFill
      ref={rootRef}
      data-editor-subtitle-canvas="true"
      style={{pointerEvents: "none", zIndex: 2147482000}}
    >
      {activeSubtitles.map((item) => {
        const selected = state.selectedItemIds.includes(item.id);
        const estimatedHeight =
          item.fontSize * item.lineHeight * Math.max(1, item.maxLines) + 24;
        return (
          <div
            key={item.id}
            data-editor-subtitle-canvas-item={item.id}
            onPointerDown={(event) => beginDrag(item, event)}
            style={{
              position: "absolute",
              left: item.x - item.width / 2,
              top: item.y - estimatedHeight,
              width: item.width,
              height: estimatedHeight,
              boxSizing: "border-box",
              border: selected
                ? "2px solid #ffd06b"
                : "1px dashed rgba(255,255,255,0.5)",
              background: selected
                ? "rgba(255,208,107,0.05)"
                : "rgba(0,0,0,0.02)",
              cursor: "move",
              pointerEvents: "auto",
            }}
          >
            {selected ? (
              <span
                style={{
                  position: "absolute",
                  right: 0,
                  top: -22,
                  padding: "3px 5px",
                  borderRadius: 4,
                  background: "#ffd06b",
                  color: "#17130f",
                  fontSize: 9,
                  fontWeight: 800,
                }}
              >
                SUBTITLE
              </span>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
