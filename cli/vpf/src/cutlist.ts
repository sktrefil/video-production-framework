import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { MediaArtifact, ProductionClip, ProductionLink } from "@vpf/domain";
import { ProjectBootstrapService, type ProjectStatus } from "@vpf/project-bootstrap";
import { SqliteFinalClipRepository } from "@vpf/storage/final-clip";

export class CutListCliError extends Error {
  constructor(
    public readonly code: "CUTLIST_INPUT_PATH" | "CUTLIST_INPUT_INVALID" | "CUTLIST_STATE",
    message: string
  ) {
    super(message);
    this.name = "CutListCliError";
  }
}

interface CutListEntry {
  sceneKey: string;
  sequenceLabel: string;
  narrationBeat: string;
  visualDescription: string;
  mustShow: string[];
  baseHoldMs: number;
  overlay: string;
  audioCue: string;
  historicalDisclosure: string;
}

interface CutListPlan {
  title: string;
  entries: CutListEntry[];
}

interface MaterializedCut {
  cutNo: number;
  sceneId: string;
  sceneKey: string;
  sequenceLabel: string;
  narrationBeat: string;
  visualDescription: string;
  mustShow: string[];
  baseHoldMs: number;
  overlay: string;
  audioCue: string;
  historicalDisclosure: string;
  image: Pick<MediaArtifact, "id" | "relativePath" | "width" | "height">;
  outgoing?: {
    clipId: string;
    clipMode: ProductionClip["clipMode"];
    transitionMethod: ProductionClip["transitionMethod"];
    durationMs: number;
    cameraMove: string;
    subjectMotion: string;
    environmentMotion: string;
    providerExecutionRequired: boolean;
  };
  estimatedDurationMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function readProjectJson(projectRoot: string, inputPath: string): Promise<unknown> {
  const root = path.resolve(projectRoot);
  const requested = path.resolve(inputPath);
  if (!isInside(root, requested)) {
    throw new CutListCliError("CUTLIST_INPUT_PATH", "Cut-list input files must remain inside the current project workspace.");
  }
  let actual: string;
  try {
    actual = await realpath(requested);
  } catch {
    throw new CutListCliError("CUTLIST_INPUT_PATH", `Cut-list input file does not exist or is unreadable: ${inputPath}`);
  }
  if (!isInside(root, actual)) {
    throw new CutListCliError("CUTLIST_INPUT_PATH", "Cut-list input symlink resolves outside the current project workspace.");
  }
  try {
    return JSON.parse(await readFile(actual, "utf8")) as unknown;
  } catch {
    throw new CutListCliError("CUTLIST_INPUT_INVALID", `Cut-list input must contain valid JSON: ${inputPath}`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CutListCliError("CUTLIST_INPUT_INVALID", `${label} is required.`);
  }
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new CutListCliError("CUTLIST_INPUT_INVALID", `${label} must be an array of non-empty strings.`);
  }
  return value.map(item => item.trim());
}

function duration(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new CutListCliError("CUTLIST_INPUT_INVALID", `${label} must be a positive integer.`);
  }
  return value as number;
}

function parsePlan(value: unknown): CutListPlan {
  if (!isRecord(value) || !Array.isArray(value.entries) || value.entries.length === 0) {
    throw new CutListCliError("CUTLIST_INPUT_INVALID", "Cut-list plan must contain a non-empty entries array.");
  }
  const seen = new Set<string>();
  const entries = value.entries.map((item, index) => {
    const label = `entries[${index}]`;
    if (!isRecord(item)) throw new CutListCliError("CUTLIST_INPUT_INVALID", `${label} must be an object.`);
    const sceneKey = text(item.sceneKey, `${label}.sceneKey`);
    if (seen.has(sceneKey)) throw new CutListCliError("CUTLIST_INPUT_INVALID", `${label}.sceneKey duplicates ${sceneKey}.`);
    seen.add(sceneKey);
    return {
      sceneKey,
      sequenceLabel: text(item.sequenceLabel, `${label}.sequenceLabel`),
      narrationBeat: text(item.narrationBeat, `${label}.narrationBeat`),
      visualDescription: text(item.visualDescription, `${label}.visualDescription`),
      mustShow: strings(item.mustShow, `${label}.mustShow`),
      baseHoldMs: duration(item.baseHoldMs, `${label}.baseHoldMs`),
      overlay: text(item.overlay, `${label}.overlay`),
      audioCue: text(item.audioCue, `${label}.audioCue`),
      historicalDisclosure: text(item.historicalDisclosure, `${label}.historicalDisclosure`)
    };
  });
  return { title: text(value.title, "title"), entries };
}

function orderedLinkChain(links: ProductionLink[]): ProductionLink[] {
  if (links.length === 0) throw new CutListCliError("CUTLIST_STATE", "No active Scene Links exist.");
  const incoming = new Set(links.map(link => link.toSceneId));
  const starts = links.filter(link => !incoming.has(link.fromSceneId));
  if (starts.length !== 1) {
    throw new CutListCliError("CUTLIST_STATE", "Active Scene Links must form one unambiguous linear chain.");
  }
  const byFrom = new Map(links.map(link => [link.fromSceneId, link]));
  const chain: ProductionLink[] = [];
  let current = starts[0]!;
  while (current !== undefined) {
    chain.push(current);
    const next = byFrom.get(current.toSceneId);
    if (next === undefined) break;
    if (chain.some(link => link.id === next.id)) {
      throw new CutListCliError("CUTLIST_STATE", "Active Scene Links contain a cycle.");
    }
    current = next;
  }
  if (chain.length !== links.length) {
    throw new CutListCliError("CUTLIST_STATE", "Active Scene Links are disconnected.");
  }
  return chain;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function ms(seconds: number): string {
  return `${(seconds / 1000).toFixed(1)}s`;
}

function renderHtml(input: { title: string; projectId: string; totalMs: number; cuts: MaterializedCut[] }): string {
  const rows = input.cuts.map(cut => {
    const imagePath = `../../${cut.image.relativePath.replaceAll("\\", "/")}`;
    const outgoing = cut.outgoing === undefined
      ? `<span class="terminal">Final hold · no outgoing transition</span>`
      : `<strong>${escapeHtml(cut.outgoing.clipMode)}</strong> · ${escapeHtml(cut.outgoing.transitionMethod)} · ${ms(cut.outgoing.durationMs)}<br><span>${escapeHtml(cut.outgoing.cameraMove)}</span><br><span>${escapeHtml(cut.outgoing.subjectMotion)}</span><br><span>${escapeHtml(cut.outgoing.environmentMotion)}</span><br><em>${cut.outgoing.providerExecutionRequired ? "I2V / Provider job after Pre-QC" : "Editorial motion / no provider video"}</em>`;
    return `<article class="cut">
  <header><span class="number">CUT ${String(cut.cutNo).padStart(2, "0")}</span><span class="duration">budget ${ms(cut.estimatedDurationMs)}</span></header>
  <div class="body"><img src="${escapeHtml(imagePath)}" alt="${escapeHtml(cut.sceneKey)} approved image"><section>
    <p class="sequence">${escapeHtml(cut.sequenceLabel)} · ${escapeHtml(cut.sceneKey)}</p>
    <h2>${escapeHtml(cut.narrationBeat)}</h2>
    <p>${escapeHtml(cut.visualDescription)}</p>
    <dl><dt>Must show</dt><dd>${cut.mustShow.map(escapeHtml).join(" · ")}</dd><dt>Overlay</dt><dd>${escapeHtml(cut.overlay)}</dd><dt>Audio</dt><dd>${escapeHtml(cut.audioCue)}</dd><dt>Historical disclosure</dt><dd>${escapeHtml(cut.historicalDisclosure)}</dd><dt>Outgoing implementation</dt><dd>${outgoing}</dd></dl>
  </section></div>
</article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)} — Cut List</title>
<style>
*{box-sizing:border-box} body{margin:0;background:#10131a;color:#e7eaf0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:34px 20px 72px}h1{margin:0 0 6px;font-size:30px}.sub{color:#aeb9cb;margin:0 0 22px}.notice{border-left:4px solid #e1a940;background:#252237;padding:12px 14px;border-radius:5px;color:#f5e7c5;margin-bottom:24px}.cut{background:#181d27;border:1px solid #31394b;border-radius:12px;overflow:hidden;margin:16px 0}.cut header{display:flex;justify-content:space-between;gap:16px;padding:9px 14px;background:#202738}.number{font-weight:750;color:#e8c46c}.duration{color:#b8c5da}.body{display:grid;grid-template-columns:180px 1fr;gap:18px;padding:16px}.body img{width:180px;aspect-ratio:16/9;height:auto;object-fit:cover;border-radius:8px;background:#0a0d12}.sequence{color:#80b9cb;font-weight:650;margin:0}.body h2{font-size:18px;line-height:1.35;margin:4px 0 8px}.body p{margin:7px 0}dl{display:grid;grid-template-columns:150px 1fr;gap:7px 14px;margin:14px 0 0;padding-top:12px;border-top:1px solid #303849}dt{color:#9fadc4;font-weight:650}dd{margin:0}em{display:inline-block;margin-top:5px;color:#d7b665;font-style:normal}.terminal{color:#aeb9cb}@media(max-width:640px){main{padding:20px 12px}.body{grid-template-columns:104px 1fr;gap:12px;padding:12px}.body img{width:104px;aspect-ratio:16/9;height:auto}dl{grid-template-columns:1fr}.cut header{font-size:13px}}
</style></head><body><main><h1>${escapeHtml(input.title)}</h1><p class="sub">${escapeHtml(input.projectId)} · ${input.cuts.length} narrative cuts / ${Math.max(0,input.cuts.length-1)} transition implementations · planned runtime ${ms(input.totalMs)}</p><div class="notice">Timing is an editorial budget until approved TTS/alignment exists. Do not treat these durations as final narration timecode.</div>${rows}</main></body></html>`;
}

export class CutListCliService {
  constructor(private readonly projects: ProjectBootstrapService) {}

  private async withRepository<T>(projectId: string, fn: (repo: SqliteFinalClipRepository, status: ProjectStatus) => Promise<T>): Promise<T> {
    const status = await this.projects.getStatus(projectId);
    const repo = new SqliteFinalClipRepository(status.projectDbPath);
    try { return await fn(repo, status); } finally { repo.close(); }
  }

  async materialize(projectId: string, file: string) {
    return this.withRepository(projectId, async (repo, status) => {
      const plan = parsePlan(await readProjectJson(status.projectRoot, file));
      const chain = orderedLinkChain(await repo.listActiveLinks(projectId));
      if (plan.entries.length !== chain.length + 1) {
        throw new CutListCliError("CUTLIST_INPUT_INVALID", "Cut-list entries must equal the linked Scene count (links + 1).");
      }
      const clips = new Map((await repo.listActiveClips(projectId)).map(clip => [clip.linkId, clip]));
      const cuts: MaterializedCut[] = [];
      for (let index = 0; index < plan.entries.length; index += 1) {
        const entry = plan.entries[index]!;
        const outgoingLink = chain[index];
        const sceneId = outgoingLink === undefined ? chain[index - 1]!.toSceneId : outgoingLink.fromSceneId;
        const outgoing = outgoingLink === undefined ? undefined : clips.get(outgoingLink.id);
        if (outgoingLink !== undefined && (
          outgoing === undefined || outgoing.stale || outgoing.linkRevision !== outgoingLink.revision || outgoing.finalDesignApprovalId === undefined
        )) {
          throw new CutListCliError("CUTLIST_STATE", `Cut ${index + 1} requires a current approved WF-11 clip for Link ${outgoingLink.id}.`);
        }
        const mediaId = outgoing === undefined ? chain[index - 1]!.toMediaId : outgoing.startMediaId;
        if (mediaId === undefined) {
          throw new CutListCliError("CUTLIST_STATE", `Cut ${index + 1} has no approved image media binding.`);
        }
        const media = await repo.getMedia(projectId, mediaId);
        if (media === null || media.mediaType !== "IMAGE" || media.mediaStatus !== "AVAILABLE") {
          throw new CutListCliError("CUTLIST_STATE", `Cut ${index + 1} image media is not currently available.`);
        }
        const output: MaterializedCut = {
          cutNo: index + 1,
          sceneId,
          ...entry,
          image: { id: media.id, relativePath: media.relativePath, ...(media.width === undefined ? {} : { width: media.width }), ...(media.height === undefined ? {} : { height: media.height }) },
          ...(outgoing === undefined ? {} : {
            outgoing: {
              clipId: outgoing.id,
              clipMode: outgoing.clipMode,
              transitionMethod: outgoing.transitionMethod,
              durationMs: outgoing.durationMs,
              cameraMove: outgoing.cameraMove,
              subjectMotion: outgoing.subjectMotion,
              environmentMotion: outgoing.environmentMotion,
              providerExecutionRequired: outgoing.providerExecutionRequired
            }
          }),
          estimatedDurationMs: entry.baseHoldMs + (outgoing?.durationMs ?? 0)
        };
        cuts.push(output);
      }
      const totalMs = cuts.reduce((sum, cut) => sum + cut.estimatedDurationMs, 0);
      const outputDir = path.join(status.projectRoot, "08_editor", "cut-list");
      await mkdir(outputDir, { recursive: true });
      const materialized = {
        schemaVersion: "1.0",
        kind: "VPF_MATERIALIZED_CUT_LIST",
        projectId,
        title: plan.title,
        timingStatus: "EDITORIAL_BUDGET_PENDING_TTS_ALIGNMENT",
        estimatedRuntimeMs: totalMs,
        cuts
      };
      const jsonPath = path.join(outputDir, "cut-list.materialized.json");
      const htmlPath = path.join(outputDir, "cut-list.html");
      await writeFile(jsonPath, JSON.stringify(materialized, null, 2) + "\n", "utf8");
      await writeFile(htmlPath, renderHtml({ title: plan.title, projectId, totalMs, cuts }), "utf8");
      return {
        projectId,
        cutCount: cuts.length,
        transitionClipCount: chain.length,
        providerClipCount: cuts.filter(cut => cut.outgoing?.providerExecutionRequired).length,
        editorialClipCount: cuts.filter(cut => cut.outgoing !== undefined && !cut.outgoing.providerExecutionRequired).length,
        estimatedRuntimeMs: totalMs,
        timingStatus: materialized.timingStatus,
        jsonPath,
        htmlPath
      };
    });
  }
}
