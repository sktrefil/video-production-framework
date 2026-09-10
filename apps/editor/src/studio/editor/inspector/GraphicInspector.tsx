import {useEffect, useState} from "react";
import type {CSSProperties, FC} from "react";
import {editorActions} from "../editorActions";
import type {GraphicTimelineItem, GraphicType} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";

const grid: CSSProperties = {
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
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}> = ({label, value, min, max, step = 1, onCommit}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
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
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
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

export const GraphicInspector: FC<{item: GraphicTimelineItem}> = ({item}) => {
  const {state, dispatch} = useStudioEditor();
  const patch = (value: Parameters<typeof editorActions.updateGraphicStyle>[1]) =>
    dispatch(editorActions.updateGraphicStyle(item.id, value));

  return (
    <div
      data-editor-graphic-inspector={item.id}
      style={{display: "grid", gap: 10, padding: 10}}
    >
      <div>
        <div style={{fontSize: 12, fontWeight: 800}}>GRAPHIC</div>
        <div style={{fontSize: 10, opacity: 0.55, marginTop: 3}}>{item.id}</div>
      </div>

      <label style={labelStyle}>
        <span>Graphic Type</span>
        <select
          value={item.graphicType}
          onChange={(event) =>
            patch({graphicType: event.target.value as GraphicType})
          }
          style={inputStyle}
        >
          <option value="BLUR_PANEL">BLUR_PANEL</option>
          <option value="GRADIENT">GRADIENT</option>
          <option value="SOLID_PANEL">SOLID_PANEL</option>
          <option value="DIM_LAYER">DIM_LAYER</option>
        </select>
      </label>

      <div style={grid}>
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
          max={Math.max(
            1,
            state.project.project.durationInFrames - item.timelineStartFrame,
          )}
          onCommit={(value) =>
            dispatch(editorActions.changeItemDuration(item.id, Math.round(value)))
          }
        />
        <NumericField label="X" value={item.x} onCommit={(x) => patch({x})} />
        <NumericField label="Y" value={item.y} onCommit={(y) => patch({y})} />
        <NumericField
          label="Width"
          value={item.width}
          min={1}
          onCommit={(width) => patch({width})}
        />
        <NumericField
          label="Height"
          value={item.height}
          min={1}
          onCommit={(height) => patch({height})}
        />
        <NumericField
          label="Opacity"
          value={item.opacity}
          min={0}
          max={1}
          step={0.05}
          onCommit={(opacity) => patch({opacity})}
        />
        <NumericField
          label="Blur"
          value={item.blurPx}
          min={0}
          step={1}
          onCommit={(blurPx) => patch({blurPx})}
        />
        <NumericField
          label="Radius"
          value={item.borderRadius}
          min={0}
          step={1}
          onCommit={(borderRadius) => patch({borderRadius})}
        />
      </div>

      {item.graphicType === "GRADIENT" ? (
        <>
          <div style={grid}>
            <label style={labelStyle}>
              <span>Gradient Start</span>
              <input
                type="text"
                value={item.gradientStartColor ?? "rgba(0,0,0,0)"}
                onChange={(event) => patch({gradientStartColor: event.target.value})}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span>Gradient End</span>
              <input
                type="text"
                value={item.gradientEndColor ?? "rgba(0,0,0,0.78)"}
                onChange={(event) => patch({gradientEndColor: event.target.value})}
                style={inputStyle}
              />
            </label>
          </div>
          <NumericField
            label="Gradient Angle"
            value={item.gradientAngleDeg ?? 180}
            step={1}
            onCommit={(gradientAngleDeg) => patch({gradientAngleDeg})}
          />
        </>
      ) : (
        <label style={labelStyle}>
          <span>Background Color</span>
          <input
            type="text"
            value={item.backgroundColor}
            onChange={(event) => patch({backgroundColor: event.target.value})}
            style={inputStyle}
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => dispatch(editorActions.deleteItem(item.id))}
        style={{
          border: "1px solid rgba(255,110,100,0.4)",
          borderRadius: 6,
          padding: "7px 9px",
          background: "rgba(150,44,38,0.24)",
          color: "#ffc1ba",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        그래픽 삭제
      </button>
    </div>
  );
};
