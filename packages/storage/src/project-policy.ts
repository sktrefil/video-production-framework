import type Database from "better-sqlite3";
import type {UnifiedProjectPolicy} from "@vpf/legacy-guard";

export function readProjectPolicy(db: Database.Database, projectId: string): UnifiedProjectPolicy | null {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get()) return null;
  const columns = db.prepare("PRAGMA table_info(projects)").all() as Array<{name: string}>;
  if (!["pipeline", "legacy_allowed", "project_id", "lifecycle_status", "revision"].every(name=>columns.some(column=>column.name===name))) return null;
  const row = db.prepare("SELECT pipeline, legacy_allowed FROM projects WHERE project_id=? AND lifecycle_status='ACTIVE' ORDER BY revision DESC LIMIT 1")
    .get(projectId) as {pipeline: string; legacy_allowed: number} | undefined;
  return row ? {pipeline: row.pipeline, legacyAllowed: row.legacy_allowed !== 0} : null;
}
