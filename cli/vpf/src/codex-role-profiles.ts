export type CodexRoleId =
  | "CODEX_1_MANAGER"
  | "CODEX_2_STORY_AUDIO"
  | "CODEX_3_VISUAL_PRODUCTION";

export interface CodexRoleProfile {
  roleId: CodexRoleId;
  slug: string;
  displayName: string;
  allowedTasks: string[];
  webSearchTasks: string[];
  writePolicy: "OUTPUT_ONLY";
  databasePolicy: "NO_DIRECT_DB_ACCESS";
  filesystemPolicy: "ISOLATED_RUN_DIRECTORY";
}

export const CODEX_ROLE_PROFILES: Record<CodexRoleId, CodexRoleProfile> = {
  CODEX_1_MANAGER: {
    roleId: "CODEX_1_MANAGER",
    slug: "codex1-manager",
    displayName: "Codex 1 Manager / QC",
    allowedTasks: ["MANAGER_REVIEW"],
    webSearchTasks: [],
    writePolicy: "OUTPUT_ONLY",
    databasePolicy: "NO_DIRECT_DB_ACCESS",
    filesystemPolicy: "ISOLATED_RUN_DIRECTORY"
  },
  CODEX_2_STORY_AUDIO: {
    roleId: "CODEX_2_STORY_AUDIO",
    slug: "codex2-story-audio",
    displayName: "Codex 2 Story + Audio",
    allowedTasks: ["T010", "T020"],
    webSearchTasks: ["T010"],
    writePolicy: "OUTPUT_ONLY",
    databasePolicy: "NO_DIRECT_DB_ACCESS",
    filesystemPolicy: "ISOLATED_RUN_DIRECTORY"
  },
  CODEX_3_VISUAL_PRODUCTION: {
    roleId: "CODEX_3_VISUAL_PRODUCTION",
    slug: "codex3-visual-production",
    displayName: "Codex 3 Visual + Production",
    allowedTasks: ["T040", "T050", "T060"],
    webSearchTasks: [],
    writePolicy: "OUTPUT_ONLY",
    databasePolicy: "NO_DIRECT_DB_ACCESS",
    filesystemPolicy: "ISOLATED_RUN_DIRECTORY"
  }
};

export function getCodexRoleProfile(roleId: CodexRoleId): CodexRoleProfile {
  return structuredClone(CODEX_ROLE_PROFILES[roleId]);
}
