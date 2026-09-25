import { spawn } from "node:child_process";
import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { ProductionDashboardHub } from "./production-dashboard-hub.js";
import type { ProductionDashboardSnapshotService } from "./production-dashboard-snapshot.js";

const DASHBOARD_HOST = "127.0.0.1";
const DEFAULT_DASHBOARD_PORT = 4174;
const MAX_PORT_ATTEMPTS = 20;

function html(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VPF Production Dashboard</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--panel:#13171c;--card:#181e25;--line:#2b333d;--text:#edf2f7;--muted:#98a5b3;--ok:#58c58a;--run:#67a6ff;--warn:#f2c66d;--bad:#ef7b7b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1180px;margin:auto;padding:24px}.top{display:flex;gap:16px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
h1{font-size:22px;margin:0 0 4px}.muted{color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;margin:18px 0}
.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.stat b{font-size:22px;display:block;margin-top:3px}
.progress{height:12px;background:#222a33;border-radius:999px;overflow:hidden}.progress>i{display:block;height:100%;background:var(--run);width:0;transition:width .25s}
.grid{display:grid;grid-template-columns:1.35fr .65fr;gap:14px}.current{margin-bottom:14px}.rowline{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.status{font-weight:700}.COMPLETE{color:var(--ok)}.RUNNING{color:var(--run)}.MANUAL_EXTERNAL{color:var(--warn)}.FAILED,.BLOCKED{color:var(--bad)}
.images{display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:8px;margin-top:10px}.img{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:7px;min-width:0}.img img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:#080a0d}.img small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:5px}
.action{border-color:#735f2c;background:#19170f}.complete{border-color:#285a3d;background:#0f1813}.events{max-height:320px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.event{padding:5px 0;border-bottom:1px solid var(--line)}
.hidden{display:none!important}.pill{display:inline-block;padding:2px 7px;border:1px solid var(--line);border-radius:999px;font-size:12px}
@media(max-width:800px){main{padding:14px}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.tablewrap{overflow:auto}table{min-width:700px}}
</style>
</head>
<body>
<main>
  <div class="top"><div><h1>VPF LONGFORM PRODUCTION</h1><div id="project" class="muted">Loading...</div></div><div><span id="connection" class="pill">CONNECTING</span></div></div>
  <section class="stats">
    <div class="card stat"><span class="muted">Overall</span><b id="overall">0%</b></div>
    <div class="card stat"><span class="muted">Elapsed</span><b id="elapsed">00:00</b></div>
    <div class="card stat"><span class="muted">Remaining</span><b id="remaining">—</b><small id="confidence" class="muted"></small></div>
    <div class="card stat"><span class="muted">Last activity</span><b id="activity">—</b></div>
  </section>
  <section class="panel current">
    <div class="rowline"><div><b id="current-title">Current task</b><div id="current-detail" class="muted">—</div></div><b id="current-percent">0%</b></div>
    <div class="progress" style="margin-top:10px"><i id="current-bar"></i></div>
  </section>
  <div class="grid">
    <section class="panel"><b>Production stages</b><div class="tablewrap"><table><thead><tr><th>Task</th><th>Status</th><th>Progress</th><th>Elapsed</th><th>Expected / ETA</th><th>Attempt</th></tr></thead><tbody id="tasks"></tbody></table></div></section>
    <section class="panel"><b>Event log</b><div id="events" class="events"></div></section>
  </div>
  <section id="t070-panel" class="panel hidden" style="margin-top:14px"><div class="rowline"><b>T070 Image Generation</b><span id="t070-count"></span></div><div id="images" class="images"></div></section>
  <section id="t080-panel" class="panel action hidden" style="margin-top:14px"><b>ACTION REQUIRED — GOOGLE FLOW</b><p id="t080-summary"></p><div id="clips"></div></section>
  <section id="final-panel" class="panel complete hidden" style="margin-top:14px"><b>PRODUCTION COMPLETE</b><p id="final-summary"></p></section>
</main>
<script>
(() => {
  const q = id => document.getElementById(id);
  let refreshing = false;
  let queued = false;
  const fmt = sec => {
    if (!Number.isFinite(sec) || sec < 0) return "—";
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? [h,m,s].map((v,i)=>i?String(v).padStart(2,"0"):String(v)).join(":") : String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  };
  const eta = value => value ? fmt(value.min_sec)+"–"+fmt(value.max_sec) : "—";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[c]));
  async function refresh(){
    if(refreshing){ queued=true; return; }
    refreshing=true;
    try{
      const res=await fetch("/api/status",{cache:"no-store"});
      if(!res.ok) throw new Error("status "+res.status);
      render(await res.json());
      q("connection").textContent="LIVE";
    }catch(error){
      q("connection").textContent="RECONNECTING";
    }finally{
      refreshing=false;
      if(queued){ queued=false; setTimeout(refresh,50); }
    }
  }
  function render(s){
    q("project").textContent=s.project_id+" · "+s.format+" · "+s.title;
    q("overall").textContent=s.overall_percent.toFixed(1)+"%";
    const current=s.tasks.find(t=>t.task_id===s.current_task);
    q("current-bar").style.width=(current?Math.max(0,Math.min(100,current.percent)):s.final.production_complete?100:0)+"%";
    q("elapsed").textContent=fmt(s.elapsed_sec);
    q("remaining").textContent=eta(s.remaining_eta);
    q("confidence").textContent=s.remaining_eta ? "confidence "+s.remaining_eta.confidence+(s.remaining_eta_excludes_manual_external?" · manual Flow excluded":"") : "";
    q("activity").textContent=s.last_activity_age_sec==null
      ?"—"
      :s.last_activity_age_sec>300
        ?"POSSIBLY STALLED · "+s.last_activity_age_sec+"s"
        :s.last_activity_age_sec+"s ago";
    q("current-title").textContent=current ? current.task_id+" "+current.name : (s.final.production_complete?"Production complete":"No active task");
    q("current-detail").textContent=current ? [current.phase||current.status,current.agent,"attempt "+current.attempt+"/3"].join(" · ") : "—";
    q("current-percent").textContent=current ? current.percent.toFixed(1)+"%" : (s.final.production_complete?"100%":"0%");
    q("tasks").innerHTML=s.tasks.map(t=>"<tr><td><b>"+esc(t.task_id)+"</b><br><span class='muted'>"+esc(t.name)+"</span></td><td class='status "+esc(t.status)+"'>"+esc(t.status)+"</td><td>"+t.percent.toFixed(1)+"%</td><td>"+fmt(t.elapsed_sec)+"</td><td>"+(t.workflow_status==="COMPLETE"?"done":eta(t.eta))+"</td><td>"+t.attempt+"/3</td></tr>").join("");
    q("events").innerHTML=[...s.recent_events].reverse().map(e=>"<div class='event'>"+esc(e.at.slice(11,19))+" <b>"+esc(e.task_id||"RUN")+"</b> "+esc(e.event)+" "+esc(e.verdict||e.phase||"")+"</div>").join("");
    const showImages=s.t070.total>0;
    q("t070-panel").classList.toggle("hidden",!showImages);
    q("t070-count").textContent=s.t070.completed+" / "+s.t070.total+" images";
    q("images").innerHTML=s.t070.items.map(i=>"<div class='img'>"+(i.preview_url?"<img loading='lazy' src='"+esc(i.preview_url)+"' alt='"+esc(i.state_image_id)+"'>":"<div style='aspect-ratio:16/9;display:grid;place-items:center;background:#0b0d10;border-radius:6px;color:#6d7884'>waiting</div>")+"<small>"+(i.ready?"✓ ":"○ ")+esc(i.state_image_id)+"</small></div>").join("");
    q("t080-panel").classList.toggle("hidden",!s.t080.action_required);
    q("t080-summary").textContent=s.t080.action_required ? s.t080.completed+" / "+s.t080.total+" clips available · "+s.t080.missing.length+" missing · "+s.t080.manifest_relative_path : "";
    q("clips").innerHTML=s.t080.action_required ? s.t080.items.map(i=>"<div>"+(i.ready?"✓ ":"○ ")+esc(i.clip_id)+" <span class='muted'>"+esc(i.relative_path)+"</span></div>").join("") : "";
    q("final-panel").classList.toggle("hidden",!s.final.production_complete);
    q("final-summary").textContent=s.final.production_complete ? "Final QC "+(s.final.final_qc_verdict||"available")+" · "+s.final.final_relative_path : "";
  }
  const es=new EventSource("/api/events");
  es.addEventListener("open",()=>{q("connection").textContent="LIVE"});
  es.addEventListener("progress",()=>{refresh()});
  es.addEventListener("error",()=>{q("connection").textContent="RECONNECTING"});
  setInterval(refresh,2000);
  refresh();
})();
</script>
</body>
</html>`;
}

export function resolveDashboardImagePath(projectRoot: string, encodedPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  const normalized = decoded.replaceAll("\\", "/");
  if (
    normalized.includes("\0") ||
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..") ||
    !normalized.startsWith("05_images/generated/")
  ) return null;

  const extension = path.extname(normalized).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return null;

  const absolute = path.resolve(projectRoot, normalized);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

function contentType(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(value));
}

export interface ProductionDashboardHandle {
  host: typeof DASHBOARD_HOST;
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startProductionDashboard(input: {
  projectId: string;
  projectRoot: string;
  snapshot: ProductionDashboardSnapshotService;
  hub: ProductionDashboardHub;
  preferredPort?: number;
  openBrowser?: boolean;
}): Promise<ProductionDashboardHandle> {
  const preferred = input.preferredPort ?? DEFAULT_DASHBOARD_PORT;

  const makeServer = (): Server => createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://" + DASHBOARD_HOST);
      if (req.method !== "GET") {
        json(res, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }
      if (url.pathname === "/") {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(html());
        return;
      }
      if (url.pathname === "/api/status") {
        json(res, 200, await input.snapshot.get(input.projectId));
        return;
      }
      if (url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "connection": "keep-alive",
          "x-accel-buffering": "no"
        });
        res.write(": connected\n\n");
        const unsubscribe = input.hub.subscribe(event => {
          res.write("event: progress\n");
          res.write("data: " + JSON.stringify(event) + "\n\n");
        });
        const heartbeat = setInterval(() => {
          try { res.write(": keepalive\n\n"); } catch { /* disconnected */ }
        }, 15000);
        req.once("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return;
      }
      if (url.pathname.startsWith("/api/images/")) {
        const filename = resolveDashboardImagePath(
          input.projectRoot,
          url.pathname.slice("/api/images/".length)
        );
        if (filename === null) {
          json(res, 403, { error: "IMAGE_PATH_FORBIDDEN" });
          return;
        }
        try {
          const bytes = await readFile(filename);
          res.writeHead(200, {
            "content-type": contentType(filename),
            "cache-control": "no-store"
          });
          res.end(bytes);
        } catch {
          json(res, 404, { error: "IMAGE_NOT_FOUND" });
        }
        return;
      }
      json(res, 404, { error: "NOT_FOUND" });
    })().catch(error => {
      if (!res.headersSent) {
        json(res, 500, {
          error: "DASHBOARD_REQUEST_FAILED",
          message: error instanceof Error ? error.message : String(error)
        });
      } else {
        res.end();
      }
    });
  });

  let server: Server | null = null;
  let selectedPort = preferred;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const candidatePort = preferred === 0 ? 0 : preferred + attempt;
    const candidate = makeServer();
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error & { code?: string }) => {
          candidate.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          candidate.off("error", onError);
          resolve();
        };
        candidate.once("error", onError);
        candidate.once("listening", onListening);
        candidate.listen(candidatePort, DASHBOARD_HOST);
      });
      server = candidate;
      const address = candidate.address();
      selectedPort =
        typeof address === "object" && address !== null
          ? address.port
          : candidatePort;
      break;
    } catch (error) {
      candidate.close();
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "EADDRINUSE" || preferred === 0) throw error;
    }
  }

  if (server === null) {
    throw new Error("No dashboard port was available.");
  }

  const url = "http://" + DASHBOARD_HOST + ":" + selectedPort + "/";
  if (input.openBrowser === true) {
    openDashboardBrowser(url);
  }

  return {
    host: DASHBOARD_HOST,
    port: selectedPort,
    url,
    close: async () => {
      if (!server!.listening) return;
      await new Promise<void>((resolve, reject) => {
        server!.close(error => error ? reject(error) : resolve());
        server!.closeAllConnections();
      });
    }
  };
}

export function openDashboardBrowser(url: string): void {
  try {
    const command =
      process.platform === "win32" ? "cmd.exe" :
      process.platform === "darwin" ? "open" :
      "xdg-open";
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", "start", "", url]
        : [url];
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false
    });
    child.unref();
  } catch {
    // Browser opening is convenience only and must never stop production.
  }
}
