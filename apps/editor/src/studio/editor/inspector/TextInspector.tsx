import {useEffect, useState} from "react";
import type {CSSProperties, FC} from "react";
import {editorActions} from "../editorActions";
import type {
  SubtitleTimelineItem,
  TextRole,
  TextStyleFields,
  TextTimelineItem,
} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";

type EditableTextItem = SubtitleTimelineItem | TextTimelineItem;
type EditableTextPatch = Partial<TextStyleFields> & {textRole?: TextRole};

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

export const TextInspector: FC<{item: EditableTextItem}> = ({item}) => {
  const {state, dispatch} = useStudioEditor();
  const [text, setText] = useState(item.text);

  useEffect(() => {
    setText(item.text);
  }, [item.id, item.text]);

  const style = (patch: EditableTextPatch) => {
    if (item.type === "SUBTITLE") {
      dispatch(editorActions.updateSubtitleStyle(item.id, patch));
    } else {
      dispatch(editorActions.updateTextStyle(item.id, patch));
    }
  };

  return (
    <div
      data-editor-text-inspector={item.id}
      style={{display: "grid", gap: 10, padding: 10}}
    >
      <div>
        <div style={{fontSize: 12, fontWeight: 800}}>{item.type}</div>
        <div style={{fontSize: 10, opacity: 0.55, marginTop: 3}}>
          {item.id}
          {item.type === "SUBTITLE" && item.generationSource
            ? ` · ${item.generationSource}`
            : ""}
        </div>
      </div>

      {item.type === "TEXT" ? (
        <label style={labelStyle}>
          <span>Text Role</span>
          <select
            value={item.textRole}
            onChange={(event) =>
              style({textRole: event.target.value as TextRole})
            }
            style={inputStyle}
          >
            <option value="TOP_TITLE">TOP_TITLE</option>
            <option value="LOWER_THIRD">LOWER_THIRD</option>
            <option value="SOURCE">SOURCE</option>
            <option value="LABEL">LABEL</option>
            <option value="FREE_TEXT">FREE_TEXT</option>
          </select>
        </label>
      ) : null}

      <label style={labelStyle}>
        <span>Text / 줄바꿈</span>
        <textarea
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            if (text !== item.text) {
              dispatch(editorActions.updateText(item.id, text));
            }
          }}
          style={{...inputStyle, resize: "vertical", lineHeight: 1.45}}
        />
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
            dispatch(
              editorActions.changeItemDuration(item.id, Math.round(value)),
            )
          }
        />
        <NumericField label="X" value={item.x} onCommit={(x) => style({x})} />
        <NumericField label="Y" value={item.y} onCommit={(y) => style({y})} />
        <NumericField
          label="Width"
          value={item.width}
          min={1}
          onCommit={(width) => style({width})}
        />
        <NumericField
          label="Font Size"
          value={item.fontSize}
          min={1}
          onCommit={(fontSize) => style({fontSize})}
        />
        <NumericField
          label="Font Weight"
          value={item.fontWeight}
          min={100}
          max={900}
          step={100}
          onCommit={(fontWeight) => style({fontWeight})}
        />
        <NumericField
          label="Line Height"
          value={item.lineHeight}
          min={0.1}
          step={0.05}
          onCommit={(lineHeight) => style({lineHeight})}
        />
        <NumericField
          label="Max Lines"
          value={item.maxLines}
          min={1}
          max={6}
          onCommit={(maxLines) => style({maxLines})}
        />
        <NumericField
          label="Stroke"
          value={item.strokeWidth}
          min={0}
          step={0.5}
          onCommit={(strokeWidth) => style({strokeWidth})}
        />
      </div>

      <label style={labelStyle}>
        <span>Font</span>
        <select
          value={item.fontFamily}
          onChange={(event) => style({fontFamily: event.target.value})}
          style={inputStyle}
        >
          <option value="VITRO">VITRO</option>
          <option value="Arial">Arial</option>
          <option value="sans-serif">Sans serif</option>
          <option value="serif">Serif</option>
        </select>
      </label>

      <label style={labelStyle}>
        <span>Alignment</span>
        <select
          value={item.textAlign}
          onChange={(event) =>
            style({
              textAlign: event.target.value as
                | "left"
                | "center"
                | "right",
            })
          }
          style={inputStyle}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>

      <div style={grid}>
        <label style={labelStyle}>
          <span>Text Color</span>
          <input
            type="color"
            value={item.color}
            onChange={(event) => style({color: event.target.value})}
            style={{...inputStyle, height: 34, padding: 3}}
          />
        </label>
        <label style={labelStyle}>
          <span>Stroke Color</span>
          <input
            type="color"
            value={item.strokeColor}
            onChange={(event) => style({strokeColor: event.target.value})}
            style={{...inputStyle, height: 34, padding: 3}}
          />
        </label>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        <input
          type="checkbox"
          checked={item.backgroundEnabled}
          onChange={(event) =>
            style({backgroundEnabled: event.target.checked})
          }
        />
        Background
      </label>

      {item.backgroundEnabled ? (
        <div style={grid}>
          <label style={labelStyle}>
            <span>BG Color</span>
            <input
              type="color"
              value={item.backgroundColor}
              onChange={(event) =>
                style({backgroundColor: event.target.value})
              }
              style={{...inputStyle, height: 34, padding: 3}}
            />
          </label>
          <NumericField
            label="BG Opacity"
            value={item.backgroundOpacity}
            min={0}
            max={1}
            step={0.05}
            onCommit={(backgroundOpacity) => style({backgroundOpacity})}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => dispatch(editorActions.deleteItem(item.id))}
        style={{
          marginTop: 2,
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
        {item.type === "SUBTITLE" ? "자막 삭제" : "텍스트 삭제"}
      </button>
    </div>
  );
};
