import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {legacyCategory} from "../packages/legacy-guard/dist/index.js";

const repoRoot = process.argv[2] ? resolve(process.argv[2]) : resolve(fileURLToPath(new URL("..", import.meta.url)));
const scanRoots = ["packages", "runtimes", "apps", "cli", "resources", "scripts", ".github", "package.json"];

const allowedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".py",
  ".toml",
  ".yaml",
  ".yml"
]);

const prohibited = [
  {
    code: "OLD_MANAGER_V2_WINDOWS_PATH",
    pattern: /[A-Za-z]:[\\/]git[\\/]video-production-admin-manager-v2/iu
  },
  {
    code: "OLD_VIDEO_PRODUCTION_WINDOWS_PATH",
    pattern: /[A-Za-z]:[\\/]git[\\/]video-production(?:[\\/]|$)/iu
  },
  {
    code: "OLD_ONEDRIVE_MANAGER_PATH",
    pattern: /[A-Za-z]:[\\/][^\r\n"']*video-production-admin-manager-v2/iu
  },
  {
    code: "OLD_REPO_ABSOLUTE_POSIX_PATH",
    pattern: /\/(?:home|mnt|opt|srv|Users)\/[^\r\n"']*\/(?:video-production-admin-manager-v2|video-production)(?:\/|$)/u
  }
];

const selfPath = "scripts/check-no-legacy-paths.mjs";
const immutableLegacyProhibition = "Do not use the legacy HISTORY_MYSTERY_STYLIZED_V1 master style, history_mystery_shorts_style.json, old scene prompt presets, or old master-candidate logic.";
const visualBibleProhibitionOnly = new Set([
  "resources/visual-bibles/HISTORY_MYSTERY_VISUAL_BIBLE/1.0.0.json",
  "resources/visual-bibles/HISTORY_MYSTERY_VISUAL_BIBLE/1.1.0.json"
]);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (["node_modules", "dist", "build", ".remotion"].includes(entry.name)) {
      continue;
    }

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(full));
    } else if (entry.isFile() && allowedExtensions.has(extname(entry.name))) {
      files.push(full);
    }
  }

  return files;
}

const findings = [];

for (const rootName of scanRoots) {
  const root = resolve(repoRoot, rootName);
  let files;

  try {
    files = rootName === "package.json" ? [root] : await listFiles(root);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      continue;
    }
    throw error;
  }

  for (const file of files) {
    const rel = relative(repoRoot, file).replaceAll("\\", "/");
    if (rel === selfPath || rel === "packages/legacy-guard/src/index.ts" || rel.includes("/test/") || rel.includes("/tests/")) {
      continue;
    }

    let content;
    try { content = await readFile(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT" && rootName === "package.json") continue; throw error; }
    if (rel === "apps/editor/PORT_SOURCE.json") {
      // Exact migration provenance field; all other fields still undergo the scan.
      content = content.replace('"sourceRepository": "sktrefil/video-production"', '"sourceRepository": "MIGRATION_PROVENANCE"');
    }
    // Exact immutable prohibition prose is detection data, never an executable
    // reference. Preserve the canonical resource bytes; sanitize only the scan input.
    if (visualBibleProhibitionOnly.has(rel)) {
      content = content.replace(immutableLegacyProhibition, "");
    }
    const category = legacyCategory(content);
    if (category) findings.push({file: rel, code: category});
    for (const rule of prohibited) {
      if (rule.pattern.test(content)) {
        findings.push({ file: rel, code: rule.code });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Legacy operational path dependency detected:");
  for (const finding of findings) {
    console.error("- " + finding.code + ": " + finding.file);
  }
  process.exitCode = 1;
} else {
  console.log(
    "[repository-boundary] PASS · no hardcoded legacy operational repository path"
  );
}
