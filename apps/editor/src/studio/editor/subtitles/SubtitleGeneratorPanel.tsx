import {useEffect, useMemo, useRef, useState} from "react";
import type {CSSProperties, FC} from "react";
import {pause, seek} from "@remotion/studio";
import {editorActions} from "../editorActions";
import type {
  AudioTimelineItem,
  SubtitleTimelineItem,
} from "../editorTypes";
import {useStudioEditor} from "../StudioEditorContext";
import {
  loadLocalWhisperCapabilities,
  loadProjectSubtitleScript,
  transcribeTtsSourceDetailed,
} from "./subtitleApi";
import type {
  LocalWhisperCapabilities,
  LocalWhisperTranscriptionMeta,
} from "./subtitleApi";
import {
  findSubtitleTrackId,
  generateSubtitlesFromScript,
  generateSubtitlesFromScriptAndTranscription,
  generateSubtitlesFromTranscription,
  SHORTS_LOWER_SUBTITLE_STYLE,
} from "./subtitleGeneration";
import {
  runSubtitleTimingQc,
} from "./subtitleTimingQc";
import type {
  SubtitleTimingQcIssue,
  SubtitleTimingQcReport,
} from "./subtitleTimingQc";
import {
  resolveSubtitleQcNavigationTarget,
  scrollTimelineSubtitleIntoView,
} from "./subtitleQcNavigator";
import {
  applyAllSubtitleTimingSafeFixes,
  applySubtitleTimingSafeFix,
  canSafeFixSubtitleTimingIssue,
} from "./subtitleTimingSafeFix";

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 6,
  background: "rgba(0,0,0,0.3)",
  color: "white",
  padding: "7px 8px",
  fontSize: 11,
  outline: "none",
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  padding: "7px 9px",
  color: "white",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

export type SubtitleGateQcFocus = {
  requestId: number;
  code: string;
  message: string;
  subtitleIds: string[];
  frame?: number;
};

export const SubtitleGeneratorPanel: FC<{
  onClose: () => void;
  gateFocus?: SubtitleGateQcFocus | null;
}> = ({onClose, gateFocus = null}) => {
  const {state, dispatch} = useStudioEditor();
  const [script, setScript] = useState("");
  const [scriptSource, setScriptSource] = useState("");
  const [language, setLanguage] = useState("ko");
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(11);
  const [maxLines, setMaxLines] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whisperCapabilities, setWhisperCapabilities] =
    useState<LocalWhisperCapabilities | null>(null);
  const [whisperCapabilityError, setWhisperCapabilityError] =
    useState<string | null>(null);
  const [whisperStatus, setWhisperStatus] = useState("대기");
  const [whisperMetas, setWhisperMetas] = useState<
    LocalWhisperTranscriptionMeta[]
  >([]);
  const [timingQc, setTimingQc] =
    useState<SubtitleTimingQcReport | null>(null);
  const [timingWordsBySource, setTimingWordsBySource] = useState<
    Record<
      string,
      Awaited<ReturnType<typeof transcribeTtsSourceDetailed>>["words"]
    >
  >({});
  const timingQcRef = useRef<HTMLDivElement | null>(null);

  const ttsItems = useMemo(
    () =>
      state.project.items.filter(
        (item): item is AudioTimelineItem =>
          item.type === "TTS" && item.enabled,
      ),
    [state.project.items],
  );
  const subtitleTrackId = findSubtitleTrackId(state.project);
  const existingSubtitleIds = state.project.items
    .filter(
      (item): item is SubtitleTimelineItem => item.type === "SUBTITLE",
    )
    .map((item) => item.id);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void loadProjectSubtitleScript(state.project.project.id)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setScript(loaded.script);
        setScriptSource(loaded.source);
        setMessage("프로젝트 확정 대본을 자동으로 불러왔습니다.");
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        setScriptSource("");
        setMessage(null);
        setError(
          caught instanceof Error
            ? `대본 자동 불러오기 실패 · ${caught.message}`
            : "대본 자동 불러오기에 실패했습니다.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [state.project.project.id]);

  useEffect(() => {
    if (!gateFocus) {
      return;
    }
    window.requestAnimationFrame(() => {
      timingQcRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [gateFocus]);

  useEffect(() => {
    let cancelled = false;
    setWhisperCapabilityError(null);
    void loadLocalWhisperCapabilities()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setWhisperCapabilities(loaded);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        setWhisperCapabilities(null);
        setWhisperCapabilityError(
          caught instanceof Error
            ? caught.message
            : "Local Whisper 상태를 확인하지 못했습니다.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [state.project.project.id]);

  const options = subtitleTrackId
    ? {
        trackId: subtitleTrackId,
        fps: state.project.project.fps,
        compositionWidth: state.project.project.width,
        compositionHeight: state.project.project.height,
        existingIds: state.project.items
          .filter((item) => item.type !== "SUBTITLE")
          .map((item) => item.id),
        maxCharsPerLine: Math.max(6, Math.round(maxCharsPerLine)),
        maxLines: Math.min(
          SHORTS_LOWER_SUBTITLE_STYLE.maxLines,
          Math.max(1, Math.round(maxLines)),
        ),
        maxCueDurationFrames: Math.max(
          1,
          Math.round(state.project.project.fps * 2.2),
        ),
      }
    : null;

  const confirmReplacement = () =>
    existingSubtitleIds.length === 0 ||
    window.confirm(
      `기존 하단 자막 ${existingSubtitleIds.length}개를 모두 삭제하고 새 자막으로 교체할까요?\n(TEXT 상단 제목/그래픽은 삭제하지 않습니다.)`,
    );

  const evaluateTimingQc = (
    items: SubtitleTimelineItem[],
    wordsBySource?: Record<
      string,
      Awaited<ReturnType<typeof transcribeTtsSourceDetailed>>["words"]
    >,
  ) => {
    const report = runSubtitleTimingQc({
      subtitles: items,
      ttsItems,
      wordsBySource,
      options: {
        fps: state.project.project.fps,
        maxCharsPerLine: Math.max(6, Math.round(maxCharsPerLine)),
        maxLines: Math.min(
          SHORTS_LOWER_SUBTITLE_STYLE.maxLines,
          Math.max(1, Math.round(maxLines)),
        ),
      },
    });
    setTimingQc(report);
    return report;
  };

  const replaceGenerated = (
    items: SubtitleTimelineItem[],
    label: string,
    wordsBySource?: Record<
      string,
      Awaited<ReturnType<typeof transcribeTtsSourceDetailed>>["words"]
    >,
  ) => {
    const report = evaluateTimingQc(items, wordsBySource);
    dispatch(editorActions.replaceSubtitleItems(items));
    setMessage(
      `${label} · 기존 ${existingSubtitleIds.length}개 삭제 → ${items.length}개 생성 완료 · Timing QC ${report.status}`,
    );
  };

  const currentTimingWords =
    Object.keys(timingWordsBySource).length > 0
      ? timingWordsBySource
      : undefined;

  const runCurrentTimingQc = () => {
    const current = state.project.items.filter(
      (item): item is SubtitleTimelineItem => item.type === "SUBTITLE",
    );
    const report = evaluateTimingQc(current, currentTimingWords);
    setMessage(
      `현재 하단 자막 Timing QC · ${report.status} · ${report.cueCount} cues`,
    );
  };

  const navigateToTimingQcIssue = (entry: SubtitleTimingQcIssue) => {
    const subtitles = state.project.items.filter(
      (item): item is SubtitleTimelineItem => item.type === "SUBTITLE",
    );
    const target = resolveSubtitleQcNavigationTarget({
      issue: entry,
      subtitles,
      durationInFrames: state.project.project.durationInFrames,
    });

    pause();
    dispatch(editorActions.setPlayhead(target.frame));
    seek(target.frame);

    if (!target.subtitleId) {
      setMessage(
        `Timing QC 이동 · F${target.frame} · 연결된 자막을 찾지 못했습니다.`,
      );
      return;
    }

    dispatch(editorActions.selectItem([target.subtitleId]));
    setMessage(
      `Timing QC 이동 · ${target.subtitleId} · F${target.frame}`,
    );
    scrollTimelineSubtitleIntoView(target.subtitleId);
  };

  const applyTimingQcSafeFix = (entry: SubtitleTimingQcIssue) => {
    const subtitles = state.project.items.filter(
      (item): item is SubtitleTimelineItem => item.type === "SUBTITLE",
    );
    const result = applySubtitleTimingSafeFix({
      issue: entry,
      subtitles,
      ttsItems,
      fps: state.project.project.fps,
      projectDurationInFrames: state.project.project.durationInFrames,
    });

    if (!result.applied) {
      setMessage(`Safe Fix 미적용 · ${result.summary}`);
      return;
    }

    dispatch(editorActions.replaceSubtitleItems(result.subtitles));
    const report = evaluateTimingQc(
      result.subtitles,
      currentTimingWords,
    );
    const targetId = result.affectedSubtitleIds[0];
    if (targetId) {
      dispatch(editorActions.selectItem([targetId]));
      scrollTimelineSubtitleIntoView(targetId);
    }
    setMessage(
      `Safe Fix 적용 · ${result.summary} · Timing QC ${report.status}`,
    );
  };

  const applyAllTimingQcSafeFixes = () => {
    if (!timingQc) {
      return;
    }
    const subtitles = state.project.items.filter(
      (item): item is SubtitleTimelineItem => item.type === "SUBTITLE",
    );
    const result = applyAllSubtitleTimingSafeFixes({
      issues: timingQc.issues,
      subtitles,
      ttsItems,
      fps: state.project.project.fps,
      projectDurationInFrames: state.project.project.durationInFrames,
    });

    if (result.appliedCount === 0) {
      setMessage("Safe Fix 가능한 문제를 자동 수정하지 못했습니다.");
      return;
    }

    dispatch(editorActions.replaceSubtitleItems(result.subtitles));
    const report = evaluateTimingQc(
      result.subtitles,
      currentTimingWords,
    );
    const targetId = result.affectedSubtitleIds[0];
    if (targetId) {
      dispatch(editorActions.selectItem([targetId]));
      scrollTimelineSubtitleIntoView(targetId);
    }
    setMessage(
      `Safe Fix ${result.appliedCount}개 적용 · Timing QC ${report.status}`,
    );
  };

  const transcribeAllTtsSources = async ({
    force = false,
  }: {
    force?: boolean;
  } = {}) => {
    const wordsBySource: Record<
      string,
      Awaited<ReturnType<typeof transcribeTtsSourceDetailed>>["words"]
    > = {};
    const metas: LocalWhisperTranscriptionMeta[] = [];
    const sources = [...new Set(ttsItems.map((item) => item.src))];

    setWhisperMetas([]);
    setWhisperStatus(
      force
        ? "Local Whisper 강제 재분석 준비 중…"
        : "캐시 확인 / 필요 시 Local Whisper 분석 중…",
    );

    for (let index = 0; index < sources.length; index += 1) {
      const src = sources[index];
      const label = src.split("/").pop() || src;
      setWhisperStatus(
        force
          ? `강제 재분석 ${index + 1}/${sources.length} · ${label}`
          : `캐시 확인 / 분석 ${index + 1}/${sources.length} · ${label}`,
      );
      const result = await transcribeTtsSourceDetailed({
        src,
        language,
        force,
      });
      wordsBySource[src] = result.words;
      metas.push(result.meta);
    }

    setWhisperMetas(metas);
    setTimingWordsBySource(wordsBySource);
    const cacheHits = metas.filter((meta) => meta.cacheHit).length;
    if (force) {
      setWhisperStatus(
        `강제 재분석 완료 · 신규 분석 ${metas.length}개`,
      );
    } else if (metas.length > 0 && cacheHits === metas.length) {
      setWhisperStatus(
        `캐시 사용 완료 · ${cacheHits}/${metas.length}개`,
      );
    } else {
      setWhisperStatus(
        `분석 완료 · 캐시 ${cacheHits}개 / 신규 ${metas.length - cacheHits}개`,
      );
    }

    return wordsBySource;
  };

  const regenerateFromScriptAndAudio = async ({
    force = false,
  }: {
    force?: boolean;
  } = {}) => {
    if (!options || ttsItems.length === 0 || !script.trim()) {
      return;
    }
    if (!confirmReplacement()) {
      return;
    }
    if (
      force &&
      !window.confirm(
        "Local Whisper 캐시를 무시하고 TTS 전체를 다시 분석합니다. 첫 분석처럼 시간이 걸릴 수 있습니다. 계속할까요?",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const wordsBySource = await transcribeAllTtsSources({force});
      const generated = generateSubtitlesFromScriptAndTranscription({
        script,
        ttsItems,
        wordsBySource,
        options,
      });
      if (generated.length === 0) {
        throw new Error(
          "대본과 TTS word timestamp를 정렬하지 못했습니다.",
        );
      }
      replaceGenerated(
        generated,
        "실제 발화 타이밍 자막",
        wordsBySource,
      );
    } catch (caught) {
      setWhisperStatus("Local Whisper 분석 오류");
      setError(
        caught instanceof Error
          ? caught.message
          : "대본 + TTS 실제 발화 타이밍 자막 생성에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  const regenerateFromAudioOnly = async () => {
    if (!options || ttsItems.length === 0) {
      return;
    }
    if (!confirmReplacement()) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const wordsBySource = await transcribeAllTtsSources({force: false});
      const generated = generateSubtitlesFromTranscription({
        ttsItems,
        wordsBySource,
        options,
      });
      if (generated.length === 0) {
        throw new Error(
          "전사 결과가 현재 TTS Source/Timeline 구간과 겹치지 않습니다.",
        );
      }
      replaceGenerated(
        generated,
        "TTS 전사 자막",
        wordsBySource,
      );
    } catch (caught) {
      setWhisperStatus("Local Whisper 분석 오류");
      setError(
        caught instanceof Error
          ? caught.message
          : "TTS 자동 전사에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  const regenerateFromScriptTiming = () => {
    if (!options || ttsItems.length === 0 || !script.trim()) {
      return;
    }
    if (!confirmReplacement()) {
      return;
    }

    setError(null);
    setMessage(null);
    const generated = generateSubtitlesFromScript({
      script,
      ttsItems,
      options,
    });
    if (generated.length === 0) {
      setError("대본을 입력해 주세요.");
      return;
    }
    replaceGenerated(generated, "TTS Segment 비례 타이밍 자막");
  };

  return (
    <div
      data-editor-subtitle-generator="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        right: 286,
        bottom: 396,
        zIndex: 2147483001,
        width: 390,
        maxHeight: "min(620px, 68vh)",
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <div style={{fontSize: 13, fontWeight: 900}}>
            하단 자막 재생성
          </div>
          <div style={{fontSize: 10, opacity: 0.55}}>
            확정 대본 + TTS word timing → Subtitle Timeline
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{...buttonStyle, background: "rgba(255,255,255,0.06)"}}
        >
          닫기
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          padding: 8,
          borderRadius: 6,
          background: "rgba(255,255,255,0.045)",
          fontSize: 10,
          lineHeight: 1.55,
        }}
      >
        TTS Segment {ttsItems.length}개 · 기존 하단 자막{" "}
        {existingSubtitleIds.length}개
        <br />
        Subtitle Track {subtitleTrackId ?? "없음"}
        <br />
        Shorts Style · VITRO · 104px@1080 · 2줄 · Outline 4px ·
        Baseline Y1790@1920
      </div>

      {!subtitleTrackId ? (
        <div style={{marginTop: 10, color: "#ffb2aa", fontSize: 11}}>
          TEXT 타입 자막 Track이 필요합니다.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 7,
          marginTop: 10,
        }}
      >
        <label style={{display: "grid", gap: 4, fontSize: 10}}>
          언어
          <select
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value);
              setTimingWordsBySource({});
            }}
            style={inputStyle}
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="auto">Auto</option>
          </select>
        </label>
        <label style={{display: "grid", gap: 4, fontSize: 10}}>
          한 줄 글자
          <input
            type="number"
            min={6}
            max={20}
            value={maxCharsPerLine}
            onChange={(event) =>
              setMaxCharsPerLine(Number(event.target.value) || 11)
            }
            style={inputStyle}
          />
        </label>
        <label style={{display: "grid", gap: 4, fontSize: 10}}>
          최대 줄
          <input
            type="number"
            min={1}
            max={2}
            value={maxLines}
            onChange={(event) =>
              setMaxLines(Number(event.target.value) || 2)
            }
            style={inputStyle}
          />
        </label>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          opacity: 0.62,
          lineHeight: 1.45,
        }}
      >
        대본 소스: {scriptSource || "직접 입력"}
      </div>

      <textarea
        rows={7}
        value={script}
        onChange={(event) => {
          setScript(event.target.value);
          setScriptSource("직접 수정");
        }}
        placeholder="확정 대본을 입력하거나 프로젝트 대본 자동 로드를 사용합니다."
        style={{...inputStyle, marginTop: 5, resize: "vertical", lineHeight: 1.45}}
      />

      <button
        data-editor-regenerate-aligned-subtitles="true"
        type="button"
        disabled={
          busy ||
          !subtitleTrackId ||
          ttsItems.length === 0 ||
          !script.trim()
        }
        onClick={() => void regenerateFromScriptAndAudio({force: false})}
        style={{
          ...buttonStyle,
          width: "100%",
          marginTop: 9,
          background: "rgba(38,125,112,0.9)",
          opacity:
            busy ||
            !subtitleTrackId ||
            ttsItems.length === 0 ||
            !script.trim()
              ? 0.45
              : 1,
        }}
      >
        {busy
          ? whisperStatus
          : "기존 자막 삭제 + 실제 발화 타이밍으로 재생성"}
      </button>

      <div
        style={{
          marginTop: 8,
          padding: 8,
          borderRadius: 6,
          background: "rgba(51,111,115,0.11)",
          fontSize: 10,
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.72)",
        }}
      >
        권장 방식: 화면 문구는 확정 대본을 사용하고, 시작/끝 프레임은
        TTS word timestamp를 사용합니다. 따라서 전사 오탈자는 화면 자막에
        그대로 노출하지 않습니다.
      </div>

      <div
        data-editor-local-whisper-status="true"
        style={{
          marginTop: 8,
          padding: 9,
          borderRadius: 6,
          border: "1px solid rgba(114,167,201,0.2)",
          background: "rgba(54,83,105,0.16)",
          fontSize: 10,
          lineHeight: 1.55,
          color: "rgba(255,255,255,0.78)",
        }}
      >
        <div style={{fontWeight: 800, color: "rgba(255,255,255,0.92)"}}>
          Local Whisper
        </div>
        <div>
          Sidecar:{" "}
          {whisperCapabilities?.localWhisper
            ? `연결됨 · ${whisperCapabilities.pythonSource}`
            : whisperCapabilityError
              ? "연결 확인 필요"
              : "확인 중…"}
          {" · "}
          Cache:{" "}
          {whisperCapabilities?.cacheEnabled
            ? "사용"
            : whisperCapabilities
              ? "미지원"
              : "확인 중…"}
        </div>
        <div>상태: {whisperStatus}</div>
        {whisperMetas.length > 0 ? (
          <>
            <div>
              최근 결과: 캐시{" "}
              {whisperMetas.filter((meta) => meta.cacheHit).length}개 · 신규{" "}
              {whisperMetas.filter((meta) => !meta.cacheHit).length}개
            </div>
            <div>
              모델:{" "}
              {[...new Set(whisperMetas.map((meta) => meta.model).filter(Boolean))].join(
                ", ",
              ) || "unknown"}
              {" · "}
              런타임:{" "}
              {[
                ...new Set(
                  whisperMetas
                    .map((meta) =>
                      [meta.device, meta.computeType]
                        .filter(Boolean)
                        .join("/"),
                    )
                    .filter(Boolean),
                ),
              ].join(", ") || "cache"}
            </div>
            {whisperMetas[0]?.cachePath ? (
              <div
                title={whisperMetas[0].cachePath}
                style={{
                  marginTop: 2,
                  opacity: 0.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Cache: {whisperMetas[0].cachePath}
              </div>
            ) : null}
          </>
        ) : null}
        {whisperCapabilityError ? (
          <div style={{marginTop: 3, color: "#ffc1ba"}}>
            {whisperCapabilityError}
          </div>
        ) : null}
      </div>

      <button
        data-editor-force-local-whisper="true"
        type="button"
        disabled={
          busy ||
          !subtitleTrackId ||
          ttsItems.length === 0 ||
          !script.trim()
        }
        onClick={() => void regenerateFromScriptAndAudio({force: true})}
        style={{
          ...buttonStyle,
          width: "100%",
          marginTop: 7,
          background: "rgba(116,75,54,0.72)",
          opacity:
            busy ||
            !subtitleTrackId ||
            ttsItems.length === 0 ||
            !script.trim()
              ? 0.45
              : 1,
        }}
      >
        Local Whisper 강제 재분석 + 자막 재생성
      </button>

      <button
        type="button"
        disabled={busy || !subtitleTrackId || ttsItems.length === 0}
        onClick={() => void regenerateFromAudioOnly()}
        style={{
          ...buttonStyle,
          width: "100%",
          marginTop: 8,
          background: "rgba(51,85,115,0.7)",
          opacity:
            busy || !subtitleTrackId || ttsItems.length === 0 ? 0.45 : 1,
        }}
      >
        보조: TTS 전사 문구로 재생성
      </button>

      <button
        type="button"
        disabled={
          busy ||
          !subtitleTrackId ||
          ttsItems.length === 0 ||
          !script.trim()
        }
        onClick={regenerateFromScriptTiming}
        style={{
          ...buttonStyle,
          width: "100%",
          marginTop: 6,
          background: "rgba(89,111,124,0.62)",
          opacity:
            busy ||
            !subtitleTrackId ||
            ttsItems.length === 0 ||
            !script.trim()
              ? 0.45
              : 1,
        }}
      >
        Fallback: 대본 + TTS Segment 비례 타이밍
      </button>

      <div
        ref={timingQcRef}
        data-editor-subtitle-timing-qc="true"
        style={{
          marginTop: 8,
          padding: 9,
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.045)",
          fontSize: 10,
          lineHeight: 1.5,
        }}
      >
        {gateFocus ? (
          <div
            data-editor-production-gate-qc-focus="true"
            style={{
              marginBottom: 7,
              padding: 7,
              borderRadius: 5,
              border: "1px solid rgba(255,139,128,0.28)",
              background: "rgba(118,49,44,0.24)",
              color: "#ffd0ca",
              lineHeight: 1.45,
            }}
          >
            <div style={{fontWeight: 900}}>Production Gate → Timing QC</div>
            <div>
              [{gateFocus.code}] {gateFocus.message}
            </div>
            <div style={{marginTop: 2, opacity: 0.68}}>
              {gateFocus.subtitleIds.length > 0
                ? `자막 ${gateFocus.subtitleIds.join(", ")}`
                : "연결 자막 없음"}
              {gateFocus.frame === undefined
                ? ""
                : ` · F${gateFocus.frame}`}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{fontWeight: 800}}>Timing QC</div>
          <div style={{display: "flex", gap: 5}}>
            {timingQc &&
            timingQc.issues.some(canSafeFixSubtitleTimingIssue) ? (
              <button
                data-editor-apply-all-subtitle-safe-fixes="true"
                type="button"
                disabled={busy}
                onClick={applyAllTimingQcSafeFixes}
                style={{
                  ...buttonStyle,
                  padding: "4px 7px",
                  background: "rgba(69,120,78,0.72)",
                  opacity: busy ? 0.45 : 1,
                }}
              >
                Safe Fix 모두
              </button>
            ) : null}
            <button
              data-editor-run-current-subtitle-qc="true"
              type="button"
              disabled={busy}
              onClick={runCurrentTimingQc}
              style={{
                ...buttonStyle,
                padding: "4px 7px",
                background: "rgba(255,255,255,0.07)",
                opacity: busy ? 0.45 : 1,
              }}
            >
              현재 자막 검사
            </button>
          </div>
        </div>

        {timingQc ? (
          <>
            <div style={{marginTop: 4, fontWeight: 800}}>
              {timingQc.status} · {timingQc.cueCount} cues · ERROR{" "}
              {timingQc.errorCount} · WARN {timingQc.warningCount}
            </div>
            {timingQc.issues.length > 0 ? (
              <div style={{marginTop: 5, display: "grid", gap: 3}}>
                {timingQc.issues.slice(0, 8).map((entry, index) => (
                  <div
                    key={`${entry.code}-${entry.subtitleIds.join("-")}-${index}`}
                    style={{display: "grid", gridTemplateColumns: "1fr auto", gap: 4}}
                  >
                    <button
                      data-editor-subtitle-qc-issue={entry.code}
                      type="button"
                      onClick={() => navigateToTimingQcIssue(entry)}
                      title="해당 자막을 선택하고 문제 프레임으로 이동"
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 5,
                        background: "rgba(0,0,0,0.12)",
                        padding: "4px 6px",
                        color:
                          entry.severity === "ERROR"
                            ? "#ffc1ba"
                            : "#ffe6aa",
                        textAlign: "left",
                        fontSize: 10,
                        lineHeight: 1.35,
                        cursor: "pointer",
                      }}
                    >
                      [{entry.severity}] {entry.message}
                      {entry.frame === undefined ? "" : ` · F${entry.frame}`}
                      {" → 이동"}
                    </button>
                    {canSafeFixSubtitleTimingIssue(entry) ? (
                      <button
                        data-editor-subtitle-qc-safe-fix={entry.code}
                        type="button"
                        disabled={busy}
                        onClick={() => applyTimingQcSafeFix(entry)}
                        title="자막 문구는 바꾸지 않고 안전한 타이밍 범위만 자동 수정"
                        style={{
                          ...buttonStyle,
                          padding: "4px 6px",
                          background: "rgba(69,120,78,0.72)",
                          opacity: busy ? 0.45 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Safe Fix
                      </button>
                    ) : null}
                  </div>
                ))}
                {timingQc.issues.length > 8 ? (
                  <div style={{opacity: 0.55}}>
                    + {timingQc.issues.length - 8}개 추가 문제
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{marginTop: 4, color: "#bfe8c9"}}>
                겹침, 길이, 줄 수, TTS 범위 문제를 찾지 못했습니다.
              </div>
            )}
            <div style={{marginTop: 5, opacity: 0.55}}>
              Safe Fix는 생성 자막의 겹침 제거, 너무 짧은 cue 확장, TTS
              범위 밖 cue 클램프만 처리합니다. 잠금/수동 자막, 문구 변경, 무음
              추정, 긴 공백은 자동 수정하지 않습니다.
            </div>
          </>
        ) : (
          <div style={{marginTop: 4, opacity: 0.55}}>
            자막 생성 후 자동 검사하거나 현재 자막 검사를 실행하세요.
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 9,
          lineHeight: 1.45,
          opacity: 0.5,
        }}
      >
        실제 word timing은 PC의 Local Whisper로 분석합니다. 동일한 TTS는
        SHA256 캐시를 재사용하며, 필요할 때 위 강제 재분석 버튼으로 캐시를
        무시하고 다시 분석할 수 있습니다. 실패 시 fallback 편집은 가능하지만
        단어 단위 실제 발화 타이밍 정확도는 낮아집니다.
      </div>

      {message ? (
        <div
          style={{
            marginTop: 9,
            padding: 8,
            borderRadius: 6,
            background: "rgba(54,128,78,0.22)",
            color: "#bfe8c9",
            fontSize: 10,
          }}
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          style={{
            marginTop: 9,
            padding: 8,
            borderRadius: 6,
            background: "rgba(168,62,53,0.23)",
            color: "#ffc1ba",
            fontSize: 10,
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
};
