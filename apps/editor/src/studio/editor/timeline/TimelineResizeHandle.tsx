import type {FC, PointerEvent} from "react";

export const TimelineResizeHandle: FC<{
  side: "left" | "right";
  visible: boolean;
  onPointerDown: (event: PointerEvent<HTMLSpanElement>) => void;
}> = ({side, visible, onPointerDown}) => {
  if (!visible) {
    return null;
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      data-editor-trim-handle={side}
      title={side === "left" ? "왼쪽 Trim" : "오른쪽 Trim"}
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        top: 1,
        bottom: 1,
        [side]: 0,
        width: 8,
        borderRadius: 3,
        background: "rgba(255,255,255,0.82)",
        opacity: 0.78,
        cursor: "ew-resize",
        zIndex: 10,
      }}
    />
  );
};
