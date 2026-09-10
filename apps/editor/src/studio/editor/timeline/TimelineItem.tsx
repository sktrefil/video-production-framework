import type {FC, KeyboardEvent, PointerEvent} from "react";
import type {TimelineItem as EditorTimelineItem} from "../editorTypes";
import {Waveform} from "../audio/Waveform";
import {
  TIMELINE_LABEL_WIDTH,
  frameToPixels,
} from "./timelineMath";
import {TimelineResizeHandle} from "./TimelineResizeHandle";

const itemBackground = (type: EditorTimelineItem["type"]) => {
  if (type === "VIDEO") return "#315f8f";
  if (type === "IMAGE") return "#547b51";
  if (type === "TTS") return "#7a4e91";
  if (type === "CLIP_AUDIO") return "#6d5a93";
  if (type === "BGM") return "#8b6a35";
  if (type === "SFX") return "#9b4f4a";
  if (type === "SUBTITLE") return "#336f73";
  if (type === "TEXT") return "#596f7c";
  return "#6d6258";
};

const itemLabel = (item: EditorTimelineItem) => {
  if (item.type === "SUBTITLE" || item.type === "TEXT") {
    return item.text.replace(/\s+/g, " ").trim() || item.id;
  }
  return item.id;
};

export const TimelineItem: FC<{
  item: EditorTimelineItem;
  selected: boolean;
  pixelsPerFrame: number;
  onSelect: (itemId: string, toggle: boolean) => void;
  onBeginMove: (
    itemId: string,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onBeginTrim: (
    itemId: string,
    side: "left" | "right",
    event: PointerEvent<HTMLSpanElement>,
  ) => void;
}> = ({
  item,
  selected,
  pixelsPerFrame,
  onSelect,
  onBeginMove,
  onBeginTrim,
}) => {
  const editable =
    (item.type === "VIDEO" ||
      item.type === "TTS" ||
      item.type === "BGM" ||
      item.type === "SFX" ||
      item.type === "SUBTITLE" ||
      item.type === "TEXT" ||
      item.type === "GRAPHIC") &&
    !item.locked;
  const select = (toggle: boolean) => onSelect(item.id, toggle);

  const handleMoveStart = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const toggle = event.shiftKey || event.metaKey || event.ctrlKey;
    select(toggle);
    if (editable && event.button === 0 && !toggle) {
      onBeginMove(item.id, event);
    }
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(event.shiftKey || event.metaKey || event.ctrlKey);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-editor-timeline-item={item.id}
      onPointerDown={handleMoveStart}
      onKeyDown={handleKeyboard}
      title={`${item.id} · F${item.timelineStartFrame} · ${item.durationInFrames}f`}
      style={{
        position: "absolute",
        left:
          TIMELINE_LABEL_WIDTH +
          frameToPixels(item.timelineStartFrame, pixelsPerFrame),
        top: 5,
        width: Math.max(
          8,
          frameToPixels(item.durationInFrames, pixelsPerFrame),
        ),
        height: 32,
        boxSizing: "border-box",
        border: selected
          ? "2px solid #fff4bd"
          : "1px solid rgba(255,255,255,0.24)",
        borderRadius: 5,
        background: itemBackground(item.type),
        color: "white",
        padding: "0 10px",
        opacity: item.enabled ? 1 : 0.38,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "left",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: "30px",
        cursor: item.locked
          ? "not-allowed"
          : editable
            ? "grab"
            : "pointer",
        zIndex: selected ? 8 : 4,
        boxShadow: selected
          ? "0 0 0 1px rgba(0,0,0,0.55), 0 0 10px rgba(255,244,189,0.2)"
          : "none",
      }}
    >
      {item.type === "TTS" || item.type === "BGM" || item.type === "SFX" ? (
        <Waveform item={item} />
      ) : null}
      <TimelineResizeHandle
        side="left"
        visible={selected && editable}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          select(false);
          onBeginTrim(item.id, "left", event);
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 2,
          pointerEvents: "none",
          textShadow: "0 1px 2px rgba(0,0,0,0.75)",
        }}
      >
        {itemLabel(item)}
      </span>
      <TimelineResizeHandle
        side="right"
        visible={selected && editable}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          select(false);
          onBeginTrim(item.id, "right", event);
        }}
      />
    </div>
  );
};
