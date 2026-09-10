import {AbsoluteFill} from "remotion";
import type {CSSProperties, FC} from "react";
import type {GraphicTimelineItem} from "../studio/editor/editorTypes";

const backgroundForGraphic = (
  item: GraphicTimelineItem,
): CSSProperties => {
  if (item.graphicType === "GRADIENT") {
    const start = item.gradientStartColor ?? "rgba(0,0,0,0)";
    const end = item.gradientEndColor ?? "rgba(0,0,0,0.78)";
    const angle = item.gradientAngleDeg ?? 180;
    return {
      background: `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`,
    };
  }

  return {backgroundColor: item.backgroundColor};
};

export const GraphicItemRenderer: FC<{item: GraphicTimelineItem}> = ({
  item,
}) => {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: item.x,
          top: item.y,
          width: item.width,
          height: item.height,
          opacity: item.opacity,
          borderRadius: item.borderRadius,
          backdropFilter:
            item.graphicType === "BLUR_PANEL"
              ? `blur(${item.blurPx}px)`
              : undefined,
          WebkitBackdropFilter:
            item.graphicType === "BLUR_PANEL"
              ? `blur(${item.blurPx}px)`
              : undefined,
          ...backgroundForGraphic(item),
        }}
      />
    </AbsoluteFill>
  );
};
