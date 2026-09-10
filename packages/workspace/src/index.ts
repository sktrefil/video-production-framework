import {
  isAbsolute,
  relative,
  resolve,
  win32
} from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
);

const WINDOWS_RESERVED_NAME =
  /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\..*)?$/iu;

export class WorkspacePathError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PROJECT_ID"
      | "INVALID_RELATIVE_PATH"
      | "PATH_OUTSIDE_PROJECT",
    message: string
  ) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

export interface WorkspaceResolverOptions {
  repositoryRoot?: string;
  workspaceRoot?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ProjectWorkspace {
  workspaceRoot: string;
  projectsRoot: string;
  projectId: string;
  projectRoot: string;
}

export function validateProjectId(value: string): string {
  const projectId = value.trim();

  if (
    projectId.length === 0 ||
    projectId.length > 180 ||
    projectId === "." ||
    projectId === ".." ||
    /[\\/]/u.test(projectId) ||
    /[\u0000-\u001f\u007f]/u.test(projectId) ||
    /[<>:"|?*]/u.test(projectId) ||
    /[. ]$/u.test(projectId) ||
    WINDOWS_RESERVED_NAME.test(projectId)
  ) {
    throw new WorkspacePathError(
      "INVALID_PROJECT_ID",
      "Unsafe project id: " + JSON.stringify(value)
    );
  }

  return projectId;
}

export function resolveWorkspaceRoot(
  options: WorkspaceResolverOptions = {}
): string {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT
  );
  const configured =
    options.workspaceRoot ??
    options.env?.VPF_WORKSPACE_ROOT ??
    process.env.VPF_WORKSPACE_ROOT;

  if (configured === undefined || configured.trim() === "") {
    return resolve(repositoryRoot, "workspace");
  }

  return isAbsolute(configured)
    ? resolve(configured)
    : resolve(repositoryRoot, configured);
}

export function resolveProjectWorkspace(
  projectIdInput: string,
  options: WorkspaceResolverOptions = {}
): ProjectWorkspace {
  const projectId = validateProjectId(projectIdInput);
  const workspaceRoot = resolveWorkspaceRoot(options);
  const projectsRoot = resolve(workspaceRoot, "projects");
  const projectRoot = resolve(projectsRoot, projectId);

  assertPathInside(projectsRoot, projectRoot);

  return {
    workspaceRoot,
    projectsRoot,
    projectId,
    projectRoot
  };
}

export function normalizeProjectRelativePath(value: string): string {
  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    isAbsolute(trimmed) ||
    win32.isAbsolute(trimmed) ||
    /^[a-zA-Z]:[\\/]/u.test(trimmed)
  ) {
    throw new WorkspacePathError(
      "INVALID_RELATIVE_PATH",
      "Project artifact path must be relative: " + JSON.stringify(value)
    );
  }

  const normalized = trimmed.replaceAll("\\", "/");
  const parts = normalized.split("/");

  if (
    parts.some(
      part =>
        part.length === 0 ||
        part === "." ||
        part === ".." ||
        /[\u0000-\u001f\u007f]/u.test(part)
    )
  ) {
    throw new WorkspacePathError(
      "INVALID_RELATIVE_PATH",
      "Unsafe project-relative path: " + JSON.stringify(value)
    );
  }

  return parts.join("/");
}

export function resolveProjectRelativePath(
  projectRoot: string,
  projectRelativePath: string
): string {
  const normalized = normalizeProjectRelativePath(projectRelativePath);
  const root = resolve(projectRoot);
  const target = resolve(root, ...normalized.split("/"));

  assertPathInside(root, target);
  return target;
}

export function toProjectRelativePath(
  projectRoot: string,
  artifactPath: string
): string {
  const root = resolve(projectRoot);
  const target = isAbsolute(artifactPath)
    ? resolve(artifactPath)
    : resolve(root, artifactPath);

  assertPathInside(root, target);

  const result = relative(root, target).replaceAll("\\", "/");
  if (result.length === 0) {
    throw new WorkspacePathError(
      "INVALID_RELATIVE_PATH",
      "A project artifact path must resolve below the project root."
    );
  }

  return normalizeProjectRelativePath(result);
}

function assertPathInside(basePath: string, candidatePath: string): void {
  const base = resolve(basePath);
  const candidate = resolve(candidatePath);
  const rel = relative(base, candidate);

  if (
    rel === "" ||
    (!rel.startsWith("..") && !isAbsolute(rel))
  ) {
    return;
  }

  throw new WorkspacePathError(
    "PATH_OUTSIDE_PROJECT",
    "Resolved path escapes its allowed root: " + candidate
  );
}
