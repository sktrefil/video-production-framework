import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, stat, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, relative, resolve} from "node:path";

const TRACK_TYPES = new Set(["VIDEO", "AUDIO", "TEXT", "GRAPHIC"]);
const ITEM_TYPES = new Set([
  "VIDEO", "IMAGE", "TTS", "CLIP_AUDIO", "BGM", "SFX", "SUBTITLE", "TEXT", "GRAPHIC"
]);
const MEDIA_TYPES = new Set(["VIDEO", "IMAGE", "TTS", "CLIP_AUDIO", "BGM", "SFX"]);

const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const nonNegative = value => Number.isFinite(Number(value)) && Number(value) >= 0;
const expectedTrack = type =>
  type === "VIDEO" || type === "IMAGE" ? "VIDEO" :
    ["TTS", "CLIP_AUDIO", "BGM", "SFX"].includes(type) ? "AUDIO" :
      ["SUBTITLE", "TEXT"].includes(type) ? "TEXT" : "GRAPHIC";
const issue = (errors, code, message, data) => errors.push({code, message, ...(data === undefined ? {} : {data})});

export const projectSha256 = project =>
  createHash("sha256").update(JSON.stringify(project)).digest("hex");

const resolveInside = (base, value) => {
  const raw = String(value ?? "").trim().replaceAll("\\", "/");
  if (!raw || isAbsolute(raw) || /^[a-zA-Z]:\//.test(raw) || /^(?:https?:|data:|blob:)/i.test(raw)) {
    throw new Error("media source must be a persistent project-relative path");
  }
  const parts = raw.replace(/^\/+/, "").split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.includes("\0"))) {
    throw new Error("unsafe media source path");
  }
  const target = resolve(base, ...parts);
  const rel = relative(resolve(base), target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("media source escapes editor public root");
  return target;
};

const mergeIntervals = intervals => {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const current of sorted) {
    const previous = merged.at(-1);
    if (!previous || current[0] > previous[1]) merged.push([...current]);
    else previous[1] = Math.max(previous[1], current[1]);
  }
  return merged;
};

const findVisualGaps = (intervals, duration) => {
  const gaps = [];
  let cursor = 0;
  for (const [start, end] of mergeIntervals(intervals)) {
    if (start > cursor) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) gaps.push([cursor, duration]);
  return gaps;
};

export async function validateEditorProductionProject(project, {
  publicDir,
  allowVisualGaps = false,
  verifyMedia = true
} = {}) {
  const errors = [];
  const warnings = [];
  const verifiedMedia = [];
  const visualIntervals = [];

  if (!project || typeof project !== "object" || Array.isArray(project)) {
    issue(errors, "PROJECT_INVALID", "Project must be an object.");
    return {ok: false, errors, warnings, verifiedMedia, visualGaps: []};
  }
  if (project.schemaVersion !== 1) issue(errors, "SCHEMA_UNSUPPORTED", "Only schemaVersion 1 is supported.");
  const meta = project.project ?? {};
  if (!String(meta.id ?? "").trim()) issue(errors, "PROJECT_ID_INVALID", "Project id is required.");
  for (const key of ["fps", "width", "height", "durationInFrames"]) {
    if (!positive(meta[key])) issue(errors, "PROJECT_METADATA_INVALID", `${key} must be positive.`);
  }
  if (!Array.isArray(project.tracks)) issue(errors, "TRACKS_INVALID", "tracks must be an array.");
  if (!Array.isArray(project.items)) issue(errors, "ITEMS_INVALID", "items must be an array.");

  const tracks = Array.isArray(project.tracks) ? project.tracks : [];
  const items = Array.isArray(project.items) ? project.items : [];
  const trackById = new Map();
  for (const track of tracks) {
    if (!track || !String(track.id ?? "") || !TRACK_TYPES.has(track.type)) {
      issue(errors, "TRACK_INVALID", "Invalid editor track.");
      continue;
    }
    if (trackById.has(track.id)) issue(errors, "TRACK_ID_DUPLICATE", `Duplicate track ${track.id}.`);
    else trackById.set(track.id, track);
  }

  const itemIds = new Set();
  const subtitleItems = [];
  const ttsById = new Map();
  for (const item of items) {
    if (!item || !String(item.id ?? "") || !ITEM_TYPES.has(item.type)) {
      issue(errors, "ITEM_INVALID", "Invalid timeline item.");
      continue;
    }
    if (itemIds.has(item.id)) issue(errors, "ITEM_ID_DUPLICATE", `Duplicate item ${item.id}.`);
    itemIds.add(item.id);
    const track = trackById.get(item.trackId);
    if (!track) {
      issue(errors, "ITEM_TRACK_MISSING", `Track ${item.trackId} not found for ${item.id}.`);
      continue;
    }
    if (track.type !== expectedTrack(item.type)) {
      issue(errors, "ITEM_TRACK_TYPE_MISMATCH", `${item.type} ${item.id} is on ${track.type}.`);
    }
    if (!nonNegative(item.timelineStartFrame) || !positive(item.durationInFrames)) {
      issue(errors, "ITEM_TIMING_INVALID", `Invalid timeline timing for ${item.id}.`);
      continue;
    }
    const start = Math.round(Number(item.timelineStartFrame));
    const duration = Math.round(Number(item.durationInFrames));
    const end = start + duration;
    if (positive(meta.durationInFrames) && end > Number(meta.durationInFrames)) {
      issue(errors, "ITEM_EXCEEDS_COMPOSITION", `${item.id} exceeds composition duration.`);
    }
    const enabled = item.enabled !== false && track.enabled !== false;
    if (enabled && (item.type === "VIDEO" || item.type === "IMAGE")) {
      visualIntervals.push([start, Math.min(end, Number(meta.durationInFrames) || end)]);
    }
    if (item.type === "TTS") ttsById.set(item.id, item);
    if (item.type === "SUBTITLE" && enabled) subtitleItems.push(item);

    if (MEDIA_TYPES.has(item.type)) {
      if (!String(item.src ?? "").trim()) {
        issue(errors, "MEDIA_SRC_MISSING", `Media source missing for ${item.id}.`);
      } else if (verifyMedia && enabled) {
        if (!publicDir) {
          issue(errors, "PUBLIC_DIR_REQUIRED", "publicDir is required for media verification.");
        } else {
          try {
            const target = resolveInside(publicDir, item.src);
            if (!existsSync(target)) issue(errors, "MEDIA_FILE_MISSING", `Media file missing for ${item.id}.`);
            else {
              const info = await stat(target);
              if (!info.isFile() || info.size <= 0) issue(errors, "MEDIA_FILE_INVALID", `Media file invalid for ${item.id}.`);
              else verifiedMedia.push({itemId: item.id, src: item.src, sizeBytes: info.size});
            }
          } catch (error) {
            issue(errors, "MEDIA_PATH_INVALID", `${item.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    if (["VIDEO", "TTS", "CLIP_AUDIO", "BGM", "SFX"].includes(item.type)) {
      if (!nonNegative(item.sourceStartFrame) || !positive(item.sourceDurationInFrames) || !positive(item.sourceAssetDurationInFrames)) {
        issue(errors, "SOURCE_RANGE_INVALID", `Invalid source range for ${item.id}.`);
      } else if (Number(item.sourceStartFrame) + Number(item.sourceDurationInFrames) > Number(item.sourceAssetDurationInFrames)) {
        issue(errors, "SOURCE_RANGE_EXCEEDS_ASSET", `Source range exceeds asset for ${item.id}.`);
      }
    }
    if (item.type === "VIDEO" && !positive(item.playbackRate)) {
      issue(errors, "VIDEO_RATE_INVALID", `Invalid playback rate for ${item.id}.`);
    }
    if (["TTS", "CLIP_AUDIO", "SFX"].includes(item.type) && positive(item.sourceDurationInFrames) && duration > Number(item.sourceDurationInFrames)) {
      issue(errors, "AUDIO_DURATION_EXCEEDS_SOURCE", `${item.type} ${item.id} exceeds source window.`);
    }
    if (item.type === "BGM" && item.loop !== true && positive(item.sourceDurationInFrames) && duration > Number(item.sourceDurationInFrames)) {
      issue(errors, "BGM_DURATION_EXCEEDS_SOURCE", `Non-loop BGM ${item.id} exceeds source window.`);
    }
  }

  subtitleItems.sort((a, b) => Number(a.timelineStartFrame) - Number(b.timelineStartFrame));
  for (let index = 0; index < subtitleItems.length; index += 1) {
    const cue = subtitleItems[index];
    const start = Number(cue.timelineStartFrame);
    const end = start + Number(cue.durationInFrames);
    const previous = subtitleItems[index - 1];
    if (previous && Number(previous.timelineStartFrame) + Number(previous.durationInFrames) > start) {
      issue(errors, "SUBTITLE_OVERLAP", `${previous.id} overlaps ${cue.id}.`);
    }
    if (cue.generationSource && cue.generationSource !== "MANUAL") {
      const refs = Array.isArray(cue.generatedFromTtsIds) ? cue.generatedFromTtsIds : [];
      if (refs.length === 0) issue(errors, "SUBTITLE_TTS_PROVENANCE_MISSING", `${cue.id} lacks TTS provenance.`);
      for (const id of refs) {
        const tts = ttsById.get(id);
        if (!tts) issue(errors, "SUBTITLE_TTS_REFERENCE_MISSING", `${cue.id} references missing TTS ${id}.`);
        else {
          const ttsStart = Number(tts.timelineStartFrame);
          const ttsEnd = ttsStart + Number(tts.durationInFrames);
          if (start < ttsStart || end > ttsEnd) issue(errors, "SUBTITLE_OUTSIDE_TTS_RANGE", `${cue.id} is outside TTS ${id}.`);
        }
      }
    }
  }

  const duration = positive(meta.durationInFrames) ? Number(meta.durationInFrames) : 0;
  const visualGaps = findVisualGaps(visualIntervals, duration);
  if (visualGaps.length > 0) {
    const target = allowVisualGaps ? warnings : errors;
    issue(target, "VISUAL_GAPS", `Visual coverage has ${visualGaps.length} gap(s).`, {visualGaps});
  }
  return {ok: errors.length === 0, errors, warnings, verifiedMedia, visualGaps};
}

export async function writeProductionGateReport({project, validation, outputPath}) {
  const report = {
    schemaVersion: 1,
    status: validation.ok ? "PASS" : "BLOCKED",
    projectId: project?.project?.id ?? null,
    projectSha256: projectSha256(project),
    checkedAt: new Date().toISOString(),
    errors: validation.errors,
    warnings: validation.warnings,
    verifiedMedia: validation.verifiedMedia,
    visualGaps: validation.visualGaps
  };
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return report;
}
