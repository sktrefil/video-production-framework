import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

throw new Error('SUPERSEDED: the silent-video pack incorrectly forbids sound effects. Use scripts/build-db-cooper-voice-free-video-pack.mjs and output/db-cooper-v3/storyboard-lock-v1/voice-free-video-prompts-v1/index.html.');

const mode = process.argv[2];
if (process.argv.length !== 3 || !['--build', '--check'].includes(mode)) {
  throw new Error('Usage: node scripts/build-db-cooper-silent-video-pack.mjs --build|--check');
}
const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const destination = resolve(root, 'silent-video-prompts-v1');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const silentClause = `NON_REALISTIC_STYLIZED hand-drawn 2D ink-noir video only: no photorealism, live action or documentary reenactment.
SILENT VIDEO ONLY — DO NOT GENERATE AUDIO.
For Google Flow, create the video visuals only. Do not generate voice, narration, dialogue, spoken words, singing, humming, crowd voices, sound effects, music, ambience, airport announcements, engine sounds, wind, footsteps or an automatic soundtrack. Do not create an audio track. Disable automatic audio and export mute / without an audio stream if the tool supports it. Approved Korean TTS and all sound design will be added separately in editing. Never imitate or regenerate the approved narration. Any SOUND DESIGN, SOUND INTENT or sound cue in the source directing text below is an EDITING NOTE ONLY, never a request to synthesize audio.
`;
const activeRevision = { 1: 4, 2: 4, 3: 4, 4: 3, 5: 3, 6: 5, 7: 4, 8: 3 };
const plan = JSON.parse(await readFile(resolve(root, 'chain-plan.json'), 'utf8'));
if (plan.shots.length !== 30 || plan.manager_story_gate !== 'PASS') {
  throw new Error('Expected the reviewed 30-shot Cooper chain.');
}
const entries = [];
const pages = [];
for (let ordinal = 1; ordinal <= 30; ordinal++) {
  const id = `CL${String(ordinal).padStart(2, '0')}`;
  const shot = plan.shots.find(item => item.id === id);
  const revision = activeRevision[ordinal] ?? 2;
  const sourceRelative = `prompts/${id}_v${revision}_VIDEO.prompt.txt`;
  const source = await readFile(resolve(root, sourceRelative), 'utf8');
  if (!source.includes(id)) {
    throw new Error(`${id} source prompt does not match the expected clip: ${sourceRelative}`);
  }
  const sourceHash = sha256(Buffer.from(source));
  const hasSilentRule = source.includes('SILENT VIDEO ONLY — DO NOT GENERATE AUDIO.') &&
    source.includes('Do not create an audio track');
  const composed = hasSilentRule ? source.trimEnd() + '\n' :
    `${id} | GOOGLE FLOW SILENT VIDEO REVISION | SOURCE ${id}_v${revision}_VIDEO.prompt.txt\n\n${silentClause}\nSOURCE VISUAL DIRECTING FOLLOWS:\n\n${source.trimEnd()}\n\nSILENT VIDEO ONLY — DO NOT GENERATE AUDIO. Add approved TTS and all sound later in editing.\n`;
  if (!composed.includes('SILENT VIDEO ONLY — DO NOT GENERATE AUDIO.') ||
      !composed.includes('Do not create an audio track')) {
    throw new Error(`${id} silent-video rule missing.`);
  }
  const promptFile = `${id}_VIDEO.prompt.txt`;
  const htmlFile = `${id}-video-prompt.html`;
  const promptBytes = Buffer.from(composed);
  const promptHash = sha256(promptBytes);
  const warning = ordinal > 8 ?
    '이 샷은 프롬프트 초안입니다. START·END 실제 이미지와 이전 클립의 사용 종료 프레임, 확정 TTS 타이밍을 확인한 뒤 생성하세요.' :
    '이전 클립의 실제 사용 종료 프레임과 현재 START·END 자산을 확인한 뒤 사용하세요. 기존 제작 클립의 원본 프롬프트·해시는 보존됩니다.';
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper ${id} | 무음 영상 프롬프트</title>
<style>:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:dark;background:#101a21;color:#f0eee8}body{margin:0;line-height:1.6}header{background:#1c303c;padding:32px max(22px,calc((100vw - 980px)/2));border-bottom:2px solid #b68a50}main{max-width:980px;margin:auto;padding:24px 22px 70px}h1{margin:0 0 6px}small,.meta{color:#cad1d1}.alert{border-left:4px solid #e7ae63;background:#24333a;padding:13px 17px;margin:18px 0}article{background:#1b2a33;border:1px solid #4c626c;border-radius:9px;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0c161b;border:1px solid #506471;border-radius:6px;padding:18px;font:14px/1.65 Consolas,monospace}button{border:0;border-radius:5px;background:#e5b371;color:#10202b;font-weight:800;padding:10px 14px;cursor:pointer}a{color:#f0c280}</style></head><body>
<header><small>D.B. COOPER / ${id} / ${escapeHtml(shot.scene)} / SILENT PACK v1</small><h1>${id} 무음 영상 프롬프트</h1><span>생성 ${shot.source_seconds}초 · 편집 사용 ${shot.keep_seconds}초 · 타임라인 ${shot.timeline_start}–${shot.timeline_end}초</span></header>
<main><p class="alert"><strong>Google Flow에서 모든 오디오 생성 금지.</strong> 음성·대사·효과음·음악·환경음·자동 사운드트랙을 생성하지 않습니다. Flow 오디오 옵션을 끄고, 확정 TTS와 음향은 편집에서 넣습니다.</p><p class="alert">${escapeHtml(warning)}</p>
<article><button id="copy" type="button">프롬프트 복사</button><p class="meta">원본: <code>${escapeHtml(sourceRelative)}</code><br>원본 SHA-256: <code>${sourceHash}</code><br>이 무음 프롬프트 SHA-256: <code>${promptHash}</code></p><pre id="prompt">${escapeHtml(composed)}</pre><a href="${promptFile}">프롬프트 TXT 열기</a></article><p><a href="index.html">전체 30샷 목록</a></p></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{let b=document.getElementById('copy'),v=document.getElementById('prompt').textContent;try{await navigator.clipboard.writeText(v)}catch{let a=document.createElement('textarea');a.value=v;document.body.append(a);a.select();document.execCommand('copy');a.remove()}b.textContent='복사 완료';setTimeout(()=>b.textContent='프롬프트 복사',1600)});</script></body></html>
`;
  entries.push({ clip_id: id, scene: shot.scene, source_prompt: sourceRelative,
    source_sha256: sourceHash, silent_prompt: `silent-video-prompts-v1/${promptFile}`,
    silent_prompt_sha256: promptHash, html: `silent-video-prompts-v1/${htmlFile}`,
    media_production_status: ordinal > 8 ? 'PROMPT_ONLY_REVIEW_REQUIRED' : 'REVISED_PROMPT_FOR_FUTURE_GENERATION' });
  pages.push({ path: resolve(destination, promptFile), bytes: promptBytes });
  pages.push({ path: resolve(destination, htmlFile), bytes: Buffer.from(html) });
}
const rows = entries.map(item => `<tr><td>${item.clip_id}</td><td>${item.scene}</td><td><a href="${item.clip_id}-video-prompt.html">HTML · 복사</a></td><td><a href="${item.clip_id}_VIDEO.prompt.txt">TXT</a></td><td>${item.media_production_status}</td></tr>`).join('\n');
const index = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | 30샷 무음 영상 프롬프트</title><style>:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:dark;background:#101a21;color:#f0eee8}body{max-width:1050px;margin:auto;padding:30px 20px;line-height:1.6}h1{margin-bottom:6px}p{color:#cad1d1}.notice{border-left:4px solid #e7ae63;background:#24333a;padding:14px 18px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #526471;padding:10px;text-align:left}a{color:#f0c280}@media(max-width:650px){td:last-child,th:last-child{display:none}}</style></head><body><h1>D.B. Cooper · 30샷 무음 영상 프롬프트</h1><p class="notice">Google Flow에서는 영상만 생성합니다. 음성, 대사, 효과음, 음악과 자동 오디오를 생성하지 않고 확정 TTS 및 음향은 편집에서 넣습니다. 이 파일은 기존 제작 기록을 보존한 새 프롬프트 패키지입니다. START·END 이미지와 편집 사용 구간은 각 샷에서 별도로 확인하세요.</p><table><thead><tr><th>샷</th><th>장면</th><th>영상 HTML</th><th>프롬프트 TXT</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></body></html>\n`;
pages.push({ path: resolve(destination, 'index.html'), bytes: Buffer.from(index) });
const manifest = JSON.stringify({ schema: 'db-cooper-silent-video-prompts.v1', project_id: plan.project_id,
  status: 'PROMPT_PACKAGE_NOT_CANONICAL_APPROVAL', audio_generation: 'FORBIDDEN',
  generated_from_locked_plan_sha256: sha256(await readFile(resolve(root, 'chain-plan.json'))),
  entries }, null, 2) + '\n';
pages.push({ path: resolve(destination, 'manifest.json'), bytes: Buffer.from(manifest) });
if (mode === '--build') await mkdir(destination, { recursive: true });
for (const page of pages) {
  if (await exists(page.path)) {
    if (!(await readFile(page.path)).equals(page.bytes)) {
      throw new Error(`Existing silent pack file differs; create a new package revision: ${page.path}`);
    }
  } else if (mode === '--build') {
    await writeFile(page.path, page.bytes, { flag: 'wx' });
  } else {
    throw new Error(`Silent pack file missing: ${page.path}`);
  }
}
console.log(`${mode === '--build' ? 'BUILT' : 'VERIFIED'}: 30 silent video prompts, 30 HTML pages, manifest and index.`);
console.log(resolve(destination, 'index.html'));
