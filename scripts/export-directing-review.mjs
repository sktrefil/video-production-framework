import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) =>
  arg.startsWith("--") ? [...pairs, [arg.slice(2), all[index + 1]]] : pairs, []));
if (!args.out || (!args.spec && (!args.db || !args.project)))
  throw new Error("Use --db <project.db> --project <id> --out <review.html>, or --spec <clip_production_spec.json> --out <review.html>.");

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
let spec, prompts = {}, images = [], clips = [], reviews = [], sceneTiming = {scenes:[]}, story = {scenes:[]}, tts = {sections:[]}, provenance = "Example only; no canonical approval";
let projectRoot;
if (args.db) {
  const db = new DatabaseSync(resolve(args.db), {readOnly:true});
  projectRoot = await realpath(args.root ?? dirname(resolve(args.db)));
  try {
    const row = db.prepare("SELECT spec_json, revision, spec_sha256 FROM production_clip_specs WHERE project_id=? AND lifecycle_status='ACTIVE' ORDER BY revision DESC LIMIT 1").get(args.project);
    if (!row) throw new Error("No active clip production spec.");
    spec = JSON.parse(row.spec_json);
    provenance = `Canonical clip revision ${row.revision} · SHA-256 ${row.spec_sha256}`;
    const artifact = (table, type) => {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return {};
      const record = db.prepare(`SELECT artifact_json FROM ${table} WHERE project_id=? AND artifact_type=? AND lifecycle_status='ACTIVE' ORDER BY revision DESC LIMIT 1`).get(args.project, type);
      return record ? JSON.parse(record.artifact_json) : {};
    };
    prompts = artifact("agent3_visual_artifacts", "prompt_bundle_spec");
    story = artifact("agent2_story_audio_artifacts", "story_spec");
    tts = artifact("agent2_story_audio_artifacts", "tts_manifest");
    const timingRow = db.prepare("SELECT spec_json FROM production_scene_timing_specs WHERE project_id=? AND lifecycle_status='ACTIVE' ORDER BY revision DESC LIMIT 1").get(args.project);
    sceneTiming = timingRow ? JSON.parse(timingRow.spec_json) : {scenes:[]};
    images = artifact("production_tail_artifacts", "generated_images").images ?? [];
    clips = artifact("production_tail_artifacts", "generated_clips").clips ?? [];
    reviews = artifact("production_tail_artifacts", "clip_qc_result").directing_reviews ?? [];
  } finally { db.close(); }
} else spec = JSON.parse(await readFile(resolve(args.spec), "utf8"));

async function image(id) {
  const found = images.find(item => item.state_image_id === id);
  if (!found || !projectRoot) return `<p class="pending">${esc(id)} · 아직 생성된 이미지 없음</p>`;
  const absolute = await realpath(resolve(projectRoot, found.relative_path));
  const rel = relative(projectRoot, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Image path escapes project root.");
  const bytes = await readFile(absolute);
  return `<figure><img alt="${esc(id)}" src="data:image/png;base64,${bytes.toString("base64")}"><figcaption>${esc(id)} · ${esc(found.sha256)}</figcaption></figure>`;
}

const cards = await Promise.all(spec.clips.map(async clip => {
  const d = clip.directing;
  const prompt = prompts.video_prompts?.find(item => item.clip_id === clip.clip_id);
  const video = clips.find(item => item.clip_id === clip.clip_id);
  const review = reviews.find(item => item.clip_id === clip.clip_id);
  const scene = sceneTiming.scenes?.find(item => item.scene_id === clip.scene_id);
  const storyScene = story.scenes?.find(item => item.scene_id === clip.scene_id);
  const rangeStart = d?.timeline_start_sec;
  const rangeEnd = d?.timeline_end_sec;
  const ttsSections = (tts.sections ?? []).filter(item => rangeStart === undefined || rangeEnd === undefined ||
    (item.timeline_end_sec > rangeStart && item.timeline_start_sec < rangeEnd));
  const rows = d ? ["story","action","space","start","subject_motion","camera_path","reveal","end","handoff","locks","risk","fallback"]
    .map(key => `<tr><th>${esc(key.toUpperCase())}</th><td>${esc(d[key].ko)}</td><td lang="en">${esc(d[key].en)}</td></tr>`).join("") : "";
  const imagePrompts = (prompts.image_prompts ?? []).filter(item => [clip.state_images.entry,clip.state_images.target].includes(item.state_image_id));
  return `<article id="${esc(clip.clip_id)}"><h2>${esc(clip.clip_id)} <small>${esc(clip.scene_id)}</small></h2>
    <p>${d ? `TTS ${d.timeline_start_sec}–${d.timeline_end_sec}s · 원본 사용 ${d.source_in_sec}–${d.source_out_sec}s · 공개 마감 ${d.reveal_deadline_sec}s · ${esc(d.image_mode)}` : "기존 v1 계획 · 연출 카드 미작성"}
    · 편집 ${clip.editorial_duration_sec}s / 생성 ${clip.generation_duration_sec ?? "미정"}s</p>
    <h3>대본 · 실제 TTS 연결</h3><pre>${esc(JSON.stringify({
      scene_script_ko: scene?.script_ko ?? storyScene?.script_ko ?? null,
      scene_script_en: scene?.script_en ?? storyScene?.script_en ?? null,
      scene_tts: scene?.tts ?? null,
      overlapping_tts_sections: ttsSections.map(item => ({section_id:item.section_id,timeline_start_sec:item.timeline_start_sec,timeline_end_sec:item.timeline_end_sec,text:item.text}))
    },null,2))}</pre>
    <div class="images">${d?.image_mode === "PREVIOUS_END_FRAME" ? `<p>이전 채택 클립 ${esc(d.previous_clip_id)}의 사용 구간 끝 프레임</p>` : await image(clip.state_images.entry)}
    ${!d || d.image_mode === "START_END" ? await image(clip.state_images.target) : "<p>종료 상태는 END에 설계 · 종료 이미지 파일은 생략</p>"}</div>
    <div class="scroll"><table><thead><tr><th>연출</th><th>한국어</th><th>English</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p>레퍼런스: ${esc(d?.reference_ids.join(", ") || "없음")}</p>
    <h3>영상 프롬프트</h3><div class="pair"><pre>${esc(prompt?.prompt_ko ?? "아직 컴파일하지 않음")}</pre><pre lang="en">${esc(prompt?.provider_prompt_en ?? "Not compiled")}</pre></div>
    ${imagePrompts.map(item=>`<details><summary>${esc(item.state_image_id)} 이미지 프롬프트</summary><div class="pair"><pre>${esc(item.prompt_ko)}</pre><pre lang="en">${esc(item.provider_prompt_en)}</pre></div></details>`).join("")}
    <h3>생성 영상 · 검수 기록</h3><pre>${esc(JSON.stringify({video:video ?? null,review:review ?? null},null,2))}</pre></article>`;
}));
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(spec.project_id)} 연출 검토</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#f5f3ef;color:#222;margin:0;padding:24px;max-width:1400px;margin:auto}article{background:white;padding:24px;margin:24px 0;border-radius:12px}h1,h2{line-height:1.3}small,.pending{color:#666}.images,.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;aspect-ratio:16/9;object-fit:contain}figure{margin:0}figcaption{overflow-wrap:anywhere;font-size:12px}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #ddd}td{width:44%}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 system-ui;background:#f6f6f6;padding:16px}.scroll{overflow:auto}@media(max-width:700px){body{padding:12px}article{padding:16px}.images,.pair{grid-template-columns:1fr}}</style>
<h1>${esc(spec.project_id)} · 연출 디렉션 검토</h1><p>${esc(provenance)}</p><p>검토용 스냅샷입니다. 승인과 최신 상태는 project.db에서 확인합니다.</p>${cards.join("")}</html>`;
await mkdir(dirname(resolve(args.out)),{recursive:true});
await writeFile(resolve(args.out),html,"utf8");
console.log(pathToFileURL(resolve(args.out)).href);
