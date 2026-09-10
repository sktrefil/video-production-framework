import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {readFile, stat, writeFile, mkdir} from "node:fs/promises";
import {dirname, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {
  validateSubtitleProductionQc,
} from "./subtitle-production-qc.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT = resolve(__dirname, "..");
export const PUBLIC_DIR = resolve(ROOT, "public");

const TRACK_TYPES = new Set(["VIDEO", "AUDIO", "TEXT", "GRAPHIC"]);
const ITEM_TYPES = new Set([
  "VIDEO",
  "IMAGE",
  "TTS",
  "CLIP_AUDIO",
  "BGM",
  "SFX",
  "SUBTITLE",
  "TEXT",
  "GRAPHIC",
]);

const expectedTrackType = (itemType) => {
  if (itemType === "VIDEO" || itemType === "IMAGE") return "VIDEO";
  if (
    itemType === "TTS" ||
    itemType === "CLIP_AUDIO" ||
    itemType === "BGM" ||
    itemType === "SFX"
  ) {
    return "AUDIO";
  }
  if (itemType === "SUBTITLE" || itemType === "TEXT") return "TEXT";
  return "GRAPHIC";
};

const isFinitePositive = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0;

const isFiniteNonNegative = (value) =>
  Number.isFinite(Number(value)) && Number(value) >= 0;

const isRemoteMedia = (src) => /^https?:\/\//i.test(src);
const isEphemeralMedia = (src) => /^(?:blob:|data:)/i.test(src);

const resolveInside = (base, relativePath) => {
  const normalized = String(relativePath ?? "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  const parts = normalized.split("/");
  if (
    !normalized ||
    parts.some(
      (part) => part === "." || part === ".." || part.includes("\0"),
    )
  ) {
    throw new Error("Unsafe local media path");
  }
  const target = resolve(base, ...parts);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error("Local media path escapes public directory");
  }
  return {normalized, target};
};

const pushIssue = (collection, code, message, data = undefined) => {
  collection.push({code, message, ...(data ? {data} : {})});
};

const mergeIntervals = (intervals) => {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval[0] > previous[1]) {
      merged.push([...interval]);
      continue;
    }
    previous[1] = Math.max(previous[1], interval[1]);
  }
  return merged;
};

const findGaps = (intervals, durationInFrames) => {
  const merged = mergeIntervals(intervals);
  const gaps = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      gaps.push([cursor, start]);
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < durationInFrames) {
    gaps.push([cursor, durationInFrames]);
  }
  return gaps;
};

export const projectSha256 = (project) =>
  createHash("sha256")
    .update(JSON.stringify(project))
    .digest("hex");

export const loadCanonicalEditorProject = async (projectId) => {
  const {target} = resolveInside(
    PUBLIC_DIR,
    `projects/${projectId}/edit_project.json`,
  );
  if (!existsSync(target)) {
    throw new Error(
      `Canonical edit_project.json not found: public/projects/${projectId}/edit_project.json`,
    );
  }
  return JSON.parse(await readFile(target, "utf8"));
};

export const validateEditorProductionProject = async (
  project,
  {
    allowRemote = false,
    allowVisualGaps = false,
    verifyMedia = true,
  } = {},
) => {
  const errors = [];
  const warnings = [];
  const verifiedMedia = [];

  if (!project || typeof project !== "object" || Array.isArray(project)) {
    pushIssue(errors, "PROJECT_INVALID", "Project must be a JSON object.");
    return {
      ok: false,
      errors,
      warnings,
      verifiedMedia,
      visualGaps: [],
      subtitleQc: null,
    };
  }
  if (project.schemaVersion !== 1) {
    pushIssue(
      errors,
      "SCHEMA_UNSUPPORTED",
      "Only edit project schemaVersion 1 is supported.",
    );
  }

  const metadata = project.project ?? {};
  if (typeof metadata.id !== "string" || !metadata.id.trim()) {
    pushIssue(errors, "PROJECT_ID_INVALID", "Project id is required.");
  }
  for (const key of ["fps", "width", "height", "durationInFrames"]) {
    if (!isFinitePositive(metadata[key])) {
      pushIssue(
        errors,
        "PROJECT_METADATA_INVALID",
        `Project ${key} must be a positive number.`,
        {key, value: metadata[key]},
      );
    }
  }

  if (!Array.isArray(project.tracks)) {
    pushIssue(errors, "TRACKS_INVALID", "tracks must be an array.");
  }
  if (!Array.isArray(project.items)) {
    pushIssue(errors, "ITEMS_INVALID", "items must be an array.");
  }
  if (!project.settings || typeof project.settings !== "object") {
    pushIssue(errors, "SETTINGS_INVALID", "settings object is required.");
  }

  const tracks = Array.isArray(project.tracks) ? project.tracks : [];
  const items = Array.isArray(project.items) ? project.items : [];
  const trackMap = new Map();
  for (const track of tracks) {
    if (
      !track ||
      typeof track.id !== "string" ||
      !track.id ||
      !TRACK_TYPES.has(track.type)
    ) {
      pushIssue(errors, "TRACK_INVALID", "Invalid editor track.", {track});
      continue;
    }
    if (trackMap.has(track.id)) {
      pushIssue(
        errors,
        "TRACK_ID_DUPLICATE",
        `Duplicate track id: ${track.id}`,
      );
      continue;
    }
    trackMap.set(track.id, track);
  }

  const itemIds = new Set();
  const visualIntervals = [];
  const mediaItems = [];

  for (const item of items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      !ITEM_TYPES.has(item.type)
    ) {
      pushIssue(errors, "ITEM_INVALID", "Invalid timeline item.", {item});
      continue;
    }
    if (itemIds.has(item.id)) {
      pushIssue(
        errors,
        "ITEM_ID_DUPLICATE",
        `Duplicate item id: ${item.id}`,
      );
      continue;
    }
    itemIds.add(item.id);

    const track = trackMap.get(item.trackId);
    if (!track) {
      pushIssue(
        errors,
        "ITEM_TRACK_MISSING",
        `Track not found for item ${item.id}: ${item.trackId}`,
      );
      continue;
    }
    const wantedTrackType = expectedTrackType(item.type);
    if (track.type !== wantedTrackType) {
      pushIssue(
        errors,
        "ITEM_TRACK_TYPE_MISMATCH",
        `Item ${item.id} (${item.type}) cannot be placed on ${track.type} track ${track.id}.`,
      );
    }

    if (!isFiniteNonNegative(item.timelineStartFrame)) {
      pushIssue(
        errors,
        "ITEM_START_INVALID",
        `Item ${item.id} has invalid timelineStartFrame.`,
      );
      continue;
    }
    if (!isFinitePositive(item.durationInFrames)) {
      pushIssue(
        errors,
        "ITEM_DURATION_INVALID",
        `Item ${item.id} has invalid durationInFrames.`,
      );
      continue;
    }

    const start = Math.round(Number(item.timelineStartFrame));
    const duration = Math.round(Number(item.durationInFrames));
    const end = start + duration;
    if (
      isFinitePositive(metadata.durationInFrames) &&
      end > Number(metadata.durationInFrames)
    ) {
      pushIssue(
        errors,
        "ITEM_EXCEEDS_COMPOSITION",
        `Item ${item.id} ends at F${end}, beyond composition F${metadata.durationInFrames}.`,
        {startFrame: start, endFrame: end},
      );
    }

    const renderEnabled = item.enabled !== false && track.enabled !== false;
    if (
      renderEnabled &&
      (item.type === "VIDEO" || item.type === "IMAGE")
    ) {
      visualIntervals.push([
        start,
        Math.min(end, Number(metadata.durationInFrames) || end),
      ]);
    }

    if (
      item.type === "VIDEO" ||
      item.type === "IMAGE" ||
      item.type === "TTS" ||
      item.type === "CLIP_AUDIO" ||
      item.type === "BGM" ||
      item.type === "SFX"
    ) {
      if (typeof item.src !== "string" || !item.src.trim()) {
        pushIssue(
          errors,
          "MEDIA_SRC_MISSING",
          `Media source is missing for ${item.id}.`,
        );
      } else if (renderEnabled) {
        mediaItems.push(item);
      }
    }

    if (item.type === "IMAGE" && item.motion !== undefined) {
      const motion = item.motion;
      const transforms = [motion?.from, motion?.to];
      const motionValid =
        motion &&
        motion.kind === "TRANSFORM" &&
        (motion.easing === "LINEAR" || motion.easing === "EASE_IN_OUT") &&
        transforms.every(
          (transform) =>
            transform &&
            Number.isFinite(Number(transform.x)) &&
            Number.isFinite(Number(transform.y)) &&
            Number.isFinite(Number(transform.rotation)) &&
            isFinitePositive(transform.scale) &&
            Number.isFinite(Number(transform.opacity)) &&
            Number(transform.opacity) >= 0 &&
            Number(transform.opacity) <= 1,
        );

      if (!motionValid) {
        pushIssue(
          errors,
          "IMAGE_MOTION_INVALID",
          `Image ${item.id} has an invalid motion specification.`,
        );
      }
    }

    if (
      item.type === "VIDEO" ||
      item.type === "TTS" ||
      item.type === "CLIP_AUDIO" ||
      item.type === "BGM" ||
      item.type === "SFX"
    ) {
      for (const key of [
        "sourceStartFrame",
        "sourceDurationInFrames",
        "sourceAssetDurationInFrames",
      ]) {
        const valid =
          key === "sourceStartFrame"
            ? isFiniteNonNegative(item[key])
            : isFinitePositive(item[key]);
        if (!valid) {
          pushIssue(
            errors,
            "SOURCE_RANGE_INVALID",
            `Item ${item.id} has invalid ${key}.`,
          );
        }
      }

      if (
        isFiniteNonNegative(item.sourceStartFrame) &&
        isFinitePositive(item.sourceDurationInFrames) &&
        isFinitePositive(item.sourceAssetDurationInFrames) &&
        Number(item.sourceStartFrame) +
          Number(item.sourceDurationInFrames) >
          Number(item.sourceAssetDurationInFrames)
      ) {
        pushIssue(
          errors,
          "SOURCE_RANGE_EXCEEDS_ASSET",
          `Source range exceeds asset for ${item.id}.`,
        );
      }
    }

    if (item.type === "VIDEO") {
      if (!isFinitePositive(item.playbackRate)) {
        pushIssue(
          errors,
          "VIDEO_RATE_INVALID",
          `Video ${item.id} has invalid playbackRate.`,
        );
      } else if (isFinitePositive(item.sourceDurationInFrames)) {
        const expected = Math.max(
          1,
          Math.round(
            Number(item.sourceDurationInFrames) /
              Number(item.playbackRate),
          ),
        );
        if (Math.abs(expected - duration) > 1) {
          pushIssue(
            errors,
            "VIDEO_DURATION_RATE_MISMATCH",
            `Video ${item.id} timeline duration ${duration}f does not match source/rate expectation ${expected}f.`,
          );
        }
      }
    }

    if (
      ["TTS", "CLIP_AUDIO", "SFX"].includes(item.type) &&
      isFinitePositive(item.sourceDurationInFrames) &&
      duration > Number(item.sourceDurationInFrames)
    ) {
      pushIssue(
        errors,
        "AUDIO_DURATION_EXCEEDS_SOURCE",
        `${item.type} ${item.id} is longer than its source window and may render silence.`,
      );
    }

    if (
      (item.type === "SUBTITLE" || item.type === "TEXT") &&
      !String(item.text ?? "").trim()
    ) {
      pushIssue(
        warnings,
        "EMPTY_TEXT",
        `Text item ${item.id} is empty.`,
      );
    }
  }

  if (verifyMedia) {
    for (const item of mediaItems) {
      const src = item.src.trim();
      if (isEphemeralMedia(src)) {
        pushIssue(
          errors,
          "EPHEMERAL_MEDIA_SOURCE",
          `Item ${item.id} uses a non-persistent ${src.split(":")[0]} URL.`,
        );
        continue;
      }
      if (isRemoteMedia(src)) {
        if (!allowRemote) {
          pushIssue(
            errors,
            "REMOTE_MEDIA_BLOCKED",
            `Remote media is blocked for deterministic production render: ${item.id}`,
            {src},
          );
        } else {
          pushIssue(
            warnings,
            "REMOTE_MEDIA_ALLOWED",
            `Remote media will be fetched during render: ${item.id}`,
            {src},
          );
        }
        continue;
      }

      try {
        const {normalized, target} = resolveInside(PUBLIC_DIR, src);
        if (!existsSync(target)) {
          pushIssue(
            errors,
            "MEDIA_FILE_MISSING",
            `Local media file does not exist for ${item.id}: public/${normalized}`,
          );
          continue;
        }
        const info = await stat(target);
        if (!info.isFile() || info.size <= 0) {
          pushIssue(
            errors,
            "MEDIA_FILE_INVALID",
            `Local media is not a non-empty file for ${item.id}: public/${normalized}`,
          );
          continue;
        }
        verifiedMedia.push({
          itemId: item.id,
          src: normalized,
          sizeBytes: info.size,
        });
      } catch (error) {
        pushIssue(
          errors,
          "MEDIA_PATH_INVALID",
          `Invalid local media path for ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const subtitleQc = await validateSubtitleProductionQc(project);
  for (const entry of subtitleQc.issues) {
    const target =
      entry.severity === "ERROR" ? errors : warnings;
    pushIssue(
      target,
      `SUBTITLE_QC_${entry.code}`,
      `Subtitle QC: ${entry.message}`,
      {
        subtitleIds: entry.subtitleIds,
        ...(entry.frame === undefined ? {} : {frame: entry.frame}),
        ...(entry.data === undefined ? {} : entry.data),
      },
    );
  }

  const visualGaps = isFinitePositive(metadata.durationInFrames)
    ? findGaps(visualIntervals, Number(metadata.durationInFrames))
    : [];
  if (visualGaps.length > 0) {
    const message = visualGaps
      .map(([start, end]) => `F${start}–F${end - 1}`)
      .join(", ");
    pushIssue(
      allowVisualGaps ? warnings : errors,
      "VISUAL_GAP",
      `No enabled VIDEO/IMAGE coverage at: ${message}`,
      {gaps: visualGaps},
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    verifiedMedia,
    visualGaps,
    subtitleQc,
  };
};

export const writeProductionGateReport = async ({
  project,
  validation,
  outputPath,
}) => {
  const report = {
    schemaVersion: 1,
    status: validation.ok ? "APPROVED" : "BLOCKED",
    projectId: project?.project?.id ?? null,
    projectSha256: projectSha256(project),
    checkedAt: new Date().toISOString(),
    metadata: project?.project ?? null,
    itemCount: Array.isArray(project?.items) ? project.items.length : 0,
    trackCount: Array.isArray(project?.tracks) ? project.tracks.length : 0,
    ...validation,
  };
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
};
