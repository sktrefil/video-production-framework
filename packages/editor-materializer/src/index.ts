import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve
} from "node:path";
import type {
  FinalRenderAttempt,
  FinalRenderResultImport,
  GenericEditProject,
  GenericEditorTimelineItem,
  MediaArtifact,
  PublishHandoffOutput,
  PublishPackageFileRole,
  PublishPackageManifest,
  TimelineAssemblyRecord
} from "@vpf/domain";
import {
  normalizeProjectRelativePath,
  resolveProjectRelativePath,
  validateProjectId
} from "@vpf/workspace";

const MEDIA_ITEM_TYPES = new Set([
  "VIDEO",
  "IMAGE",
  "TTS",
  "CLIP_AUDIO",
  "BGM",
  "SFX"
]);
const RENDER_FILES = new Set([
  "final.mp4",
  "production_gate.json",
  "render_props.json",
  "render_manifest.json",
  "technical_qc.json",
  "delivery_manifest.json"
]);
const PUBLISH_ROOT_FILES = new Set([
  "final_output_qc.json",
  "publish_metadata.json"
]);

export type MediaTimelineItem = Extract<
  GenericEditorTimelineItem,
  {type: "VIDEO" | "IMAGE" | "TTS" | "CLIP_AUDIO" | "BGM" | "SFX"}
>;

function isMediaTimelineItem(item: GenericEditorTimelineItem): item is MediaTimelineItem {
  return MEDIA_ITEM_TYPES.has(item.type);
}

export class EditorMaterializationError extends Error {
  constructor(
    public readonly code:
      | "ASSEMBLY_NOT_FOUND"
      | "ASSEMBLY_NOT_READY"
      | "PROJECT_ID_MISMATCH"
      | "MEDIA_ARTIFACT_MISSING"
      | "MEDIA_ARTIFACT_INVALID"
      | "MEDIA_PATH_AMBIGUOUS"
      | "MEDIA_SOURCE_INVALID"
      | "SOURCE_HASH_MISMATCH"
      | "DEST_HASH_MISMATCH"
      | "UNSUPPORTED_LOGICAL_PATH"
      | "RENDER_RESULT_INVALID"
      | "PUBLISH_PACKAGE_INVALID",
    message: string
  ) {
    super(message);
    this.name = "EditorMaterializationError";
  }
}

export interface EditorMaterializationRepository {
  getLatestAssembly(projectId: string): Promise<TimelineAssemblyRecord | null>;
  listAvailableMedia(projectId: string): Promise<MediaArtifact[]>;
}

export interface EditorMaterializedMedia {
  mediaId: string;
  mediaRevision: number;
  sourceRelativePath: string;
  editorRelativePath: string;
  sha256: string;
  sizeBytes: number;
  itemIds: string[];
}

export interface EditorMaterializationReport {
  schemaVersion: 1;
  status: "READY";
  projectId: string;
  assemblyId: string;
  assemblyRevision: number;
  materializedAt: string;
  canonicalProjectPath: "08_editor/edit_project.json";
  canonicalProjectSha256: string;
  editorMirrorProjectPath: string;
  executionProjectSha256: string;
  media: EditorMaterializedMedia[];
}

export interface MaterializeEditorProjectInput {
  projectRoot: string;
  editorPublicRoot: string;
  assembly: TimelineAssemblyRecord;
  mediaArtifacts: MediaArtifact[];
  nowIso?: () => string;
}

export interface MaterializeEditorProjectResult {
  report: EditorMaterializationReport;
  executionProject: GenericEditProject;
  canonicalProjectAbsolutePath: string;
  materializationReportAbsolutePath: string;
  editorMirrorRoot: string;
  editorMirrorProjectAbsolutePath: string;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function sha256File(filePath: string): Promise<string> {
  return await new Promise<string>((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolveHash(hash.digest("hex")));
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), {recursive: true});
  const tempPath = filePath + `.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tempPath, filePath);
}

function ensureInside(basePath: string, candidatePath: string): string {
  const base = resolve(basePath);
  const candidate = resolve(candidatePath);
  const rel = relative(base, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return candidate;
  }
  throw new EditorMaterializationError(
    "MEDIA_SOURCE_INVALID",
    `Path escapes allowed root: ${candidate}`
  );
}

function resolveInside(basePath: string, relativePath: string): string {
  const normalized = normalizeProjectRelativePath(relativePath);
  return ensureInside(basePath, resolve(basePath, ...normalized.split("/")));
}

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/iu.test(value);
}

function normalizeMediaPath(value: string): string {
  if (/^(?:https?:|data:|blob:)/iu.test(value.trim())) {
    throw new EditorMaterializationError(
      "MEDIA_SOURCE_INVALID",
      `Remote or ephemeral media is not allowed in deterministic materialization: ${value}`
    );
  }
  return normalizeProjectRelativePath(value);
}

function mediaIndex(
  projectId: string,
  artifacts: MediaArtifact[]
): Map<string, MediaArtifact> {
  const result = new Map<string, MediaArtifact>();
  for (const artifact of [...artifacts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (artifact.projectId !== projectId || artifact.mediaStatus !== "AVAILABLE") continue;
    const path = normalizeProjectRelativePath(artifact.relativePath);
    if (!validSha256(artifact.checksum)) {
      throw new EditorMaterializationError(
        "MEDIA_ARTIFACT_INVALID",
        `Media ${artifact.id} has an invalid SHA-256 checksum.`
      );
    }
    const previous = result.get(path);
    if (previous !== undefined && previous.checksum !== artifact.checksum) {
      throw new EditorMaterializationError(
        "MEDIA_PATH_AMBIGUOUS",
        `Multiple AVAILABLE media artifacts claim ${path} with different checksums.`
      );
    }
    if (previous === undefined) result.set(path, artifact);
  }
  return result;
}

export async function materializeEditorProject(
  input: MaterializeEditorProjectInput
): Promise<MaterializeEditorProjectResult> {
  const projectId = validateProjectId(input.assembly.projectId);
  if (
    input.assembly.assemblyStatus !== "READY" ||
    input.assembly.stale ||
    input.assembly.lifecycleStatus !== "ACTIVE"
  ) {
    throw new EditorMaterializationError(
      "ASSEMBLY_NOT_READY",
      "Editor materialization requires the current ACTIVE, non-stale READY assembly."
    );
  }
  if (input.assembly.editProject.project.id !== projectId) {
    throw new EditorMaterializationError(
      "PROJECT_ID_MISMATCH",
      `Assembly project ${projectId} does not match edit project ${input.assembly.editProject.project.id}.`
    );
  }

  const artifactsByPath = mediaIndex(projectId, input.mediaArtifacts);
  const executionProject = structuredClone(input.assembly.editProject);
  const canonicalProjectSha256 = hashJson(input.assembly.editProject);
  const mirrorRelativeRoot = `projects/${projectId}`;
  const mirrorRoot = resolveInside(input.editorPublicRoot, mirrorRelativeRoot);
  const stagingRoot = ensureInside(
    input.editorPublicRoot,
    `${mirrorRoot}.staging-${process.pid}-${Date.now()}`
  );
  const mediaRecords = new Map<string, EditorMaterializedMedia>();

  await rm(stagingRoot, {recursive: true, force: true});
  await mkdir(stagingRoot, {recursive: true});

  try {
    for (const item of executionProject.items) {
      if (!isMediaTimelineItem(item)) continue;
      const sourceRelativePath = normalizeMediaPath(item.src);
      const artifact = artifactsByPath.get(sourceRelativePath);
      if (artifact === undefined) {
        throw new EditorMaterializationError(
          "MEDIA_ARTIFACT_MISSING",
          `No AVAILABLE MediaArtifact matches ${sourceRelativePath} for item ${item.id}.`
        );
      }

      const sourceAbsolutePath = resolveProjectRelativePath(
        input.projectRoot,
        sourceRelativePath
      );
      const sourceInfo = await stat(sourceAbsolutePath).catch(() => null);
      if (sourceInfo === null || !sourceInfo.isFile() || sourceInfo.size <= 0) {
        throw new EditorMaterializationError(
          "MEDIA_SOURCE_INVALID",
          `Materialization source is missing or empty: ${sourceRelativePath}`
        );
      }
      const sourceSha256 = await sha256File(sourceAbsolutePath);
      if (sourceSha256.toLowerCase() !== artifact.checksum.toLowerCase()) {
        throw new EditorMaterializationError(
          "SOURCE_HASH_MISMATCH",
          `Source hash mismatch for ${sourceRelativePath}.`
        );
      }

      const editorRelativePath = `${mirrorRelativeRoot}/media/${artifact.checksum.toLowerCase()}/${basename(sourceRelativePath)}`;
      const stagingDestination = resolveInside(
        stagingRoot,
        `media/${artifact.checksum.toLowerCase()}/${basename(sourceRelativePath)}`
      );
      const existing = mediaRecords.get(editorRelativePath);
      if (existing === undefined) {
        await mkdir(dirname(stagingDestination), {recursive: true});
        await copyFile(sourceAbsolutePath, stagingDestination);
        const destinationSha256 = await sha256File(stagingDestination);
        if (destinationSha256 !== sourceSha256) {
          throw new EditorMaterializationError(
            "DEST_HASH_MISMATCH",
            `Destination hash mismatch for ${sourceRelativePath}.`
          );
        }
        mediaRecords.set(editorRelativePath, {
          mediaId: artifact.id,
          mediaRevision: artifact.revision,
          sourceRelativePath,
          editorRelativePath,
          sha256: sourceSha256,
          sizeBytes: sourceInfo.size,
          itemIds: [item.id]
        });
      } else {
        existing.itemIds.push(item.id);
      }
      item.src = editorRelativePath;
    }

    const executionProjectSha256 = hashJson(executionProject);
    const report: EditorMaterializationReport = {
      schemaVersion: 1,
      status: "READY",
      projectId,
      assemblyId: input.assembly.id,
      assemblyRevision: input.assembly.revision,
      materializedAt: input.nowIso?.() ?? new Date().toISOString(),
      canonicalProjectPath: "08_editor/edit_project.json",
      canonicalProjectSha256,
      editorMirrorProjectPath: `${mirrorRelativeRoot}/edit_project.json`,
      executionProjectSha256,
      media: [...mediaRecords.values()]
        .map(record => ({...record, itemIds: [...record.itemIds].sort()}))
        .sort((a, b) => a.editorRelativePath.localeCompare(b.editorRelativePath))
    };

    await writeJson(resolve(stagingRoot, "edit_project.json"), executionProject);
    await writeJson(resolve(stagingRoot, "materialization_report.json"), report);

    await rm(mirrorRoot, {recursive: true, force: true});
    await mkdir(dirname(mirrorRoot), {recursive: true});
    await rename(stagingRoot, mirrorRoot);

    const canonicalProjectAbsolutePath = resolveProjectRelativePath(
      input.projectRoot,
      "08_editor/edit_project.json"
    );
    const materializationReportAbsolutePath = resolveProjectRelativePath(
      input.projectRoot,
      "08_editor/materialization_report.json"
    );
    await writeJson(canonicalProjectAbsolutePath, input.assembly.editProject);
    await writeJson(materializationReportAbsolutePath, report);

    return {
      report,
      executionProject,
      canonicalProjectAbsolutePath,
      materializationReportAbsolutePath,
      editorMirrorRoot: mirrorRoot,
      editorMirrorProjectAbsolutePath: resolve(mirrorRoot, "edit_project.json")
    };
  } catch (error) {
    await rm(stagingRoot, {recursive: true, force: true}).catch(() => undefined);
    throw error;
  }
}

export async function materializeEditorProjectFromRepository(input: {
  repository: EditorMaterializationRepository;
  projectId: string;
  projectRoot: string;
  editorPublicRoot: string;
  nowIso?: () => string;
}): Promise<MaterializeEditorProjectResult> {
  const projectId = validateProjectId(input.projectId);
  const assembly = await input.repository.getLatestAssembly(projectId);
  if (assembly === null) {
    throw new EditorMaterializationError(
      "ASSEMBLY_NOT_FOUND",
      `No active timeline assembly exists for ${projectId}.`
    );
  }
  const mediaArtifacts = await input.repository.listAvailableMedia(projectId);
  return materializeEditorProject({
    projectRoot: input.projectRoot,
    editorPublicRoot: input.editorPublicRoot,
    assembly,
    mediaArtifacts,
    ...(input.nowIso === undefined ? {} : {nowIso: input.nowIso})
  });
}

export interface FrameworkArtifactPath {
  logicalPath: string;
  projectRelativePath: string;
  absolutePath: string;
  adaptedFromLegacy: boolean;
}

export function resolveFrameworkArtifactPath(
  projectRoot: string,
  projectIdInput: string,
  logicalPathInput: string
): FrameworkArtifactPath {
  const projectId = validateProjectId(projectIdInput);
  const logicalPath = logicalPathInput.trim().replaceAll("\\", "/").replace(/^\/+/, "");
  if (!logicalPath) {
    throw new EditorMaterializationError(
      "UNSUPPORTED_LOGICAL_PATH",
      "Framework artifact path cannot be empty."
    );
  }

  const legacyPrefix = `out/${projectId}/`;
  let projectRelativePath = logicalPath;
  let adaptedFromLegacy = false;
  if (logicalPath.startsWith("out/") && !logicalPath.startsWith(legacyPrefix)) {
    throw new EditorMaterializationError(
      "PROJECT_ID_MISMATCH",
      `Legacy logical path does not belong to project ${projectId}: ${logicalPath}`
    );
  }
  if (logicalPath.startsWith(legacyPrefix)) {
    adaptedFromLegacy = true;
    const suffix = logicalPath.slice(legacyPrefix.length);
    if (RENDER_FILES.has(suffix)) {
      projectRelativePath = `09_render/${suffix}`;
    } else if (PUBLISH_ROOT_FILES.has(suffix)) {
      projectRelativePath = `10_publish/${suffix}`;
    } else if (suffix === "publish" || suffix === "publish/") {
      projectRelativePath = "10_publish/package";
    } else if (suffix.startsWith("publish/")) {
      projectRelativePath = `10_publish/package/${suffix.slice("publish/".length)}`;
    } else {
      throw new EditorMaterializationError(
        "UNSUPPORTED_LOGICAL_PATH",
        `No unified workspace adapter exists for legacy logical path ${logicalPath}.`
      );
    }
  }

  const normalized = normalizeProjectRelativePath(projectRelativePath);
  return {
    logicalPath,
    projectRelativePath: normalized,
    absolutePath: resolveProjectRelativePath(projectRoot, normalized),
    adaptedFromLegacy
  };
}

export async function loadWorkspaceRenderResult(input: {
  projectRoot: string;
  projectId: string;
  attempt: FinalRenderAttempt;
}): Promise<FinalRenderResultImport> {
  if (input.attempt.projectId !== input.projectId) {
    throw new EditorMaterializationError(
      "PROJECT_ID_MISMATCH",
      "Render attempt project id does not match requested project."
    );
  }
  const manifestPath = resolveFrameworkArtifactPath(
    input.projectRoot,
    input.projectId,
    input.attempt.paths.renderManifestPath
  ).absolutePath;
  const result = JSON.parse(await readFile(manifestPath, "utf8")) as FinalRenderResultImport;
  if (
    result.schemaVersion !== 1 ||
    result.status !== "RENDERED" ||
    result.projectId !== input.projectId ||
    result.projectSha256 !== input.attempt.projectSha256 ||
    result.output.path !== input.attempt.paths.outputPath
  ) {
    throw new EditorMaterializationError(
      "RENDER_RESULT_INVALID",
      "Workspace render manifest does not match the current WF-17 render attempt."
    );
  }
  const output = resolveFrameworkArtifactPath(
    input.projectRoot,
    input.projectId,
    result.output.path
  ).absolutePath;
  const info = await stat(output);
  const actualSha = await sha256File(output);
  if (
    !info.isFile() ||
    info.size !== result.output.sizeBytes ||
    actualSha !== result.output.sha256
  ) {
    throw new EditorMaterializationError(
      "RENDER_RESULT_INVALID",
      "Rendered MP4 no longer matches render_manifest.json."
    );
  }
  return result;
}

export interface FinalRenderResultImporter<T> {
  importRenderResult(input: {
    projectId: string;
    renderAttemptId: string;
    result: FinalRenderResultImport;
  }): Promise<T>;
}

export async function importWorkspaceRenderResult<T>(input: {
  importer: FinalRenderResultImporter<T>;
  projectRoot: string;
  projectId: string;
  attempt: FinalRenderAttempt;
}): Promise<T> {
  const result = await loadWorkspaceRenderResult(input);
  return input.importer.importRenderResult({
    projectId: input.projectId,
    renderAttemptId: input.attempt.id,
    result
  });
}

function publishSourceLogicalPath(
  role: PublishPackageFileRole,
  projectId: string,
  manifest: PublishPackageManifest
): string {
  const base = `out/${projectId}`;
  switch (role) {
    case "VIDEO":
      return `${base}/final.mp4`;
    case "RENDER_MANIFEST":
      return `${base}/render_manifest.json`;
    case "TECHNICAL_QC":
      return `${base}/technical_qc.json`;
    case "DELIVERY_MANIFEST":
      return `${base}/delivery_manifest.json`;
    case "FINAL_OUTPUT_QC":
      return `${base}/final_output_qc.json`;
    case "PUBLISH_METADATA":
      return `${base}/publish_metadata.json`;
    case "THUMBNAIL":
      if (!manifest.metadata.thumbnail?.relativePath) {
        throw new EditorMaterializationError(
          "PUBLISH_PACKAGE_INVALID",
          "Publish package requests a thumbnail without thumbnail metadata."
        );
      }
      return manifest.metadata.thumbnail.relativePath;
  }
}

export interface PublishMaterializedFile {
  role: PublishPackageFileRole;
  projectRelativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface PublishMaterializationReport {
  schemaVersion: 1;
  status: "READY";
  projectId: string;
  packageSha256: string;
  packageDirectory: string;
  files: PublishMaterializedFile[];
  handoffPath: string;
}

export async function materializePublishHandoff(input: {
  projectRoot: string;
  manifest: PublishPackageManifest;
  output: PublishHandoffOutput;
}): Promise<PublishMaterializationReport> {
  const {manifest, output} = input;
  const projectId = validateProjectId(manifest.projectId);
  if (
    manifest.packageStatus !== "READY" ||
    output.status !== "READY" ||
    output.projectId !== projectId ||
    output.packageSha256 !== manifest.packageSha256 ||
    output.projectSha256 !== manifest.projectSha256
  ) {
    throw new EditorMaterializationError(
      "PUBLISH_PACKAGE_INVALID",
      "WF-18 logical package is not current READY or its handoff identity mismatches."
    );
  }

  const packageDirectory = resolveFrameworkArtifactPath(
    input.projectRoot,
    projectId,
    manifest.packageDirectory
  );
  await rm(packageDirectory.absolutePath, {recursive: true, force: true});
  await mkdir(packageDirectory.absolutePath, {recursive: true});

  const files: PublishMaterializedFile[] = [];
  for (const logicalFile of manifest.files) {
    const sourceLogical = publishSourceLogicalPath(logicalFile.role, projectId, manifest);
    const source = sourceLogical.startsWith("out/")
      ? resolveFrameworkArtifactPath(input.projectRoot, projectId, sourceLogical)
      : {
          logicalPath: sourceLogical,
          projectRelativePath: normalizeProjectRelativePath(sourceLogical),
          absolutePath: resolveProjectRelativePath(input.projectRoot, sourceLogical),
          adaptedFromLegacy: false
        };
    const destination = resolveFrameworkArtifactPath(
      input.projectRoot,
      projectId,
      logicalFile.relativePath
    );
    ensureInside(packageDirectory.absolutePath, destination.absolutePath);

    const sourceInfo = await stat(source.absolutePath);
    if (!sourceInfo.isFile() || sourceInfo.size <= 0) {
      throw new EditorMaterializationError(
        "PUBLISH_PACKAGE_INVALID",
        `Publish source ${logicalFile.role} is missing or empty.`
      );
    }
    const sourceSha = await sha256File(source.absolutePath);
    if (
      logicalFile.sizeBytes !== undefined &&
      logicalFile.sizeBytes !== sourceInfo.size
    ) {
      throw new EditorMaterializationError(
        "PUBLISH_PACKAGE_INVALID",
        `Publish source size mismatch for ${logicalFile.role}.`
      );
    }
    if (
      logicalFile.sha256 !== undefined &&
      logicalFile.sha256 !== sourceSha
    ) {
      throw new EditorMaterializationError(
        "PUBLISH_PACKAGE_INVALID",
        `Publish source hash mismatch for ${logicalFile.role}.`
      );
    }

    await mkdir(dirname(destination.absolutePath), {recursive: true});
    await copyFile(source.absolutePath, destination.absolutePath);
    const destinationSha = await sha256File(destination.absolutePath);
    if (destinationSha !== sourceSha) {
      throw new EditorMaterializationError(
        "DEST_HASH_MISMATCH",
        `Publish destination hash mismatch for ${logicalFile.role}.`
      );
    }
    files.push({
      role: logicalFile.role,
      projectRelativePath: destination.projectRelativePath,
      sizeBytes: sourceInfo.size,
      sha256: sourceSha
    });
  }

  const handoffPath = resolve(
    packageDirectory.absolutePath,
    manifest.recommendedFileName
  );
  await writeJson(handoffPath, output);
  const report: PublishMaterializationReport = {
    schemaVersion: 1,
    status: "READY",
    projectId,
    packageSha256: manifest.packageSha256,
    packageDirectory: packageDirectory.projectRelativePath,
    files,
    handoffPath: `${packageDirectory.projectRelativePath}/${manifest.recommendedFileName}`
  };
  await writeJson(
    resolve(packageDirectory.absolutePath, "package_materialization.json"),
    report
  );
  return report;
}
