import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {
  CSSProperties,
  ChangeEvent,
  DragEvent,
  FC,
  MutableRefObject,
} from "react";
import {useCurrentFrame} from "remotion";
import {
  bgmInboxPreviewUrl,
  getStudioAudioState,
  importInboxBgm,
} from "../../audio/audio-api";
import type {StudioAudioState} from "../../audio/audio-types";
import {
  getSfxState,
  importInboxSfx,
  inboxPreviewUrl,
  uploadSfx,
} from "../../sfx/sfx-api";
import type {SfxState} from "../../sfx/sfx-types";
import {editorActions} from "../editorActions";
import {useStudioEditor} from "../StudioEditorContext";
import {
  probeAudioDurationFrames,
  probeAudioFileDurationFrames,
} from "./audioAssetUtils";
import {
  createBgmTimelineItem,
  createSfxTimelineItem,
  planAudioTracks,
} from "./audioTrackPresets";
import {
  EXTERNAL_BGM_ACCEPT,
  isSupportedExternalBgmFile,
  uploadExternalBgmFile,
} from "./externalBgmImport";

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 7,
  background: "rgba(255,255,255,0.07)",
  color: "white",
  padding: "7px 9px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 5,
  background: "rgba(0,0,0,0.3)",
  color: "white",
  padding: "6px 7px",
  fontSize: 11,
};

const stopAudio = (ref: MutableRefObject<HTMLAudioElement | null>) => {
  ref.current?.pause();
  if (ref.current) {
    ref.current.src = "";
  }
  ref.current = null;
};

export const AudioAssetPanel: FC<{onClose: () => void}> = ({onClose}) => {
  const frame = useCurrentFrame();
  const {state, dispatch} = useStudioEditor();
  const [audioState, setAudioState] = useState<StudioAudioState | null>(null);
  const [sfxState, setSfxState] = useState<SfxState | null>(null);
  const [bgmInboxName, setBgmInboxName] = useState("");
  const [sfxInboxName, setSfxInboxName] = useState("");
  const [legacySfxKey, setLegacySfxKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgmDragActive, setBgmDragActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const fps = state.project.project.fps;

  const refresh = useCallback(async () => {
    const [nextAudio, nextSfx] = await Promise.all([
      getStudioAudioState(),
      getSfxState(),
    ]);
    setAudioState(nextAudio);
    setSfxState(nextSfx);
    setBgmInboxName((current) =>
      nextAudio.inbox.some((asset) => asset.name === current)
        ? current
        : (nextAudio.inbox[0]?.name ?? ""),
    );
    setSfxInboxName((current) =>
      nextSfx.inbox.some((asset) => asset.name === current)
        ? current
        : (nextSfx.inbox[0]?.name ?? ""),
    );
    setLegacySfxKey((current) =>
      nextSfx.sfx.some((item) => (item.id ?? item.path) === current)
        ? current
        : (nextSfx.sfx[0]
            ? nextSfx.sfx[0].id ?? nextSfx.sfx[0].path
            : ""),
    );
  }, []);

  useEffect(() => {
    void refresh().catch((caught) =>
      setError(caught instanceof Error ? caught.message : String(caught)),
    );
    return () => stopAudio(previewRef);
  }, [refresh]);

  const ensureTracks = () => {
    const plan = planAudioTracks(state.project);
    for (const track of plan.tracksToAdd) {
      dispatch(editorActions.addTrack(track));
    }
    return plan;
  };

  const addBgm = async ({
    src,
    volume,
    startFrame,
    knownFrames,
  }: {
    src: string;
    volume: number;
    startFrame: number;
    knownFrames?: number;
  }) => {
    const assetFrames =
      knownFrames ?? (await probeAudioDurationFrames(src, fps));
    const plan = ensureTracks();
    const item = createBgmTimelineItem({
      project: state.project,
      trackId: plan.bgmTrackId,
      src,
      startFrame,
      sourceAssetDurationInFrames: assetFrames,
      volume,
    });
    dispatch(editorActions.addItem(item));
    dispatch(editorActions.selectItem([item.id]));
    setMessage(`BGM 추가 완료 · ${assetFrames} source frames · Loop ON`);
  };

  const addSfx = async ({
    src,
    volume,
    startFrame,
    assetFrames,
    preferredDurationInFrames,
  }: {
    src: string;
    volume: number;
    startFrame: number;
    assetFrames: number;
    preferredDurationInFrames?: number;
  }) => {
    const plan = ensureTracks();
    const item = createSfxTimelineItem({
      project: state.project,
      trackId: plan.sfxTrackId,
      src,
      startFrame,
      sourceAssetDurationInFrames: assetFrames,
      volume,
      preferredDurationInFrames,
    });
    dispatch(editorActions.addItem(item));
    dispatch(editorActions.selectItem([item.id]));
    setMessage(`SFX 추가 완료 · ${item.durationInFrames}f`);
  };

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await job();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const preview = (src: string, volume = 0.5) => {
    stopAudio(previewRef);
    const audio = new window.Audio(src);
    audio.volume = Math.min(1, Math.max(0, volume));
    previewRef.current = audio;
    void audio.play().catch((caught) =>
      setError(caught instanceof Error ? caught.message : String(caught)),
    );
  };

  const importBgmInbox = () =>
    run(async () => {
      if (!bgmInboxName) return;
      const next = await importInboxBgm({
        name: bgmInboxName,
        volume: 0.1,
        startFrame: frame,
      });
      if (!next.bgm.path) {
        throw new Error("BGM import returned no path");
      }
      await addBgm({
        src: next.bgm.path,
        volume: next.bgm.volume,
        startFrame: frame,
      });
    });

  const addCurrentBgm = () =>
    run(async () => {
      if (!audioState?.bgm.path) {
        throw new Error("현재 적용된 BGM이 없습니다.");
      }
      await addBgm({
        src: audioState.bgm.path,
        volume: audioState.bgm.volume,
        startFrame: audioState.bgm.startFrame,
      });
    });

  const addExternalBgmFile = (file: File, startFrame = frame) =>
    run(async () => {
      const uploaded = await uploadExternalBgmFile({
        file,
        fps,
        startFrame,
        volume: 0.1,
      });
      await addBgm({
        src: uploaded.src,
        volume: uploaded.volume,
        startFrame: uploaded.startFrame,
        knownFrames: uploaded.assetFrames,
      });
    });

  const chooseBgmFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void addExternalBgmFile(file, frame);
  };

  const handleBgmDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (busy || !event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setBgmDragActive(true);
  };

  const handleBgmDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setBgmDragActive(false);
    if (busy) {
      return;
    }
    const file = Array.from(event.dataTransfer.files).find(
      isSupportedExternalBgmFile,
    );
    if (!file) {
      setError("BGM은 MP3, WAV, M4A 파일만 추가할 수 있습니다.");
      return;
    }
    void addExternalBgmFile(file, frame);
  };

  const importSfxInbox = () =>
    run(async () => {
      if (!sfxInboxName) return;
      const previewUrl = inboxPreviewUrl(sfxInboxName);
      const assetFrames = await probeAudioDurationFrames(previewUrl, fps);
      const durationSeconds = assetFrames / Math.max(1, fps);
      const imported = await importInboxSfx({
        name: sfxInboxName,
        startFrame: frame,
        fps,
        durationSeconds,
        volume: 0.18,
      });
      await addSfx({
        src: imported.path,
        volume: imported.volume,
        startFrame: imported.startFrame,
        assetFrames,
        preferredDurationInFrames: imported.durationInFrames,
      });
    });

  const addLegacySfx = () =>
    run(async () => {
      const selected = sfxState?.sfx.find(
        (item) => (item.id ?? item.path) === legacySfxKey,
      );
      if (!selected) {
        throw new Error("가져올 기존 SFX를 선택해 주세요.");
      }
      let assetFrames = Math.max(1, selected.durationInFrames);
      try {
        assetFrames = await probeAudioDurationFrames(selected.path, fps);
      } catch {
        // Keep the existing sidecar duration when metadata probing is unavailable.
      }
      await addSfx({
        src: selected.path,
        volume: selected.volume,
        startFrame: selected.startFrame,
        assetFrames,
        preferredDurationInFrames: selected.durationInFrames,
      });
    });

  const chooseSfxFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void run(async () => {
      const assetFrames = await probeAudioFileDurationFrames(file, fps);
      const imported = await uploadSfx({
        file,
        startFrame: frame,
        durationSeconds: assetFrames / Math.max(1, fps),
        volume: 0.18,
      });
      await addSfx({
        src: imported.path,
        volume: imported.volume,
        startFrame: imported.startFrame,
        assetFrames,
        preferredDurationInFrames: imported.durationInFrames,
      });
    });
  };

  const currentBgmLabel = useMemo(
    () =>
      audioState?.bgm.path
        ? audioState.bgm.originalName ?? audioState.bgm.path
        : "없음",
    [audioState],
  );

  return (
    <div
      data-editor-audio-assets="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        right: 286,
        bottom: 396,
        zIndex: 2147483001,
        width: 390,
        maxHeight: "min(610px, 68vh)",
        overflow: "auto",
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
      <div style={{display: "flex", justifyContent: "space-between", gap: 10}}>
        <div>
          <div style={{fontSize: 13, fontWeight: 900}}>BGM + SFX</div>
          <div style={{fontSize: 10, opacity: 0.55}}>
            Generic A3/A4 · Playhead F{frame}
          </div>
        </div>
        <button type="button" onClick={onClose} style={buttonStyle}>닫기</button>
      </div>

      <div style={{marginTop: 12, fontSize: 11, fontWeight: 900}}>BGM</div>
      <div style={{marginTop: 5, fontSize: 10, opacity: 0.58}}>
        현재 Sidecar BGM: {currentBgmLabel}
      </div>
      <button
        type="button"
        disabled={busy || !audioState?.bgm.path}
        onClick={() => void addCurrentBgm()}
        style={{...buttonStyle, width: "100%", marginTop: 7}}
      >
        현재 BGM을 Generic Timeline에 추가
      </button>

      {audioState?.inbox.length ? (
        <>
          <select
            value={bgmInboxName}
            onChange={(event) => setBgmInboxName(event.target.value)}
            style={{...inputStyle, marginTop: 7}}
          >
            {audioState.inbox.map((asset) => (
              <option key={asset.name} value={asset.name} style={{color: "black"}}>
                {asset.name}
              </option>
            ))}
          </select>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6}}>
            <button
              type="button"
              onClick={() => preview(bgmInboxPreviewUrl(bgmInboxName), 0.35)}
              style={buttonStyle}
            >
              ▶ BGM 미리듣기
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importBgmInbox()}
              style={{...buttonStyle, background: "rgba(139,106,53,0.65)"}}
            >
              Inbox BGM 추가
            </button>
          </div>
        </>
      ) : null}
      <div
        data-editor-bgm-drop-zone="true"
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setBgmDragActive(true);
          }
        }}
        onDragOver={handleBgmDragOver}
        onDragLeave={() => setBgmDragActive(false)}
        onDrop={handleBgmDrop}
        style={{
          marginTop: 7,
          padding: "12px 10px",
          border: bgmDragActive
            ? "1px dashed rgba(255,205,119,0.95)"
            : "1px dashed rgba(255,255,255,0.22)",
          borderRadius: 7,
          background: bgmDragActive
            ? "rgba(143,104,45,0.28)"
            : "rgba(255,255,255,0.035)",
          color: bgmDragActive ? "#ffe0a6" : "rgba(255,255,255,0.68)",
          fontSize: 10,
          textAlign: "center",
        }}
      >
        {bgmDragActive
          ? "여기에 놓으면 현재 Playhead에 BGM이 추가됩니다"
          : "외부 BGM 파일을 여기에 Drag & Drop"}
      </div>

      <label
        data-editor-add-bgm-file-button="true"
        style={{
          ...buttonStyle,
          display: "block",
          textAlign: "center",
          marginTop: 6,
          background: "rgba(139,106,53,0.65)",
        }}
      >
        {busy ? "BGM 추가 중…" : "+ BGM 추가"}
        <input
          type="file"
          accept={EXTERNAL_BGM_ACCEPT}
          disabled={busy}
          onChange={chooseBgmFile}
          style={{display: "none"}}
        />
      </label>

      <div style={{height: 1, background: "rgba(255,255,255,0.1)", margin: "13px 0"}} />

      <div style={{fontSize: 11, fontWeight: 900}}>SFX</div>
      {sfxState?.sfx.length ? (
        <>
          <select
            value={legacySfxKey}
            onChange={(event) => setLegacySfxKey(event.target.value)}
            style={{...inputStyle, marginTop: 7}}
          >
            {sfxState.sfx.map((item) => {
              const key = item.id ?? item.path;
              return (
                <option key={key} value={key} style={{color: "black"}}>
                  {item.label ?? item.id ?? item.path}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            disabled={busy || !legacySfxKey}
            onClick={() => void addLegacySfx()}
            style={{...buttonStyle, width: "100%", marginTop: 6}}
          >
            기존 SFX Workbench 항목 가져오기
          </button>
        </>
      ) : null}

      {sfxState?.inbox.length ? (
        <>
          <select
            value={sfxInboxName}
            onChange={(event) => setSfxInboxName(event.target.value)}
            style={{...inputStyle, marginTop: 7}}
          >
            {sfxState.inbox.map((asset) => (
              <option key={asset.name} value={asset.name} style={{color: "black"}}>
                {asset.name}
              </option>
            ))}
          </select>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6}}>
            <button
              type="button"
              onClick={() => preview(inboxPreviewUrl(sfxInboxName), 0.7)}
              style={buttonStyle}
            >
              ▶ SFX 미리듣기
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importSfxInbox()}
              style={{...buttonStyle, background: "rgba(155,79,74,0.62)"}}
            >
              Inbox SFX 추가
            </button>
          </div>
        </>
      ) : null}
      <label style={{...buttonStyle, display: "block", textAlign: "center", marginTop: 6}}>
        SFX 파일 선택
        <input
          type="file"
          accept=".mp3,.wav,.m4a,.aac,.ogg,.flac"
          onChange={chooseSfxFile}
          style={{display: "none"}}
        />
      </label>

      <div
        style={{
          marginTop: 11,
          padding: 8,
          borderRadius: 6,
          background: "rgba(255,255,255,0.045)",
          fontSize: 10,
          lineHeight: 1.45,
          opacity: 0.68,
        }}
      >
        기존 BGM/SFX Sidecar 자산을 재사용합니다. Generic Editor에 추가된 뒤에는
        Timeline/Inspector의 값이 독립 편집 상태가 됩니다.
      </div>

      {message ? (
        <div style={{marginTop: 8, color: "#bfe8c9", fontSize: 10}}>{message}</div>
      ) : null}
      {error ? (
        <div style={{marginTop: 8, color: "#ffc1ba", fontSize: 10, lineHeight: 1.4}}>
          {error}
        </div>
      ) : null}
    </div>
  );
};
