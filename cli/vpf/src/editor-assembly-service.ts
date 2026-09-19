import {randomUUID} from "node:crypto";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import {cinematicShortsHeaderVisuals,cinematicShortsSubtitleStyle,type EditorContentPlan, type MediaArtifact} from "@vpf/domain";
import {
  EditorContentPlanService,
  EditorTimelineAssemblyPipeline,
  type TimelineProfile
} from "@vpf/editor-timeline";
import {MediaBindingPipeline} from "@vpf/media-binding";
import type {ProjectStatus} from "@vpf/project-bootstrap";
import {ProjectBootstrapService} from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type FormatProfilePayload,
  type ResourcePin
} from "@vpf/resource-registry";
import {SqliteEditorTimelineRepository} from "@vpf/storage/editor-timeline";
import {
  NarrationTimedAssemblyRepository,
  NarrationTimedHandoffSource,
  NarrationTimingError
} from "./editor-narration-timing.js";
import {buildSpilloverNarrationTimingPlan} from "./editor-narration-schedule.js";

export type EditorAssemblyErrorCode =
  | "EDITOR_PROFILE_PIN_MISSING"
  | "EDITOR_PROFILE_INVALID"
  | "EDITOR_TTS_MEDIA_MISSING"
  | "EDITOR_TTS_DURATION_MISSING"
  | "EDITOR_SUBTITLE_INPUT_MISSING"
  | "EDITOR_SUBTITLE_INPUT_INVALID"
  | "EDITOR_TOP_ANNOTATION_INPUT_INVALID"
  | "EDITOR_VISUAL_TIMING_INVALID";

export class EditorAssemblyServiceError extends Error {
  constructor(public readonly code: EditorAssemblyErrorCode, message: string) {
    super(message);
    this.name = "EditorAssemblyServiceError";
  }
}

type SubtitleCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  generationSource?: "TTS_TRANSCRIBE" | "SCRIPT_TTS_ALIGN" | "SCRIPT_TIMING" | "MANUAL";
};

type SubtitleDocument = {
  source?: {
    audioDurationMs?: number;
    narrationRelativePath?: string;
    characterAlignmentRelativePath?: string;
  };
  cues?: SubtitleCue[];
};

type TopAnnotation = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

type TopAnnotationDocument = {
  annotations?: TopAnnotation[];
};

const clock = {nowIso: () => new Date().toISOString()};
const ids = {next: (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`};
// Project media may live in an external workspace (for example OneDrive), but
// pinned resource documents are always owned by the checked-out repository.
const REPOSITORY_RESOURCES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "resources"
);

function formatPin(status: ProjectStatus): ResourcePin {
  const pin = status.resourcePins.find(item => item.resourceType === "FORMAT_PROFILE");
  if (pin === undefined) {
    throw new EditorAssemblyServiceError(
      "EDITOR_PROFILE_PIN_MISSING",
      "Project has no pinned FORMAT_PROFILE resource."
    );
  }
  return pin;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function resolveTimelineProfile(status: ProjectStatus): Promise<TimelineProfile> {
  const pin = formatPin(status);
  const registry = new FileSystemResourceRegistry(REPOSITORY_RESOURCES_ROOT);
  const resource = await registry.resolvePinned<FormatProfilePayload>(pin);
  const defaults = resource.payload.editorDefaults;
  const fps = resource.payload.fpsPreference;
  const width = resource.payload.width;
  const height = resource.payload.height;
  if (!Number.isInteger(fps) || fps <= 0 || !Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new EditorAssemblyServiceError(
      "EDITOR_PROFILE_INVALID",
      `Pinned format profile ${pin.resourceId}@${pin.version} has invalid timeline dimensions.`
    );
  }
  return {
    fps,
    width,
    height,
    snapEnabled: bool(defaults.snapEnabled, true),
    snapToleranceFrames: finiteNumber(defaults.snapToleranceFrames, 4),
    // A 9:16 narration timeline is unreadable at the generic 1x fallback.
    // A profile may still explicitly choose another value, and saved Studio
    // review drafts retain the user's own zoom after the first open.
    timelineZoom: finiteNumber(defaults.timelineZoom, resource.payload.format === "SHORTFORM" ? 3 : 1),
    masterVolume: finiteNumber(defaults.masterVolume, 1),
    videoVolume: finiteNumber(defaults.videoVolume, 0),
    clipAudioVolume: finiteNumber(defaults.clipAudioVolume, 1)
  };
}

function contentInputEqual(plan: EditorContentPlan, input: {
  audio: EditorContentPlan["audio"];
  subtitles: EditorContentPlan["subtitles"];
  textOverlays: EditorContentPlan["textOverlays"];
  graphics: EditorContentPlan["graphics"];
}): boolean {
  return plan.planStatus === "APPROVED" &&
    JSON.stringify(plan.audio) === JSON.stringify(input.audio) &&
    JSON.stringify(plan.subtitles) === JSON.stringify(input.subtitles) &&
    JSON.stringify(plan.textOverlays) === JSON.stringify(input.textOverlays) &&
    JSON.stringify(plan.graphics) === JSON.stringify(input.graphics);
}

async function readSubtitleDocument(projectRoot: string): Promise<SubtitleDocument> {
  const filename = path.resolve(projectRoot, "03_tts", "subtitle-cues.json");
  let raw: string;
  try {
    raw = await readFile(filename, "utf8");
  } catch {
    throw new EditorAssemblyServiceError(
      "EDITOR_SUBTITLE_INPUT_MISSING",
      `Subtitle cue file is missing: ${filename}`
    );
  }
  let parsed: SubtitleDocument;
  try {
    parsed = JSON.parse(raw) as SubtitleDocument;
  } catch {
    throw new EditorAssemblyServiceError(
      "EDITOR_SUBTITLE_INPUT_INVALID",
      "subtitle-cues.json is not valid JSON."
    );
  }
  if (!Array.isArray(parsed.cues) || parsed.cues.length === 0) {
    throw new EditorAssemblyServiceError(
      "EDITOR_SUBTITLE_INPUT_INVALID",
      "subtitle-cues.json must contain at least one subtitle cue."
    );
  }
  let previousEnd = 0;
  for (const cue of parsed.cues) {
    if (
      typeof cue.id !== "string" || !cue.id.trim() ||
      typeof cue.text !== "string" || !cue.text.trim() ||
      !Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 || cue.endMs <= cue.startMs || cue.startMs < previousEnd
    ) {
      throw new EditorAssemblyServiceError(
        "EDITOR_SUBTITLE_INPUT_INVALID",
        `Invalid subtitle cue: ${cue.id ?? "unknown"}`
      );
    }
    previousEnd = cue.endMs;
  }
  return parsed;
}

/**
 * Optional, project-owned explanatory labels for the top safe area.
 * They add source context or a clearly marked hypothesis without repeating the
 * narration or embedding factual claims into a generated visual.
 */
async function readTopAnnotations(projectRoot: string): Promise<TopAnnotation[]> {
  const filename = path.resolve(projectRoot, "08_editor", "top_annotations.json");
  let raw: string;
  try {
    raw = await readFile(filename, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new EditorAssemblyServiceError(
      "EDITOR_TOP_ANNOTATION_INPUT_INVALID",
      `Could not read top annotation file: ${filename}`
    );
  }
  let parsed: TopAnnotationDocument;
  try {
    parsed = JSON.parse(raw) as TopAnnotationDocument;
  } catch {
    throw new EditorAssemblyServiceError(
      "EDITOR_TOP_ANNOTATION_INPUT_INVALID",
      "top_annotations.json is not valid JSON."
    );
  }
  if (!Array.isArray(parsed.annotations)) {
    throw new EditorAssemblyServiceError(
      "EDITOR_TOP_ANNOTATION_INPUT_INVALID",
      "top_annotations.json must contain an annotations array."
    );
  }
  let previousEnd = 0;
  for (const annotation of parsed.annotations) {
    if (
      typeof annotation.id !== "string" || !annotation.id.trim() ||
      typeof annotation.text !== "string" || !annotation.text.trim() ||
      !Number.isFinite(annotation.startMs) || !Number.isFinite(annotation.endMs) ||
      annotation.startMs < 0 || annotation.endMs <= annotation.startMs ||
      annotation.startMs < previousEnd
    ) {
      throw new EditorAssemblyServiceError(
        "EDITOR_TOP_ANNOTATION_INPUT_INVALID",
        `Invalid top annotation: ${annotation.id ?? "unknown"}`
      );
    }
    previousEnd = annotation.endMs;
  }
  return parsed.annotations;
}

async function activeMediaByPath(
  repo: SqliteEditorTimelineRepository,
  projectId: string,
  relativePath: string
): Promise<MediaArtifact | null> {
  const row = repo.db.prepare(
    `SELECT id FROM media_artifacts
     WHERE project_id = ? AND relative_path = ? AND lifecycle_status = 'ACTIVE' AND media_status = 'AVAILABLE'
     ORDER BY revision DESC, rowid DESC LIMIT 1`
  ).get(projectId, relativePath) as {id: string} | undefined;
  return row === undefined ? null : repo.getMedia(projectId, row.id);
}

async function ensureContentPlan(input: {
  repo: SqliteEditorTimelineRepository;
  projectId: string;
  projectRoot: string;
  header: string;
  profile: TimelineProfile;
}): Promise<{plan: EditorContentPlan; created: boolean}> {
  const subtitles = await readSubtitleDocument(input.projectRoot);
  const narration = await activeMediaByPath(input.repo, input.projectId, "03_tts/narration.mp3");
  if (narration === null || narration.mediaType !== "AUDIO") {
    throw new EditorAssemblyServiceError(
      "EDITOR_TTS_MEDIA_MISSING",
      "03_tts/narration.mp3 must be imported as an AVAILABLE AUDIO MediaArtifact before assembly."
    );
  }
  if (narration.durationMs === undefined || !Number.isFinite(narration.durationMs) || narration.durationMs <= 0) {
    throw new EditorAssemblyServiceError(
      "EDITOR_TTS_DURATION_MISSING",
      "Narration MediaArtifact requires durationMs. Re-run editor media import after media metadata probing is enabled."
    );
  }
  const narrationDurationMs = narration.durationMs;

  const header = input.header.trim();
  if (!header) {
    throw new EditorAssemblyServiceError("EDITOR_SUBTITLE_INPUT_INVALID", "Editor header must not be empty.");
  }
  const bottomBlurY = Math.round(input.profile.height * 0.74);
  const headerVisuals=cinematicShortsHeaderVisuals(input.profile);
  const topAnnotations = await readTopAnnotations(input.projectRoot);
  const planInput = {
    audio: [{
      id: "tts-narration",
      type: "TTS" as const,
      mediaId: narration.id,
      timelineStartMs: 0,
      sourceInMs: 0,
      sourceOutMs: narration.durationMs,
      durationMs: narration.durationMs,
      volume: 1,
      muted: false
    }],
    subtitles: subtitles.cues!.map(cue => ({
      id: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.text,
      generationSource: cue.generationSource ?? "SCRIPT_TTS_ALIGN" as const,
      generatedFromAudioPlacementIds: ["tts-narration"],
      style: cinematicShortsSubtitleStyle(input.profile)
    })),
    textOverlays: [{
      id: "top-title",
      startMs: 0,
      endMs: narrationDurationMs,
      text: header,
      textRole: "TOP_TITLE" as const,
      ...headerVisuals.title,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0.2
    }, ...topAnnotations.map(annotation => ({
      id: `top-info-${annotation.id}`,
      startMs: annotation.startMs,
      endMs: Math.min(annotation.endMs, narrationDurationMs),
      text: annotation.text,
      textRole: "LABEL" as const,
      ...headerVisuals.info,
      backgroundEnabled: false,
      backgroundColor: "#000000",
      backgroundOpacity: 0,
      zIndex: 30
    }))],
    graphics: [
      {
        id: "top-safe-blur",
        startMs: 0,
        endMs: narration.durationMs,
        graphicType: "BLUR_PANEL" as const,
        x: 0,
        y: 0,
        width: input.profile.width,
        height: Math.round(input.profile.height * 0.18),
        opacity: 1,
        blurPx: 18,
        backgroundColor: "rgba(8,12,18,0.26)",
        borderRadius: 0,
        zIndex: 10
      },
      {
        id: "top-header-panel",
        startMs: 0,
        endMs: narration.durationMs,
        graphicType: "SOLID_PANEL" as const,
        ...headerVisuals.panel,
        opacity: 1,
        blurPx: 0,
        borderRadius: 0,
        zIndex: 11
      },
      {
        id: "top-header-gold-rule",
        startMs: 0,
        endMs: narration.durationMs,
        graphicType: "SOLID_PANEL" as const,
        ...headerVisuals.goldRule,
        opacity: 1,
        blurPx: 0,
        borderRadius: 0,
        zIndex: 12
      },
      {
        id: "bottom-safe-blur",
        startMs: 0,
        endMs: narration.durationMs,
        graphicType: "BLUR_PANEL" as const,
        x: 0,
        y: bottomBlurY,
        width: input.profile.width,
        height: input.profile.height - bottomBlurY,
        opacity: 1,
        blurPx: 22,
        backgroundColor: "rgba(8,12,18,0.30)",
        borderRadius: 0,
        zIndex: 20
      }
    ] as EditorContentPlan["graphics"]
  };

  const previous = await input.repo.getLatestEditorContentPlan(input.projectId);
  if (previous !== null && contentInputEqual(previous, planInput)) {
    return {plan: previous, created: false};
  }
  const service = new EditorContentPlanService(input.repo, clock, ids);
  const plan = await service.savePlan({
    projectId: input.projectId,
    planStatus: "APPROVED",
    ...planInput
  });
  return {plan, created: true};
}

async function writeCanonicalJson(projectRoot: string, editProject: unknown): Promise<string> {
  const directory = path.resolve(projectRoot, "08_editor");
  await mkdir(directory, {recursive: true});
  const output = path.resolve(directory, "edit_project.json");
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(editProject, null, 2)}\n`, "utf8");
  await rename(temporary, output);
  return output;
}

export class EditorAssemblyCliService {
  constructor(private readonly projects: ProjectBootstrapService = new ProjectBootstrapService()) {}

  async diagnose(projectId: string) {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteEditorTimelineRepository(status.projectDbPath);
    try {
      const binding = new MediaBindingPipeline(repo, repo, clock, ids);
      const handoff = await binding.buildEditorHandoff(projectId);
      const mediaArtifactCount = (repo.db.prepare(
        "SELECT COUNT(*) AS count FROM media_artifacts WHERE project_id = ? AND lifecycle_status = 'ACTIVE'"
      ).get(projectId) as {count: number}).count;
      const bindingCount = (repo.db.prepare(
        "SELECT COUNT(*) AS count FROM final_media_bindings WHERE project_id = ? AND lifecycle_status = 'ACTIVE'"
      ).get(projectId) as {count: number}).count;
      const plan = await repo.getLatestEditorContentPlan(projectId);
      const assembly = await repo.getLatestAssembly(projectId);
      return {
        projectId,
        projectDb: status.projectDbPath,
        mediaArtifactCount,
        bindingCount,
        handoffStatus: handoff.status,
        handoffBlockers: handoff.blockers,
        contentPlanRevision: plan?.revision ?? null,
        contentPlanStatus: plan?.planStatus ?? null,
        assemblyRevision: assembly?.revision ?? null,
        assemblyStatus: assembly?.assemblyStatus ?? null,
        assemblyStale: assembly?.stale ?? null
      };
    } finally {
      repo.close();
    }
  }

  async assemble(input: {projectId: string; header: string}) {
    const status = await this.projects.getStatus(input.projectId);
    const repo = new SqliteEditorTimelineRepository(status.projectDbPath);
    try {
      const profile = await resolveTimelineProfile(status);
      const binding = new MediaBindingPipeline(repo, repo, clock, ids);
      const bindingResult = await binding.bindProject(input.projectId);
      const handoff = await binding.buildEditorHandoff(input.projectId);
      if (handoff.status !== "READY") {
        return {
          status: handoff.status,
          created: false,
          projectId: input.projectId,
          bindingResult,
          handoff,
          blockers: handoff.blockers.map(item => `BINDING_BLOCKER:${item.implementationType}:${item.implementationId}:${item.reason}`)
        };
      }

      const content = await ensureContentPlan({
        repo,
        projectId: input.projectId,
        projectRoot: status.projectRoot,
        header: input.header,
        profile
      });
      const narration = content.plan.audio.find(
        item => item.id === "tts-narration" && item.type === "TTS"
      );
      if (
        narration === undefined ||
        narration.durationMs === undefined ||
        !Number.isFinite(narration.durationMs) ||
        narration.durationMs <= 0
      ) {
        throw new EditorAssemblyServiceError(
          "EDITOR_TTS_DURATION_MISSING",
          "Approved EditorContentPlan requires the positive tts-narration duration."
        );
      }

      let timing;
      try {
        timing = await buildSpilloverNarrationTimingPlan({
          repo,
          projectId: input.projectId,
          handoff,
          contentPlan: content.plan,
          narrationDurationMs: narration.durationMs,
          profile
        });
      } catch (error) {
        if (error instanceof NarrationTimingError) {
          throw new EditorAssemblyServiceError(
            "EDITOR_VISUAL_TIMING_INVALID",
            `[${error.code}] ${error.message}`
          );
        }
        throw error;
      }

      const timedHandoff = new NarrationTimedHandoffSource(handoff, timing, profile.fps);
      const timedRepository = new NarrationTimedAssemblyRepository(repo, timing, profile);
      const pipeline = new EditorTimelineAssemblyPipeline(
        timedRepository,
        timedHandoff,
        clock,
        ids,
        repo
      );
      const result = await pipeline.assembleProject({
        projectId: input.projectId,
        projectName: status.project.title,
        profile
      });
      const canonicalJson = result.assembly.assemblyStatus === "READY"
        ? await writeCanonicalJson(status.projectRoot, result.assembly.editProject)
        : null;
      return {
        status: result.assembly.assemblyStatus,
        projectId: input.projectId,
        bindingResult,
        handoffStatus: handoff.status,
        contentPlanRevision: content.plan.revision,
        contentPlanCreated: content.created,
        visualTimingSegmentCount: timing.segments.length,
        visualTimingDurationInFrames: timing.expectedDurationInFrames,
        assemblyId: result.assembly.id,
        assemblyRevision: result.assembly.revision,
        assemblyStale: result.assembly.stale,
        created: result.created,
        blockers: result.assembly.blockers,
        canonicalJson,
        profile
      };
    } finally {
      repo.close();
    }
  }
}
