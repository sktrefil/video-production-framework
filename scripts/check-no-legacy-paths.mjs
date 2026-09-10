import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scanRoots = ["packages", "runtimes", "apps", "cli", "resources", "scripts"];

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

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") {
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
    files = await listFiles(root);
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
    if (rel === selfPath || rel.includes("/test/") || rel.includes("/tests/")) {
      continue;
    }

    const content = await readFile(file, "utf8");
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
