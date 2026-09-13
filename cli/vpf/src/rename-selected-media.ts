import { rename, readFile, realpath, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { ProjectBootstrapService, type ProjectStatus } from "@vpf/project-bootstrap";
import { SqliteFinalClipRepository } from "@vpf/storage/final-clip";

export class RenameSelectedMediaError extends Error {
  constructor(
    public readonly code: "RENAME_SELECTED_STATE" | "RENAME_SELECTED_CONFLICT" | "RENAME_SELECTED_MANIFEST",
    message: string
  ) {
    super(message);
    this.name = "RenameSelectedMediaError";
  }
}

interface RenameEntry {
  sceneNumber: number;
  oldName: string;
  newName: string;
  oldRelativePath: string;
  newRelativePath: string;
}

function replaceStrings(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") {
    let output = value;
    for (const [from, to] of replacements) output = output.replaceAll(from, to);
    return output;
  }
  if (Array.isArray(value)) return value.map(item => replaceStrings(item, replacements));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStrings(item, replacements)]));
  }
  return value;
}

async function requireRealFile(file: string, message: string): Promise<void> {
  try { await realpath(file); } catch { throw new RenameSelectedMediaError("RENAME_SELECTED_MANIFEST", message); }
}

export class RenameSelectedMediaService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(projectId: string, fn: (repo: SqliteFinalClipRepository, status: ProjectStatus) => Promise<T>): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteFinalClipRepository(status.projectDbPath);
    try { return await fn(repo, status); } finally { repo.close(); }
  }

  async renameToCutNames(projectId: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const selectedDir = path.join(status.projectRoot, "05_images", "selected");
      await requireRealFile(selectedDir, "Selected image directory does not exist.");
      const rows = repo.db.prepare(`SELECT id, relative_path, media_status
        FROM media_artifacts WHERE project_id = ? AND relative_path LIKE '05_images/selected/%'`).all(projectId) as Array<{
          id: string; relative_path: string; media_status: string;
        }>;
      const entries = rows.map(row => {
        const oldName = path.posix.basename(row.relative_path);
        const match = /^v7-world-variation-role-lock--(\d{2})--sc(\d+)--roman-ix-full-\d+\.png$/i.exec(oldName);
        if (match === null || row.media_status !== "AVAILABLE") {
          throw new RenameSelectedMediaError("RENAME_SELECTED_STATE", `Selected media is not a current available Roman IX plate: ${row.relative_path}`);
        }
        const sceneNumber = Number(match[2]);
        if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > 99) {
          throw new RenameSelectedMediaError("RENAME_SELECTED_STATE", `Invalid selected scene number in ${row.relative_path}.`);
        }
        const newName = `CUT ${String(sceneNumber).padStart(2, "0")}.png`;
        return {
          sceneNumber,
          oldName,
          newName,
          oldRelativePath: row.relative_path,
          newRelativePath: `05_images/selected/${newName}`
        };
      }).sort((a, b) => a.sceneNumber - b.sceneNumber);
      if (entries.length !== 11 || new Set(entries.map(entry => entry.sceneNumber)).size !== 11) {
        throw new RenameSelectedMediaError("RENAME_SELECTED_STATE", "Expected exactly one current selected plate for each of the 11 scenes.");
      }
      for (let number = 1; number <= 11; number += 1) {
        if (entries[number - 1]?.sceneNumber !== number) {
          throw new RenameSelectedMediaError("RENAME_SELECTED_STATE", "Selected plate numbers must be a complete SC1 through SC11 set.");
        }
      }
      for (const entry of entries) {
        await requireRealFile(path.join(status.projectRoot, entry.oldRelativePath), `Selected image is missing: ${entry.oldRelativePath}`);
        try {
          await realpath(path.join(selectedDir, entry.newName));
          throw new RenameSelectedMediaError("RENAME_SELECTED_CONFLICT", `Refusing to overwrite existing target: ${entry.newRelativePath}`);
        } catch (error) {
          if (error instanceof RenameSelectedMediaError) throw error;
        }
      }
      const manifestPaths = [
        path.join(selectedDir, "image-imports.json"),
        path.join(selectedDir, "full-preview-manifest.v7-world-variation-role-lock.json"),
        path.join(selectedDir, "editorial-selected-plates.video-ready-v1.json")
      ];
      const originals = new Map<string, string>();
      for (const manifest of manifestPaths) {
        await requireRealFile(manifest, `Required selected-image manifest is missing: ${path.basename(manifest)}`);
        originals.set(manifest, await readFile(manifest, "utf8"));
      }
      const replacements = new Map<string, string>();
      for (const entry of entries) {
        replacements.set(entry.oldRelativePath, entry.newRelativePath);
        replacements.set(entry.oldName, entry.newName);
      }
      const moved: RenameEntry[] = [];
      try {
        for (const entry of entries) {
          await rename(path.join(status.projectRoot, entry.oldRelativePath), path.join(status.projectRoot, entry.newRelativePath));
          moved.push(entry);
        }
        repo.db.transaction(() => {
          const update = repo.db.prepare(`UPDATE media_artifacts SET relative_path = ? WHERE project_id = ? AND id = ? AND relative_path = ?`);
          for (const entry of entries) {
            const changes = update.run(entry.newRelativePath, projectId, rows.find(row => row.relative_path === entry.oldRelativePath)!.id, entry.oldRelativePath).changes;
            if (changes !== 1) throw new RenameSelectedMediaError("RENAME_SELECTED_STATE", `Media path changed concurrently: ${entry.oldRelativePath}`);
          }
        })();
        for (const [manifest, source] of originals) {
          let parsed: unknown;
          try { parsed = JSON.parse(source) as unknown; } catch {
            throw new RenameSelectedMediaError("RENAME_SELECTED_MANIFEST", `Selected-image manifest is invalid JSON: ${path.basename(manifest)}`);
          }
          await writeFile(manifest, JSON.stringify(replaceStrings(parsed, replacements), null, 2) + "\n", "utf8");
        }
      } catch (error) {
        for (const entry of [...moved].reverse()) {
          try { await rename(path.join(status.projectRoot, entry.newRelativePath), path.join(status.projectRoot, entry.oldRelativePath)); } catch { /* Preserve the original failure; recovery is reported below. */ }
        }
        throw error;
      }
      return {
        projectId,
        renamedCount: entries.length,
        renamed: entries.map(entry => ({ scene: `sc${entry.sceneNumber}`, from: entry.oldName, to: entry.newName })),
        rematerializeRequired: ["cutlist materialize"]
      };
    });
  }
}
