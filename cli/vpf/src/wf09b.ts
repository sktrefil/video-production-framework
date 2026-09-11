import { randomUUID } from "node:crypto";
import { realpath, readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ProductionAsset } from "@vpf/domain";
import type { ProjectStatus } from "@vpf/project-bootstrap";
import { ProjectBootstrapService } from "@vpf/project-bootstrap";
import type { ImageQcDecision, SceneAssetDecisionPort } from "@vpf/production-system";
import {
  ChannelVisualBibleRegistryAdapter,
  FileSystemResourceRegistry,
  FormatProfileRegistryAdapter,
  type ResourcePin
} from "@vpf/resource-registry";
import {
  RuntimeExecutorRegistry,
  RuntimeOrchestrator,
  type RuntimeIdFactory
} from "@vpf/provider-orchestrator";
import {
  ImageRuntimeExecutor,
  type ImageProviderAdapter
} from "@vpf/provider-orchestrator/image-runtime";
import {
  SceneAssetPipeline,
  type ImageApprovalPolicy,
  type SceneAssetIdFactory
} from "@vpf/scene-assets";
import { UnifiedImageRuntimeJobService } from "@vpf/scene-assets/image-runtime";
import { SqliteSceneAssetRepository } from "@vpf/storage/scene-assets";
import { SqliteRuntimeExecutionRepository } from "@vpf/storage/runtime-execution";
import type { RuntimeSecretRequirement } from "@vpf/runtime-contracts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const canonicalResourcesRoot = path.join(repositoryRoot, "resources");
const systemClock = { nowIso: () => new Date().toISOString() };
const neverAutoApprove: ImageApprovalPolicy = { shouldAutoApprove: () => false };
const IMAGE_PROVIDER_PROFILE_ID = "IMAGE_PROVIDER_EXECUTION_V1";

export class Wf09bCliError extends Error {
  constructor(
    public readonly code:
      | "WF09B_USAGE"
      | "WF09B_INPUT_PATH"
      | "WF09B_INPUT_INVALID"
      | "WF09B_RESOURCE_PIN"
      | "WF09B_PROVIDER_PROFILE"
      | "WF09B_ADAPTER_REQUIRED"
      | "WF09B_SECRET_REQUIRED"
      | "WF09B_ASSET_STATE"
      | "WF09B_QC_AMBIGUOUS",
    message: string
  ) {
    super(message);
    this.name = "Wf09bCliError";
  }
}

interface ImageProviderProfilePayload {
  provider: string;
  executionMode: "AUTOMATED";
  jobTypes: string[];
  runtimeSecretNames: string[];
}

interface ResolvedImageProviderProfile {
  pin: ResourcePin;
  payload: ImageProviderProfilePayload;
}

export interface Wf09bQcInput {
  sceneId: string;
  mediaId?: string;
  decision: ImageQcDecision;
}

export interface Wf09bQcPlan {
  results: Wf09bQcInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSceneAssetIds(): SceneAssetIdFactory {
  return {
    next(prefix) {
      return `${prefix}_${randomUUID().replaceAll("-", "")}`;
    }
  };
}

function createRuntimeIds(): RuntimeIdFactory {
  return {
    next(prefix) {
      return `${prefix}_${randomUUID().replaceAll("-", "")}`;
    }
  };
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function readProjectJson(projectRoot: string, inputPath: string): Promise<unknown> {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedInput = path.resolve(inputPath);
  if (!isInside(resolvedRoot, resolvedInput)) {
    throw new Wf09bCliError(
      "WF09B_INPUT_PATH",
      "WF-09B input files must remain inside the current project workspace."
    );
  }
  let actual: string;
  try {
    actual = await realpath(resolvedInput);
  } catch {
    throw new Wf09bCliError(
      "WF09B_INPUT_PATH",
      `WF-09B input file does not exist or is unreadable: ${inputPath}`
    );
  }
  if (!isInside(resolvedRoot, actual)) {
    throw new Wf09bCliError(
      "WF09B_INPUT_PATH",
      "WF-09B input symlink resolves outside the current project workspace."
    );
  }
  try {
    return JSON.parse(await readFile(actual, "utf8")) as unknown;
  } catch {
    throw new Wf09bCliError(
      "WF09B_INPUT_INVALID",
      `WF-09B input must contain valid JSON: ${inputPath}`
    );
  }
}

function requireImageProviderPin(status: ProjectStatus): ResourcePin {
  const pin = status.resourcePins.find(candidate =>
    candidate.resourceType === "PROVIDER_PROFILE" &&
    candidate.resourceId === IMAGE_PROVIDER_PROFILE_ID
  );
  if (pin === undefined) {
    throw new Wf09bCliError(
      "WF09B_RESOURCE_PIN",
      `Project is missing pinned ${IMAGE_PROVIDER_PROFILE_ID}.`
    );
  }
  return pin;
}

function requirePin(status: ProjectStatus, resourceType: "CHANNEL_VISUAL_BIBLE" | "FORMAT_PROFILE"): ResourcePin {
  const pin = status.resourcePins.find(candidate => candidate.resourceType === resourceType);
  if (pin === undefined) {
    throw new Wf09bCliError(
      "WF09B_RESOURCE_PIN",
      `Project is missing pinned ${resourceType}.`
    );
  }
  return pin;
}

function parseProviderProfile(value: unknown): ImageProviderProfilePayload {
  if (!isRecord(value)) {
    throw new Wf09bCliError("WF09B_PROVIDER_PROFILE", "Image Provider Profile payload is invalid.");
  }
  const provider = value.provider;
  const executionMode = value.executionMode;
  const jobTypes = value.jobTypes;
  const runtimeSecretNames = value.runtimeSecretNames;
  if (
    typeof provider !== "string" || !provider.trim() ||
    executionMode !== "AUTOMATED" ||
    !Array.isArray(jobTypes) || !jobTypes.includes("IMAGE_GENERATION") ||
    !Array.isArray(runtimeSecretNames) ||
    runtimeSecretNames.some(item => typeof item !== "string" || !/^[A-Z][A-Z0-9_]*$/u.test(item))
  ) {
    throw new Wf09bCliError(
      "WF09B_PROVIDER_PROFILE",
      "Pinned Image Provider Profile must define an AUTOMATED IMAGE_GENERATION provider and valid runtime secret names."
    );
  }
  return {
    provider: provider.trim(),
    executionMode,
    jobTypes: jobTypes.map(String),
    runtimeSecretNames: runtimeSecretNames.map(String)
  };
}

function persistedPromptDecisions(qcDecision?: ImageQcDecision): SceneAssetDecisionPort {
  const unavailable = async (): Promise<never> => {
    throw new Wf09bCliError(
      "WF09B_USAGE",
      "WF-09B does not redesign Scene Assets. Return to WF-09A for ASSET_PLAN/IMAGE_ASSET_DESIGN changes."
    );
  };
  return {
    planAsset: unavailable,
    designImageAsset: unavailable,
    async compileImagePrompt(input) {
      const prompt = input.asset.design.imagePrompt?.trim();
      if (!prompt) {
        throw new Wf09bCliError(
          "WF09B_ASSET_STATE",
          `Asset ${input.asset.id} has no materialized IMAGE_PROMPT. Complete WF-09A first.`
        );
      }
      const negativePrompt = input.asset.design.negativePrompt?.trim();
      return {
        prompt,
        ...(negativePrompt ? { negativePrompt } : {})
      };
    },
    async runImageQc() {
      if (qcDecision === undefined) {
        throw new Wf09bCliError(
          "WF09B_USAGE",
          "IMAGE_QC requires an explicit QC decision input."
        );
      }
      return { ...qcDecision };
    }
  };
}

function validateQcDecision(value: unknown, label: string): ImageQcDecision {
  if (!isRecord(value)) {
    throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label} must be an object.`);
  }
  const statuses = ["PASS", "PASS_WITH_NOTE", "FIXABLE", "REGENERATE", "REDESIGN", "REJECT"] as const;
  const severities = ["CRITICAL", "MAJOR", "MINOR"] as const;
  if (!statuses.includes(value.qcStatus as (typeof statuses)[number])) {
    throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.qcStatus is invalid.`);
  }
  if (!severities.includes(value.severity as (typeof severities)[number])) {
    throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.severity is invalid.`);
  }
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.confidence must be between 0 and 1.`);
  }
  const optional = ["symptom", "rootCause", "recommendedAction", "fallback"] as const;
  for (const key of optional) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !(value[key] as string).trim())) {
      throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.${key} must be a non-empty string when provided.`);
    }
  }
  return {
    qcStatus: value.qcStatus as ImageQcDecision["qcStatus"],
    severity: value.severity as ImageQcDecision["severity"],
    confidence: value.confidence,
    ...(typeof value.symptom === "string" ? { symptom: value.symptom.trim() } : {}),
    ...(typeof value.rootCause === "string" ? { rootCause: value.rootCause.trim() } : {}),
    ...(typeof value.recommendedAction === "string" ? { recommendedAction: value.recommendedAction.trim() } : {}),
    ...(typeof value.fallback === "string" ? { fallback: value.fallback.trim() } : {})
  };
}

export function parseQcPlan(value: unknown): Wf09bQcPlan {
  if (!isRecord(value) || !Array.isArray(value.results) || value.results.length === 0) {
    throw new Wf09bCliError(
      "WF09B_INPUT_INVALID",
      "image-qc.json must contain a non-empty results array."
    );
  }
  const seen = new Set<string>();
  const results = value.results.map((candidate, index): Wf09bQcInput => {
    const label = `image-qc.json.results[${index}]`;
    if (!isRecord(candidate) || typeof candidate.sceneId !== "string" || !candidate.sceneId.trim()) {
      throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.sceneId is required.`);
    }
    const sceneId = candidate.sceneId.trim();
    if (seen.has(sceneId)) {
      throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.sceneId duplicates ${sceneId}.`);
    }
    seen.add(sceneId);
    const mediaId = candidate.mediaId;
    if (mediaId !== undefined && (typeof mediaId !== "string" || !mediaId.trim())) {
      throw new Wf09bCliError("WF09B_INPUT_INVALID", `${label}.mediaId must be non-empty when provided.`);
    }
    return {
      sceneId,
      ...(typeof mediaId === "string" ? { mediaId: mediaId.trim() } : {}),
      decision: validateQcDecision(candidate.decision, `${label}.decision`)
    };
  });
  return { results };
}

async function importAdapter(moduleSpec: string): Promise<ImageProviderAdapter> {
  const trimmed = moduleSpec.trim();
  if (!trimmed) {
    throw new Wf09bCliError(
      "WF09B_ADAPTER_REQUIRED",
      "VPF_IMAGE_ADAPTER_MODULE must point to an image provider adapter module."
    );
  }
  let specifier = trimmed;
  if (path.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) {
    specifier = pathToFileURL(trimmed).href;
  } else if (trimmed.startsWith(".")) {
    specifier = pathToFileURL(path.resolve(trimmed)).href;
  }
  let loaded: Record<string, unknown>;
  try {
    loaded = await import(specifier) as Record<string, unknown>;
  } catch (error) {
    throw new Wf09bCliError(
      "WF09B_ADAPTER_REQUIRED",
      `Could not load VPF_IMAGE_ADAPTER_MODULE (${trimmed}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
  let candidate = loaded.default;
  if (candidate === undefined && typeof loaded.createImageProviderAdapter === "function") {
    candidate = await (loaded.createImageProviderAdapter as () => Promise<unknown> | unknown)();
  }
  if (!isRecord(candidate) || typeof candidate.generate !== "function") {
    throw new Wf09bCliError(
      "WF09B_ADAPTER_REQUIRED",
      "Image adapter must export default { generate(request) } or createImageProviderAdapter()."
    );
  }
  return candidate as unknown as ImageProviderAdapter;
}

export class Wf09bCliService {
  private readonly registry = new FileSystemResourceRegistry(canonicalResourcesRoot);

  constructor(private readonly projects: ProjectBootstrapService) {}

  private async resolveProviderProfile(status: ProjectStatus): Promise<ResolvedImageProviderProfile> {
    const pin = requireImageProviderPin(status);
    const resource = await this.registry.resolve<Record<string, unknown>>({
      resourceType: "PROVIDER_PROFILE",
      resourceId: pin.resourceId,
      version: pin.version
    });
    if (resource === null || resource.contentHash !== pin.contentHash) {
      throw new Wf09bCliError(
        "WF09B_PROVIDER_PROFILE",
        "Pinned Image Provider Profile is missing or its content hash no longer matches."
      );
    }
    return { pin, payload: parseProviderProfile(resource.payload) };
  }

  private visualPorts(status: ProjectStatus) {
    const biblePin = requirePin(status, "CHANNEL_VISUAL_BIBLE");
    const formatPin = requirePin(status, "FORMAT_PROFILE");
    return {
      bibles: new ChannelVisualBibleRegistryAdapter(
        this.registry,
        biblePin.resourceId,
        { [biblePin.version]: biblePin.contentHash }
      ),
      formats: new FormatProfileRegistryAdapter(
        this.registry,
        formatPin.resourceId,
        { [formatPin.version]: formatPin.contentHash }
      )
    };
  }

  private pipeline(
    repo: SqliteSceneAssetRepository,
    status: ProjectStatus,
    decisions: SceneAssetDecisionPort
  ): SceneAssetPipeline {
    const ports = this.visualPorts(status);
    return new SceneAssetPipeline(
      repo,
      repo,
      ports.bibles,
      ports.formats,
      decisions,
      neverAutoApprove,
      systemClock,
      createSceneAssetIds()
    );
  }

  private imageJobs(
    repo: SqliteSceneAssetRepository,
    status: ProjectStatus
  ): UnifiedImageRuntimeJobService {
    const ports = this.visualPorts(status);
    return new UnifiedImageRuntimeJobService(
      repo,
      repo,
      ports.bibles,
      ports.formats,
      persistedPromptDecisions(),
      systemClock,
      createSceneAssetIds()
    );
  }

  private primaryGenerateAssets(repo: SqliteSceneAssetRepository, projectId: string): Promise<ProductionAsset[]> {
    return repo.listAssets(projectId).then(assets => assets.filter(asset =>
      asset.assetClass === "PRIMARY_SCENE" &&
      asset.owner.type === "SCENE" &&
      asset.sourceStrategy === "GENERATE"
    ));
  }

  private assertRequiredSecrets(profile: ResolvedImageProviderProfile): RuntimeSecretRequirement[] {
    const missing = profile.payload.runtimeSecretNames.filter(name => !(process.env[name]?.trim()));
    if (missing.length > 0) {
      throw new Wf09bCliError(
        "WF09B_SECRET_REQUIRED",
        `Missing required image runtime environment secret(s): ${missing.join(", ")}.`
      );
    }
    return profile.payload.runtimeSecretNames.map(envName => ({ envName, required: true }));
  }

  async preflight(projectId: string) {
    const status = await this.projects.getStatus(projectId);
    const profile = await this.resolveProviderProfile(status);
    const secretRequirements = this.assertRequiredSecrets(profile);
    const adapterModule = process.env.VPF_IMAGE_ADAPTER_MODULE?.trim() ?? "";
    await importAdapter(adapterModule);

    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      const assets = await this.primaryGenerateAssets(repo, projectId);
      const blocked = assets.filter(asset =>
        asset.stale ||
        asset.assetStatus !== "DESIGNED" ||
        !asset.design.imagePrompt?.trim()
      );
      if (assets.length === 0 || blocked.length > 0) {
        throw new Wf09bCliError(
          "WF09B_ASSET_STATE",
          `WF-09B requires current DESIGNED GENERATE assets with materialized prompts; blocked=${blocked.map(item => item.id).join(",") || "none"}.`
        );
      }
      return {
        projectId,
        provider: profile.payload.provider,
        providerProfileId: profile.pin.resourceId,
        providerProfileVersion: profile.pin.version,
        executionMode: profile.payload.executionMode,
        adapterModule,
        secretRequirements: secretRequirements.map(item => item.envName),
        assetCount: assets.length,
        ready: true
      };
    } finally {
      repo.close();
    }
  }

  async execute(projectId: string, selection: "ALL" | string[]) {
    const status = await this.projects.getStatus(projectId);
    const profile = await this.resolveProviderProfile(status);
    const secretRequirements = this.assertRequiredSecrets(profile);
    const adapterModule = process.env.VPF_IMAGE_ADAPTER_MODULE?.trim() ?? "";
    const adapter = await importAdapter(adapterModule);

    const sceneRepo = new SqliteSceneAssetRepository(status.projectDbPath);
    const runtimeRepo = new SqliteRuntimeExecutionRepository(status.projectDbPath);
    try {
      const allAssets = await this.primaryGenerateAssets(sceneRepo, projectId);
      const selected = selection === "ALL"
        ? allAssets.filter(asset => asset.assetStatus === "DESIGNED")
        : selection.map(assetId => {
            const asset = allAssets.find(candidate => candidate.id === assetId);
            if (asset === undefined) {
              throw new Wf09bCliError("WF09B_ASSET_STATE", `Unknown GENERATE PRIMARY_SCENE Asset: ${assetId}`);
            }
            return asset;
          });
      if (selected.length === 0) {
        throw new Wf09bCliError("WF09B_ASSET_STATE", "No DESIGNED image Assets are selected for execution.");
      }
      for (const asset of selected) {
        if (asset.stale || asset.assetStatus !== "DESIGNED" || !asset.design.imagePrompt?.trim()) {
          throw new Wf09bCliError(
            "WF09B_ASSET_STATE",
            `Asset ${asset.id} must be current, DESIGNED and have a materialized prompt before execution.`
          );
        }
      }

      const imageJobs = this.imageJobs(sceneRepo, status);
      const registry = new RuntimeExecutorRegistry();
      const workspaceRoot = path.dirname(path.dirname(status.projectRoot));
      registry.register({
        provider: profile.payload.provider,
        jobType: "IMAGE_GENERATION",
        executor: new ImageRuntimeExecutor(adapter, { workspace: { workspaceRoot } })
      });
      const orchestrator = new RuntimeOrchestrator(
        runtimeRepo,
        imageJobs.targetRevisionPort(),
        registry,
        systemClock,
        createRuntimeIds(),
        { workspaceRoot }
      );

      const results: Array<Record<string, unknown>> = [];
      for (const asset of selected) {
        try {
          const prepared = await imageJobs.prepareGeneration({
            projectId,
            assetId: asset.id,
            format: status.project.format,
            provider: profile.payload.provider,
            providerProfileVersion: profile.pin.version,
            executionMode: profile.payload.executionMode
          });
          const outcome = await orchestrator.executeAutomated(
            projectId,
            prepared.job.id,
            { expectedOutputs: prepared.expectedOutputs, secretRequirements }
          );
          const synchronized = await imageJobs.synchronizeRuntimeOutcome({
            projectId,
            jobId: prepared.job.id
          });
          results.push({
            assetId: asset.id,
            sceneId: asset.owner.id,
            jobId: prepared.job.id,
            jobStatus: outcome.providerJob.status,
            resultStatus: outcome.result.status,
            mediaIds: outcome.media.map(media => media.id),
            assetStatus: synchronized.assetStatus,
            candidateMediaIds: synchronized.candidateMediaIds,
            ...(outcome.result.error === undefined ? {} : { error: outcome.result.error })
          });
        } catch (error) {
          results.push({
            assetId: asset.id,
            sceneId: asset.owner.id,
            jobStatus: "SETUP_ERROR",
            resultStatus: "FAILED",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      return {
        projectId,
        requested: selected.length,
        completed: results.filter(row => row.assetStatus === "CANDIDATE_AVAILABLE").length,
        failed: results.filter(row => row.assetStatus !== "CANDIDATE_AVAILABLE").length,
        provider: profile.payload.provider,
        providerProfileVersion: profile.pin.version,
        results
      };
    } finally {
      runtimeRepo.close();
      sceneRepo.close();
    }
  }

  async retryFailed(projectId: string, selection: "ALL" | string[]) {
    const status = await this.projects.getStatus(projectId);
    const profile = await this.resolveProviderProfile(status);
    const secretRequirements = this.assertRequiredSecrets(profile);
    const adapter = await importAdapter(process.env.VPF_IMAGE_ADAPTER_MODULE?.trim() ?? "");
    const sceneRepo = new SqliteSceneAssetRepository(status.projectDbPath);
    const runtimeRepo = new SqliteRuntimeExecutionRepository(status.projectDbPath);
    try {
      const rows = sceneRepo.db.prepare(
        `SELECT id FROM provider_jobs
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
           AND job_type = 'IMAGE_GENERATION' AND status = 'FAILED'
         ORDER BY created_at`
      ).all(projectId) as Array<{ id: string }>;
      const selectedIds = selection === "ALL" ? rows.map(row => row.id) : selection;
      if (selectedIds.length === 0) {
        throw new Wf09bCliError("WF09B_ASSET_STATE", "No FAILED image Provider Jobs are available for retry.");
      }
      const imageJobs = this.imageJobs(sceneRepo, status);
      const registry = new RuntimeExecutorRegistry();
      const workspaceRoot = path.dirname(path.dirname(status.projectRoot));
      registry.register({
        provider: profile.payload.provider,
        jobType: "IMAGE_GENERATION",
        executor: new ImageRuntimeExecutor(adapter, { workspace: { workspaceRoot } })
      });
      const orchestrator = new RuntimeOrchestrator(
        runtimeRepo,
        imageJobs.targetRevisionPort(),
        registry,
        systemClock,
        createRuntimeIds(),
        { workspaceRoot }
      );
      const results: Array<Record<string, unknown>> = [];
      for (const jobId of selectedIds) {
        try {
          const retry = await imageJobs.retryFailedGeneration({ projectId, jobId });
          const outcome = await orchestrator.executeAutomated(
            projectId,
            retry.job.id,
            { expectedOutputs: retry.expectedOutputs, secretRequirements }
          );
          const synchronized = await imageJobs.synchronizeRuntimeOutcome({ projectId, jobId: retry.job.id });
          results.push({
            retryOfJobId: jobId,
            jobId: retry.job.id,
            jobStatus: outcome.providerJob.status,
            resultStatus: outcome.result.status,
            assetId: synchronized.id,
            assetStatus: synchronized.assetStatus,
            mediaIds: outcome.media.map(media => media.id),
            ...(outcome.result.error === undefined ? {} : { error: outcome.result.error })
          });
        } catch (error) {
          results.push({
            retryOfJobId: jobId,
            resultStatus: "FAILED",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      return {
        projectId,
        requested: selectedIds.length,
        completed: results.filter(row => row.assetStatus === "CANDIDATE_AVAILABLE").length,
        failed: results.filter(row => row.assetStatus !== "CANDIDATE_AVAILABLE").length,
        results
      };
    } finally {
      runtimeRepo.close();
      sceneRepo.close();
    }
  }

  async applyQc(projectId: string, file: string) {
    const status = await this.projects.getStatus(projectId);
    const plan = parseQcPlan(await readProjectJson(status.projectRoot, file));
    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      const results = [];
      for (const item of plan.results) {
        const asset = await repo.getPrimarySceneAsset(projectId, item.sceneId);
        if (asset === null) {
          throw new Wf09bCliError("WF09B_ASSET_STATE", `Scene ${item.sceneId} has no PRIMARY_SCENE Asset.`);
        }
        const mediaId = item.mediaId ?? (() => {
          if (asset.candidateMediaIds.length !== 1) {
            throw new Wf09bCliError(
              "WF09B_QC_AMBIGUOUS",
              `Scene ${item.sceneId} requires mediaId because it has ${asset.candidateMediaIds.length} candidates.`
            );
          }
          return asset.candidateMediaIds[0]!;
        })();
        const pipeline = this.pipeline(repo, status, persistedPromptDecisions(item.decision));
        const result = await pipeline.runImageQc({
          projectId,
          assetId: asset.id,
          mediaId,
          format: status.project.format
        });
        results.push({
          sceneId: item.sceneId,
          assetId: asset.id,
          mediaId,
          qcId: result.qc.id,
          qcStatus: result.qc.qcStatus,
          assetStatus: result.asset.assetStatus
        });
      }
      return {
        projectId,
        qcCount: results.length,
        passCount: results.filter(item => item.qcStatus === "PASS" || item.qcStatus === "PASS_WITH_NOTE").length,
        results
      };
    } finally {
      repo.close();
    }
  }

  async approve(projectId: string, selection: "ALL" | string[], approvedById?: string) {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      const assets = await this.primaryGenerateAssets(repo, projectId);
      const selected = selection === "ALL"
        ? assets.filter(asset => asset.assetStatus === "NEEDS_REVIEW")
        : selection.map(assetId => {
            const asset = assets.find(candidate => candidate.id === assetId);
            if (asset === undefined) {
              throw new Wf09bCliError("WF09B_ASSET_STATE", `Unknown image Asset: ${assetId}`);
            }
            return asset;
          });
      if (selected.length === 0) {
        throw new Wf09bCliError("WF09B_ASSET_STATE", "No image Assets are ready for approval.");
      }
      const pipeline = this.pipeline(repo, status, persistedPromptDecisions());
      const results = [];
      for (const asset of selected) {
        const approvable: string[] = [];
        for (const mediaId of asset.candidateMediaIds) {
          const qc = await repo.getLatestQcForMedia(projectId, asset.id, mediaId);
          if (qc?.qcStatus === "PASS" || qc?.qcStatus === "PASS_WITH_NOTE") {
            approvable.push(mediaId);
          }
        }
        if (approvable.length !== 1) {
          throw new Wf09bCliError(
            "WF09B_QC_AMBIGUOUS",
            `Asset ${asset.id} must have exactly one PASS/PASS_WITH_NOTE candidate before batch approval; found ${approvable.length}.`
          );
        }
        const result = await pipeline.approveAsset({
          projectId,
          assetId: asset.id,
          mediaId: approvable[0]!,
          ...(approvedById === undefined ? {} : { approvedById })
        });
        results.push({
          assetId: asset.id,
          sceneId: asset.owner.id,
          mediaId: approvable[0],
          approvalId: result.approval.id,
          assetStatus: result.asset.assetStatus
        });
      }
      return { projectId, approvedCount: results.length, results };
    } finally {
      repo.close();
    }
  }

  async status(projectId: string) {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteSceneAssetRepository(status.projectDbPath);
    try {
      const assets = await this.primaryGenerateAssets(repo, projectId);
      const jobs = repo.db.prepare(
        `SELECT id, target_id AS assetId, status, attempt, error_code AS errorCode,
                result_media_ids_json AS resultMediaIdsJson
         FROM provider_jobs
         WHERE project_id = ? AND lifecycle_status = 'ACTIVE' AND job_type = 'IMAGE_GENERATION'
         ORDER BY created_at`
      ).all(projectId) as Array<{
        id: string;
        assetId: string;
        status: string;
        attempt: number;
        errorCode: string | null;
        resultMediaIdsJson: string;
      }>;
      const rows = [];
      for (const asset of assets) {
        const qcs = [];
        for (const mediaId of asset.candidateMediaIds) {
          const qc = await repo.getLatestQcForMedia(projectId, asset.id, mediaId);
          if (qc !== null) qcs.push({ mediaId, qcStatus: qc.qcStatus, severity: qc.severity });
        }
        rows.push({
          assetId: asset.id,
          sceneId: asset.owner.id,
          assetRevision: asset.revision,
          assetStatus: asset.assetStatus,
          stale: asset.stale,
          candidateMediaIds: asset.candidateMediaIds,
          approvedMediaId: asset.approvedMediaId ?? null,
          qcs
        });
      }
      return {
        projectId,
        assetCount: assets.length,
        candidateAvailableCount: assets.filter(item => item.assetStatus === "CANDIDATE_AVAILABLE").length,
        needsReviewCount: assets.filter(item => item.assetStatus === "NEEDS_REVIEW").length,
        approvedCount: assets.filter(item => item.assetStatus === "APPROVED").length,
        regenerateRequiredCount: assets.filter(item => item.assetStatus === "REGENERATE_REQUIRED").length,
        blockedCount: assets.filter(item => item.assetStatus === "BLOCKED").length,
        providerJobCount: jobs.length,
        completeJobCount: jobs.filter(job => job.status === "COMPLETE").length,
        failedJobCount: jobs.filter(job => job.status === "FAILED").length,
        blockedJobCount: jobs.filter(job => job.status === "BLOCKED").length,
        assets: rows,
        jobs: jobs.map(job => ({
          id: job.id,
          assetId: job.assetId,
          status: job.status,
          attempt: job.attempt,
          errorCode: job.errorCode,
          resultMediaIds: JSON.parse(job.resultMediaIdsJson) as string[]
        }))
      };
    } finally {
      repo.close();
    }
  }
}
