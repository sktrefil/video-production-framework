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
import type {
  GraphicTimelineItem,
  TextTimelineItem,
} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";

type EditableOverlayItem = GraphicTimelineItem | TextTimelineItem;

type DragState = {
  kind: "move" | "resize";
  itemId: string;
  itemType: EditableOverlayItem["type"];
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
};

export const StudioGraphicsCanvasOverlay: FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {isStudio, isReadOnlyStudio} = useRemotionEnvironment();
  const {state, dispatch} = useStudioEditor();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const activeItems = useMemo(
    () =>
      state.project.items.filter(
        (item): item is EditableOverlayItem =>
          (item.type === "TEXT" || item.type === "GRAPHIC") &&
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
      const deltaX =
        (event.clientX - drag.startClientX) / Math.max(scaleX, 0.0001);
      const deltaY =
        (event.clientY - drag.startClientY) / Math.max(scaleY, 0.0001);

      if (drag.kind === "move") {
        const nextX =
          drag.itemType === "TEXT"
            ? Math.max(0, Math.min(width, drag.initialX + deltaX))
            : Math.max(0, Math.min(width - 1, drag.initialX + deltaX));
        const nextY =
          drag.itemType === "TEXT"
            ? Math.max(0, Math.min(height, drag.initialY + deltaY))
            : Math.max(0, Math.min(height - 1, drag.initialY + deltaY));

        if (drag.itemType === "TEXT") {
          dispatch(
            editorActions.updateTextStyle(drag.itemId, {
              x: nextX,
              y: nextY,
            }),
          );
        } else {
          dispatch(
            editorActions.updateGraphicStyle(drag.itemId, {
              x: nextX,
              y: nextY,
            }),
          );
        }
        return;
      }

      const nextWidth = Math.max(20, drag.initialWidth + deltaX);
      const nextHeight = Math.max(20, drag.initialHeight + deltaY);

      if (drag.itemType === "TEXT") {
        dispatch(
          editorActions.updateTextStyle(drag.itemId, {
            width: Math.min(width, nextWidth),
          }),
        );
      } else {
        dispatch(
          editorActions.updateGraphicStyle(drag.itemId, {
            width: Math.min(width, nextWidth),
            height: Math.min(height, nextHeight),
          }),
        );
      }
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

  const begin = (
    item: EditableOverlayItem,
    kind: DragState["kind"],
    event: PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    pause();
    dispatch(editorActions.selectItem([item.id]));
    dispatch(editorActions.beginEditTransaction());

    const estimatedTextHeight =
      item.type === "TEXT"
        ? item.fontSize * item.lineHeight * Math.max(1, item.maxLines) + 24
        : item.height;

    dragRef.current = {
      kind,
      itemId: item.id,
      itemType: item.type,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialX: item.x,
      initialY: item.y,
      initialWidth: item.width,
      initialHeight: estimatedTextHeight,
    };
  };

  return (
    <AbsoluteFill
      ref={rootRef}
      data-editor-graphics-canvas="true"
      style={{pointerEvents: "none", zIndex: 2147481900}}
    >
      {activeItems.map((item) => {
        const selected = state.selectedItemIds.includes(item.id);
        const itemHeight =
          item.type === "TEXT"
            ? item.fontSize * item.lineHeight * Math.max(1, item.maxLines) + 24
            : item.height;
        const left =
          item.type === "TEXT" ? item.x - item.width / 2 : item.x;
        const top =
          item.type === "TEXT" ? item.y - itemHeight / 2 : item.y;

        return (
          <div
            key={item.id}
            data-editor-graphics-canvas-item={item.id}
            onPointerDown={(event) => begin(item, "move", event)}
            style={{
              position: "absolute",
              left,
              top,
              width: item.width,
              height: itemHeight,
              boxSizing: "border-box",
              border: selected
                ? "2px solid #8fd7ff"
                : "1px dashed rgba(143,215,255,0.48)",
              background: selected
                ? "rgba(70,166,220,0.05)"
                : "transparent",
              cursor: "move",
              pointerEvents: "auto",
            }}
          >
            {selected ? (
              <>
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: -22,
                    padding: "3px 5px",
                    borderRadius: 4,
                    background: "#8fd7ff",
                    color: "#101215",
                    fontSize: 9,
                    fontWeight: 800,
                  }}
                >
                  {item.type}
                </span>
                <div
                  data-editor-overlay-resize-handle="true"
                  onPointerDown={(event) => begin(item, "resize", event)}
                  style={{
                    position: "absolute",
                    right: -6,
                    bottom: -6,
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: "#8fd7ff",
                    border: "1px solid #101215",
                    cursor: "nwse-resize",
                    pointerEvents: "auto",
                  }}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
