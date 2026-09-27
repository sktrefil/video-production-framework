import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import * as path from "node:path";
import { ProductionSpecRepository } from "@vpf/storage/production-spec";
import type { ImagePromptPlan } from "@vpf/production-spec";

/** Resolve only already-approved canonical references. This never promotes media. */
export async function resolveDirectingReferences(input: {
  dbPath: string; projectRoot: string; projectId: string; ids: string[];
}): Promise<NonNullable<ImagePromptPlan["references"]>> {
  if (input.ids.length === 0) return [];
  const repo = new ProductionSpecRepository(input.dbPath, { readonly: true });
  try {
    const root = await realpath(input.projectRoot);
    const references: NonNullable<ImagePromptPlan["references"]> = [];
    for (const id of input.ids) {
      const media = repo.db.prepare(`SELECT m.id media_id, m.revision, m.relative_path, m.checksum sha256, m.mime_type
        FROM media_artifacts m WHERE m.project_id=? AND m.id=? AND m.lifecycle_status='ACTIVE'
        AND m.media_status='AVAILABLE' AND EXISTS (
          SELECT 1 FROM production_assets a WHERE a.project_id=m.project_id AND a.approved_media_id=m.id
          AND a.lifecycle_status='ACTIVE' AND a.asset_class='REFERENCE' AND a.asset_status='APPROVED' AND a.stale=0
        )`).get(input.projectId, id) as NonNullable<ImagePromptPlan["references"]>[number] | undefined;
      if (!media || !["image/png", "image/jpeg", "image/webp"].includes(media.mime_type))
        throw new Error("Directing reference must be an approved canonical REFERENCE image: " + id);
      const absolute = await realpath(path.resolve(root, media.relative_path));
      const relative = path.relative(root, absolute);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Reference escapes project root: " + id);
      const checksum = createHash("sha256").update(await readFile(absolute)).digest("hex");
      if (checksum !== media.sha256.replace(/^sha256:/u, "")) throw new Error("Reference bytes changed: " + id);
      references.push({ ...media, sha256: checksum });
    }
    return references;
  } finally { repo.close(); }
}
