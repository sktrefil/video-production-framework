import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {CSSProperties, FC} from "react";
import {createPortal} from "react-dom";
import {pause, play, seek, toggle} from "@remotion/studio";
import {
  useCurrentFrame,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import {editorActions} from "./editorActions";
import {
  canSplitItemAtFrame,
  createSplitItemId,
} from "./audio/audioEditUtils";
import {useStudioEditor} from "./StudioEditorContext";
import {useStudioHeaderToolbar} from "../StudioToolbar";
import {Timeline} from "./timeline/Timeline";
import {Inspector} from "./inspector/Inspector";
import {
  SubtitleGeneratorPanel,
  type SubtitleGateQcFocus,
} from "./subtitles/SubtitleGeneratorPanel";
import {
  resolveSubtitleQcNavigationTarget,
  scrollTimelineSubtitleIntoView,
} from "./subtitles/subtitleQcNavigator";
import type {
  SubtitleTimingQcIssue,
} from "./subtitles/subtitleTimingQc";
import {OverlayGeneratorPanel} from "./overlays/OverlayGeneratorPanel";
import {AudioAssetPanel} from "./audio/AudioAssetPanel";
import {
  EXTERNAL_BGM_ACCEPT,
  uploadExternalBgmFile,
} from "./audio/externalBgmImport";
import {
  createBgmTimelineItem,
  planAudioTracks,
} from "./audio/audioTrackPresets";
import {
  runEditorFinalRender,
  runEditorProductionGate,
  type EditorProductionIssue,
  type EditorProductionResult,
} from "./persistence/editorPersistenceApi";
import {
  clampTimelineFrame,
  formatFrameTimecode,
} from "./timeline/timelineMath";
import type {SubtitleTimelineItem} from "./editorTypes";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

const toolbarButton: CSSProperties = {
  height: 30,
  minWidth: 34,
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "0 9px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const isTextInput = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest("input, textarea, select, [contenteditable='true']"),
  );
};

export const StudioEditor: FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const {isStudio, isReadOnlyStudio} = useRemotionEnvironment();
  const {
    state,
    dispatch,
    persistence,
    saveProject,
    reloadProject,
    canUndo,
    canRedo,
  } = useStudioEditor();
  const headerToolbarRoot = useStudioHeaderToolbar();
  const [open, setOpen] = useState(true);
  const [subtitleGeneratorOpen, setSubtitleGeneratorOpen] = useState(false);
  const [overlayGeneratorOpen, setOverlayGeneratorOpen] = useState(false);
  const [audioAssetsOpen, setAudioAssetsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const bgmFileInputRef = useRef<HTMLInputElement | null>(null);
  const [bgmImportBusy, setBgmImportBusy] = useState(false);
  const [bgmImportMessage, setBgmImportMessage] = useState<string | null>(null);
  const [productionStatus, setProductionStatus] = useState<
    "idle" | "gating" | "rendering" | "approved" | "delivery-ready" | "blocked"
  >("idle");
  const [productionResult, setProductionResult] =
    useState<EditorProductionResult | null>(null);
  const [subtitleGateQcFocus, setSubtitleGateQcFocus] =
    useState<SubtitleGateQcFocus | null>(null);
  const subtitleGateFocusSequenceRef = useRef(0);

  useEffect(() => {
    if (state.selectedItemIds.length === 1) {
      setInspectorOpen(true);
    }
  }, [state.selectedItemIds]);
  const [productionMessage, setProductionMessage] =
    useState<string | null>(null);

  const currentFrame = clampTimelineFrame(frame, durationInFrames);
  const selectedCount = state.selectedItemIds.length;
  const zoom = state.project.settings.timelineZoom;

  const seekExact = useCallback(
    (nextFrame: number) => {
      const clamped = clampTimelineFrame(nextFrame, durationInFrames);
      dispatch(editorActions.setPlayhead(clamped));
      seek(clamped);
    },
    [dispatch, durationInFrames],
  );

  const splitSelectedTts = useCallback(() => {
    if (state.selectedItemIds.length !== 1) {
      return false;
    }
    const itemId = state.selectedItemIds[0];
    if (!canSplitItemAtFrame(state, itemId, currentFrame)) {
      return false;
    }

    dispatch(
      editorActions.splitAudioItem(
        itemId,
        currentFrame,
        createSplitItemId(state, itemId, currentFrame),
      ),
    );
    return true;
  }, [currentFrame, dispatch, state]);

  const setZoom = useCallback(
    (nextZoom: number) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      dispatch(editorActions.setTimelineZoom(clamped));
    },
    [dispatch],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      setZoom(zoom * factor);
    },
    [setZoom, zoom],
  );

  const addExternalBgmFile = useCallback(
    async (file: File, startFrame: number) => {
      if (bgmImportBusy) {
        return;
      }
      setBgmImportBusy(true);
      setBgmImportMessage(null);
      try {
        const uploaded = await uploadExternalBgmFile({
          file,
          fps,
          startFrame,
          volume: 0.1,
        });
        const plan = planAudioTracks(state.project);
        for (const track of plan.tracksToAdd) {
          dispatch(editorActions.addTrack(track));
        }
        const item = createBgmTimelineItem({
          project: state.project,
          trackId: plan.bgmTrackId,
          src: uploaded.src,
          startFrame: uploaded.startFrame,
          sourceAssetDurationInFrames: uploaded.assetFrames,
          volume: uploaded.volume,
        });
        dispatch(editorActions.addItem(item));
        dispatch(editorActions.selectItem([item.id]));
        setSubtitleGeneratorOpen(false);
        setOverlayGeneratorOpen(false);
        setAudioAssetsOpen(false);
        setInspectorOpen(true);
        setBgmImportMessage(
          `BGM 추가 · F${item.timelineStartFrame} · ${file.name}`,
        );
      } catch (caught) {
        setBgmImportMessage(
          `BGM 오류 · ${caught instanceof Error ? caught.message : String(caught)}`,
        );
      } finally {
        setBgmImportBusy(false);
      }
    },
    [bgmImportBusy, dispatch, fps, state.project],
  );

  const openSubtitleQcFromProductionError = useCallback(
    (issue: EditorProductionIssue) => {
      const issueSubtitleIds = issue.data?.subtitleIds;
      const subtitleIds = Array.isArray(issueSubtitleIds)
        ? issueSubtitleIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          )
        : [];
      const rawIssueFrame = issue.data?.frame;
      const issueFrame =
        typeof rawIssueFrame === "number" &&
        Number.isFinite(rawIssueFrame)
          ? rawIssueFrame
          : undefined;
      const qcIssue: SubtitleTimingQcIssue = {
        code: issue.code.replace(
          /^SUBTITLE_QC_/,
          "",
        ) as SubtitleTimingQcIssue["code"],
        severity: "ERROR",
        message: issue.message.replace(/^Subtitle QC:\s*/, ""),
        subtitleIds,
        ...(issueFrame === undefined ? {} : {frame: issueFrame}),
      };
      const subtitles = state.project.items.filter(
        (item): item is SubtitleTimelineItem =>
          item.type === "SUBTITLE",
      );
      const target = resolveSubtitleQcNavigationTarget({
        issue: qcIssue,
        subtitles,
        durationInFrames: state.project.project.durationInFrames,
      });

      subtitleGateFocusSequenceRef.current += 1;
      setSubtitleGateQcFocus({
        requestId: subtitleGateFocusSequenceRef.current,
        code: qcIssue.code,
        message: qcIssue.message,
        subtitleIds: qcIssue.subtitleIds,
        ...(qcIssue.frame === undefined ? {} : {frame: qcIssue.frame}),
      });
      setOpen(true);
      setSubtitleGeneratorOpen(true);
      setOverlayGeneratorOpen(false);
      setAudioAssetsOpen(false);
      setInspectorOpen(false);

      pause();
      seekExact(target.frame);
      if (target.subtitleId) {
        dispatch(editorActions.selectItem([target.subtitleId]));
        scrollTimelineSubtitleIntoView(target.subtitleId);
        setProductionMessage(
          `Gate → QC · ${target.subtitleId} · F${target.frame}`,
        );
      } else {
        setProductionMessage(
          `Gate → QC · F${target.frame} · 연결된 자막을 찾지 못했습니다.`,
        );
      }
    },
    [
      dispatch,
      seekExact,
      state.project.items,
      state.project.project.durationInFrames,
    ],
  );

  const runProductionGate = useCallback(async () => {
    if (state.dirty) {
      setProductionStatus("blocked");
      setProductionMessage("먼저 Save하여 canonical JSON을 확정하세요.");
      return;
    }

    setProductionStatus("gating");
    setProductionMessage(null);
    setProductionResult(null);
    setSubtitleGateQcFocus(null);
    try {
      const result = await runEditorProductionGate(
        state.project.project.id,
      );
      setProductionResult(result);
      if (result.status === "APPROVED") {
        setProductionStatus("approved");
        setProductionMessage(
          `APPROVED · Subtitle QC ${result.subtitleQc?.status ?? "PASS"} · warnings ${result.warnings.length}`,
        );
      } else {
        setProductionStatus("blocked");
        const subtitleError = result.errors.find((entry) =>
          entry.code.startsWith("SUBTITLE_QC_"),
        );
        setProductionMessage(
          subtitleError
            ? `Subtitle QC BLOCKED · ${subtitleError.message}`
            : result.errors[0]?.message ?? "Production Gate BLOCKED",
        );
      }
    } catch (caught) {
      setProductionStatus("blocked");
      setProductionMessage(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }, [state.dirty, state.project.project.id]);

  const runFinalRender = useCallback(async () => {
    if (state.dirty) {
      setProductionStatus("blocked");
      setProductionMessage("Unsaved 상태에서는 Final Render할 수 없습니다.");
      return;
    }

    setProductionStatus("rendering");
    setProductionMessage(null);
    setProductionResult(null);
    setSubtitleGateQcFocus(null);
    try {
      const result = await runEditorFinalRender(
        state.project.project.id,
      );
      setProductionResult(result);
      if (result.status === "DELIVERY_READY") {
        setProductionStatus("delivery-ready");
        setProductionMessage(
          result.outputPath
            ? `DELIVERY READY · Technical QC ${result.technicalQc?.status ?? "PASS"} · Subtitle QC ${result.subtitleQc?.status ?? "PASS"} · ${result.outputPath}`
            : `DELIVERY READY · Technical QC ${result.technicalQc?.status ?? "PASS"} · Subtitle QC ${result.subtitleQc?.status ?? "PASS"}`,
        );
      } else {
        setProductionStatus("blocked");
        const technicalError = result.errors.find((entry) =>
          entry.code.startsWith("TECHNICAL_QC_"),
        );
        const subtitleError = result.errors.find((entry) =>
          entry.code.startsWith("SUBTITLE_QC_"),
        );
        setProductionMessage(
          technicalError
            ? `Final Render BLOCKED · Technical QC · ${technicalError.message}`
            : subtitleError
              ? `Final Render BLOCKED · Subtitle QC · ${subtitleError.message}`
              : result.errors[0]?.message ?? "Final Render BLOCKED",
        );
      }
    } catch (caught) {
      setProductionStatus("blocked");
      setProductionMessage(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }, [state.dirty, state.project.project.id]);

  useEffect(() => {
    if (!isStudio || isReadOnlyStudio || !open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void saveProject();
        return;
      }

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        dispatch(
          event.shiftKey ? editorActions.redo() : editorActions.undo(),
        );
        return;
      }

      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        dispatch(editorActions.redo());
        return;
      }

      if (event.key === "Delete" && state.selectedItemIds.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        for (const itemId of state.selectedItemIds) {
          dispatch(editorActions.deleteItem(itemId));
        }
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        seekExact(currentFrame + direction * (event.shiftKey ? 5 : 1));
        return;
      }

      if (
        event.key.toLowerCase() === "s" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        splitSelectedTts()
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggle();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    currentFrame,
    dispatch,
    isReadOnlyStudio,
    isStudio,
    open,
    seekExact,
    saveProject,
    splitSelectedTts,
    state.selectedItemIds,
  ]);

  const timecode = useMemo(
    () => formatFrameTimecode(currentFrame, fps),
    [currentFrame, fps],
  );

  if (!isStudio || isReadOnlyStudio) {
    return null;
  }

  const panel = open ? (
    <div
      data-generic-editor-panel="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        bottom: 8,
        height: 380,
        zIndex: 2147483000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 10,
        background: "#15171a",
        color: "white",
        boxShadow: "0 10px 42px rgba(0,0,0,0.58)",
        fontFamily: "Arial, sans-serif",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          flex: "0 0 44px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          background: "#1d2024",
        }}
      >
        <strong style={{fontSize: 12, marginRight: 6}}>
          Generic Editor
        </strong>

        <button type="button" onClick={() => play()} style={toolbarButton}>
          ▶
        </button>
        <button type="button" onClick={() => pause()} style={toolbarButton}>
          ❚❚
        </button>
        <button
          type="button"
          onClick={() => seekExact(currentFrame - 5)}
          style={toolbarButton}
          title="-5 frames"
        >
          -5F
        </button>
        <button
          type="button"
          onClick={() => seekExact(currentFrame - 1)}
          style={toolbarButton}
          title="-1 frame"
        >
          -1F
        </button>
        <button
          type="button"
          onClick={() => seekExact(currentFrame + 1)}
          style={toolbarButton}
          title="+1 frame"
        >
          +1F
        </button>
        <button
          type="button"
          onClick={() => seekExact(currentFrame + 5)}
          style={toolbarButton}
          title="+5 frames"
        >
          +5F
        </button>

        <div
          style={{
            minWidth: 126,
            padding: "5px 8px",
            borderRadius: 5,
            background: "rgba(0,0,0,0.3)",
            fontVariantNumeric: "tabular-nums",
            fontSize: 11,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {timecode} · F{currentFrame}
        </div>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={state.project.settings.snapEnabled}
            onChange={(event) =>
              dispatch(
                editorActions.setSnap(
                  event.target.checked,
                  state.project.settings.snapToleranceFrames,
                ),
              )
            }
          />
          Snap {state.project.settings.snapToleranceFrames}F
        </label>

        <span style={{fontSize: 10, opacity: 0.55, marginLeft: 4}}>
          Zoom
        </span>
        <input
          aria-label="Timeline zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          style={{width: 120}}
        />
        <span
          style={{
            width: 38,
            fontSize: 10,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {zoom.toFixed(2)}×
        </span>

        <span style={{fontSize: 10, opacity: 0.58}}>
          {selectedCount > 0 ? `${selectedCount} selected` : "No selection"}
        </span>

        <button
          data-editor-undo-button="true"
          type="button"
          disabled={!canUndo}
          onClick={() => dispatch(editorActions.undo())}
          style={{
            ...toolbarButton,
            opacity: canUndo ? 1 : 0.38,
            cursor: canUndo ? "pointer" : "not-allowed",
          }}
          title="Undo · Ctrl+Z"
        >
          ↶
        </button>

        <button
          data-editor-redo-button="true"
          type="button"
          disabled={!canRedo}
          onClick={() => dispatch(editorActions.redo())}
          style={{
            ...toolbarButton,
            opacity: canRedo ? 1 : 0.38,
            cursor: canRedo ? "pointer" : "not-allowed",
          }}
          title="Redo · Ctrl+Shift+Z / Ctrl+Y"
        >
          ↷
        </button>

        <button
          data-editor-save-button="true"
          type="button"
          disabled={persistence.status === "saving"}
          onClick={() => void saveProject()}
          style={{
            ...toolbarButton,
            background: state.dirty
              ? "rgba(145,94,38,0.85)"
              : "rgba(58,104,70,0.68)",
          }}
          title="Save edit_project.json · Ctrl+S"
        >
          {persistence.status === "saving"
            ? "Saving…"
            : state.dirty
              ? "Save*"
              : "Saved"}
        </button>

        <button
          data-editor-load-button="true"
          type="button"
          disabled={persistence.status === "loading"}
          onClick={() => {
            if (
              state.dirty &&
              !window.confirm(
                "저장되지 않은 변경사항을 버리고 저장된 edit_project.json을 다시 불러올까요?",
              )
            ) {
              return;
            }
            void reloadProject();
          }}
          style={toolbarButton}
          title="Reload saved edit_project.json"
        >
          {persistence.status === "loading" ? "Loading…" : "Load"}
        </button>

        <span
          data-editor-dirty-state={state.dirty ? "dirty" : "clean"}
          title={persistence.savedPath ?? undefined}
          style={{
            minWidth: 66,
            fontSize: 10,
            color: persistence.error
              ? "#ff9b91"
              : state.dirty
                ? "#ffd08a"
                : "#9fd5aa",
          }}
        >
          {persistence.error
            ? "Save Error"
            : state.dirty
              ? "● Unsaved"
              : "● Saved"}
        </span>

        <button
          data-editor-production-gate-button="true"
          type="button"
          disabled={
            state.dirty ||
            productionStatus === "gating" ||
            productionStatus === "rendering"
          }
          onClick={() => void runProductionGate()}
          style={{
            ...toolbarButton,
            opacity: state.dirty ? 0.42 : 1,
            background:
              productionStatus === "approved"
                ? "rgba(52,116,69,0.78)"
                : "rgba(255,255,255,0.07)",
          }}
          title="Validate saved edit_project.json before render"
        >
          {productionStatus === "gating" ? "Gating…" : "Gate"}
        </button>

        <button
          data-editor-final-render-button="true"
          type="button"
          disabled={
            state.dirty ||
            productionStatus === "gating" ||
            productionStatus === "rendering"
          }
          onClick={() => void runFinalRender()}
          style={{
            ...toolbarButton,
            opacity: state.dirty ? 0.42 : 1,
            background:
              productionStatus === "delivery-ready"
                ? "rgba(46,112,91,0.82)"
                : "rgba(92,69,126,0.78)",
          }}
          title="Run Production Gate first; Subtitle QC ERROR blocks Final Render"
        >
          {productionStatus === "rendering" ? "Rendering…" : "Final Render"}
        </button>

        <span
          data-editor-production-status={productionStatus}
          title={
            productionResult?.projectSha256
              ? `project sha256: ${productionResult.projectSha256}`
              : undefined
          }
          style={{
            maxWidth: 260,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 10,
            color:
              productionStatus === "blocked"
                ? "#ff9b91"
                : productionStatus === "delivery-ready"
                  ? "#9fe0c5"
                  : productionStatus === "approved"
                    ? "#a9dda9"
                    : "rgba(255,255,255,0.58)",
          }}
        >
          {productionMessage ??
            (state.dirty
              ? "Save required for Gate/Render"
              : "Production ready")}
        </span>

        {productionResult?.errors
          .filter((entry) => entry.code.startsWith("SUBTITLE_QC_"))
          .slice(0, 3)
          .map((entry, index) => (
            <button
              key={`${entry.code}-${index}`}
              data-editor-production-subtitle-qc-error={entry.code}
              type="button"
              onClick={() => openSubtitleQcFromProductionError(entry)}
              title={entry.message}
              style={{
                ...toolbarButton,
                height: 26,
                maxWidth: 126,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                background: "rgba(125,52,48,0.82)",
                color: "#ffd0ca",
                fontSize: 9,
              }}
            >
              QC {entry.code.replace("SUBTITLE_QC_", "")}
            </button>
          ))}

        {(productionResult?.errors.filter((entry) =>
          entry.code.startsWith("SUBTITLE_QC_"),
        ).length ?? 0) > 3 ? (
          <span
            data-editor-production-subtitle-qc-overflow="true"
            style={{fontSize: 9, color: "#ffc1ba"}}
          >
            +
            {(productionResult?.errors.filter((entry) =>
              entry.code.startsWith("SUBTITLE_QC_"),
            ).length ?? 0) - 3}
          </span>
        ) : null}

        <button
          data-editor-inspector-toggle="true"
          type="button"
          onClick={() => setInspectorOpen((value) => !value)}
          style={{
            ...toolbarButton,
            background: inspectorOpen
              ? "rgba(62,91,126,0.82)"
              : "rgba(255,255,255,0.07)",
          }}
          title="속성 창 열기/닫기"
        >
          속성
        </button>

        <button
          type="button"
          onClick={() => {
            setSubtitleGeneratorOpen((value) => !value);
            setOverlayGeneratorOpen(false);
            setAudioAssetsOpen(false);
            setInspectorOpen(false);
          }}
          style={{
            ...toolbarButton,
            background: subtitleGeneratorOpen
              ? "rgba(51,111,115,0.85)"
              : "rgba(255,255,255,0.07)",
          }}
        >
          Auto 자막
        </button>

        <button
          type="button"
          onClick={() => {
            setOverlayGeneratorOpen((value) => !value);
            setSubtitleGeneratorOpen(false);
            setAudioAssetsOpen(false);
            setInspectorOpen(false);
          }}
          style={{
            ...toolbarButton,
            background: overlayGeneratorOpen
              ? "rgba(90,99,141,0.85)"
              : "rgba(255,255,255,0.07)",
          }}
        >
          Text/Graphics
        </button>

        <input
          ref={bgmFileInputRef}
          type="file"
          accept={EXTERNAL_BGM_ACCEPT}
          disabled={bgmImportBusy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void addExternalBgmFile(file, currentFrame);
            }
          }}
          style={{display: "none"}}
        />
        <button
          data-editor-add-bgm-button="true"
          type="button"
          disabled={bgmImportBusy}
          onClick={() => bgmFileInputRef.current?.click()}
          style={{
            ...toolbarButton,
            background: "rgba(139,106,53,0.72)",
            opacity: bgmImportBusy ? 0.55 : 1,
          }}
          title="외부 MP3/WAV/M4A를 현재 Playhead에 BGM으로 추가"
        >
          {bgmImportBusy ? "BGM 추가중…" : "+ BGM 추가"}
        </button>

        <button
          type="button"
          onClick={() => {
            setAudioAssetsOpen((value) => !value);
            setSubtitleGeneratorOpen(false);
            setOverlayGeneratorOpen(false);
            setInspectorOpen(false);
          }}
          style={{
            ...toolbarButton,
            background: audioAssetsOpen
              ? "rgba(121,87,54,0.88)"
              : "rgba(255,255,255,0.07)",
          }}
        >
          BGM/SFX
        </button>

        {bgmImportMessage ? (
          <span
            data-editor-bgm-import-status="true"
            title={bgmImportMessage}
            style={{
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 10,
              color: bgmImportMessage.startsWith("BGM 오류")
                ? "#ff9b91"
                : "#f2d49b",
            }}
          >
            {bgmImportMessage}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{...toolbarButton, marginLeft: "auto"}}
        >
          닫기
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <Timeline
          currentFrame={currentFrame}
          onSeek={seekExact}
          onZoomByFactor={zoomByFactor}
          onImportBgmFile={(file, startFrame) =>
            void addExternalBgmFile(file, startFrame)
          }
          bgmImportBusy={bgmImportBusy}
        />
      </div>
    </div>
  ) : null;

  return (
    <>
      {headerToolbarRoot
        ? createPortal(
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              title="Generic Editor Timeline"
              style={{
                ...toolbarButton,
                height: 24,
                minWidth: 94,
                background: open
                  ? "rgba(72,112,160,0.7)"
                  : "rgba(28,31,34,0.98)",
              }}
            >
              Editor Timeline
            </button>,
            headerToolbarRoot,
          )
        : null}
      {open ? createPortal(panel, document.body) : null}
      {open && inspectorOpen
        ? createPortal(
            <Inspector
              floating
              onClose={() => setInspectorOpen(false)}
            />,
            document.body,
          )
        : null}
      {open && subtitleGeneratorOpen
        ? createPortal(
            <SubtitleGeneratorPanel
              gateFocus={subtitleGateQcFocus}
              onClose={() => setSubtitleGeneratorOpen(false)}
            />,
            document.body,
          )
        : null}
      {open && overlayGeneratorOpen
        ? createPortal(
            <OverlayGeneratorPanel
              onClose={() => setOverlayGeneratorOpen(false)}
            />,
            document.body,
          )
        : null}
      {open && audioAssetsOpen
        ? createPortal(
            <AudioAssetPanel
              onClose={() => setAudioAssetsOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
};
