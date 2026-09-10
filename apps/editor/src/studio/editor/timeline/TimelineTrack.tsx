import {useState} from "react";
import type {DragEvent, FC, PointerEvent} from "react";
import type {
  EditorTrack,
  TimelineItem as EditorTimelineItem,
} from "../editorTypes";
import {isSupportedExternalBgmFile} from "../audio/externalBgmImport";
import {TimelineItem} from "./TimelineItem";
import {TIMELINE_LABEL_WIDTH} from "./timelineMath";

export const TIMELINE_TRACK_HEIGHT = 42;

export const TimelineTrack: FC<{
  track: EditorTrack;
  items: EditorTimelineItem[];
  selectedItemIds: string[];
  pixelsPerFrame: number;
  onSelectItem: (itemId: string, toggle: boolean) => void;
  onBeginMove: (
    itemId: string,
    event: PointerEvent<HTMLDivElement>,
  ) => void;
  onBeginTrim: (
    itemId: string,
    side: "left" | "right",
    event: PointerEvent<HTMLSpanElement>,
  ) => void;
  durationInFrames: number;
  onExternalBgmDrop?: (file: File, startFrame: number) => void;
  externalBgmImportDisabled?: boolean;
}> = ({
  track,
  items,
  selectedItemIds,
  pixelsPerFrame,
  onSelectItem,
  onBeginMove,
  onBeginTrim,
  durationInFrames,
  onExternalBgmDrop,
  externalBgmImportDisabled = false,
}) => {
  const [bgmDragActive, setBgmDragActive] = useState(false);
  const isBgmTrack =
    /\bBGM\b/i.test(track.name) || /(?:^|_)BGM(?:_|$)/i.test(track.id);
  const canAcceptExternalBgm =
    isBgmTrack &&
    track.enabled &&
    !track.locked &&
    !externalBgmImportDisabled &&
    Boolean(onExternalBgmDrop);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptExternalBgm || !event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setBgmDragActive(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canAcceptExternalBgm) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setBgmDragActive(false);

    const file = Array.from(event.dataTransfer.files).find(
      isSupportedExternalBgmFile,
    );
    if (!file) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const timelineX =
      event.clientX - bounds.left - TIMELINE_LABEL_WIDTH;
    const rawFrame = Math.round(timelineX / Math.max(0.0001, pixelsPerFrame));
    const startFrame = Math.max(
      0,
      Math.min(Math.max(0, durationInFrames - 1), rawFrame),
    );
    onExternalBgmDrop?.(file, startFrame);
  };

  return (
    <div
      data-editor-track={track.id}
      data-editor-bgm-drop-target={isBgmTrack ? "true" : undefined}
      onDragEnter={(event) => {
        if (canAcceptExternalBgm && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setBgmDragActive(true);
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => setBgmDragActive(false)}
      onDrop={handleDrop}
      style={{
        position: "relative",
        height: TIMELINE_TRACK_HEIGHT,
        borderTop: "1px solid rgba(255,255,255,0.07)",
        background: bgmDragActive
          ? "rgba(143,104,45,0.24)"
          : track.enabled
            ? "rgba(255,255,255,0.025)"
            : "rgba(0,0,0,0.22)",
        outline: bgmDragActive
          ? "1px dashed rgba(255,205,119,0.92)"
          : "none",
        outlineOffset: -2,
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
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 10px",
          borderRight: "1px solid rgba(255,255,255,0.12)",
          background: bgmDragActive ? "#3a3021" : "#17191c",
          color: track.enabled
            ? "rgba(255,255,255,0.9)"
            : "rgba(255,255,255,0.4)",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            minWidth: 24,
            padding: "2px 4px",
            borderRadius: 4,
            textAlign: "center",
            background: "rgba(255,255,255,0.08)",
          }}
        >
          {track.id}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {track.name}
        </span>
        {track.locked ? <span title="Locked">🔒</span> : null}
      </div>

      {bgmDragActive ? (
        <div
          style={{
            position: "absolute",
            left: TIMELINE_LABEL_WIDTH + 8,
            top: 0,
            bottom: 0,
            zIndex: 11,
            display: "flex",
            alignItems: "center",
            color: "#ffe0a6",
            fontSize: 10,
            fontWeight: 800,
            pointerEvents: "none",
          }}
        >
          BGM 파일을 놓으면 이 위치에 추가됩니다
        </div>
      ) : null}

      {items.map((item) => (
        <TimelineItem
          key={item.id}
          item={item}
          selected={selectedItemIds.includes(item.id)}
          pixelsPerFrame={pixelsPerFrame}
          onSelect={onSelectItem}
          onBeginMove={onBeginMove}
          onBeginTrim={onBeginTrim}
        />
      ))}
    </div>
  );
};
