import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectBootstrapService } from "@vpf/project-bootstrap";
import { FileSystemResourceRegistry, type ProviderProfilePayload, type ResourcePin } from "@vpf/resource-registry";
import {
  getAgent2TaskInstruction,
  type Agent2FactCheckSpec,
  type Agent2ResearchBundle,
  type Agent2ResearchSpec,
  type Agent2ScriptSpec,
  type Agent2StoryBundle,
  type Agent2StorySpec,
  type Agent2TaskExecutionResult,
  type Agent2TtsCompletionInput
} from "@vpf/production-spec";
import { Agent2StoryAudioRepository } from "@vpf/storage/agent2-story-audio";
import { Agent2RuntimeRepository } from "@vpf/storage/agent2-runtime";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import { WorkflowOrchestratorRepository } from "@vpf/storage/workflow-orchestrator";
import { ElevenLabsProcessRuntimeExecutor } from "@vpf/provider-orchestrator/elevenlabs-runtime";
import {
  sha256CanonicalJson,
  type RuntimeExpectedOutput,
  type RuntimeJob,
  type RuntimeResult
} from "@vpf/runtime-contracts";
import { Agent1WorkflowOrchestratorService } from "./workflow-orchestrator-service.js";
import { CodexProcessRunner, CodexRuntimeError } from "./codex-process-runner.js";
import { CodexManagerRuntimeService } from "./codex-manager-runtime-service.js";
import { Agent2StoryAudioWorkerService } from "./agent2-story-audio-service.js";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url))
);

const STORY_ROLES = [
  "HOOK", "IDENTIFY", "EVIDENCE", "EXTEND", "BREAK", "HYPOTHESIS",
  "UNCERTAINTY", "CLOSING", "CLOSING_QUESTION", "OTHER"
];

const FACT_CLASSES = [
  "VERIFIED_FACT",
  "LIKELY_INTERPRETATION",
  "HYPOTHESIS",
  "LEGEND",
  "EDITORIAL_RECONSTRUCTION"
];

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["research_spec", "fact_check_spec"],
  properties: {
    research_spec: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "project_id", "topic", "central_question", "sources", "research_notes"],
      properties: {
        schema_version: { type: "string", enum: ["1.0"] },
        project_id: { type: "string" },
        topic: { type: "string" },
        central_question: { type: "string" },
        sources: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["source_id", "title", "source_type", "url", "citation", "publisher", "published_at", "notes"],
            properties: {
              source_id: { type: "string" },
              title: { type: "string" },
              source_type: { type: "string" },
              url: { type: "string" },
              citation: { type: "string" },
              publisher: { type: "string" },
              published_at: { type: "string" },
              notes: { type: "string" }
            }
          }
        },
        research_notes: { type: "array", items: { type: "string" } }
      }
    },
    fact_check_spec: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "project_id", "facts"],
      properties: {
        schema_version: { type: "string", enum: ["1.0"] },
        project_id: { type: "string" },
        facts: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "fact_id", "statement_ko", "statement_en", "classification",
              "confidence", "source_refs", "visualisation_note", "uncertainty_note"
            ],
            properties: {
              fact_id: { type: "string" },
              statement_ko: { type: "string" },
              statement_en: { type: "string" },
              classification: { type: "string", enum: FACT_CLASSES },
              confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
              source_refs: { type: "array", items: { type: "string" } },
              visualisation_note: { type: "string" },
              uncertainty_note: { type: "string" }
            }
          }
        }
      }
    }
  }
} as const;

const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["story_spec", "script"],
  properties: {
    story_spec: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "project_id", "central_question", "sections", "scenes"],
      properties: {
        schema_version: { type: "string", enum: ["1.0"] },
        project_id: { type: "string" },
        central_question: { type: "string" },
        sections: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["section_id", "role", "purpose_ko", "purpose_en", "fact_refs"],
            properties: {
              section_id: { type: "string" },
              role: { type: "string", enum: STORY_ROLES },
              purpose_ko: { type: "string" },
              purpose_en: { type: "string" },
              fact_refs: { type: "array", items: { type: "string" } }
            }
          }
        },
        scenes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "scene_id", "story_role", "narrative_purpose_ko", "narrative_purpose_en",
              "script_ko", "script_en", "fact_refs", "beats"
            ],
            properties: {
              scene_id: { type: "string" },
              story_role: { type: "string", enum: STORY_ROLES },
              narrative_purpose_ko: { type: "string" },
              narrative_purpose_en: { type: "string" },
              script_ko: { type: "string" },
              script_en: { type: "string" },
              fact_refs: { type: "array", items: { type: "string" } },
              beats: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["beat_id", "purpose_ko", "purpose_en", "script_ko"],
                  properties: {
                    beat_id: { type: "string" },
                    purpose_ko: { type: "string" },
                    purpose_en: { type: "string" },
                    script_ko: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    script: {
      type: "object",
      additionalProperties: false,
      required: [
        "schema_version", "project_id", "language", "body_ko", "body_en",
        "estimated_duration_sec", "source_fact_refs"
      ],
      properties: {
        schema_version: { type: "string", enum: ["1.0"] },
        project_id: { type: "string" },
        language: { type: "string" },
        body_ko: { type: "string" },
        body_en: { type: "string" },
        estimated_duration_sec: { type: "number" },
        source_fact_refs: { type: "array", items: { type: "string" } }
      }
    }
  }
} as const;

type Agent2RuntimeTaskId = "T010" | "T020" | "T030";

export class Agent2RuntimeAdapterError extends Error {
  constructor(
    public readonly code:
      | "AGENT2_RUNTIME_SECRET_MISSING"
      | "AGENT2_RUNTIME_HTTP"
      | "AGENT2_RUNTIME_RESPONSE_INVALID"
      | "AGENT2_RUNTIME_SOURCE_UNVERIFIED"
      | "AGENT2_RUNTIME_TASK_UNAVAILABLE"
      | "AGENT2_RUNTIME_PREREQUISITE"
      | "AGENT2_RUNTIME_PROJECT_UPGRADE_REQUIRED"
      | "AGENT2_TTS_RUNTIME_FAILED",
    message: string
  ) {
    super(message);
    this.name = "Agent2RuntimeAdapterError";
  }
}

interface OpenAiResponseEnvelope {
  id?: string;
  status?: string;
  output?: unknown[];
  error?: { message?: string };
}

interface RuntimeStepResult {
  task_id: Agent2RuntimeTaskId;
  runtime_provider: string;
  runtime_model: string;
  worker: Agent2TaskExecutionResult;
  gate_status: string;
}

const sha256Text = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

type Agent2AiRuntimeMode = "CODEX_SESSION" | "OPENAI_API";

function agent2AiRuntimeMode(environment: NodeJS.ProcessEnv): Agent2AiRuntimeMode {
  const value = (environment.VPF_AI_RUNTIME_MODE ?? "CODEX_SESSION").trim().toUpperCase();
  if (value === "CODEX_SESSION" || value === "OPENAI_API") return value;
  throw new Agent2RuntimeAdapterError(
    "AGENT2_RUNTIME_RESPONSE_INVALID",
    "VPF_AI_RUNTIME_MODE must be CODEX_SESSION or OPENAI_API."
  );
}

function codexFatal(error: unknown): boolean {
  return error instanceof CodexRuntimeError && [
    "CODEX_CLI_MISSING",
    "CODEX_LOGIN_REQUIRED",
    "CODEX_CAPABILITY_MISSING"
  ].includes(error.code);
}


function extractOutputText(response: OpenAiResponseEnvelope): string {
  const texts: string[] = [];
  for (const item of response.output ?? []) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "message" || !Array.isArray(record.content)) continue;
    for (const part of record.content) {
      if (typeof part !== "object" || part === null) continue;
      const value = part as Record<string, unknown>;
      if (value.type === "output_text" && typeof value.text === "string") texts.push(value.text);
    }
  }
  return texts.join("").trim();
}

function canonicalWebUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function collectWebSourceUrls(response: OpenAiResponseEnvelope): Set<string> {
  const urls = new Set<string>();
  const visit = (value: unknown, inSourceContext = false): void => {
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, inSourceContext));
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const sourceContext = inSourceContext || type === "url_citation" || type === "web_search_call";
    if (sourceContext && typeof record.url === "string" && /^https?:\/\//iu.test(record.url)) urls.add(canonicalWebUrl(record.url));
    if (Array.isArray(record.sources)) visit(record.sources, true);
    if (Array.isArray(record.annotations)) visit(record.annotations, true);
    if (record.action !== undefined) visit(record.action, true);
    for (const [key, child] of Object.entries(record)) {
      if (["sources", "annotations", "action", "url"].includes(key)) continue;
      visit(child, sourceContext);
    }
  };
  visit(response.output ?? []);
  return urls;
}

function parseStructuredJson<T>(response: OpenAiResponseEnvelope): T {
  const text = extractOutputText(response);
  if (!text) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_RESPONSE_INVALID", "OpenAI response did not contain structured output text.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_RESPONSE_INVALID", "OpenAI structured output was not valid JSON.");
  }
}

function normalizeResearchBundle(bundle: Agent2ResearchBundle): Agent2ResearchBundle {
  return {
    research_spec: {
      ...bundle.research_spec,
      sources: bundle.research_spec.sources.map(source => ({
        ...source,
        ...((source.url ?? "").trim() ? { url: (source.url ?? "").trim() } : { url: "" }),
        ...((source.citation ?? "").trim() ? { citation: (source.citation ?? "").trim() } : { citation: "" }),
        ...((source.publisher ?? "").trim() ? { publisher: (source.publisher ?? "").trim() } : { publisher: "" }),
        ...((source.published_at ?? "").trim() ? { published_at: (source.published_at ?? "").trim() } : { published_at: "" }),
        ...((source.notes ?? "").trim() ? { notes: (source.notes ?? "").trim() } : { notes: "" })
      }))
    },
    fact_check_spec: {
      ...bundle.fact_check_spec,
      facts: bundle.fact_check_spec.facts.map(fact => ({
        ...fact,
        statement_en: fact.statement_en ?? "",
        visualisation_note: fact.visualisation_note ?? "",
        uncertainty_note: fact.uncertainty_note ?? ""
      }))
    }
  };
}

function normalizeStoryBundle(bundle: Agent2StoryBundle): Agent2StoryBundle {
  return {
    story_spec: {
      ...bundle.story_spec,
      sections: bundle.story_spec.sections.map(section => ({
        ...section,
        purpose_en: section.purpose_en ?? ""
      })),
      scenes: bundle.story_spec.scenes.map(scene => ({
        ...scene,
        narrative_purpose_en: scene.narrative_purpose_en ?? "",
        script_en: scene.script_en ?? "",
        beats: scene.beats.map(beat => ({ ...beat, purpose_en: beat.purpose_en ?? "" }))
      }))
    },
    script: {
      ...bundle.script,
      body_en: bundle.script.body_en ?? ""
    }
  };
}

class OpenAiAgent2Runtime {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    profile: { model: string },
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {
    this.apiKey = (environment.OPENAI_API_KEY ?? "").trim();
    const configuredOverride = (environment.VPF_AGENT2_OPENAI_MODEL ?? "").trim();
    if (configuredOverride && configuredOverride !== profile.model) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_RESPONSE_INVALID",
        `VPF_AGENT2_OPENAI_MODEL=${configuredOverride} does not match pinned provider model ${profile.model}.`
      );
    }
    this.model = profile.model.trim();
    this.baseUrl = (environment.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/u, "");
    this.timeoutMs = Number(environment.VPF_AGENT2_OPENAI_TIMEOUT_MS ?? 180000);
    this.retries = Number(environment.VPF_AGENT2_OPENAI_RETRIES ?? 2);
    if (!this.apiKey) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_SECRET_MISSING", "OPENAI_API_KEY is required for Agent2 T010/T020.");
    if (!this.model) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_RESPONSE_INVALID", "VPF_AGENT2_OPENAI_MODEL must not be empty.");
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isInteger(this.retries) || this.retries < 0 || this.retries > 5) {
      throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_RESPONSE_INVALID", "Invalid Agent2 OpenAI timeout/retry configuration.");
    }
  }

  get modelId(): string { return this.model; }

  async research(input: {
    projectId: string;
    topic: string;
    format: "SHORTS" | "LONGFORM";
    targetDurationSec: number;
    language: string;
  }): Promise<{ responseId: string | null; bundle: Agent2ResearchBundle }> {
    const instruction = getAgent2TaskInstruction("T010");
    const body = {
      model: this.model,
      store: false,
      reasoning: { effort: "medium" },
      tools: [{ type: "web_search", search_context_size: "high" }],
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: [
              "You are Agent 2 Research/Fact-Check Worker for a production pipeline.",
              ...instruction.rules,
              "Research with the web search tool before producing the final JSON.",
              "Prefer primary sources, museums, universities, scholarly publications, government/institutional sources, and established reference works.",
              "For VERIFIED_FACT, use traceable supporting source IDs. Do not invent URLs.",
              "Keep disputed claims explicitly classified as interpretation, hypothesis, legend, or editorial reconstruction."
            ].join("\n")
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              project_id: input.projectId,
              topic: input.topic,
              format: input.format,
              target_duration_sec: input.targetDurationSec,
              language: input.language
            })
          }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agent2_research_bundle",
          strict: true,
          schema: RESEARCH_SCHEMA
        }
      }
    };
    const response = await this.request(body);
    const bundle = normalizeResearchBundle(parseStructuredJson<Agent2ResearchBundle>(response));
    const observed = collectWebSourceUrls(response);
    for (const source of bundle.research_spec.sources) {
      if (!source.url) continue;
      if (!observed.has(canonicalWebUrl(source.url))) {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_SOURCE_UNVERIFIED",
          `Research output referenced a URL not observed in OpenAI web search evidence: ${source.url}`
        );
      }
    }
    return { responseId: typeof response.id === "string" ? response.id : null, bundle };
  }

  async story(input: {
    projectId: string;
    format: "SHORTS" | "LONGFORM";
    targetDurationSec: number;
    language: string;
    research: Agent2ResearchSpec;
    facts: Agent2FactCheckSpec;
  }): Promise<{ responseId: string | null; bundle: Agent2StoryBundle }> {
    const instruction = getAgent2TaskInstruction("T020");
    const body = {
      model: this.model,
      store: false,
      reasoning: { effort: "medium" },
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: [
              "You are Agent 2 Story/Script Worker for a production pipeline.",
              ...instruction.rules,
              "Do not add factual claims that are absent from fact_check_spec.",
              "Write Korean narration that fits the requested format and approximate target duration.",
              "For SHORTS, open immediately with the central mystery, keep background compact, introduce evidence quickly, distinguish hypotheses, and close by returning to the unresolved question.",
              "Scene boundaries follow narrative purpose, not sentence count.",
              "Return exact scene and beat script slices so concatenating them reproduces body_ko after whitespace normalization."
            ].join("\n")
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              project_id: input.projectId,
              format: input.format,
              target_duration_sec: input.targetDurationSec,
              language: input.language,
              research_spec: input.research,
              fact_check_spec: input.facts
            })
          }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agent2_story_bundle",
          strict: true,
          schema: STORY_SCHEMA
        }
      }
    };
    const response = await this.request(body);
    return {
      responseId: typeof response.id === "string" ? response.id : null,
      bundle: normalizeStoryBundle(parseStructuredJson<Agent2StoryBundle>(response))
    };
  }

  private async request(body: unknown): Promise<OpenAiResponseEnvelope> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const text = await response.text();
        let parsed: OpenAiResponseEnvelope;
        try {
          parsed = JSON.parse(text) as OpenAiResponseEnvelope;
        } catch {
          throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_RESPONSE_INVALID", `OpenAI returned non-JSON HTTP ${response.status}.`);
        }
        if (response.ok && parsed.status === "completed") return parsed;
        const detail = parsed.error?.message ?? `OpenAI Responses API HTTP ${response.status} status=${String(parsed.status)}`;
        if ((response.status === 429 || response.status >= 500) && attempt < this.retries) {
          lastError = new Agent2RuntimeAdapterError("AGENT2_RUNTIME_HTTP", detail);
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000)));
          continue;
        }
        throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_HTTP", detail);
      } catch (error) {
        lastError = error;
        if (error instanceof Agent2RuntimeAdapterError) throw error;
        if (attempt >= this.retries) {
          throw new Agent2RuntimeAdapterError(
            "AGENT2_RUNTIME_HTTP",
            error instanceof Error ? error.message : String(error)
          );
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Agent2RuntimeAdapterError("AGENT2_RUNTIME_HTTP", "OpenAI request failed.");
  }
}

interface ElevenLabsSectionPlan {
  id: string;
  index: number;
  text: string;
  audioRelativePath: string;
  characterAlignmentRelativePath: string;
}

class Agent2ElevenLabsBridge {
  constructor(
    private readonly repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {}

  async execute(input: {
    projectId: string;
    projectRoot: string;
    dbPath: string;
    attempt: number;
    format: "SHORTS" | "LONGFORM";
    script: Agent2ScriptSpec;
    scriptRevision: number;
    story: Agent2StorySpec;
    providerProfile: { version: string; contentHash: string };
  }): Promise<{ runtimeResult: RuntimeResult; completion: Agent2TtsCompletionInput }> {
    const workspaceRoot = path.dirname(path.dirname(input.projectRoot));
    const sections = this.sections(input.format, input.script, input.story);
    const preset = input.format === "LONGFORM" ? "HISTORY_MYSTERY_LONGFORM" : "HISTORY_MYSTERY_SHORTS";
    const settings = input.format === "LONGFORM"
      ? { stability: 0.62, similarityBoost: 0.8, style: 0.04, speed: 1, useSpeakerBoost: true }
      : { stability: 0.6, similarityBoost: 0.8, style: 0.05, speed: 1, useSpeakerBoost: true };
    const effective = input.format === "LONGFORM"
      ? { stability: 0.62, style: 0.04 }
      : { stability: 0.6, style: 0.05 };
    const narrationMode = input.format === "LONGFORM" ? "SEGMENTED" : "SINGLE";
    const chunks = sections.map(section => ({
      index: section.index,
      text: section.text,
      textCharacterCount: section.text.length,
      outputRelativePath: section.audioRelativePath,
      ...(narrationMode === "SEGMENTED" ? { sectionId: section.id, sectionIndex: section.index } : {})
    }));
    const plan = {
      id: `agent2-tts-${input.scriptRevision}`,
      revision: input.scriptRevision,
      sourceScript: {
        id: "agent2-script",
        revision: input.scriptRevision,
        sha256: sha256Text(JSON.stringify(input.script))
      },
      contentFormat: input.format === "LONGFORM" ? "LONGFORM" : "SHORTFORM",
      endpoint: "/v1/text-to-speech/{voice_id}/with-timestamps",
      modelId: "eleven_v3",
      outputFormat: "mp3_44100_128",
      voiceIdResolution: "VOICE_PRESET_THEN_ENV",
      voiceIdFallbackEnv: "ELEVENLABS_VOICE_ID",
      voicePreset: preset,
      configuredVoiceSettings: settings,
      effectiveVoiceSettings: effective,
      droppedVoiceSettings: ["similarity_boost", "speed", "use_speaker_boost"],
      preserveProviderCadence: true,
      narrationMode,
      ...(narrationMode === "SEGMENTED"
        ? {
            sections: sections.map(section => ({
              id: section.id,
              index: section.index,
              sceneIds: [section.id.replace(/^tts-/u, "")],
              text: section.text,
              textCharacterCount: section.text.length,
              audioRelativePath: section.audioRelativePath,
              characterAlignmentRelativePath: section.characterAlignmentRelativePath
            }))
          }
        : {}),
      chunks,
      outputPaths: {
        narration: "03_tts/narration.mp3",
        characterAlignment: "03_tts/character_alignment.json",
        ...(narrationMode === "SEGMENTED" ? { narrationManifest: "03_tts/narration_manifest.json" } : {}),
        metadata: "03_tts/tts_metadata.json",
        resolvedVoiceProfile: "03_tts/resolved_voice_profile.json"
      }
    };
    const runtimeInput = {
      schemaVersion: 1,
      providerProfile: {
        resourceId: "ELEVENLABS_V3_HISTORY_V1",
        version: input.providerProfile.version,
        contentHash: input.providerProfile.contentHash
      },
      plan
    };
    const expectedOutputs: RuntimeExpectedOutput[] = narrationMode === "SEGMENTED"
      ? sections.flatMap(section => {
          const suffix = String(section.index).padStart(3, "0");
          return [
            { role: `narration_section_${suffix}`, mediaType: "AUDIO" as const, required: true, acceptedMimeTypes: ["audio/mpeg"] },
            { role: `character_alignment_section_${suffix}`, mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] }
          ];
        }).concat([
          { role: "narration_manifest", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] },
          { role: "tts_metadata", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] },
          { role: "resolved_voice_profile", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] }
        ])
      : [
          { role: "narration", mediaType: "AUDIO" as const, required: true, acceptedMimeTypes: ["audio/mpeg"] },
          { role: "character_alignment", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] },
          { role: "tts_metadata", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] },
          { role: "resolved_voice_profile", mediaType: "DOCUMENT" as const, required: true, acceptedMimeTypes: ["application/json"] }
        ];
    const job: RuntimeJob = {
      schemaVersion: 1,
      jobId: `${input.projectId}:T030:A${input.attempt}:ELEVENLABS`,
      jobRevision: 1,
      projectId: input.projectId,
      jobType: "TTS_GENERATION",
      target: { type: "AUDIO", id: plan.id, revision: plan.revision },
      provider: "ELEVENLABS",
      providerProfileVersion: input.providerProfile.version,
      executionMode: "AUTOMATED",
      attempt: input.attempt,
      inputHash: sha256CanonicalJson(runtimeInput),
      input: runtimeInput,
      expectedOutputs,
      secretRequirements: [{ envName: "ELEVENLABS_API_KEY", required: true }]
    };
    const executor = new ElevenLabsProcessRuntimeExecutor({
      repositoryRoot: this.repositoryRoot,
      workspaceOptions: { repositoryRoot: this.repositoryRoot, workspaceRoot },
      environment: this.environment
    });
    const runtimeResult = await executor.execute(job);
    if (runtimeResult.status !== "COMPLETE") {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_TTS_RUNTIME_FAILED",
        runtimeResult.error?.detail ?? runtimeResult.error?.code ?? "ElevenLabs runtime failed."
      );
    }
    return {
      runtimeResult,
      completion: await this.toCompletion(input.projectRoot, input.projectId, sections, runtimeResult)
    };
  }

  private sections(format: "SHORTS" | "LONGFORM", script: Agent2ScriptSpec, story: Agent2StorySpec): ElevenLabsSectionPlan[] {
    if (format === "SHORTS") {
      if (script.body_ko.length > 4000) {
        throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_PREREQUISITE", "SHORTS narration exceeds ElevenLabs 4000-character section limit.");
      }
      return [{
        id: "tts-section-001",
        index: 1,
        text: script.body_ko,
        audioRelativePath: "03_tts/chunks/chunk_001.mp3",
        characterAlignmentRelativePath: "03_tts/character_alignment.json"
      }];
    }
    return story.scenes.map((scene, index) => {
      if (scene.script_ko.length > 4000) {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_PREREQUISITE",
          `Scene ${scene.scene_id} exceeds ElevenLabs 4000-character section limit; split the Scene at T020.`
        );
      }
      const suffix = String(index + 1).padStart(3, "0");
      return {
        id: `tts-${scene.scene_id}`,
        index: index + 1,
        text: scene.script_ko,
        audioRelativePath: `03_tts/sections/section_${suffix}.mp3`,
        characterAlignmentRelativePath: `03_tts/alignment/section_${suffix}.json`
      };
    });
  }

  private async toCompletion(
    projectRoot: string,
    projectId: string,
    sections: ElevenLabsSectionPlan[],
    result: RuntimeResult
  ): Promise<Agent2TtsCompletionInput> {
    const completed: Agent2TtsCompletionInput["sections"] = [];
    let timeline = 0;
    for (const section of sections) {
      const suffix = String(section.index).padStart(3, "0");
      const audioRole = sections.length === 1 && !result.outputs.some(output => output.role.startsWith("narration_section_"))
        ? "narration"
        : `narration_section_${suffix}`;
      const alignmentRole = sections.length === 1 && !result.outputs.some(output => output.role.startsWith("character_alignment_section_"))
        ? "character_alignment"
        : `character_alignment_section_${suffix}`;
      const audio = result.outputs.find(output => output.role === audioRole);
      const alignmentOutput = result.outputs.find(output => output.role === alignmentRole);
      if (!audio || !alignmentOutput || !audio.durationMs || audio.durationMs <= 0) {
        throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_RESPONSE_INVALID", `ElevenLabs outputs are incomplete for section ${section.id}.`);
      }
      const alignment = JSON.parse(
        await readFile(path.resolve(projectRoot, alignmentOutput.relativePath), "utf8")
      ) as {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      };
      completed.push({
        section_id: section.id,
        timeline_start_sec: Math.round(timeline * 1000) / 1000,
        text: section.text,
        audio_relative_path: audio.relativePath,
        audio_sha256: audio.sha256,
        audio_duration_sec: Math.round((audio.durationMs / 1000) * 1000) / 1000,
        alignment
      });
      timeline += audio.durationMs / 1000;
    }
    return {
      schema_version: "1.0",
      project_id: projectId,
      provider: "ELEVENLABS",
      voice_id: "REDACTED",
      model_id: "eleven_v3",
      sections: completed
    };
  }
}

async function resolvePinnedCodexStoryProfile(
  pins: ResourcePin[]
): Promise<ResourcePin> {
  const pin = pins.find(item =>
    item.resourceType === "PROVIDER_PROFILE" &&
    item.resourceId === "CODEX_STORY_AUDIO_V1"
  );
  if (!pin) {
    throw new Agent2RuntimeAdapterError(
      "AGENT2_RUNTIME_PREREQUISITE",
      "Pinned CODEX_STORY_AUDIO_V1 profile is missing."
    );
  }
  const registry = new FileSystemResourceRegistry(
    path.join(DEFAULT_REPOSITORY_ROOT, "resources")
  );
  const snapshot = await registry.resolvePinned<ProviderProfilePayload>(pin);
  if (
    snapshot.payload.provider !== "CODEX_SESSION" ||
    snapshot.payload.executionMode !== "AUTOMATED"
  ) {
    throw new Agent2RuntimeAdapterError(
      "AGENT2_RUNTIME_PREREQUISITE",
      "CODEX_STORY_AUDIO_V1 must be an AUTOMATED CODEX_SESSION profile."
    );
  }
  return pin;
}

async function resolvePinnedOpenAiProfile(
  pins: ResourcePin[]
): Promise<{ model: string; pin: ResourcePin }> {
  const pin = pins.find(item =>
    item.resourceType === "PROVIDER_PROFILE" &&
    item.resourceId === "OPENAI_AGENT2_STORY_V1"
  );
  if (!pin) {
    throw new Agent2RuntimeAdapterError(
      "AGENT2_RUNTIME_PREREQUISITE",
      "Pinned OpenAI Agent2 provider profile is missing. New Agent2 runtime projects require HISTORY_MYSTERY_V1@1.6.0 or an explicit equivalent pin."
    );
  }
  const registry = new FileSystemResourceRegistry(
    path.join(DEFAULT_REPOSITORY_ROOT, "resources")
  );
  const snapshot = await registry.resolvePinned<ProviderProfilePayload>(pin);
  if (
    snapshot.payload.provider !== "OPENAI" ||
    snapshot.payload.executionMode !== "AUTOMATED" ||
    typeof snapshot.payload.model !== "string" ||
    !snapshot.payload.model.trim()
  ) {
    throw new Agent2RuntimeAdapterError(
      "AGENT2_RUNTIME_PREREQUISITE",
      "Pinned OpenAI Agent2 provider profile is not an AUTOMATED OPENAI model profile."
    );
  }
  return { model: snapshot.payload.model.trim(), pin };
}

export class Agent2RuntimeAdapterService {
  private readonly manager: Agent1WorkflowOrchestratorService;
  private readonly worker: Agent2StoryAudioWorkerService;
  private readonly codexManager: CodexManagerRuntimeService;

  constructor(
    private readonly projects: ProjectBootstrapService,
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {
    this.manager = new Agent1WorkflowOrchestratorService(projects);
    this.worker = new Agent2StoryAudioWorkerService(projects);
    this.codexManager = new CodexManagerRuntimeService(projects, environment);
  }

  async runNext(projectId: string): Promise<RuntimeStepResult | { project_id: string; handoff_task: string | null; status: "HANDOFF" }> {
    await this.assertRuntimeProjectCurrent(projectId);
    const workflowState = await this.manager.status(projectId);
    const next = workflowState.tasks.find(task =>
      task.assigned_agent === "AGENT2_STORY_AUDIO" &&
      (task.status === "READY" || task.status === "REVISION_REQUIRED") &&
      ["T010", "T020", "T030"].includes(task.task_id)
    ) ?? null;
    if (next === null) {
      return {
        project_id: projectId,
        handoff_task: workflowState.next_task?.task_id ?? null,
        status: "HANDOFF"
      };
    }
    const taskId = next.task_id as Agent2RuntimeTaskId;
    const dispatch = await this.manager.dispatch(projectId, taskId, "AGENT2_STORY_AUDIO");
    try {
      const runtime = await this.executeDispatched(projectId, taskId, dispatch.attempt);
      const completed = await this.manager.complete(projectId, taskId);
      return {
        task_id: taskId,
        runtime_provider: runtime.provider,
        runtime_model: runtime.model,
        worker: runtime.worker,
        gate_status: completed.last_gate_status ?? "PASS"
      };
    } catch (error) {
      if (
        agent2AiRuntimeMode(this.environment) === "CODEX_SESSION" &&
        taskId !== "T030" &&
        !codexFatal(error)
      ) {
        try {
          await this.codexManager.reviewFailure({
            projectId,
            taskId,
            attempt: dispatch.attempt,
            workerRole: "CODEX_2_STORY_AUDIO",
            errorCode:
              error instanceof Agent2RuntimeAdapterError
                ? error.code
                : error instanceof CodexRuntimeError
                  ? error.code
                  : "AGENT2_RUNTIME_FAILURE",
            errorDetail: error instanceof Error ? error.message : String(error)
          });
        } catch {
          // Manager review is advisory. Deterministic workflow state remains authoritative.
        }
      }
      await this.manager.requestRevision(projectId, taskId);
      throw error;
    }
  }

  async runAll(projectId: string): Promise<{
    project_id: string;
    steps: RuntimeStepResult[];
    handoff_task: string | null;
    handoff_agent: string | null;
  }> {
    await this.assertRuntimeProjectCurrent(projectId);
    const steps: RuntimeStepResult[] = [];
    let guard = 0;
    while (guard < 12) {
      guard += 1;
      const state = await this.manager.status(projectId);
      const next = state.tasks.find(task =>
        task.assigned_agent === "AGENT2_STORY_AUDIO" &&
        (task.status === "READY" || task.status === "REVISION_REQUIRED") &&
        ["T010", "T020", "T030"].includes(task.task_id)
      ) ?? null;
      if (next === null) break;
      try {
        const result = await this.runNext(projectId);
        if ("status" in result) break;
        steps.push(result);
      } catch (error) {
        const after = await this.manager.status(projectId);
        const task = after.tasks.find(item => item.task_id === next.task_id);
        const retryable =
          task?.status === "REVISION_REQUIRED" &&
          (task.attempt ?? 0) < 3 &&
          !codexFatal(error) &&
          !(
            error instanceof Agent2RuntimeAdapterError &&
            [
              "AGENT2_RUNTIME_SECRET_MISSING",
              "AGENT2_RUNTIME_PROJECT_UPGRADE_REQUIRED",
              "AGENT2_RUNTIME_PREREQUISITE"
            ].includes(error.code)
          );
        if (retryable) continue;
        throw error;
      }
    }
    const handoff = await this.manager.next(projectId);
    return {
      project_id: projectId,
      steps,
      handoff_task: handoff?.task_id ?? null,
      handoff_agent: handoff?.assigned_agent ?? null
    };
  }

  async runtimeStatus(projectId: string) {
    await this.assertRuntimeProjectCurrent(projectId);
    const status = await this.projects.getStatus(projectId);
    const repo = new Agent2RuntimeRepository(status.projectDbPath, { readonly: true });
    try {
      return { project_id: projectId, runs: repo.list(projectId) };
    } finally {
      repo.close();
    }
  }

  private async assertRuntimeProjectCurrent(projectId: string): Promise<void> {
    const status = await this.projects.getStatus(projectId);
    const mode = agent2AiRuntimeMode(this.environment);
    if (mode === "CODEX_SESSION") {
      if (!status.migrations.appliedMigrationIds.includes("0022")) {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_PROJECT_UPGRADE_REQUIRED",
          "Codex Agent2 runtime requires migration 0022."
        );
      }
      if (!status.resourcePins.some(pin =>
        pin.resourceType === "PROVIDER_PROFILE" &&
        pin.resourceId === "CODEX_STORY_AUDIO_V1"
      )) {
        throw new Agent2RuntimeAdapterError(
          "AGENT2_RUNTIME_PROJECT_UPGRADE_REQUIRED",
          "Project does not pin CODEX_STORY_AUDIO_V1. Use HISTORY_MYSTERY_V1@1.8.0 or explicitly upgrade resources."
        );
      }
      return;
    }
    if (!status.migrations.appliedMigrationIds.includes("0019")) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_PROJECT_UPGRADE_REQUIRED",
        "OpenAI API Agent2 runtime requires migration 0019."
      );
    }
    if (!status.resourcePins.some(pin =>
      pin.resourceType === "PROVIDER_PROFILE" &&
      pin.resourceId === "OPENAI_AGENT2_STORY_V1"
    )) {
      throw new Agent2RuntimeAdapterError(
        "AGENT2_RUNTIME_PROJECT_UPGRADE_REQUIRED",
        "OPENAI_API mode requires pinned OPENAI_AGENT2_STORY_V1."
      );
    }
  }

  private async executeDispatched(
    projectId: string,
    taskId: Agent2RuntimeTaskId,
    attempt: number
  ): Promise<{ provider: string; model: string; worker: Agent2TaskExecutionResult }> {
    const status = await this.projects.getStatus(projectId);
    const production = new ProductionSpecRepository(status.projectDbPath, { readonly: true });
    const artifacts = new Agent2StoryAudioRepository(status.projectDbPath, { readonly: true });
    try {
      const spec = production.getProjectSpec(projectId);
      if (spec === null) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_PREREQUISITE", "Project Spec is required.");
      if (taskId === "T010") {
        const openAiProfile = await resolvePinnedOpenAiProfile(status.resourcePins);
        const openai = new OpenAiAgent2Runtime(openAiProfile, this.environment);
        const runId = `${projectId}:T010:A${attempt}:OPENAI`;
        const input = {
          projectId,
          topic: status.project.title,
          format: spec.format,
          targetDurationSec: spec.target_duration_sec,
          language: spec.language,
          provider_profile: openAiProfile.pin
        };
        const repo = new Agent2RuntimeRepository(status.projectDbPath);
        repo.start({
          run_id: runId,
          project_id: projectId,
          task_id: "T010",
          provider: "OPENAI",
          model_id: openai.modelId,
          provider_response_id: null,
          input_sha256: sha256Text(JSON.stringify(input)),
          started_at: new Date().toISOString()
        });
        try {
          const generated = await openai.research(input);
          const worker = await this.worker.executePayload(projectId, "T010", generated.bundle);
          repo.complete({
            runId,
            providerResponseId: generated.responseId,
            outputSha256: sha256Text(JSON.stringify(generated.bundle)),
            completedAt: new Date().toISOString()
          });
          return { provider: "OPENAI", model: openai.modelId, worker };
        } catch (error) {
          repo.fail({
            runId,
            errorCode: error instanceof Agent2RuntimeAdapterError ? error.code : "AGENT2_RUNTIME_HTTP",
            errorDetail: error instanceof Error ? error.message : String(error),
            completedAt: new Date().toISOString()
          });
          throw error;
        } finally {
          repo.close();
        }
      }

      if (taskId === "T020") {
        const research = artifacts.getActive<Agent2ResearchSpec>(projectId, "research_spec");
        const facts = artifacts.getActive<Agent2FactCheckSpec>(projectId, "fact_check_spec");
        if (!research || !facts) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_PREREQUISITE", "T020 requires T010 research/fact artifacts.");
        const openAiProfile = await resolvePinnedOpenAiProfile(status.resourcePins);
        const openai = new OpenAiAgent2Runtime(openAiProfile, this.environment);
        const runId = `${projectId}:T020:A${attempt}:OPENAI`;
        const input = {
          projectId,
          format: spec.format,
          targetDurationSec: spec.target_duration_sec,
          language: spec.language,
          research: research.value,
          facts: facts.value,
          provider_profile: openAiProfile.pin
        };
        const repo = new Agent2RuntimeRepository(status.projectDbPath);
        repo.start({
          run_id: runId,
          project_id: projectId,
          task_id: "T020",
          provider: "OPENAI",
          model_id: openai.modelId,
          provider_response_id: null,
          input_sha256: sha256Text(JSON.stringify(input)),
          started_at: new Date().toISOString()
        });
        try {
          const generated = await openai.story(input);
          const worker = await this.worker.executePayload(projectId, "T020", generated.bundle);
          repo.complete({
            runId,
            providerResponseId: generated.responseId,
            outputSha256: sha256Text(JSON.stringify(generated.bundle)),
            completedAt: new Date().toISOString()
          });
          return { provider: "OPENAI", model: openai.modelId, worker };
        } catch (error) {
          repo.fail({
            runId,
            errorCode: error instanceof Agent2RuntimeAdapterError ? error.code : "AGENT2_RUNTIME_HTTP",
            errorDetail: error instanceof Error ? error.message : String(error),
            completedAt: new Date().toISOString()
          });
          throw error;
        } finally {
          repo.close();
        }
      }

      const story = artifacts.getActive<Agent2StorySpec>(projectId, "story_spec");
      const script = artifacts.getActive<Agent2ScriptSpec>(projectId, "script");
      if (!story || !script) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_PREREQUISITE", "T030 requires active story_spec and script.");
      const pin = status.resourcePins.find(item =>
        item.resourceType === "PROVIDER_PROFILE" && item.resourceId === "ELEVENLABS_V3_HISTORY_V1"
      );
      if (!pin) throw new Agent2RuntimeAdapterError("AGENT2_RUNTIME_PREREQUISITE", "Pinned ElevenLabs provider profile is missing.");

      const runId = `${projectId}:T030:A${attempt}:ELEVENLABS`;
      const runtimeRepo = new Agent2RuntimeRepository(status.projectDbPath);
      runtimeRepo.start({
        run_id: runId,
        project_id: projectId,
        task_id: "T030",
        provider: "ELEVENLABS",
        model_id: "eleven_v3",
        provider_response_id: null,
        input_sha256: sha256Text(JSON.stringify({
          script_revision: script.revision,
          story_revision: story.revision,
          format: spec.format,
          provider_profile: pin
        })),
        started_at: new Date().toISOString()
      });
      try {
        const bridge = new Agent2ElevenLabsBridge(DEFAULT_REPOSITORY_ROOT, this.environment);
        const generated = await bridge.execute({
          projectId,
          projectRoot: status.projectRoot,
          dbPath: status.projectDbPath,
          attempt,
          format: spec.format,
          script: script.value,
          scriptRevision: script.revision,
          story: story.value,
          providerProfile: { version: pin.version, contentHash: pin.contentHash }
        });
        const worker = await this.worker.executePayload(projectId, "T030", generated.completion);
        runtimeRepo.complete({
          runId,
          providerResponseId: generated.runtimeResult.providerRequestIds.join(",") || null,
          outputSha256: sha256Text(JSON.stringify(generated.completion)),
          completedAt: new Date().toISOString()
        });
        return { provider: "ELEVENLABS", model: "eleven_v3", worker };
      } catch (error) {
        runtimeRepo.fail({
          runId,
          errorCode: error instanceof Agent2RuntimeAdapterError ? error.code : "AGENT2_TTS_RUNTIME_FAILED",
          errorDetail: error instanceof Error ? error.message : String(error),
          completedAt: new Date().toISOString()
        });
        throw error;
      } finally {
        runtimeRepo.close();
      }
    } finally {
      artifacts.close();
      production.close();
    }
  }
}
