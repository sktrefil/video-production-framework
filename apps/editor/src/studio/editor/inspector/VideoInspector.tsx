import {useEffect, useState} from "react";
import type {CSSProperties, FC} from "react";
import {editorActions} from "../editorActions";
import type {VideoTimelineItem} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";

const sectionStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  color: "rgba(255,255,255,0.68)",
  fontSize: 10,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 5,
  background: "rgba(0,0,0,0.28)",
  color: "white",
  padding: "5px 7px",
  fontSize: 11,
  outline: "none",
};

const NumericField: FC<{
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (value: number) => void;
}> = ({label, value, step = 1, min, max, suffix, onCommit}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? Number.NEGATIVE_INFINITY, parsed),
    );
    setDraft(String(bounded));
    onCommit(bounded);
  };

  return (
    <label style={labelStyle}>
      <span>
        {label}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        style={inputStyle}
      />
    </label>
  );
};

export const VideoInspector: FC<{item: VideoTimelineItem}> = ({item}) => {
  const {state, dispatch} = useStudioEditor();
  const fps = state.project.project.fps;
  const maxDuration = Math.max(
    1,
    state.project.project.durationInFrames - item.timelineStartFrame,
  );

  return (
    <div
      data-editor-video-inspector={item.id}
      style={{
        display: "grid",
        gap: 10,
        padding: 10,
      }}
    >
      <div>
        <div style={{fontSize: 12, fontWeight: 800}}>VIDEO</div>
        <div
          title={item.id}
          style={{
            marginTop: 3,
            fontSize: 10,
            opacity: 0.58,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.id}
        </div>
      </div>

      <div style={sectionStyle}>
        <NumericField
          label="Start"
          value={item.timelineStartFrame}
          min={0}
          max={Math.max(0, state.project.project.durationInFrames - 1)}
          onCommit={(value) =>
            dispatch(editorActions.moveItem(item.id, Math.round(value)))
          }
        />
        <NumericField
          label="Duration"
          value={item.durationInFrames}
          min={1}
          max={maxDuration}
          suffix={`${(item.durationInFrames / fps).toFixed(3)}s`}
          onCommit={(value) =>
            dispatch(
              editorActions.changeItemDuration(item.id, Math.round(value)),
            )
          }
        />
      </div>

      <div
        style={{
          padding: "7px 8px",
          borderRadius: 5,
          background: "rgba(255,255,255,0.045)",
          fontSize: 10,
          lineHeight: 1.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <div>Source In: F{item.sourceStartFrame}</div>
        <div>
          Source Out: F
          {item.sourceStartFrame + item.sourceDurationInFrames}
        </div>
        <div>Source Span: {item.sourceDurationInFrames}f</div>
      </div>

      <div style={sectionStyle}>
        <NumericField
          label="Speed"
          value={item.playbackRate}
          min={0.0625}
          max={16}
          step={0.01}
          suffix="×"
          onCommit={(value) =>
            dispatch(editorActions.changePlaybackRate(item.id, value))
          }
        />
        <NumericField
          label="Volume"
          value={item.volume}
          min={0}
          step={0.01}
          onCommit={(value) =>
            dispatch(editorActions.changeVolume(item.id, value))
          }
        />
      </div>

      <label style={labelStyle}>
        <span>Fit</span>
        <select
          value={item.fit}
          onChange={(event) =>
            dispatch(
              editorActions.changeVideoFit(
                item.id,
                event.target.value as "cover" | "contain",
              ),
            )
          }
          style={inputStyle}
        >
          <option value="cover">cover</option>
          <option value="contain">contain</option>
        </select>
      </label>

      <div style={sectionStyle}>
        <NumericField
          label="X"
          value={item.x}
          step={1}
          onCommit={(value) =>
            dispatch(editorActions.updateTransform(item.id, {x: value}))
          }
        />
        <NumericField
          label="Y"
          value={item.y}
          step={1}
          onCommit={(value) =>
            dispatch(editorActions.updateTransform(item.id, {y: value}))
          }
        />
        <NumericField
          label="Scale"
          value={item.scale}
          min={0.001}
          step={0.01}
          onCommit={(value) =>
            dispatch(editorActions.updateTransform(item.id, {scale: value}))
          }
        />
        <NumericField
          label="Rotation"
          value={item.rotation}
          step={0.1}
          onCommit={(value) =>
            dispatch(
              editorActions.updateTransform(item.id, {rotation: value}),
            )
          }
        />
        <NumericField
          label="Opacity"
          value={item.opacity}
          min={0}
          max={1}
          step={0.01}
          onCommit={(value) =>
            dispatch(editorActions.updateTransform(item.id, {opacity: value}))
          }
        />
      </div>
    </div>
  );
};
