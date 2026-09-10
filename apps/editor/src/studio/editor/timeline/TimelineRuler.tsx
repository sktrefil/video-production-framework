import type {FC} from "react";
import {
  TIMELINE_LABEL_WIDTH,
  formatFrameTimecode,
  frameToPixels,
  getRulerStepFrames,
} from "./timelineMath";

export const TIMELINE_RULER_HEIGHT = 30;

export const TimelineRuler: FC<{
  durationInFrames: number;
  fps: number;
  pixelsPerFrame: number;
}> = ({durationInFrames, fps, pixelsPerFrame}) => {
  const stepFrames = getRulerStepFrames(pixelsPerFrame, fps);
  const ticks: number[] = [];

  for (
    let tick = 0;
    tick < durationInFrames && ticks.length < 2000;
    tick += stepFrames
  ) {
    ticks.push(tick);
  }

  return (
    <div
      data-editor-ruler="true"
      style={{
        position: "relative",
        height: TIMELINE_RULER_HEIGHT,
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "#111316",
      }}
    >
      <div
        style={{
          position: "sticky",
          left: 0,
          top: 0,
          width: TIMELINE_LABEL_WIDTH,
          height: "100%",
          boxSizing: "border-box",
          zIndex: 15,
          display: "flex",
          alignItems: "center",
          paddingLeft: 10,
          borderRight: "1px solid rgba(255,255,255,0.12)",
          background: "#111316",
          color: "rgba(255,255,255,0.48)",
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        TRACK / TIME
      </div>

      {ticks.map((tick) => (
        <div
          key={tick}
          style={{
            position: "absolute",
            left:
              TIMELINE_LABEL_WIDTH +
              frameToPixels(tick, pixelsPerFrame),
            top: 0,
            bottom: 0,
            borderLeft: "1px solid rgba(255,255,255,0.14)",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 4,
              top: 4,
              color: "rgba(255,255,255,0.58)",
              fontSize: 9,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {formatFrameTimecode(tick, fps)}
          </span>
        </div>
      ))}
    </div>
  );
};
