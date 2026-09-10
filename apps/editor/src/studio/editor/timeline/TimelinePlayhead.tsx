import type {FC, PointerEvent} from "react";
import {TIMELINE_LABEL_WIDTH, frameToPixels} from "./timelineMath";

const PLAYHEAD_HIT_WIDTH = 17;

export const TimelinePlayhead: FC<{
  frame: number;
  pixelsPerFrame: number;
  height: number;
  onBeginDrag: (clientX: number) => void;
}> = ({frame, pixelsPerFrame, height, onBeginDrag}) => {
  const centerX =
    TIMELINE_LABEL_WIDTH + frameToPixels(frame, pixelsPerFrame);

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onBeginDrag(event.clientX);
  };

  return (
    <div
      data-editor-playhead="true"
      data-editor-playhead-handle="true"
      onPointerDown={beginDrag}
      title="드래그하여 재생 위치 이동"
      style={{
        position: "absolute",
        left: centerX - Math.floor(PLAYHEAD_HIT_WIDTH / 2),
        top: 0,
        width: PLAYHEAD_HIT_WIDTH,
        height,
        cursor: "ew-resize",
        touchAction: "none",
        pointerEvents: "auto",
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: Math.floor(PLAYHEAD_HIT_WIDTH / 2),
          top: 0,
          width: 1,
          height,
          background: "#ff5c5c",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: Math.floor(PLAYHEAD_HIT_WIDTH / 2) - 6,
          top: 0,
          width: 13,
          height: 10,
          clipPath: "polygon(0 0,100% 0,50% 100%)",
          background: "#ff5c5c",
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.55))",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
