import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = JSON.parse(await readFile(at('CL12-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const shot = JSON.parse(planBytes).shots.find(value => value.id === 'CL12');
if (sha(planBytes) !== candidate.base_plan_sha256 || shot?.keep_seconds !== 10 ||
    shot?.voice_slot_relative.start !== 0.2 || shot?.voice_slot_relative.end !== 7.4) {
  throw new Error('CL12 plan or FINAL TTS timing changed.');
}
const english = await readFile(at(candidate.prompts.video), 'utf8');
const korean = await readFile(at(candidate.video_prompt_korean_translation.path), 'utf8');
if (sha(english) !== candidate.prompt_sha256.video ||
    sha(korean) !== candidate.video_prompt_korean_translation.sha256 ||
    !english.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !english.includes('Generate synchronized NONVERBAL sound effects') ||
    !korean.includes('음성 생성 금지 — 효과음은 유지')) {
  throw new Error('CL12 bilingual prompt hash or audio rule changed.');
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL12 영상 프롬프트 v3</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Segoe UI",sans-serif;background:#0d171e;color:#f2efe8}*{box-sizing:border-box}body{margin:0;line-height:1.65}header{padding:42px max(24px,calc((100vw - 1080px)/2));background:linear-gradient(110deg,#203340,#101a22);border-bottom:1px solid #51636b}main{max-width:1080px;margin:auto;padding:30px 24px 80px}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 9px}.eyebrow{color:#e9bd79;letter-spacing:.15em;font-weight:800;font-size:.82rem}.lead{max-width:900px;color:#d0d9dc}.pill{display:inline-block;border:1px solid #a88452;background:#2a2a22;color:#f5d99e;padding:5px 12px;border-radius:99px}.card{background:#1b2a33;border:1px solid #455962;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:3px solid #e5b875;padding:14px 18px;background:#20313b;margin:18px 0}h2{margin:0 0 12px;font-size:1.35rem}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}button{background:#e8b975;color:#12212b;border:0;border-radius:7px;padding:10px 16px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,monospace;background:#0d181f;border:1px solid #536875;border-radius:8px;padding:18px;margin:12px 0}code{color:#f3c984}a{color:#f3c984}.beats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:22px 0}.beats div{padding:12px;background:#233844;border-top:3px solid #dcae6c;font-size:.9rem}.beats b{display:block;color:#f2c783}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;border:1px solid #4a616d;border-radius:7px}@media(max-width:760px){header{padding:30px 24px}.beats,.boards{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC03 / CL12 / V3</div><h1>CL12 영상 생성 프롬프트</h1><p class="lead">CL11의 구름으로 가려진 실제 종료 프레임에서 시작합니다. 짧은 차폐 컷으로 객실 돈가방을 드러내고, 같은 객실 구도에서 매듭·승무원 퇴장·커튼 닫힘을 차례로 보여줍니다.</p><span class="pill">2D 잉크 누아르 · 16:9 · 10초 생성 / 10초 사용 · 효과음 포함</span></header>
<main><p class="notice"><strong>START 출처:</strong> <a href="assets/CL12_START.png">CL12_START.png</a>는 CL11.mp4의 실제 사용 마지막 프레임 239(9.958333초)를 그대로 추출했습니다. 하늘·비행기·검은 구름이 보이는 이 화면을 정확한 첫 프레임으로 사용합니다. 오른쪽 아래 생성 흔적이 영상에 남는지 검수하세요. <a href="CL12-v3-chain-candidate.json">연결·해시 후보 기록</a>.</p>
<p class="notice"><strong>음성 생성 금지, 효과음 생성:</strong> Google Flow에서 내레이션·대화·교신을 만들지 않습니다. 줄 마찰, 발걸음, 커튼 천 소리와 객실 저음은 화면에 맞춰 생성합니다. 승인된 한국어 TTS는 편집에서 별도로 넣습니다.</p>
<div class="beats"><div><b>0~0.6초</b>구름 차폐→객실</div><div><b>0.6~4.6초</b>가방 매듭 한 번</div><div><b>4.6~7.4초</b>승무원 퇴장</div><div><b>7.4~10초</b>커튼이 화면 차폐</div></div>
<section class="card"><h2>VS Code 실행</h2><p>작업 위치: <code>apps/editor</code>. START는 이미 추출했습니다. 이미지 확인 후 END를 생성하세요. 전체 빌드나 테스트는 다시 돌리지 않습니다.</p><pre>powershell -NoProfile -File scripts/extract-db-cooper-used-exit.ps1 -Clip CL11 -Check
node scripts/generate-db-cooper-cl12-end.mjs --check
node scripts/generate-db-cooper-cl12-end.mjs --generate-end</pre><p>END 지시문: <a href="${candidate.prompts.end}">CL12_v3_END.prompt.txt</a><br>START: <code>${candidate.start_binding.start_path}</code><br>END: <code>${candidate.end_target_path}</code></p></section>
<section class="card"><div class="top"><h2>영상 프롬프트 · 영문 원문</h2><button id="copy" type="button">영문 프롬프트 복사</button></div><p>Google Flow에 START와 생성한 END를 첨부하고 아래 영문 원문을 사용하세요. 결과는 <code>clips/CL12.mp4</code>로 저장합니다. 실제 사용 종료 프레임에서 CL13 START를 추출합니다.</p><pre id="english">${escape(english)}</pre><p><a href="${candidate.prompts.video}">영문 TXT</a></p></section>
<section class="card"><h2>영상 프롬프트 · 한국어 전체 번역</h2><p>검토용 번역입니다. Google Flow에는 위 영문 원문을 복사하세요.</p><pre id="korean">${escape(korean)}</pre><p><a href="${candidate.video_prompt_korean_translation.path}">한국어 TXT</a></p></section>
<section class="card"><h2>대본·TTS 연결</h2><p>승인된 내레이션: “${escape(candidate.narration)}” TTS는 클립 내 0.200~7.400초에 배치됩니다. 첫 구절에 돈가방이 신속히 보이고, 끝 구절에 커튼이 닫혀야 합니다.</p></section>
<section class="card"><h2>마스터 보드</h2><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드"></div></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('english').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영문 프롬프트 복사',1600)});</script></body></html>`;
const target = at('CL12-video-prompt-v3.html');
await writeFile(target, html, 'utf8');
console.log(target);
