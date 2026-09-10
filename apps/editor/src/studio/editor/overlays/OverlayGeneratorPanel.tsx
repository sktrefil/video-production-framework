import type {CSSProperties, FC} from "react";
import {useCurrentFrame} from "remotion";
import {editorActions} from "../editorActions";
import {useStudioEditor} from "../StudioEditorContext";
import {
  createOverlayPreset,
  planOverlayTracks,
  type OverlayPreset,
} from "./overlayPresets";

const buttonStyle: CSSProperties = {
  minHeight: 38,
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 7,
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "7px 9px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const presets: Array<{
  preset: OverlayPreset;
  label: string;
  detail: string;
}> = [
  {preset: "TOP_TITLE", label: "상단 제목", detail: "TOP_TITLE text"},
  {preset: "LOWER_INFO", label: "하단 정보", detail: "LOWER_THIRD text"},
  {preset: "TOP_BLUR", label: "상단 Blur", detail: "backdrop blur"},
  {preset: "BOTTOM_BLUR", label: "하단 Blur", detail: "backdrop blur"},
  {preset: "GRADIENT", label: "Gradient", detail: "fade overlay"},
  {preset: "PANEL", label: "Panel", detail: "solid panel"},
  {preset: "DIM_LAYER", label: "Dim Layer", detail: "full-screen dim"},
];

export const OverlayGeneratorPanel: FC<{onClose: () => void}> = ({
  onClose,
}) => {
  const frame = useCurrentFrame();
  const {state, dispatch} = useStudioEditor();

  const create = (preset: OverlayPreset) => {
    const plan = planOverlayTracks(state.project);
    for (const track of plan.tracksToAdd) {
      dispatch(editorActions.addTrack(track));
    }

    const item = createOverlayPreset({
      project: state.project,
      preset,
      startFrame: frame,
      textTrackId: plan.textTrackId,
      graphicTrackId: plan.graphicTrackId,
    });
    dispatch(editorActions.addItem(item));
    dispatch(editorActions.selectItem([item.id]));
  };

  return (
    <div
      data-editor-overlay-generator="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        right: 286,
        bottom: 396,
        zIndex: 2147483001,
        width: 330,
        boxSizing: "border-box",
        padding: 12,
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: 10,
        background: "#181a1d",
        color: "white",
        boxShadow: "0 14px 40px rgba(0,0,0,0.62)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div style={{fontSize: 13, fontWeight: 900}}>TEXT + GRAPHICS</div>
          <div style={{fontSize: 10, opacity: 0.55}}>
            현재 Playhead F{frame}에서 생성
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{...buttonStyle, minHeight: 30}}
        >
          닫기
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 7,
          marginTop: 11,
        }}
      >
        {presets.map((entry) => (
          <button
            key={entry.preset}
            type="button"
            onClick={() => create(entry.preset)}
            style={buttonStyle}
          >
            <div>{entry.label}</div>
            <div
              style={{
                marginTop: 2,
                fontSize: 9,
                fontWeight: 500,
                opacity: 0.48,
              }}
            >
              {entry.detail}
            </div>
          </button>
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 8,
          borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          fontSize: 10,
          lineHeight: 1.45,
          opacity: 0.68,
        }}
      >
        TEXT/GRAPHIC Track이 없으면 자동 생성합니다. 생성 후 Timeline,
        Preview Canvas, Inspector에서 자유롭게 수정할 수 있습니다.
      </div>
    </div>
  );
};
