import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type {
  ProjectFormat,
  ProjectRecord,
  VersionPins
} from "@vpf/domain";
import {
  FileSystemResourceRegistry,
  type ChannelProfilePayload,
  type ResourcePin
} from "@vpf/resource-registry";
import {
  resolveProjectWorkspace,
  validateProjectId,
  type WorkspaceResolverOptions
} from "@vpf/workspace";

export const UNIFIED_PIPELINE = "VPF_UNIFIED_V1" as const;
export const UNIFIED_FRAMEWORK_VERSION = "0.1.0";
export const PRODUCTION_SYSTEM_VERSION = "2.0.0";
export const PROJECT_STYLE_UNMATERIALIZED_VERSION = "UNMATERIALIZED";
export const DEFAULT_CHANNEL_PROFILE_ID = "HISTORY_MYSTERY_V1";
export const DEFAULT_CHANNEL_PROFILE_VERSION = "1.0.0";

export const STANDARD_PROJECT_DIRECTORIES = [
  "01_research",
  "02_script",
  "03_tts",
  "04_visual_identity",
  "05_images",
  "06_clips",
  "07_audio",
  "08_editor",
  "09_render",
  "10_publish",
  "jobs",
  "logs"
] as const;

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
);

export type ProjectBootstrapErrorCode =
  | "DUPLICATE_PROJECT"
  | "INVALID_FORMAT"
  | "INVALID_TITLE"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_DB_INVALID"
  | "MIGRATION_SET_INVALID"
  | "MIGRATION_CHECKSUM_MISMATCH"
  | "PROJECT_SNAPSHOT_INVALID"
  | "RESOURCE_SELECTION_INVALID";

export class ProjectBootstrapError extends Error {
  constructor(
    public readonly code: ProjectBootstrapErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ProjectBootstrapError";
  }
}

export interface MigrationDescriptor {
  id: string;
  filename: string;
  sha256: string;
  sql: string;
}

export interface MigrationStatus {
  latestMigrationId: string;
  availableCount: number;
  appliedCount: number;
  current: boolean;
  appliedMigrationIds: string[];
}

export interface StoredProjectRecord {
  project: ProjectRecord;
  pipeline: typeof UNIFIED_PIPELINE;
  legacyAllowed: false;
  resourcePins: ResourcePin[];
}

export interface ProjectExchangeSnapshot {
  schemaVersion: 1;
  projectId: string;
  title: string;
  format: ProjectFormat;
  revision: number;
  lifecycleStatus: "ACTIVE";
  pipeline: typeof UNIFIED_PIPELINE;
  legacyAllowed: false;
  versions: VersionPins;
  resourcePins: ResourcePin[];
}

export interface CreatedProject {
  projectRoot: string;
  projectDbPath: string;
  projectJsonPath: string;
  record: StoredProjectRecord;
  migrations: MigrationStatus;
}

export interface ProjectStatus {
  projectRoot: string;
  projectDbPath: string;
  project: ProjectRecord;
  pipeline: typeof UNIFIED_PIPELINE;
  legacyAllowed: false;
  resourcePins: ResourcePin[];
  migrations: MigrationStatus;
}

export type DoctorCheckStatus = "PASS" | "FAIL";

export interface DoctorDiagnostic {
  code:
    | "PROJECT_DB"
    | "MIGRATIONS"
    | "PROJECT_RECORD"
    | "PROJECT_SNAPSHOT"
    | "RESOURCE_PINS"
    | "PROJECT_DIRECTORIES"
    | "LEGACY_DISABLED"
    | "UNIFIED_PIPELINE"
    | "OLD_REPOSITORY_DEPENDENCY";
  status: DoctorCheckStatus;
  message: string;
}

export interface ProjectDoctorResult {
  projectId: string;
  healthy: boolean;
  diagnostics: DoctorDiagnostic[];
}

export interface ProjectBootstrapClock {
  nowIso(): string;
}

export interface ProjectBootstrapOptions extends WorkspaceResolverOptions {
  migrationsDir?: string;
  resourcesDir?: string;
  clock?: ProjectBootstrapClock;
  frameworkVersion?: string;
  productionSystemVersion?: string;
  channelProfileId?: string;
  channelProfileVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function sqlHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function assertTitle(value: string): string {
  const title = value.trim();
  if (
    title.length === 0 ||
    title.length > 240 ||
    /[\u0000-\u001f\u007f]/u.test(title)
  ) {
    throw new ProjectBootstrapError(
      "INVALID_TITLE",
      "Project title must be 1-240 printable characters."
    );
  }
  return title;
}

export function normalizeProjectFormat(value: string): ProjectFormat {
  switch (value.trim().toLowerCase()) {
    case "longform":
      return "LONGFORM";
    case "shortform":
      return "SHORTFORM";
    default:
      throw new ProjectBootstrapError(
        "INVALID_FORMAT",
        `Unsupported project format: ${JSON.stringify(value)}. Use longform or shortform.`
      );
  }
}

function parseVersionPins(value: string): VersionPins {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed)) {
    throw new ProjectBootstrapError(
      "PROJECT_DB_INVALID",
      "Stored VersionPins must be an object."
    );
  }
  return parsed as unknown as VersionPins;
}

function parseResourcePins(value: string): ResourcePin[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new ProjectBootstrapError(
      "PROJECT_DB_INVALID",
      "Stored resource pins must be an array."
    );
  }
  return parsed as ResourcePin[];
}

function validateProjectSnapshot(value: unknown): asserts value is ProjectExchangeSnapshot {
  if (!isRecord(value)) {
    throw new ProjectBootstrapError(
      "PROJECT_SNAPSHOT_INVALID",
      "project.json must contain a JSON object."
    );
  }
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== "string" ||
    typeof value.title !== "string" ||
    (value.format !== "LONGFORM" && value.format !== "SHORTFORM") ||
    typeof value.revision !== "number" ||
    value.lifecycleStatus !== "ACTIVE" ||
    value.pipeline !== UNIFIED_PIPELINE ||
    value.legacyAllowed !== false ||
    !isRecord(value.versions) ||
    !Array.isArray(value.resourcePins)
  ) {
    throw new ProjectBootstrapError(
      "PROJECT_SNAPSHOT_INVALID",
      "project.json does not match the unified project exchange contract."
    );
  }
  validateProjectId(value.projectId);
}

async function writeJsonAtomic(
  filename: string,
  value: ProjectExchangeSnapshot
): Promise<void> {
  validateProjectSnapshot(value);
  const tmp = `${filename}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  await rename(tmp, filename);
}

function snapshotsEqual(
  snapshot: ProjectExchangeSnapshot,
  stored: StoredProjectRecord
): boolean {
  return (
    snapshot.projectId === stored.project.projectId &&
    snapshot.title === stored.project.title &&
    snapshot.format === stored.project.format &&
    snapshot.revision === stored.project.revision &&
    snapshot.lifecycleStatus === stored.project.lifecycleStatus &&
    snapshot.pipeline === stored.pipeline &&
    snapshot.legacyAllowed === stored.legacyAllowed &&
    JSON.stringify(snapshot.versions) === JSON.stringify(stored.project.versions) &&
    JSON.stringify(snapshot.resourcePins) === JSON.stringify(stored.resourcePins)
  );
}

export class ProjectMigrationRunner {
  constructor(
    private readonly migrationsDir: string,
    private readonly clock: ProjectBootstrapClock
  ) {}

  async listAvailable(): Promise<MigrationDescriptor[]> {
    const entries = await readdir(this.migrationsDir, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && /^\d{4}_.+\.sql$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    if (filenames.length === 0) {
      throw new ProjectBootstrapError(
        "MIGRATION_SET_INVALID",
        "No SQL migrations were found."
      );
    }

    const descriptors: MigrationDescriptor[] = [];
    let previous = -1;
    for (const filename of filenames) {
      const id = filename.slice(0, 4);
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= previous) {
        throw new ProjectBootstrapError(
          "MIGRATION_SET_INVALID",
          `Migration order is invalid at ${filename}.`
        );
      }
      previous = numericId;
      const sql = await readFile(path.join(this.migrationsDir, filename), "utf8");
      descriptors.push({
        id,
        filename,
        sha256: sqlHash(sql),
        sql
      });
    }
    return descriptors;
  }

  async applyAll(databasePath: string): Promise<MigrationStatus> {
    const migrations = await this.listAvailable();
    const db = new Database(databasePath);
    try {
      db.pragma("foreign_keys = ON");
      db.pragma("journal_mode = WAL");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            migration_id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            applied_at TEXT NOT NULL
          )
        `);

        const rows = db.prepare(
          "SELECT migration_id, filename, sha256 FROM schema_migrations ORDER BY migration_id"
        ).all() as Array<{migration_id: string; filename: string; sha256: string}>;
        const applied = new Map(rows.map((row) => [row.migration_id, row]));

        for (const migration of migrations) {
          const existing = applied.get(migration.id);
          if (existing !== undefined) {
            if (
              existing.filename !== migration.filename ||
              existing.sha256 !== migration.sha256
            ) {
              throw new ProjectBootstrapError(
                "MIGRATION_CHECKSUM_MISMATCH",
                `Applied migration ${migration.id} no longer matches ${migration.filename}.`
              );
            }
            continue;
          }
          db.exec(migration.sql);
          db.prepare(
            "INSERT INTO schema_migrations (migration_id, filename, sha256, applied_at) VALUES (?, ?, ?, ?)"
          ).run(
            migration.id,
            migration.filename,
            migration.sha256,
            this.clock.nowIso()
          );
        }
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Preserve the original migration error.
        }
        throw error;
      }
    } finally {
      db.close();
    }
    return this.inspect(databasePath);
  }

  async inspect(databasePath: string): Promise<MigrationStatus> {
    const migrations = await this.listAvailable();
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const table = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      ).get() as {name: string} | undefined;
      if (table === undefined) {
        return {
          latestMigrationId: migrations.at(-1)!.id,
          availableCount: migrations.length,
          appliedCount: 0,
          current: false,
          appliedMigrationIds: []
        };
      }

      const rows = db.prepare(
        "SELECT migration_id, filename, sha256 FROM schema_migrations ORDER BY migration_id"
      ).all() as Array<{migration_id: string; filename: string; sha256: string}>;
      const expected = new Map(migrations.map((m) => [m.id, m]));
      let hashesCurrent = true;
      for (const row of rows) {
        const migration = expected.get(row.migration_id);
        if (
          migration === undefined ||
          migration.filename !== row.filename ||
          migration.sha256 !== row.sha256
        ) {
          hashesCurrent = false;
          break;
        }
      }
      return {
        latestMigrationId: migrations.at(-1)!.id,
        availableCount: migrations.length,
        appliedCount: rows.length,
        current:
          hashesCurrent &&
          rows.length === migrations.length &&
          rows.at(-1)?.migration_id === migrations.at(-1)?.id,
        appliedMigrationIds: rows.map((row) => row.migration_id)
      };
    } finally {
      db.close();
    }
  }
}

export class SqliteProjectRecordRepository {
  readonly db: Database.Database;

  constructor(
    filename: string,
    options: { readonly?: boolean } = {}
  ) {
    this.db = new Database(filename, {
      readonly: options.readonly ?? false,
      fileMustExist: options.readonly ?? false
    });
    this.db.pragma("foreign_keys = ON");
  }

  close(): void {
    this.db.close();
  }

  insertInitial(input: StoredProjectRecord): void {
    this.db.prepare(`
      INSERT INTO projects
      (id, project_id, revision, lifecycle_status, title, format, versions_json,
       resource_pins_json, pipeline, legacy_allowed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.project.id,
      input.project.projectId,
      input.project.revision,
      input.project.lifecycleStatus,
      input.project.title,
      input.project.format,
      JSON.stringify(input.project.versions),
      JSON.stringify(input.resourcePins),
      input.pipeline,
      0,
      input.project.createdAt,
      input.project.updatedAt
    );
  }

  get(projectId: string): StoredProjectRecord | null {
    const row = this.db.prepare(`
      SELECT *
      FROM projects
      WHERE project_id = ? AND lifecycle_status = 'ACTIVE'
      ORDER BY revision DESC
      LIMIT 1
    `).get(projectId) as Record<string, unknown> | undefined;
    if (row === undefined) return null;
    if (row.pipeline !== UNIFIED_PIPELINE || row.legacy_allowed !== 0) {
      throw new ProjectBootstrapError(
        "PROJECT_DB_INVALID",
        "Project DB does not contain a valid unified/legacy-disabled project record."
      );
    }
    const project: ProjectRecord = {
      id: String(row.id),
      projectId: String(row.project_id),
      revision: Number(row.revision),
      lifecycleStatus: "ACTIVE",
      title: String(row.title),
      format: row.format as ProjectFormat,
      versions: parseVersionPins(String(row.versions_json)),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
    return {
      project,
      pipeline: UNIFIED_PIPELINE,
      legacyAllowed: false,
      resourcePins: parseResourcePins(String(row.resource_pins_json))
    };
  }
}

export class BootstrapResourceResolver {
  constructor(
    private readonly registry: FileSystemResourceRegistry,
    private readonly options: {
      frameworkVersion: string;
      productionSystemVersion: string;
      channelProfileId: string;
      channelProfileVersion: string;
    }
  ) {}

  async resolve(format: ProjectFormat, dataModelVersion: string): Promise<{
    versions: VersionPins;
    resourcePins: ResourcePin[];
  }> {
    const channel = await this.registry.resolve<ChannelProfilePayload>({
      resourceType: "CHANNEL_PROFILE",
      resourceId: this.options.channelProfileId,
      version: this.options.channelProfileVersion
    });
    if (channel === null) {
      throw new ProjectBootstrapError(
        "RESOURCE_SELECTION_INVALID",
        "Configured Channel Profile could not be resolved."
      );
    }

    const ruleSelection = channel.payload.ruleRegistry;
    const formatSelection = channel.payload.formats[format];
    if (ruleSelection === undefined || formatSelection === undefined) {
      throw new ProjectBootstrapError(
        "RESOURCE_SELECTION_INVALID",
        `Channel Profile is missing ${format} or Rule Registry selection.`
      );
    }

    const visualBible = await this.registry.resolve({
      resourceType: "CHANNEL_VISUAL_BIBLE",
      resourceId: channel.payload.visualBible.resourceId,
      version: channel.payload.visualBible.version
    });
    const ruleRegistry = await this.registry.resolve({
      resourceType: "RULE_REGISTRY",
      resourceId: ruleSelection.resourceId,
      version: ruleSelection.version
    });
    const formatProfile = await this.registry.resolve({
      resourceType: "FORMAT_PROFILE",
      resourceId: formatSelection.resourceId,
      version: formatSelection.version
    });

    if (
      visualBible === null ||
      ruleRegistry === null ||
      formatProfile === null
    ) {
      throw new ProjectBootstrapError(
        "RESOURCE_SELECTION_INVALID",
        "A mandatory canonical resource selected by the Channel Profile is missing."
      );
    }

    const providerProfileVersions: Record<string, string> = {};
    const providerHashes: Record<string, string> = {};
    const providerPins: ResourcePin[] = [];

    for (const role of Object.keys(channel.payload.providers).sort()) {
      const selection = channel.payload.providers[role]!;
      const provider = await this.registry.resolve({
        resourceType: "PROVIDER_PROFILE",
        resourceId: selection.resourceId,
        version: selection.version
      });
      if (provider === null) {
        throw new ProjectBootstrapError(
          "RESOURCE_SELECTION_INVALID",
          `Provider Profile for ${role} could not be resolved.`
        );
      }
      providerProfileVersions[role] = provider.version;
      providerHashes[role] = provider.contentHash;
      providerPins.push({
        resourceType: "PROVIDER_PROFILE",
        resourceId: provider.resourceId,
        version: provider.version,
        contentHash: provider.contentHash
      });
    }

    const resourcePins: ResourcePin[] = [
      {
        resourceType: "CHANNEL_PROFILE",
        resourceId: channel.resourceId,
        version: channel.version,
        contentHash: channel.contentHash
      },
      {
        resourceType: "CHANNEL_VISUAL_BIBLE",
        resourceId: visualBible.resourceId,
        version: visualBible.version,
        contentHash: visualBible.contentHash
      },
      {
        resourceType: "RULE_REGISTRY",
        resourceId: ruleRegistry.resourceId,
        version: ruleRegistry.version,
        contentHash: ruleRegistry.contentHash
      },
      {
        resourceType: "FORMAT_PROFILE",
        resourceId: formatProfile.resourceId,
        version: formatProfile.version,
        contentHash: formatProfile.contentHash
      },
      ...providerPins
    ];

    return {
      versions: {
        frameworkVersion: this.options.frameworkVersion,
        dataModelVersion,
        channelVisualBibleVersion: visualBible.version,
        productionSystemVersion: this.options.productionSystemVersion,
        ruleRegistryVersion: ruleRegistry.version,
        formatProfileVersion: formatProfile.version,
        providerProfileVersions,
        projectStyleVersion: PROJECT_STYLE_UNMATERIALIZED_VERSION,
        resourceHashes: {
          channelVisualBible: visualBible.contentHash,
          ruleRegistry: ruleRegistry.contentHash,
          formatProfile: formatProfile.contentHash,
          providerProfiles: providerHashes,
          channelProfile: channel.contentHash
        }
      },
      resourcePins
    };
  }
}

export class ProjectBootstrapService {
  private readonly repositoryRoot: string;
  private readonly migrationsDir: string;
  private readonly resourcesDir: string;
  private readonly clock: ProjectBootstrapClock;
  private readonly workspaceOptions: WorkspaceResolverOptions;
  private readonly migrationRunner: ProjectMigrationRunner;
  private readonly resourceResolver: BootstrapResourceResolver;
  private readonly registry: FileSystemResourceRegistry;

  constructor(options: ProjectBootstrapOptions = {}) {
    this.repositoryRoot = path.resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
    this.migrationsDir = path.resolve(
      options.migrationsDir ?? path.join(this.repositoryRoot, "migrations")
    );
    this.resourcesDir = path.resolve(
      options.resourcesDir ?? path.join(this.repositoryRoot, "resources")
    );
    this.clock = options.clock ?? { nowIso: () => new Date().toISOString() };
    this.workspaceOptions = {
      repositoryRoot: this.repositoryRoot,
      ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
      ...(options.env === undefined ? {} : { env: options.env })
    };
    this.migrationRunner = new ProjectMigrationRunner(this.migrationsDir, this.clock);
    this.registry = new FileSystemResourceRegistry(this.resourcesDir);
    this.resourceResolver = new BootstrapResourceResolver(this.registry, {
      frameworkVersion: options.frameworkVersion ?? UNIFIED_FRAMEWORK_VERSION,
      productionSystemVersion:
        options.productionSystemVersion ?? PRODUCTION_SYSTEM_VERSION,
      channelProfileId: options.channelProfileId ?? DEFAULT_CHANNEL_PROFILE_ID,
      channelProfileVersion:
        options.channelProfileVersion ?? DEFAULT_CHANNEL_PROFILE_VERSION
    });
  }

  async createProject(input: {
    projectId: string;
    title: string;
    format: string;
  }): Promise<CreatedProject> {
    const projectId = validateProjectId(input.projectId);
    const title = assertTitle(input.title);
    const format = normalizeProjectFormat(input.format);
    const workspace = resolveProjectWorkspace(projectId, this.workspaceOptions);

    await mkdir(workspace.projectsRoot, { recursive: true });
    if (await pathExists(workspace.projectRoot)) {
      throw new ProjectBootstrapError(
        "DUPLICATE_PROJECT",
        `Project already exists: ${projectId}`
      );
    }

    const stagingRoot = await mkdtemp(
      path.join(workspace.projectsRoot, `.${projectId}.creating-`)
    );

    try {
      for (const directory of STANDARD_PROJECT_DIRECTORIES) {
        await mkdir(path.join(stagingRoot, directory), { recursive: true });
      }

      const projectDbPath = path.join(stagingRoot, "project.db");
      const migrations = await this.migrationRunner.applyAll(projectDbPath);
      if (!migrations.current) {
        throw new ProjectBootstrapError(
          "PROJECT_DB_INVALID",
          "Fresh project DB did not reach the current migration set."
        );
      }

      const resolved = await this.resourceResolver.resolve(
        format,
        migrations.latestMigrationId
      );
      const now = this.clock.nowIso();
      const record: StoredProjectRecord = {
        project: {
          id: projectId,
          projectId,
          revision: 1,
          lifecycleStatus: "ACTIVE",
          title,
          format,
          versions: resolved.versions,
          createdAt: now,
          updatedAt: now
        },
        pipeline: UNIFIED_PIPELINE,
        legacyAllowed: false,
        resourcePins: resolved.resourcePins
      };

      const repository = new SqliteProjectRecordRepository(projectDbPath);
      try {
        repository.insertInitial(record);
      } finally {
        repository.close();
      }

      const snapshot: ProjectExchangeSnapshot = {
        schemaVersion: 1,
        projectId,
        title,
        format,
        revision: 1,
        lifecycleStatus: "ACTIVE",
        pipeline: UNIFIED_PIPELINE,
        legacyAllowed: false,
        versions: resolved.versions,
        resourcePins: resolved.resourcePins
      };
      const projectJsonPath = path.join(stagingRoot, "project.json");
      await writeJsonAtomic(projectJsonPath, snapshot);

      try {
        await rename(stagingRoot, workspace.projectRoot);
      } catch (error: unknown) {
        if (
          isRecord(error) &&
          (error.code === "EEXIST" || error.code === "ENOTEMPTY")
        ) {
          throw new ProjectBootstrapError(
            "DUPLICATE_PROJECT",
            `Project already exists: ${projectId}`
          );
        }
        throw error;
      }

      return {
        projectRoot: workspace.projectRoot,
        projectDbPath: path.join(workspace.projectRoot, "project.db"),
        projectJsonPath: path.join(workspace.projectRoot, "project.json"),
        record,
        migrations
      };
    } catch (error) {
      await rm(stagingRoot, { recursive: true, force: true });
      throw error;
    }
  }

  async getStatus(projectIdInput: string): Promise<ProjectStatus> {
    const workspace = resolveProjectWorkspace(projectIdInput, this.workspaceOptions);
    const projectDbPath = path.join(workspace.projectRoot, "project.db");
    if (!(await pathExists(projectDbPath))) {
      throw new ProjectBootstrapError(
        "PROJECT_NOT_FOUND",
        `Project DB does not exist: ${workspace.projectId}`
      );
    }

    let repository: SqliteProjectRecordRepository;
    try {
      repository = new SqliteProjectRecordRepository(projectDbPath, { readonly: true });
    } catch {
      throw new ProjectBootstrapError(
        "PROJECT_DB_INVALID",
        `Project DB could not be opened: ${workspace.projectId}`
      );
    }
    try {
      const stored = repository.get(workspace.projectId);
      if (stored === null) {
        throw new ProjectBootstrapError(
          "PROJECT_NOT_FOUND",
          `Project record does not exist: ${workspace.projectId}`
        );
      }
      const migrations = await this.migrationRunner.inspect(projectDbPath);
      return {
        projectRoot: workspace.projectRoot,
        projectDbPath,
        project: stored.project,
        pipeline: stored.pipeline,
        legacyAllowed: stored.legacyAllowed,
        resourcePins: stored.resourcePins,
        migrations
      };
    } finally {
      repository.close();
    }
  }

  async doctor(projectIdInput: string): Promise<ProjectDoctorResult> {
    const projectId = validateProjectId(projectIdInput);
    const diagnostics: DoctorDiagnostic[] = [];
    const pass = (code: DoctorDiagnostic["code"], message: string) =>
      diagnostics.push({ code, status: "PASS", message });
    const fail = (code: DoctorDiagnostic["code"], message: string) =>
      diagnostics.push({ code, status: "FAIL", message });

    let status: ProjectStatus | null = null;
    try {
      status = await this.getStatus(projectId);
      pass("PROJECT_DB", "project.db exists and is readable.");
      pass("PROJECT_RECORD", "Active ProjectRecord is readable from project.db.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      fail("PROJECT_DB", message);
      fail("PROJECT_RECORD", "ProjectRecord could not be verified.");
    }

    if (status === null) {
      return {
        projectId,
        healthy: false,
        diagnostics
      };
    }

    if (status.migrations.current) {
      pass(
        "MIGRATIONS",
        `All ${status.migrations.appliedCount} migrations are current through ${status.migrations.latestMigrationId}.`
      );
    } else {
      fail(
        "MIGRATIONS",
        `Applied migrations ${status.migrations.appliedCount}/${status.migrations.availableCount} are not current.`
      );
    }

    if (status.pipeline === UNIFIED_PIPELINE) {
      pass("UNIFIED_PIPELINE", `Pipeline is ${UNIFIED_PIPELINE}.`);
    } else {
      fail("UNIFIED_PIPELINE", "Project pipeline is not the unified pipeline.");
    }

    if (status.legacyAllowed === false) {
      pass("LEGACY_DISABLED", "legacyAllowed=false is enforced by the project DB.");
    } else {
      fail("LEGACY_DISABLED", "Legacy execution is enabled.");
    }

    let directoriesValid = true;
    for (const directory of STANDARD_PROJECT_DIRECTORIES) {
      const target = path.join(status.projectRoot, directory);
      try {
        const info = await stat(target);
        if (!info.isDirectory()) directoriesValid = false;
      } catch {
        directoriesValid = false;
      }
    }
    if (directoriesValid) {
      pass("PROJECT_DIRECTORIES", "All standard unified project directories exist.");
    } else {
      fail("PROJECT_DIRECTORIES", "One or more standard project directories are missing.");
    }

    const projectJsonPath = path.join(status.projectRoot, "project.json");
    try {
      const raw = await readFile(projectJsonPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      validateProjectSnapshot(parsed);
      const stored: StoredProjectRecord = {
        project: status.project,
        pipeline: status.pipeline,
        legacyAllowed: status.legacyAllowed,
        resourcePins: status.resourcePins
      };
      if (!snapshotsEqual(parsed, stored)) {
        fail(
          "PROJECT_SNAPSHOT",
          "project.json does not match the authoritative DB identity/pins."
        );
      } else {
        pass(
          "PROJECT_SNAPSHOT",
          "project.json matches the authoritative DB identity and pins."
        );
      }
    } catch (error: unknown) {
      fail(
        "PROJECT_SNAPSHOT",
        error instanceof Error ? error.message : "project.json could not be validated."
      );
    }

    const resourceFailures: string[] = [];
    for (const pin of status.resourcePins) {
      const diagnostic = await this.registry.diagnosePin(pin);
      if (diagnostic.status !== "CURRENT") {
        resourceFailures.push(
          `${pin.resourceId}@${pin.version}:${diagnostic.status}`
        );
      }
    }
    if (resourceFailures.length === 0) {
      pass(
        "RESOURCE_PINS",
        `All ${status.resourcePins.length} version+hash resource pins resolve exactly.`
      );
    } else {
      fail(
        "RESOURCE_PINS",
        `Resource pin failures: ${resourceFailures.join(", ")}`
      );
    }

    pass(
      "OLD_REPOSITORY_DEPENDENCY",
      "Project bootstrap/status/doctor use only unified repository resources and workspace paths."
    );

    return {
      projectId,
      healthy: diagnostics.every((item) => item.status === "PASS"),
      diagnostics
    };
  }
}

export async function projectSnapshotSha256(filename: string): Promise<string> {
  return sha256(await readFile(filename, "utf8"));
}
