import type {EditProject} from "../editorTypes";

import {getEditorApiBase} from "../../../editor/runtimeConfig.ts";

export type EditorProductionIssue = {
  code: string;
  message: string;
  data?: {
    subtitleIds?: string[];
    frame?: number;
    [key: string]: unknown;
  };
};

type EditorProjectEnvelope = {
  success: boolean;
  project?: EditProject;
  path?: string;
  savedAt?: string;
  action?: "gate" | "render";
  gateReport?: {
    status?: "APPROVED" | "BLOCKED";
    projectSha256?: string;
    errors?: EditorProductionIssue[];
    warnings?: EditorProductionIssue[];
    subtitleQc?: {
      status?: "PASS" | "WARN" | "FAIL";
      cueCount?: number;
      errorCount?: number;
      warningCount?: number;
    } | null;
  } | null;
  manifest?: {
    status?: "RENDERED";
    projectSha256?: string;
    output?: {
      path?: string;
      sha256?: string;
      sizeBytes?: number;
    };
  } | null;
  technicalQc?: {
    status?: "PASS" | "FAIL";
    issueCodes?: string[];
    projectSha256?: string;
  } | null;
  deliveryManifest?: {
    status?: "READY" | "BLOCKED";
    projectSha256?: string;
    output?: {
      path?: string;
      sha256?: string;
      sizeBytes?: number;
    };
    issueCodes?: string[];
  } | null;
  outputPath?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export type EditorProductionResult = {
  status: "APPROVED" | "BLOCKED" | "DELIVERY_READY";
  projectSha256: string | null;
  outputPath: string | null;
  outputSha256: string | null;
  errors: EditorProductionIssue[];
  warnings: EditorProductionIssue[];
  subtitleQc: {
    status: "PASS" | "WARN" | "FAIL";
    cueCount: number;
    errorCount: number;
    warningCount: number;
  } | null;
  technicalQc: {
    status: "PASS" | "FAIL";
    issueCodes: string[];
  } | null;
  deliveryStatus: "READY" | "BLOCKED" | null;
};

const parseEnvelope = async (response: Response) => {
  const payload = (await response.json()) as EditorProjectEnvelope;
  if (!response.ok || !payload.success) {
    throw new Error(
      payload.error ?? `Editor persistence failed (${response.status})`,
    );
  }
  return payload;
};

export const loadPersistedEditorProject = async (
  projectId: string,
): Promise<EditProject | null> => {
  const response = await fetch(
    `${getEditorApiBase()}/api/editor/project/${encodeURIComponent(projectId)}`,
  );

  if (response.status === 404) {
    return null;
  }

  const payload = await parseEnvelope(response);
  if (!payload.project) {
    throw new Error("Saved editor project payload is missing");
  }
  return payload.project;
};

export const savePersistedEditorProject = async (
  project: EditProject,
): Promise<{path: string; savedAt: string}> => {
  const response = await fetch(
    `${getEditorApiBase()}/api/editor/project/${encodeURIComponent(project.project.id)}`,
    {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(project),
    },
  );
  const payload = await parseEnvelope(response);
  return {
    path: payload.path ?? "",
    savedAt: payload.savedAt ?? new Date().toISOString(),
  };
};

const runProductionAction = async (
  projectId: string,
  action: "gate" | "render",
): Promise<EditorProductionResult> => {
  const response = await fetch(
    `${getEditorApiBase()}/api/editor/project/${encodeURIComponent(projectId)}/${action}`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        allowRemote: false,
        allowVisualGaps: false,
      }),
    },
  );
  const payload = await parseEnvelope(response);
  const gate = payload.gateReport;
  const manifest = payload.manifest;
  const technicalQc = payload.technicalQc;
  const deliveryManifest = payload.deliveryManifest;
  const technicalErrors =
    technicalQc?.status === "FAIL"
      ? (technicalQc.issueCodes ?? []).map((code) => ({
          code: "TECHNICAL_QC_" + code,
          message: "Technical QC: " + code,
        }))
      : [];

  const status =
    action === "render" && deliveryManifest?.status === "READY"
      ? "DELIVERY_READY"
      : action === "render"
        ? "BLOCKED"
        : gate?.status === "APPROVED"
          ? "APPROVED"
          : "BLOCKED";

  return {
    status,
    projectSha256:
      deliveryManifest?.projectSha256 ??
      manifest?.projectSha256 ??
      gate?.projectSha256 ??
      null,
    outputPath:
      deliveryManifest?.output?.path ??
      manifest?.output?.path ??
      payload.outputPath ??
      null,
    outputSha256:
      deliveryManifest?.output?.sha256 ??
      manifest?.output?.sha256 ??
      null,
    errors: [...(gate?.errors ?? []), ...technicalErrors],
    warnings: gate?.warnings ?? [],
    subtitleQc: gate?.subtitleQc
      ? {
          status: gate.subtitleQc.status ?? "PASS",
          cueCount: Number(gate.subtitleQc.cueCount ?? 0),
          errorCount: Number(gate.subtitleQc.errorCount ?? 0),
          warningCount: Number(gate.subtitleQc.warningCount ?? 0),
        }
      : null,
    technicalQc: technicalQc
      ? {
          status: technicalQc.status ?? "FAIL",
          issueCodes: technicalQc.issueCodes ?? [],
        }
      : null,
    deliveryStatus: deliveryManifest?.status ?? null,
  };
};

export const runEditorProductionGate = async (
  projectId: string,
): Promise<EditorProductionResult> =>
  runProductionAction(projectId, "gate");

export const runEditorFinalRender = async (
  projectId: string,
): Promise<EditorProductionResult> =>
  runProductionAction(projectId, "render");

export const assertCompatibleEditorProject = (
  initial: EditProject,
  loaded: EditProject,
) => {
  if (initial.project.id !== loaded.project.id) {
    throw new Error(
      `Saved project id mismatch: ${loaded.project.id}`,
    );
  }

  const keys = [
    "fps",
    "width",
    "height",
    "durationInFrames",
  ] as const;

  for (const key of keys) {
    if (initial.project[key] !== loaded.project[key]) {
      throw new Error(
        `Saved project ${key} (${loaded.project[key]}) does not match the current Remotion composition (${initial.project[key]}).`,
      );
    }
  }
};
