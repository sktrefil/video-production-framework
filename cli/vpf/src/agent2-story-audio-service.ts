import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import {
  estimateKoreanNarrationDuration,
  validateResearchBundle,
  validateStoryBundle,
  validateTtsCompletionInput,
  type Agent2ResearchBundle,
  type Agent2StoryBundle,
  type Agent2StorySpec,
  type Agent2ScriptSpec,
  type Agent2SubtitleCue,
  type Agent2SubtitleTimingSpec,
  type Agent2TaskExecutionResult,
  type Agent2TtsCompletionInput,
  type Agent2TtsManifest,
  type SceneTimingDocument,
  type SceneTimingSpec
} from "@vpf/production-spec";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";

export class Agent2StoryAudioError extends Error {
  constructor(
    public readonly code:
      | "AGENT2_INPUT_INVALID"
      | "AGENT2_TASK_NOT_RUNNING"
      | "AGENT2_TASK_MISMATCH"
      | "AGENT2_PREREQUISITE_MISSING"
      | "AGENT2_TTS_ALIGNMENT_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "Agent2StoryAudioError";
  }
}

type Agent2TaskId = "T010" | "T020" | "T030";

interface AlignedChar {
  char: string;
  start: number;
  end: number;
  sectionId: string;
}

const IGNORED_SYMBOLS = new Set(Array.from("『』「」【】《》“”‘’\"'*"));

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compactText(value: string): string {
  return Array.from(value)
    .filter(char => !IGNORED_SYMBOLS.has(char) && !/\s/u.test(char))
    .join("");
}

async function readJson(filename: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as unknown;
  } catch (error) {
    throw new Agent2StoryAudioError(
      "AGENT2_INPUT_INVALID",
      `Could not read Agent2 JSON input ${filename}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function validationMessage(result: { errors: Array<{ code: string; message: string }> }): string {
  return result.errors.map(issue => `${issue.code}: ${issue.message}`).join("; ");
}

export interface Agent2ScriptMaterializationResult {
  project_id: string;
  source: "project.db";
  story_revision: number;
  story_sha256: string;
  script_revision: number;
  script_sha256: string;
  files: {
    story_spec_json: string;
    script_json: string;
    script_ko_txt: string;
  };
}

async function writeUtf8Atomic(filename: string, content: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + ".tmp-" + process.pid + "-" + Date.now();
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filename);
}

async function materializeScriptRecords(input: {
  projectId: string;
  projectRoot: string;
  story: {
    revision: number;
    sha256: string;
    value: Agent2StorySpec;
  };
  script: {
    revision: number;
    sha256: string;
    value: Agent2ScriptSpec;
  };
}): Promise<Agent2ScriptMaterializationResult> {
  const storyRelative = "02_script/story_spec.json";
  const scriptRelative = "02_script/script.json";
  const scriptTextRelative = "02_script/script_ko.txt";

  await writeUtf8Atomic(
    path.join(input.projectRoot, storyRelative),
    JSON.stringify(input.story.value, null, 2) + "\n"
  );
  await writeUtf8Atomic(
    path.join(input.projectRoot, scriptRelative),
    JSON.stringify(input.script.value, null, 2) + "\n"
  );
  await writeUtf8Atomic(
    path.join(input.projectRoot, scriptTextRelative),
    input.script.value.body_ko.replace(/\s+$/u, "") + "\n"
  );

  return {
    project_id: input.projectId,
    source: "project.db",
    story_revision: input.story.revision,
    story_sha256: input.story.sha256,
    script_revision: input.script.revision,
    script_sha256: input.script.sha256,
    files: {
      story_spec_json: storyRelative,
      script_json: scriptRelative,
      script_ko_txt: scriptTextRelative
    }
  };
}

function subtitleChunks(text: string, maxChars: number): string[] {
  const normalized = text.replace(/[ \t]+/gu, " ").trim();
  if (!normalized) return [];
  const phraseCandidates = normalized
    .split(/(?<=[.!?。！？,，、;:])\s*/u)
    .map(value => value.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const phrase of phraseCandidates) {
    if (compactText(phrase).length <= maxChars) {
      chunks.push(phrase);
      continue;
    }
    const words = phrase.split(/\s+/u).filter(Boolean);
    let current = "";
    for (const word of words) {
      if (compactText(word).length > maxChars) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        const characters = Array.from(word);
        let segment = "";
        for (const char of characters) {
          const candidate = segment + char;
          if (segment && compactText(candidate).length > maxChars) {
            chunks.push(segment);
            segment = char;
          } else {
            segment = candidate;
          }
        }
        if (segment) chunks.push(segment);
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (current && compactText(candidate).length > maxChars) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

function buildAlignedStream(input: Agent2TtsCompletionInput): {
  chars: AlignedChar[];
  compact: string;
  totalDuration: number;
} {
  const chars: AlignedChar[] = [];
  let totalDuration = 0;
  for (const section of input.sections) {
    totalDuration = Math.max(totalDuration, section.timeline_start_sec + section.audio_duration_sec);
    for (let i = 0; i < section.alignment.characters.length; i += 1) {
      const char = section.alignment.characters[i]!;
      if (IGNORED_SYMBOLS.has(char) || /\s/u.test(char)) continue;
      chars.push({
        char,
        start: section.timeline_start_sec + section.alignment.character_start_times_seconds[i]!,
        end: section.timeline_start_sec + section.alignment.character_end_times_seconds[i]!,
        sectionId: section.section_id
      });
    }
  }
  return { chars, compact: chars.map(item => item.char).join(""), totalDuration };
}

function locateExact(
  stream: { chars: AlignedChar[]; compact: string },
  expected: string,
  cursor: number,
  label: string
): { startIndex: number; endIndex: number; start: number; end: number; nextCursor: number; sectionIds: string[] } {
  const compact = compactText(expected);
  if (!compact) throw new Agent2StoryAudioError("AGENT2_TTS_ALIGNMENT_MISMATCH", `${label} contains no speakable characters.`);
  const actual = stream.compact.slice(cursor, cursor + compact.length);
  if (actual !== compact) {
    throw new Agent2StoryAudioError(
      "AGENT2_TTS_ALIGNMENT_MISMATCH",
      `${label} does not match the measured TTS alignment at character offset ${cursor}.`
    );
  }
  const startIndex = cursor;
  const endIndex = cursor + compact.length - 1;
  const sectionIds = Array.from(new Set(stream.chars.slice(startIndex, endIndex + 1).map(item => item.sectionId)));
  return {
    startIndex,
    endIndex,
    start: stream.chars[startIndex]!.start,
    end: stream.chars[endIndex]!.end,
    nextCursor: endIndex + 1,
    sectionIds
  };
}

function compileMeasuredTiming(input: {
  projectId: string;
  story: Agent2StorySpec;
  script: Agent2ScriptSpec;
  scriptRevision: number;
  scriptSha256: string;
  tts: Agent2TtsCompletionInput;
  format: "SHORTS" | "LONGFORM";
}): {
  sceneTiming: SceneTimingDocument;
  ttsManifest: Agent2TtsManifest;
  subtitleTiming: Agent2SubtitleTimingSpec;
  warnings: Array<{ code: string; message: string }>;
} {
  const stream = buildAlignedStream(input.tts);
  if (stream.compact !== compactText(input.script.body_ko)) {
    throw new Agent2StoryAudioError(
      "AGENT2_TTS_ALIGNMENT_MISMATCH",
      "Measured TTS alignment does not cover the approved Korean script exactly."
    );
  }

  const rawScenes: Array<{
    draft: Agent2StorySpec["scenes"][number];
    start: number;
    end: number;
    sectionIds: string[];
    beats: SceneTimingSpec["beats"];
  }> = [];
  let cursor = 0;
  for (const scene of input.story.scenes) {
    const sceneRange = locateExact(stream, scene.script_ko, cursor, `Scene ${scene.scene_id}`);
    const beats: SceneTimingSpec["beats"] = [];
    let beatCursor = sceneRange.startIndex;
    for (const beat of scene.beats) {
      const beatRange = locateExact(stream, beat.script_ko, beatCursor, `Beat ${beat.beat_id}`);
      if (beatRange.endIndex > sceneRange.endIndex) {
        throw new Agent2StoryAudioError("AGENT2_TTS_ALIGNMENT_MISMATCH", `Beat ${beat.beat_id} exceeds Scene ${scene.scene_id}.`);
      }
      beats.push({
        beat_id: beat.beat_id,
        purpose_ko: beat.purpose_ko,
        purpose_en: beat.purpose_en ?? "",
        start_sec: beatRange.start,
        end_sec: beatRange.end
      });
      beatCursor = beatRange.nextCursor;
    }
    if (beatCursor !== sceneRange.nextCursor) {
      throw new Agent2StoryAudioError("AGENT2_TTS_ALIGNMENT_MISMATCH", `Beat timing does not fully cover Scene ${scene.scene_id}.`);
    }
    rawScenes.push({
      draft: scene,
      start: sceneRange.start,
      end: sceneRange.end,
      sectionIds: sceneRange.sectionIds,
      beats
    });
    cursor = sceneRange.nextCursor;
  }
  if (cursor !== stream.chars.length) {
    throw new Agent2StoryAudioError("AGENT2_TTS_ALIGNMENT_MISMATCH", "Scene timing did not consume the complete measured narration alignment.");
  }

  const boundaries: number[] = [0];
  for (let i = 0; i < rawScenes.length - 1; i += 1) {
    boundaries.push((rawScenes[i]!.end + rawScenes[i + 1]!.start) / 2);
  }
  boundaries.push(stream.totalDuration);

  const combinedAudioHash = hash(input.tts.sections.map(section => section.audio_sha256).join(":"));
  const alignmentHash = hash(JSON.stringify(input.tts.sections.map(section => section.alignment)));
  const scenes: SceneTimingSpec[] = rawScenes.map((entry, index) => {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    return {
      scene_id: entry.draft.scene_id,
      script_ko: entry.draft.script_ko,
      script_en: entry.draft.script_en ?? "",
      story_role: entry.draft.story_role,
      narrative_purpose_ko: entry.draft.narrative_purpose_ko,
      narrative_purpose_en: entry.draft.narrative_purpose_en ?? "",
      estimated_duration_sec: estimateKoreanNarrationDuration(entry.draft.script_ko),
      tts: {
        start_sec: Math.round(start * 1000) / 1000,
        end_sec: Math.round(end * 1000) / 1000,
        duration_sec: Math.round((end - start) * 1000) / 1000
      },
      beats: entry.beats,
      provenance: {
        script_id: "agent2-script",
        script_revision: input.scriptRevision,
        script_sha256: input.scriptSha256,
        scene_revision: 1,
        ...(entry.sectionIds.length === 1 ? { tts_section_id: entry.sectionIds[0]! } : {}),
        audio_sha256: combinedAudioHash,
        alignment_sha256: alignmentHash
      }
    };
  });

  const cues: Agent2SubtitleCue[] = [];
  let subtitleIndex = 1;
  const maxChars = input.format === "SHORTS" ? 18 : 28;
  let subtitleCursor = 0;
  for (const scene of input.story.scenes) {
    for (const chunk of subtitleChunks(scene.script_ko, maxChars)) {
      const range = locateExact(stream, chunk, subtitleCursor, `Subtitle ${subtitleIndex}`);
      cues.push({
        subtitle_id: `SUB_${String(subtitleIndex).padStart(4, "0")}`,
        scene_id: scene.scene_id,
        start_sec: Math.round(range.start * 1000) / 1000,
        end_sec: Math.round(range.end * 1000) / 1000,
        text_ko: chunk
      });
      subtitleCursor = range.nextCursor;
      subtitleIndex += 1;
    }
  }
  if (subtitleCursor !== stream.chars.length) {
    throw new Agent2StoryAudioError("AGENT2_TTS_ALIGNMENT_MISMATCH", "Subtitle segmentation did not consume the full measured narration.");
  }

  const warnings: Array<{ code: string; message: string }> = [];
  for (const scene of scenes) {
    const actual = scene.tts!.duration_sec;
    const difference = Math.abs(actual - scene.estimated_duration_sec) / actual;
    if (difference > 0.25) warnings.push({
      code: "ESTIMATE_ACTUAL_VARIANCE",
      message: `${scene.scene_id} estimated duration differs from measured TTS by more than 25%.`
    });
  }

  return {
    sceneTiming: { schema_version: "1.0", project_id: input.projectId, scenes },
    ttsManifest: {
      schema_version: "1.0",
      project_id: input.projectId,
      provider: input.tts.provider,
      voice_id: input.tts.voice_id,
      model_id: input.tts.model_id,
      total_duration_sec: Math.round(stream.totalDuration * 1000) / 1000,
      sections: input.tts.sections.map(section => ({
        section_id: section.section_id,
        timeline_start_sec: section.timeline_start_sec,
        timeline_end_sec: Math.round((section.timeline_start_sec + section.audio_duration_sec) * 1000) / 1000,
        text: section.text,
        audio_relative_path: section.audio_relative_path,
        audio_sha256: section.audio_sha256,
        audio_duration_sec: section.audio_duration_sec
      }))
    },
    subtitleTiming: {
      schema_version: "1.0",
      project_id: input.projectId,
      cues
    },
    warnings
  };
}

export class Agent2StoryAudioWorkerService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  async execute(projectId: string, taskId: Agent2TaskId, filename: string): Promise<Agent2TaskExecutionResult> {
    return this.executePayload(projectId, taskId, await readJson(filename));
  }

  async executePayload(projectId: string, taskId: Agent2TaskId, input: unknown): Promise<Agent2TaskExecutionResult> {
    const status = await this.projects.getStatus(projectId);
    const workflow = new WorkflowOrchestratorRepository(status.projectDbPath, { readonly: true });
    try {
      const task = workflow.getTask(projectId, taskId);
      if (task === null || task.assigned_agent !== "AGENT2_STORY_AUDIO") {
        throw new Agent2StoryAudioError("AGENT2_TASK_MISMATCH", `${taskId} is not assigned to AGENT2_STORY_AUDIO.`);
      }
      if (task.status !== "RUNNING") {
        throw new Agent2StoryAudioError("AGENT2_TASK_NOT_RUNNING", `${taskId} must be dispatched by Agent 1 before Agent 2 can execute it.`);
      }
    } finally {
      workflow.close();
    }

    if (taskId === "T010") return this.executeResearch(status.projectDbPath, projectId, input);
    if (taskId === "T020") {
      return await this.executeStory(
        status.projectDbPath,
        status.projectRoot,
        projectId,
        input
      );
    }
    return this.executeTiming(status.projectDbPath, projectId, input);
  }

  private executeResearch(dbPath: string, projectId: string, input: unknown): Agent2TaskExecutionResult {
    const production = new ProductionSpecRepository(dbPath, { readonly: true });
    const repo = new Agent2StoryAudioRepository(dbPath);
    try {
      const project = production.getProjectSpec(projectId);
      const expectedTopic = project?.topic?.trim() ?? "";
      if (!expectedTopic) {
        throw new Agent2StoryAudioError(
          "AGENT2_PREREQUISITE_MISSING",
          "T010 requires an explicit active Project Spec topic."
        );
      }

      const result = validateResearchBundle(input, projectId, expectedTopic);
      if (!result.valid) {
        throw new Agent2StoryAudioError(
          "AGENT2_INPUT_INVALID",
          validationMessage(result)
        );
      }

      const bundle = structuredClone(input as Agent2ResearchBundle);
      const at = new Date().toISOString();
      const research = repo.save(projectId, "research_spec", bundle.research_spec, "T010", at);
      const facts = repo.save(projectId, "fact_check_spec", bundle.fact_check_spec, "T010", at);
      return {
        project_id: projectId,
        task_id: "T010",
        assigned_agent: "AGENT2_STORY_AUDIO",
        stored_artifacts: [
          { artifact_type: research.artifact_type, revision: research.revision, sha256: research.sha256 },
          { artifact_type: facts.artifact_type, revision: facts.revision, sha256: facts.sha256 }
        ],
        warnings: result.warnings.map(({ code, message }) => ({ code, message }))
      };
    } finally {
      repo.close();
      production.close();
    }
  }

  private async executeStory(
    dbPath: string,
    projectRoot: string,
    projectId: string,
    input: unknown
  ): Promise<Agent2TaskExecutionResult> {
    const repo = new Agent2StoryAudioRepository(dbPath);
    try {
      const facts = repo.getActive<Agent2ResearchBundle["fact_check_spec"]>(projectId, "fact_check_spec");
      if (facts === null) throw new Agent2StoryAudioError("AGENT2_PREREQUISITE_MISSING", "T020 requires the active fact_check_spec from T010.");
      const bundle = structuredClone(input as Agent2StoryBundle);
      if (bundle?.script) bundle.script.estimated_duration_sec = estimateKoreanNarrationDuration(bundle.script.body_ko ?? "");
      const result = validateStoryBundle(bundle, facts.value, projectId);
      if (!result.valid) throw new Agent2StoryAudioError("AGENT2_INPUT_INVALID", validationMessage(result));
      const at = new Date().toISOString();
      const story = repo.save(projectId, "story_spec", bundle.story_spec, "T020", at);
      const script = repo.save(projectId, "script", bundle.script, "T020", at);
      await materializeScriptRecords({
        projectId,
        projectRoot,
        story: {
          revision: story.revision,
          sha256: story.sha256,
          value: bundle.story_spec
        },
        script: {
          revision: script.revision,
          sha256: script.sha256,
          value: bundle.script
        }
      });
      return {
        project_id: projectId,
        task_id: "T020",
        assigned_agent: "AGENT2_STORY_AUDIO",
        stored_artifacts: [
          { artifact_type: story.artifact_type, revision: story.revision, sha256: story.sha256 },
          { artifact_type: script.artifact_type, revision: script.revision, sha256: script.sha256 }
        ],
        warnings: result.warnings.map(({ code, message }) => ({ code, message }))
      };
    } finally {
      repo.close();
    }
  }

  async materializeScript(projectId: string): Promise<Agent2ScriptMaterializationResult> {
    const status = await this.projects.getStatus(projectId);
    const repo = new Agent2StoryAudioRepository(status.projectDbPath, { readonly: true });
    try {
      const story = repo.getActive<Agent2StorySpec>(projectId, "story_spec");
      const script = repo.getActive<Agent2ScriptSpec>(projectId, "script");
      if (story === null || script === null) {
        throw new Agent2StoryAudioError(
          "AGENT2_PREREQUISITE_MISSING",
          "Script materialization requires active story_spec and script artifacts in project.db."
        );
      }
      return await materializeScriptRecords({
        projectId,
        projectRoot: status.projectRoot,
        story,
        script
      });
    } finally {
      repo.close();
    }
  }

  private executeTiming(dbPath: string, projectId: string, input: unknown): Agent2TaskExecutionResult {
    const inputValidation = validateTtsCompletionInput(input, projectId);
    if (!inputValidation.valid) throw new Agent2StoryAudioError("AGENT2_INPUT_INVALID", validationMessage(inputValidation));

    const agent2 = new Agent2StoryAudioRepository(dbPath);
    const production = new ProductionSpecRepository(dbPath);
    try {
      const story = agent2.getActive<Agent2StorySpec>(projectId, "story_spec");
      const script = agent2.getActive<Agent2ScriptSpec>(projectId, "script");
      const project = production.getProjectSpec(projectId);
      if (story === null || script === null || project === null) {
        throw new Agent2StoryAudioError("AGENT2_PREREQUISITE_MISSING", "T030 requires active story_spec, script and project_spec.");
      }
      const compiled = compileMeasuredTiming({
        projectId,
        story: story.value,
        script: script.value,
        scriptRevision: script.revision,
        scriptSha256: script.sha256,
        tts: input as Agent2TtsCompletionInput,
        format: project.format
      });
      const at = new Date().toISOString();
      const tts = agent2.save(projectId, "tts_manifest", compiled.ttsManifest, "T030", at);
      const subtitles = agent2.save(projectId, "subtitle_timing", compiled.subtitleTiming, "T030", at);
      const sceneRevision = production.saveSceneTiming(projectId, compiled.sceneTiming, at);
      const sceneHash = hash(JSON.stringify(compiled.sceneTiming));
      return {
        project_id: projectId,
        task_id: "T030",
        assigned_agent: "AGENT2_STORY_AUDIO",
        stored_artifacts: [
          { artifact_type: tts.artifact_type, revision: tts.revision, sha256: tts.sha256 },
          { artifact_type: "scene_timing_spec", revision: sceneRevision, sha256: sceneHash },
          { artifact_type: subtitles.artifact_type, revision: subtitles.revision, sha256: subtitles.sha256 }
        ],
        warnings: compiled.warnings
      };
    } finally {
      production.close();
      agent2.close();
    }
  }
}
