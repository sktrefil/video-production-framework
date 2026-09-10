import type {FC} from "react";
import {selectSelectedItems} from "../editorSelectors";
import {useStudioEditor} from "../StudioEditorContext";
import {AudioInspector} from "./AudioInspector";
import {VideoInspector} from "./VideoInspector";
import {GraphicInspector} from "./GraphicInspector";
import {TextInspector} from "./TextInspector";

export const Inspector: FC<{
  floating?: boolean;
  onClose?: () => void;
}> = ({floating = false, onClose}) => {
  const {state} = useStudioEditor();
  const selected = selectSelectedItems(state);

  return (
    <aside
      data-editor-inspector="true"
      data-editor-inspector-mode={floating ? "floating" : "inline"}
      onPointerDown={(event) => {
        if (floating) {
          event.stopPropagation();
        }
      }}
      style={
        floating
          ? {
              position: "fixed",
              right: 8,
              bottom: 396,
              zIndex: 2147483002,
              width: 300,
              maxHeight: "min(560px, calc(100vh - 420px))",
              overflow: "auto",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10,
              background: "#181a1d",
              color: "white",
              boxShadow: "0 14px 40px rgba(0,0,0,0.62)",
              fontFamily: "Arial, sans-serif",
              pointerEvents: "auto",
            }
          : {
              flex: "0 0 270px",
              minWidth: 270,
              overflow: "auto",
              borderLeft: "1px solid rgba(255,255,255,0.1)",
              background: "#181a1d",
            }
      }
    >
      {floating ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            minHeight: 34,
            padding: "0 9px",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            background: "#1d2024",
          }}
        >
          <strong style={{fontSize: 11}}>속성</strong>
          <button
            type="button"
            data-editor-inspector-close="true"
            onClick={onClose}
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 5,
              background: "rgba(255,255,255,0.07)",
              color: "white",
              padding: "3px 7px",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>
      ) : null}

      {selected.length === 0 ? (
        <div style={{padding: 12, fontSize: 11, opacity: 0.5}}>
          타임라인에서 항목을 선택하세요.
        </div>
      ) : selected.length > 1 ? (
        <div style={{padding: 12, fontSize: 11, opacity: 0.62}}>
          {selected.length}개 항목 선택됨
        </div>
      ) : selected[0].type === "VIDEO" ? (
        <VideoInspector item={selected[0]} />
      ) : selected[0].type === "TTS" ||
        selected[0].type === "BGM" ||
        selected[0].type === "SFX" ? (
        <AudioInspector item={selected[0]} />
      ) : selected[0].type === "SUBTITLE" || selected[0].type === "TEXT" ? (
        <TextInspector item={selected[0]} />
      ) : selected[0].type === "GRAPHIC" ? (
        <GraphicInspector item={selected[0]} />
      ) : (
        <div style={{padding: 12, fontSize: 11, opacity: 0.62}}>
          {selected[0].type} Inspector는 후속 단계에서 확장됩니다.
        </div>
      )}
    </aside>
  );
};
