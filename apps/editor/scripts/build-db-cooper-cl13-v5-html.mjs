import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = JSON.parse(await readFile(at('CL13-v5-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const shot = JSON.parse(planBytes).shots.find(value => value.id === 'CL13');
if (sha(planBytes) !== candidate.base_plan_sha256 || shot?.source_seconds !== 10 ||
    shot?.keep_seconds !== 9 || shot?.voice_slot_relative.start !== 1.3 ||
    shot?.voice_slot_relative.end !== 6.173) throw new Error('CL13 locked plan or TTS timing changed.');
const english = await readFile(at(candidate.prompts.video), 'utf8');
const korean = await readFile(at(candidate.video_prompt_korean_translation.path), 'utf8');
if (sha(english) !== candidate.prompt_sha256.video ||
    sha(korean) !== candidate.video_prompt_korean_translation.sha256 ||
    !english.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !english.includes('Generate synchronized NONVERBAL sound effects') ||
    !korean.includes('음성 생성 금지 — 효과음은 유지')) throw new Error('Bilingual prompt or audio rule changed.');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL13 영상 프롬프트 v5</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Segoe UI",sans-serif;background:#0d171e;color:#f2efe8}*{box-sizing:border-box}body{margin:0;line-height:1.65}header{padding:42px max(24px,calc((100vw - 1080px)/2));background:linear-gradient(110deg,#203340,#101a22);border-bottom:1px solid #51636b}main{max-width:1080px;margin:auto;padding:30px 24px 80px}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 9px}.eyebrow{color:#e9bd79;letter-spacing:.15em;font-weight:800;font-size:.82rem}.lead{max-width:900px;color:#d0d9dc}.pill{display:inline-block;border:1px solid #a88452;background:#2a2a22;color:#f5d99e;padding:5px 12px;border-radius:99px}.card{background:#1b2a33;border:1px solid #455962;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:3px solid #e5b875;padding:14px 18px;background:#20313b;margin:18px 0}h2{margin:0 0 12px;font-size:1.35rem}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}button{background:#e8b975;color:#12212b;border:0;border-radius:7px;padding:10px 16px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,monospace;background:#0d181f;border:1px solid #536875;border-radius:8px;padding:18px;margin:12px 0}code,a{color:#f3c984}.beats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:22px 0}.beats div{padding:12px;background:#233844;border-top:3px solid #dcae6c;font-size:.9rem}.beats b{display:block;color:#f2c783}@media(max-width:760px){header{padding:30px 24px}.beats{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC04 / CL13 / V5</div><h1>CL13 영상 생성 프롬프트</h1><p class="lead">CL12의 실제 마지막 화면인 닫힌 커튼에서 출발합니다. 짧은 커튼 차폐 후 한 공간에서 닫힌 패널의 반응 없음과 고정된 인터폰 스피커 신호를 보여줍니다.</p><span class="pill">2D 잉크 누아르 · 16:9 · 10초 생성 / 앞 9초 사용 · 효과음 포함</span></header>
<main><p class="notice"><strong>START 출처:</strong> <a href="assets/CL13_START.png">CL13_START.png</a>는 CL12.mp4의 실제 사용 마지막 프레임 239(9.958333초)에서 추출했습니다. <a href="CL13-v5-chain-candidate.json">연결·해시 후보 기록</a>.</p>
<p class="notice"><strong>END 시점:</strong> 편집에서는 9초에서 자릅니다. END 목표 구도에 약 8.7초까지 도달하고 10초까지 유지하세요. CL14는 별도의 조종실 컷으로 시작하므로 CL13에서 CL14 START를 추출하지 않습니다.</p>
<p class="notice"><strong>음성 생성 금지, 효과음 생성:</strong> Google Flow에서 내레이션·대화·교신 음성을 만들지 않습니다. 커튼, 금속 저항, 기내 바람, 인터폰 연결음은 화면에 맞춰 생성합니다. 승인된 한국어 TTS는 편집에서 별도로 넣습니다.</p>
<div class="beats"><div><b>도입</b>커튼 차폐와 빠른 전진</div><div><b>본동작</b>닫힌 금속 패널을 누르는 시도 한 번</div><div><b>종료</b>패널을 유지하며 작은 스피커 연결 신호</div></div>
<section class="card"><h2>VS Code 실행</h2><p>작업 위치: <code>apps/editor</code>. START는 이미 추출했습니다. END 생성 전 아래 검사만 실행하면 됩니다. 전체 빌드·테스트는 반복하지 않습니다.</p><pre>powershell -NoProfile -File scripts/extract-db-cooper-used-exit.ps1 -Clip CL12 -Check
node scripts/generate-db-cooper-cl13-v5-end.mjs --check
node scripts/generate-db-cooper-cl13-v5-end.mjs --generate-end</pre><p>END 지시문: <a href="${candidate.prompts.end}">CL13_v5_END.prompt.txt</a><br>START: <code>${candidate.start_binding.start_path}</code><br>END: <code>${candidate.end_target_path}</code></p></section>
<section class="card"><div class="top"><h2>영상 프롬프트 · 영문 원문</h2><button id="copy" type="button">영문 프롬프트 복사</button></div><p>Google Flow에 START와 생성·검수한 END를 첨부하고 아래 영문을 사용하세요. 결과는 <code>clips/CL13_v5.mp4</code>로 저장합니다.</p><pre id="english">${escape(english)}</pre><p><a href="${candidate.prompts.video}">영문 TXT</a></p></section>
<section class="card"><h2>영상 프롬프트 · 한국어 전체 번역</h2><p>검토용 번역입니다. Google Flow에는 영문 원문을 복사하세요.</p><pre>${escape(korean)}</pre><p><a href="${candidate.video_prompt_korean_translation.path}">한국어 TXT</a></p></section>
<section class="card"><h2>대본·TTS 연결</h2><p>승인된 내레이션: “${escape(candidate.narration)}” TTS는 사용 구간 내 1.300~6.173초에 배치됩니다.</p></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('english').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영문 프롬프트 복사',1600)});</script></body></html>`;
const target = at('CL13-video-prompt-v5.html');
await writeFile(target, html, 'utf8');
console.log(target);
