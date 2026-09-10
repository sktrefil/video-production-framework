import type { RuntimePersistencePort, RuntimeTargetRevisionPort } from "@vpf/provider-orchestrator";
import { RuntimeContractError } from "@vpf/runtime-contracts";
import { SqliteRuntimeExecutionRepository } from "./runtime-execution.js";

/** Atomically connects MIG-02 ingestion to WF-09; never performs QC or approval. */
export class SqliteImageRuntimeRepository extends SqliteRuntimeExecutionRepository implements RuntimeTargetRevisionPort {
  async getCurrentTargetRevision(input: Parameters<RuntimeTargetRevisionPort["getCurrentTargetRevision"]>[0]): Promise<number | null> {
    if (input.targetType !== "ASSET") return null;
    const row = this.db.prepare("SELECT revision FROM production_assets WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE' AND stale = 0 AND asset_status = 'GENERATING'")
      .get(input.projectId, input.targetId) as {revision: number} | undefined;
    return row?.revision ?? null;
  }

  protected override commitTargetTransition(input: Parameters<RuntimePersistencePort["commitProviderTransition"]>[0]): void {
    const job = input.nextJob;
    if (job.jobType !== "IMAGE_GENERATION" || job.targetType !== "ASSET")
      throw new RuntimeContractError("RUNTIME_CONFIG_INVALID", "Image repository accepts image/asset jobs only.");
    const row = this.db.prepare("SELECT * FROM production_assets WHERE project_id = ? AND id = ? AND lifecycle_status = 'ACTIVE'")
      .get(job.projectId, job.targetId) as Record<string, unknown> | undefined;
    if (!row || row.revision !== job.targetRevision || row.stale !== 0 || row.asset_status !== "GENERATING") {
      // A stale result must be recorded as blocked without mutating the newer Asset.
      if (job.status === "BLOCKED") return;
      throw new RuntimeContractError("RUNTIME_TARGET_STALE", "Image asset changed before atomic commit.");
    }
    if (job.status === "RUNNING") return;
    if (!["COMPLETE", "FAILED", "BLOCKED"].includes(job.status)) return;
    if (job.status === "COMPLETE" && (input.media.length !== 1 || input.media[0]?.mediaType !== "IMAGE"))
      throw new RuntimeContractError("PROVIDER_RESULT_INVALID", "Expected exactly one candidate image.");
    this.db.prepare("UPDATE production_assets SET lifecycle_status = 'SUPERSEDED' WHERE project_id = ? AND id = ? AND revision = ?")
      .run(job.projectId, job.targetId, job.targetRevision);
    const next = {
      ...row, revision: job.targetRevision + 1, updated_at: job.updatedAt,
      asset_status: job.status === "COMPLETE" ? "CANDIDATE_AVAILABLE" : "REGENERATE_REQUIRED",
      candidate_media_ids_json: JSON.stringify([
        ...JSON.parse(row.candidate_media_ids_json as string) as string[], ...input.media.map(media => media.id)
      ])
    };
    const keys = Object.keys(next);
    this.db.prepare(`INSERT INTO production_assets (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
      .run(...Object.values(next));
  }
}
