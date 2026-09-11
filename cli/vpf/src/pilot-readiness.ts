import {access, mkdir, readFile, statfs} from "node:fs/promises";
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import {assertNoLegacyReference} from "@vpf/legacy-guard";
import {
  DEFAULT_CHANNEL_PROFILE_ID,
  DEFAULT_CHANNEL_PROFILE_VERSION,
  ProjectBootstrapService
} from "@vpf/project-bootstrap";
import {
  FileSystemResourceRegistry,
  type ChannelProfilePayload,
  type ProviderProfilePayload,
  type ResourcePin
} from "@vpf/resource-registry";
import {resolveWorkspaceRoot} from "@vpf/workspace";

export type PilotFormat = "SHORTFORM" | "LONGFORM";
export type ReadinessStatus = "PASS" | "FAIL" | "WARN";

export interface ReadinessCheck {
  code: string;
  status: ReadinessStatus;
  blocking: boolean;
  message: string;
}

export interface ProviderReadinessSummary {
  slot: string;
  resourceId: string;
  version: string;
  contentHash: string;
  provider: string;
  executionMode: "AUTOMATED" | "MANUAL_EXTERNAL";
  secretNames: string[];
  missingSecretNames: string[];
  status: "READY" | "MANUAL_READY" | "MISSING_SECRET";
}

export interface EnvironmentReadinessResult {
  scope: "ENVIRONMENT";
  format: PilotFormat;
  ready: boolean;
  workspaceRoot: string;
  freeBytes: string;
  minimumFreeBytes: string;
  checks: ReadinessCheck[];
  providers: ProviderReadinessSummary[];
}

export interface ProjectPilotReadinessResult {
  scope: "PROJECT";
  projectId: string;
  format: PilotFormat;
  ready: boolean;
  workspaceRoot: string;
  projectRoot: string;
  freeBytes: string;
  minimumFreeBytes: string;
  checks: ReadinessCheck[];
  providers: ProviderReadinessSummary[];
  resourcePins: Array<{
    resourceType: string;
    resourceId: string;
    version: string;
    status: "CURRENT" | "MISSING" | "STALE" | "INVALID";
  }>;
}

export interface PilotReadinessOptions {
  repositoryRoot?: string;
  workspaceRoot?: string;
  resourcesDir?: string;
  env?: NodeJS.ProcessEnv;
  minimumFreeBytes?: Partial<Record<PilotFormat, bigint>>;
}

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
);
const GIB = 1024n * 1024n * 1024n;
const DEFAULT_MINIMUM_FREE_BYTES: Record<PilotFormat, bigint> = {
  SHORTFORM: 5n * GIB,
  LONGFORM: 20n * GIB
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function check(
  code: string,
  ok: boolean,
  passMessage: string,
  failMessage: string,
  blocking = true
): ReadinessCheck {
  return {
    code,
    status: ok ? "PASS" : "FAIL",
    blocking,
    message: ok ? passMessage : failMessage
  };
}

function nodeMajor(): number {
  const major = Number(process.versions.node.split(".")[0]);
  return Number.isInteger(major) ? major : 0;
}

function normalizeFormat(value: string): PilotFormat {
  switch (value.trim().toLowerCase()) {
    case "shortform":
      return "SHORTFORM";
    case "longform":
      return "LONGFORM";
    default:
      throw new Error(`Unsupported pilot format ${JSON.stringify(value)}. Use shortform or longform.`);
  }
}

function minimumBytes(
  format: PilotFormat,
  configured: Partial<Record<PilotFormat, bigint>>,
  override?: bigint
): bigint {
  if (override !== undefined) return override;
  return configured[format] ?? DEFAULT_MINIMUM_FREE_BYTES[format];
}

async function freeBytesFor(target: string): Promise<bigint> {
  await mkdir(target, {recursive: true});
  const info = await statfs(target, {bigint: true});
  return info.bavail * info.bsize;
}

async function pathIsReadable(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function safeConfiguredPath(value: string): string | null {
  try {
    assertNoLegacyReference(value);
    const resolved = value.startsWith("file:")
      ? fileURLToPath(new URL(value))
      : path.resolve(value);
    assertNoLegacyReference(resolved);
    return resolved;
  } catch {
    return null;
  }
}

export class PilotReadinessService {
  private readonly repositoryRoot: string;
  private readonly workspaceRoot: string;
  private readonly resourcesDir: string;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly registry: FileSystemResourceRegistry;
  private readonly configuredMinimum: Partial<Record<PilotFormat, bigint>>;

  constructor(
    private readonly bootstrap: ProjectBootstrapService = new ProjectBootstrapService(),
    options: PilotReadinessOptions = {}
  ) {
    this.repositoryRoot = path.resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
    this.environment = options.env ?? process.env;
    this.workspaceRoot = resolveWorkspaceRoot({
      repositoryRoot: this.repositoryRoot,
      ...(options.workspaceRoot === undefined ? {} : {workspaceRoot: options.workspaceRoot}),
      env: this.environment
    });
    this.resourcesDir = path.resolve(options.resourcesDir ?? path.join(this.repositoryRoot, "resources"));
    assertNoLegacyReference(this.repositoryRoot);
    assertNoLegacyReference(this.workspaceRoot);
    assertNoLegacyReference(this.resourcesDir);
    this.registry = new FileSystemResourceRegistry(this.resourcesDir);
    this.configuredMinimum = options.minimumFreeBytes ?? {};
  }

  async checkEnvironment(
    formatInput: string,
    options: {minimumFreeBytes?: bigint} = {}
  ): Promise<EnvironmentReadinessResult> {
    const format = normalizeFormat(formatInput);
    const checks: ReadinessCheck[] = [];
    const threshold = minimumBytes(format, this.configuredMinimum, options.minimumFreeBytes);
    const freeBytes = await freeBytesFor(this.workspaceRoot);

    checks.push(check(
      "NODE_VERSION",
      nodeMajor() >= 22,
      `Node ${process.versions.node} satisfies the >=22 runtime contract.`,
      `Node ${process.versions.node} is below the required major version 22.`
    ));

    const packagePath = path.join(this.repositoryRoot, "package.json");
    let repositoryIdentity = false;
    try {
      const pkg = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
      repositoryIdentity = isRecord(pkg) && pkg.name === "video-production-framework";
    } catch {
      repositoryIdentity = false;
    }
    checks.push(check(
      "UNIFIED_REPOSITORY",
      repositoryIdentity,
      "Unified video-production-framework repository identity is present.",
      "Current repository root is not the unified video-production-framework repository."
    ));

    checks.push(check(
      "WORKSPACE_STORAGE",
      freeBytes >= threshold,
      `Workspace has ${freeBytes.toString()} free bytes (minimum ${threshold.toString()}).`,
      `Workspace has ${freeBytes.toString()} free bytes, below minimum ${threshold.toString()}.`
    ));

    const runtimes = [
      path.join(this.repositoryRoot, "runtimes", "elevenlabs", "runtime.py"),
      path.join(this.repositoryRoot, "runtimes", "image", "runtime.mjs"),
      path.join(this.repositoryRoot, "apps", "editor", "package.json")
    ];
    const runtimePresence = (await Promise.all(runtimes.map(pathIsReadable))).every(Boolean);
    checks.push(check(
      "UNIFIED_RUNTIME_ENTRYPOINTS",
      runtimePresence,
      "TTS, image and Generic Editor runtime entrypoints are present in the unified repository.",
      "One or more unified runtime entrypoints are missing."
    ));

    const selection = await this.resolveDefaultSelection(format);
    checks.push(...selection.checks);
    const providers = await this.summarizeProviders(selection.providerPins);
    checks.push(...this.providerChecks(providers));
    checks.push(...await this.imageAdapterChecks(providers));

    return {
      scope: "ENVIRONMENT",
      format,
      ready: checks.every(item => !item.blocking || item.status === "PASS"),
      workspaceRoot: this.workspaceRoot,
      freeBytes: freeBytes.toString(),
      minimumFreeBytes: threshold.toString(),
      checks,
      providers
    };
  }

  async checkProject(
    projectId: string,
    options: {minimumFreeBytes?: bigint} = {}
  ): Promise<ProjectPilotReadinessResult> {
    const status = await this.bootstrap.getStatus(projectId);
    const doctor = await this.bootstrap.doctor(projectId);
    const format = status.project.format as PilotFormat;
    const checks: ReadinessCheck[] = [];
    const workspaceRoot = path.dirname(path.dirname(status.projectRoot));
    const threshold = minimumBytes(format, this.configuredMinimum, options.minimumFreeBytes);
    const freeBytes = await freeBytesFor(workspaceRoot);

    checks.push(check(
      "PROJECT_DOCTOR",
      doctor.healthy,
      "Unified project doctor passed.",
      "Unified project doctor reported one or more blocking diagnostics."
    ));
    checks.push(check(
      "UNIFIED_PROJECT_POLICY",
      status.pipeline === "VPF_UNIFIED_V1" && status.legacyAllowed === false,
      "Project uses VPF_UNIFIED_V1 with legacyAllowed=false.",
      "Project unified/legacy policy is invalid."
    ));
    checks.push(check(
      "PROJECT_MIGRATIONS",
      status.migrations.current,
      `Project database is current through migration ${status.migrations.latestMigrationId}.`,
      "Project database migrations are not current."
    ));
    checks.push(check(
      "WORKSPACE_STORAGE",
      freeBytes >= threshold,
      `Workspace has ${freeBytes.toString()} free bytes (minimum ${threshold.toString()}).`,
      `Workspace has ${freeBytes.toString()} free bytes, below minimum ${threshold.toString()}.`
    ));

    const resourcePins: ProjectPilotReadinessResult["resourcePins"] = [];
    for (const pin of status.resourcePins) {
      const diagnostic = await this.registry.diagnosePin(pin);
      resourcePins.push({
        resourceType: pin.resourceType,
        resourceId: pin.resourceId,
        version: pin.version,
        status: diagnostic.status
      });
    }
    const pinsCurrent = resourcePins.every(pin => pin.status === "CURRENT");
    checks.push(check(
      "RESOURCE_PINS",
      pinsCurrent,
      "All project resource/version/hash pins resolve exactly.",
      "At least one project resource pin is missing, stale or invalid."
    ));

    const providerPins = status.resourcePins.filter(pin => pin.resourceType === "PROVIDER_PROFILE");
    const providers = await this.summarizeProviders(providerPins);
    checks.push(...this.providerChecks(providers));
    checks.push(...await this.imageAdapterChecks(providers));

    return {
      scope: "PROJECT",
      projectId,
      format,
      ready: checks.every(item => !item.blocking || item.status === "PASS"),
      workspaceRoot,
      projectRoot: status.projectRoot,
      freeBytes: freeBytes.toString(),
      minimumFreeBytes: threshold.toString(),
      checks,
      providers,
      resourcePins
    };
  }

  private async resolveDefaultSelection(format: PilotFormat): Promise<{
    providerPins: ResourcePin[];
    checks: ReadinessCheck[];
  }> {
    const checks: ReadinessCheck[] = [];
    const channel = await this.registry.resolve<ChannelProfilePayload>({
      resourceType: "CHANNEL_PROFILE",
      resourceId: DEFAULT_CHANNEL_PROFILE_ID,
      version: DEFAULT_CHANNEL_PROFILE_VERSION
    });
    if (channel === null) {
      checks.push(check(
        "CHANNEL_PROFILE",
        false,
        "",
        `Default channel profile ${DEFAULT_CHANNEL_PROFILE_ID}@${DEFAULT_CHANNEL_PROFILE_VERSION} is missing.`
      ));
      return {providerPins: [], checks};
    }
    checks.push(check(
      "CHANNEL_PROFILE",
      true,
      `Default channel profile ${channel.resourceId}@${channel.version} resolved.`,
      ""
    ));

    const formatSelection = channel.payload.formats[format];
    if (formatSelection === undefined) {
      checks.push(check("FORMAT_PROFILE", false, "", `Channel profile has no ${format} format selection.`));
    } else {
      const formatSnapshot = await this.registry.resolve({
        resourceType: "FORMAT_PROFILE",
        resourceId: formatSelection.resourceId,
        version: formatSelection.version
      });
      checks.push(check(
        "FORMAT_PROFILE",
        formatSnapshot !== null,
        `${format} format profile ${formatSelection.resourceId}@${formatSelection.version} resolved.`,
        `${format} format profile ${formatSelection.resourceId}@${formatSelection.version} is missing.`
      ));
    }

    const providerPins: ResourcePin[] = [];
    for (const selection of Object.values(channel.payload.providers)) {
      const snapshot = await this.registry.resolve({
        resourceType: "PROVIDER_PROFILE",
        resourceId: selection.resourceId,
        version: selection.version
      });
      if (snapshot !== null) {
        providerPins.push({
          resourceType: "PROVIDER_PROFILE",
          resourceId: snapshot.resourceId,
          version: snapshot.version,
          contentHash: snapshot.contentHash
        });
      } else {
        checks.push(check(
          "PROVIDER_PROFILE",
          false,
          "",
          `Provider profile ${selection.resourceId}@${selection.version} is missing.`
        ));
      }
    }
    if (providerPins.length === Object.keys(channel.payload.providers).length) {
      checks.push(check(
        "PROVIDER_PROFILES",
        true,
        `${providerPins.length} selected provider profiles resolved from the canonical registry.`,
        ""
      ));
    }
    return {providerPins, checks};
  }

  private async summarizeProviders(pins: ResourcePin[]): Promise<ProviderReadinessSummary[]> {
    const results: ProviderReadinessSummary[] = [];
    for (const pin of pins) {
      const snapshot = await this.registry.resolvePinned<ProviderProfilePayload>(pin);
      const missing = snapshot.payload.runtimeSecretNames.filter(name => !nonEmpty(this.environment[name]));
      const slot = snapshot.payload.jobTypes.join(",") || snapshot.resourceId;
      results.push({
        slot,
        resourceId: snapshot.resourceId,
        version: snapshot.version,
        contentHash: snapshot.contentHash,
        provider: snapshot.payload.provider,
        executionMode: snapshot.payload.executionMode,
        secretNames: [...snapshot.payload.runtimeSecretNames],
        missingSecretNames: missing,
        status:
          snapshot.payload.executionMode === "MANUAL_EXTERNAL"
            ? "MANUAL_READY"
            : missing.length === 0
              ? "READY"
              : "MISSING_SECRET"
      });
    }
    return results;
  }

  private providerChecks(providers: ProviderReadinessSummary[]): ReadinessCheck[] {
    if (providers.length === 0) {
      return [check("PROVIDER_PROFILES", false, "", "No provider profiles were resolved for pilot execution.")];
    }
    return providers.map(provider => {
      if (provider.executionMode === "MANUAL_EXTERNAL") {
        return {
          code: `PROVIDER_${provider.provider}`,
          status: "PASS" as const,
          blocking: true,
          message: `${provider.provider} is configured as MANUAL_EXTERNAL and requires no runtime secret.`
        };
      }
      const ok = provider.missingSecretNames.length === 0;
      return check(
        `PROVIDER_${provider.provider}`,
        ok,
        `${provider.provider} automated runtime secrets are present (${provider.secretNames.join(", ") || "none"}).`,
        `${provider.provider} is missing required secret names: ${provider.missingSecretNames.join(", ")}.`
      );
    });
  }

  private async imageAdapterChecks(providers: ProviderReadinessSummary[]): Promise<ReadinessCheck[]> {
    if (!providers.some(provider => provider.provider === "IMAGE_PROVIDER" && provider.executionMode === "AUTOMATED")) {
      return [];
    }
    const configured = this.environment.VPF_IMAGE_ADAPTER_MODULE;
    if (!nonEmpty(configured)) {
      return [check(
        "IMAGE_ADAPTER_MODULE",
        false,
        "",
        "VPF_IMAGE_ADAPTER_MODULE is required for the automated image runtime."
      )];
    }
    const resolved = safeConfiguredPath(configured!);
    const readable = resolved !== null && await pathIsReadable(resolved);
    return [check(
      "IMAGE_ADAPTER_MODULE",
      readable,
      "Configured image provider adapter module is readable and is not a legacy path.",
      "Configured image provider adapter module is missing, unreadable or points at a forbidden legacy path."
    )];
  }
}

export function parseMinimumFreeGb(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("--min-free-gb must be a non-negative finite number.");
  }
  return BigInt(Math.floor(parsed * 1024 * 1024 * 1024));
}
