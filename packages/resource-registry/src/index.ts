import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import type {
  ChannelVisualBibleSnapshot,
  FormatProfileSnapshot
} from "@vpf/production-system";

export type ResourceType =
  | "CHANNEL_VISUAL_BIBLE"
  | "FORMAT_PROFILE"
  | "PROVIDER_PROFILE"
  | "CHANNEL_PROFILE"
  | "RULE_REGISTRY"
  | "SCHEMA";

export interface ResourceDocument<TPayload = unknown> {
  schemaVersion: 1;
  resourceType: ResourceType;
  resourceId: string;
  version: string;
  payload: TPayload;
}

export interface ResourceSnapshot<TPayload = unknown> {
  resourceType: ResourceType;
  resourceId: string;
  version: string;
  contentHash: string;
  payload: TPayload;
}

export interface ResourcePin {
  resourceType: ResourceType;
  resourceId: string;
  version: string;
  contentHash: string;
}

export interface ResolveResourceInput {
  resourceType: ResourceType;
  resourceId: string;
  version: string;
  expectedHash?: string;
}

export type ResourceRegistryErrorCode =
  | "RESOURCE_ID_INVALID"
  | "RESOURCE_VERSION_INVALID"
  | "RESOURCE_DOCUMENT_INVALID"
  | "RESOURCE_SCHEMA_INVALID"
  | "RESOURCE_HASH_MISMATCH"
  | "RESOURCE_PIN_MISSING"
  | "LEGACY_RESOURCE_FORBIDDEN";

export class ResourceRegistryError extends Error {
  constructor(
    public readonly code: ResourceRegistryErrorCode,
    message: string,
    public readonly resourcePath?: string
  ) {
    super(message);
    this.name = "ResourceRegistryError";
  }
}

export interface ResourceDiagnostic {
  severity: "ERROR";
  code: ResourceRegistryErrorCode;
  message: string;
  resourcePath?: string;
}

export interface ResourceValidationSummary {
  valid: boolean;
  resourceCount: number;
  diagnostics: ResourceDiagnostic[];
}

export interface ResourcePinDiagnostic {
  status: "CURRENT" | "MISSING" | "STALE" | "INVALID";
  pin: ResourcePin;
  actualHash?: string;
  code?: ResourceRegistryErrorCode;
  message: string;
}

export interface ResourceUpgradePlan {
  from: ResourcePin;
  to: ResourcePin;
  changed: boolean;
  staleImpact: string[];
}

export interface ChannelVisualBiblePayload {
  channelWideVisualApproach: string;
  realismAndFactualityPrinciples: string[];
  continuityPrinciples: {
    characters: string[];
    locations: string[];
    props: string[];
  };
  visualLanguageBoundaries: {
    color: string[];
    lighting: string[];
    material: string[];
  };
  reconstructionEvidenceDistinction: string[];
  compositionAndCameraTendencies: string[];
  historicalUncertaintyHandling: string[];
  formatAdaptationRules: string[];
  avoidances: string[];
}

export interface FormatProfilePayload {
  format: "LONGFORM" | "SHORTFORM";
  width: number;
  height: number;
  aspectRatio: string;
  fpsPreference: number;
  safeAreas: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  imageGeneration: {
    width: number;
    height: number;
  };
  editorDefaults: Record<string, unknown>;
  subtitleLayoutEnvelope: Record<string, unknown>;
  delivery: Record<string, unknown>;
}

export interface ProviderProfilePayload {
  provider: string;
  executionMode: "AUTOMATED" | "MANUAL_EXTERNAL";
  jobTypes: string[];
  model?: string;
  capabilities: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  result: Record<string, unknown>;
  runtimeSecretNames: string[];
}

export interface ChannelProfilePayload {
  channelId: string;
  visualBible: {
    resourceId: string;
    version: string;
  };
  formats: Record<string, {
    resourceId: string;
    version: string;
  }>;
  providers: Record<string, {
    resourceId: string;
    version: string;
  }>;
}

const RESOURCE_DIRECTORIES: Record<ResourceType, string> = {
  CHANNEL_VISUAL_BIBLE: "visual-bibles",
  FORMAT_PROFILE: "format-profiles",
  PROVIDER_PROFILE: "provider-profiles",
  CHANNEL_PROFILE: "channel-profiles",
  RULE_REGISTRY: "rule-registries",
  SCHEMA: "schemas"
};

const LEGACY_RESOURCE_TOKENS = [
  "history_mystery_shorts_style",
  "history-mystery-shorts-style",
  "history_mystery_stylized_v1",
  "history-mystery-stylized-v1",
  "old_scene_prompt_style",
  "old-scene-prompt-style",
  "master_candidate_style",
  "master-candidate-style"
];

const PROVIDER_STYLE_KEYS = new Set([
  "visualStyle",
  "palette",
  "historicalPalette",
  "colorLanguage",
  "lightingLanguage",
  "materialLanguage",
  "characterRenderingPrinciple",
  "cameraCompositionTendency",
  "masterStyle",
  "masterImage",
  "narrativeRules"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function ensureSafeSegment(value: string, kind: "id" | "version"): void {
  if (
    !value.trim() ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new ResourceRegistryError(
      kind === "id" ? "RESOURCE_ID_INVALID" : "RESOURCE_VERSION_INVALID",
      `Resource ${kind} must be a single safe path segment.`
    );
  }
}

function assertNotLegacy(resourceId: string): void {
  const normalized = resourceId.trim().toLowerCase();
  if (LEGACY_RESOURCE_TOKENS.some((token) => normalized.includes(token))) {
    throw new ResourceRegistryError(
      "LEGACY_RESOURCE_FORBIDDEN",
      `Legacy visual resource is not a unified registry candidate: ${resourceId}`
    );
  }
}

function sha256(raw: string): string {
  return `sha256:${createHash("sha256").update(raw, "utf8").digest("hex")}`;
}

function validateBaseDocument(
  value: unknown,
  expected: Pick<ResolveResourceInput, "resourceType" | "resourceId" | "version">
): ResourceDocument {
  if (!isRecord(value)) {
    throw new ResourceRegistryError(
      "RESOURCE_DOCUMENT_INVALID",
      "Resource document must be a JSON object."
    );
  }
  if (
    value.schemaVersion !== 1 ||
    value.resourceType !== expected.resourceType ||
    value.resourceId !== expected.resourceId ||
    value.version !== expected.version ||
    !("payload" in value)
  ) {
    throw new ResourceRegistryError(
      "RESOURCE_DOCUMENT_INVALID",
      "Resource document identity does not match its registry path."
    );
  }
  return value as unknown as ResourceDocument;
}

function assertNoProviderStyleFields(value: unknown, location = "payload"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoProviderStyleFields(item, `${location}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PROVIDER_STYLE_KEYS.has(key)) {
      throw new ResourceRegistryError(
        "RESOURCE_SCHEMA_INVALID",
        `Provider profile contains forbidden creative/style field at ${location}.${key}.`
      );
    }
    assertNoProviderStyleFields(child, `${location}.${key}`);
  }
}

function validateVisualBible(payload: unknown): asserts payload is ChannelVisualBiblePayload {
  if (!isRecord(payload)) {
    throw new ResourceRegistryError("RESOURCE_SCHEMA_INVALID", "Visual Bible payload must be an object.");
  }
  const continuity = payload.continuityPrinciples;
  const boundaries = payload.visualLanguageBoundaries;
  if (
    !nonEmptyString(payload.channelWideVisualApproach) ||
    !stringArray(payload.realismAndFactualityPrinciples) ||
    !isRecord(continuity) ||
    !stringArray(continuity.characters) ||
    !stringArray(continuity.locations) ||
    !stringArray(continuity.props) ||
    !isRecord(boundaries) ||
    !stringArray(boundaries.color) ||
    !stringArray(boundaries.lighting) ||
    !stringArray(boundaries.material) ||
    !stringArray(payload.reconstructionEvidenceDistinction) ||
    !stringArray(payload.compositionAndCameraTendencies) ||
    !stringArray(payload.historicalUncertaintyHandling) ||
    !stringArray(payload.formatAdaptationRules) ||
    !stringArray(payload.avoidances)
  ) {
    throw new ResourceRegistryError(
      "RESOURCE_SCHEMA_INVALID",
      "Channel Visual Bible is missing required channel-wide principles."
    );
  }
}

function validateFormatProfile(payload: unknown): asserts payload is FormatProfilePayload {
  if (!isRecord(payload)) {
    throw new ResourceRegistryError("RESOURCE_SCHEMA_INVALID", "Format Profile payload must be an object.");
  }
  const safeAreas = payload.safeAreas;
  const imageGeneration = payload.imageGeneration;
  const format = payload.format;
  if (
    (format !== "LONGFORM" && format !== "SHORTFORM") ||
    typeof payload.width !== "number" ||
    payload.width <= 0 ||
    typeof payload.height !== "number" ||
    payload.height <= 0 ||
    !nonEmptyString(payload.aspectRatio) ||
    typeof payload.fpsPreference !== "number" ||
    payload.fpsPreference <= 0 ||
    !isRecord(safeAreas) ||
    !["top", "right", "bottom", "left"].every((key) => typeof safeAreas[key] === "number") ||
    !isRecord(imageGeneration) ||
    typeof imageGeneration.width !== "number" ||
    typeof imageGeneration.height !== "number" ||
    !isRecord(payload.editorDefaults) ||
    !isRecord(payload.subtitleLayoutEnvelope) ||
    !isRecord(payload.delivery)
  ) {
    throw new ResourceRegistryError(
      "RESOURCE_SCHEMA_INVALID",
      "Format Profile must contain delivery/layout constraints."
    );
  }
  assertNoProviderStyleFields(payload);
}

function validateProviderProfile(payload: unknown): asserts payload is ProviderProfilePayload {
  if (!isRecord(payload)) {
    throw new ResourceRegistryError("RESOURCE_SCHEMA_INVALID", "Provider Profile payload must be an object.");
  }
  if (
    !nonEmptyString(payload.provider) ||
    (payload.executionMode !== "AUTOMATED" && payload.executionMode !== "MANUAL_EXTERNAL") ||
    !stringArray(payload.jobTypes) ||
    !isRecord(payload.capabilities) ||
    !isRecord(payload.retryPolicy) ||
    !isRecord(payload.result) ||
    !stringArray(payload.runtimeSecretNames)
  ) {
    throw new ResourceRegistryError(
      "RESOURCE_SCHEMA_INVALID",
      "Provider Profile is missing execution/capability fields."
    );
  }
  assertNoProviderStyleFields(payload);
}

function validateChannelProfile(payload: unknown): asserts payload is ChannelProfilePayload {
  if (!isRecord(payload) || !nonEmptyString(payload.channelId)) {
    throw new ResourceRegistryError("RESOURCE_SCHEMA_INVALID", "Channel Profile requires channelId.");
  }
  const visualBible = payload.visualBible;
  if (
    !isRecord(visualBible) ||
    !nonEmptyString(visualBible.resourceId) ||
    !nonEmptyString(visualBible.version) ||
    !isRecord(payload.formats) ||
    !isRecord(payload.providers)
  ) {
    throw new ResourceRegistryError(
      "RESOURCE_SCHEMA_INVALID",
      "Channel Profile must select resources without duplicating their payloads."
    );
  }
  assertNoProviderStyleFields(payload);
}

function validateSchemaResource(payload: unknown): void {
  if (!isRecord(payload) || !nonEmptyString(payload.$schema) || !nonEmptyString(payload.title)) {
    throw new ResourceRegistryError(
      "RESOURCE_SCHEMA_INVALID",
      "Schema resource payload must contain $schema and title."
    );
  }
}

function validatePayload(type: ResourceType, payload: unknown): void {
  switch (type) {
    case "CHANNEL_VISUAL_BIBLE":
      validateVisualBible(payload);
      return;
    case "FORMAT_PROFILE":
      validateFormatProfile(payload);
      return;
    case "PROVIDER_PROFILE":
      validateProviderProfile(payload);
      return;
    case "CHANNEL_PROFILE":
      validateChannelProfile(payload);
      return;
    case "SCHEMA":
      validateSchemaResource(payload);
      return;
    case "RULE_REGISTRY":
      if (!isRecord(payload)) {
        throw new ResourceRegistryError("RESOURCE_SCHEMA_INVALID", "Rule Registry payload must be an object.");
      }
      return;
  }
}

function staleImpactFor(type: ResourceType): string[] {
  switch (type) {
    case "CHANNEL_VISUAL_BIBLE":
      return ["PROJECT_STYLE", "IDENTITY_ANCHOR", "SCENE_ASSET", "IMAGE_PROMPT"];
    case "FORMAT_PROFILE":
      return ["SCENE_ASSET", "EDITOR_TIMELINE", "RENDER_OUTPUT"];
    case "PROVIDER_PROFILE":
      return ["PROVIDER_JOB", "RUNTIME_JOB"];
    case "CHANNEL_PROFILE":
      return ["PROJECT_RESOURCE_PINS"];
    case "RULE_REGISTRY":
      return ["PRODUCTION_DECISION"];
    case "SCHEMA":
      return ["RESOURCE_VALIDATION"];
  }
}

export class FileSystemResourceRegistry {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  async resolve<TPayload = unknown>(
    input: ResolveResourceInput
  ): Promise<ResourceSnapshot<TPayload> | null> {
    ensureSafeSegment(input.resourceId, "id");
    ensureSafeSegment(input.version, "version");
    assertNotLegacy(input.resourceId);

    const relativePath = path.join(
      RESOURCE_DIRECTORIES[input.resourceType],
      input.resourceId,
      `${input.version}.json`
    );
    const absolutePath = path.resolve(this.rootDir, relativePath);
    const rootWithSeparator = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : `${this.rootDir}${path.sep}`;
    if (!absolutePath.startsWith(rootWithSeparator)) {
      throw new ResourceRegistryError(
        "RESOURCE_ID_INVALID",
        "Resolved resource path escaped the registry root.",
        relativePath
      );
    }

    let raw: string;
    try {
      raw = await readFile(absolutePath, "utf8");
    } catch (error: unknown) {
      if (
        isRecord(error) &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new ResourceRegistryError(
        "RESOURCE_DOCUMENT_INVALID",
        "Resource file is not valid JSON.",
        relativePath
      );
    }

    const document = validateBaseDocument(parsed, input);
    validatePayload(document.resourceType, document.payload);
    const contentHash = sha256(raw);
    if (input.expectedHash !== undefined && input.expectedHash !== contentHash) {
      throw new ResourceRegistryError(
        "RESOURCE_HASH_MISMATCH",
        `Pinned hash does not match resource ${input.resourceId}@${input.version}.`,
        relativePath
      );
    }

    return {
      resourceType: document.resourceType,
      resourceId: document.resourceId,
      version: document.version,
      contentHash,
      payload: document.payload as TPayload
    };
  }

  async resolvePinned<TPayload = unknown>(
    pin: ResourcePin
  ): Promise<ResourceSnapshot<TPayload>> {
    const snapshot = await this.resolve<TPayload>({
      resourceType: pin.resourceType,
      resourceId: pin.resourceId,
      version: pin.version,
      expectedHash: pin.contentHash
    });
    if (snapshot === null) {
      throw new ResourceRegistryError(
        "RESOURCE_PIN_MISSING",
        `Pinned resource is missing: ${pin.resourceId}@${pin.version}`
      );
    }
    return snapshot;
  }

  async listVersions(resourceType: ResourceType, resourceId: string): Promise<string[]> {
    ensureSafeSegment(resourceId, "id");
    assertNotLegacy(resourceId);
    const directory = path.join(this.rootDir, RESOURCE_DIRECTORIES[resourceType], resourceId);
    try {
      const names = await readdir(directory);
      return names
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -5))
        .sort();
    } catch (error: unknown) {
      if (isRecord(error) && error.code === "ENOENT") return [];
      throw error;
    }
  }

  async diagnosePin(pin: ResourcePin): Promise<ResourcePinDiagnostic> {
    try {
      const snapshot = await this.resolve({
        resourceType: pin.resourceType,
        resourceId: pin.resourceId,
        version: pin.version
      });
      if (snapshot === null) {
        return {
          status: "MISSING",
          pin: { ...pin },
          code: "RESOURCE_PIN_MISSING",
          message: `Pinned resource is missing: ${pin.resourceId}@${pin.version}`
        };
      }
      if (snapshot.contentHash !== pin.contentHash) {
        return {
          status: "STALE",
          pin: { ...pin },
          actualHash: snapshot.contentHash,
          code: "RESOURCE_HASH_MISMATCH",
          message: `Pinned resource hash is stale: ${pin.resourceId}@${pin.version}`
        };
      }
      return {
        status: "CURRENT",
        pin: { ...pin },
        actualHash: snapshot.contentHash,
        message: `Pinned resource is current: ${pin.resourceId}@${pin.version}`
      };
    } catch (error: unknown) {
      if (error instanceof ResourceRegistryError) {
        return {
          status: "INVALID",
          pin: { ...pin },
          code: error.code,
          message: error.message
        };
      }
      throw error;
    }
  }

  async planUpgrade(pin: ResourcePin, targetVersion: string): Promise<ResourceUpgradePlan> {
    await this.resolvePinned(pin);
    const target = await this.resolve({
      resourceType: pin.resourceType,
      resourceId: pin.resourceId,
      version: targetVersion
    });
    if (target === null) {
      throw new ResourceRegistryError(
        "RESOURCE_PIN_MISSING",
        `Upgrade target is missing: ${pin.resourceId}@${targetVersion}`
      );
    }
    const to: ResourcePin = {
      resourceType: target.resourceType,
      resourceId: target.resourceId,
      version: target.version,
      contentHash: target.contentHash
    };
    return {
      from: { ...pin },
      to,
      changed: pin.version !== to.version || pin.contentHash !== to.contentHash,
      staleImpact: staleImpactFor(pin.resourceType)
    };
  }

  async validateAll(): Promise<ResourceValidationSummary> {
    const diagnostics: ResourceDiagnostic[] = [];
    let resourceCount = 0;

    for (const resourceType of Object.keys(RESOURCE_DIRECTORIES) as ResourceType[]) {
      const typeDir = path.join(this.rootDir, RESOURCE_DIRECTORIES[resourceType]);
      let resourceEntries;
      try {
        resourceEntries = await readdir(typeDir, { withFileTypes: true });
      } catch (error: unknown) {
        if (isRecord(error) && error.code === "ENOENT") continue;
        throw error;
      }

      for (const resourceEntry of resourceEntries) {
        if (!resourceEntry.isDirectory()) continue;
        const resourceId = resourceEntry.name;
        const versions = await this.listVersions(resourceType, resourceId).catch((error: unknown) => {
          if (error instanceof ResourceRegistryError) {
            diagnostics.push({
              severity: "ERROR",
              code: error.code,
              message: error.message,
              ...(error.resourcePath === undefined ? {} : { resourcePath: error.resourcePath })
            });
            return [];
          }
          throw error;
        });
        for (const version of versions) {
          resourceCount += 1;
          try {
            await this.resolve({ resourceType, resourceId, version });
          } catch (error: unknown) {
            if (error instanceof ResourceRegistryError) {
              diagnostics.push({
                severity: "ERROR",
                code: error.code,
                message: error.message,
                ...(error.resourcePath === undefined ? {} : { resourcePath: error.resourcePath })
              });
            } else {
              throw error;
            }
          }
        }
      }
    }

    return {
      valid: diagnostics.length === 0,
      resourceCount,
      diagnostics
    };
  }
}

export class ChannelVisualBibleRegistryAdapter {
  constructor(
    private readonly registry: FileSystemResourceRegistry,
    private readonly resourceId: string,
    private readonly expectedHashes: Readonly<Record<string, string>> = {}
  ) {}

  async resolve(version: string): Promise<ChannelVisualBibleSnapshot | null> {
    const expectedHash = this.expectedHashes[version];
    const snapshot = await this.registry.resolve<ChannelVisualBiblePayload>({
      resourceType: "CHANNEL_VISUAL_BIBLE",
      resourceId: this.resourceId,
      version,
      ...(expectedHash === undefined ? {} : { expectedHash })
    });
    if (snapshot === null) return null;
    return {
      version: snapshot.version,
      resourceId: snapshot.resourceId,
      contentHash: snapshot.contentHash,
      payload: snapshot.payload
    };
  }
}

export class FormatProfileRegistryAdapter {
  constructor(
    private readonly registry: FileSystemResourceRegistry,
    private readonly resourceId: string,
    private readonly expectedHashes: Readonly<Record<string, string>> = {}
  ) {}

  async resolve(version: string): Promise<FormatProfileSnapshot | null> {
    const expectedHash = this.expectedHashes[version];
    const snapshot = await this.registry.resolve<FormatProfilePayload>({
      resourceType: "FORMAT_PROFILE",
      resourceId: this.resourceId,
      version,
      ...(expectedHash === undefined ? {} : { expectedHash })
    });
    if (snapshot === null) return null;
    return {
      version: snapshot.version,
      resourceId: snapshot.resourceId,
      contentHash: snapshot.contentHash,
      payload: snapshot.payload
    };
  }
}

export class ProviderProfileRegistryAdapter {
  constructor(
    private readonly registry: FileSystemResourceRegistry,
    private readonly resourceId: string
  ) {}

  async resolve(version: string, expectedHash?: string): Promise<ResourceSnapshot<ProviderProfilePayload> | null> {
    return this.registry.resolve<ProviderProfilePayload>({
      resourceType: "PROVIDER_PROFILE",
      resourceId: this.resourceId,
      version,
      ...(expectedHash === undefined ? {} : { expectedHash })
    });
  }
}
