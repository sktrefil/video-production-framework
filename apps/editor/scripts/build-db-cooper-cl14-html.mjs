import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = JSON.parse(await readFile(at('CL14-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const shot = JSON.parse(planBytes).shots.find(x => x.id === 'CL14');
if (sha(planBytes) !== candidate.base_plan_sha256 || shot?.image_mode !== 'SINGLE' ||
    candidate.proposed_image_mode !== 'START_TARGET_OPTIONAL_END' ||
    shot.keep_seconds !== 9 || shot.voice_slot_relative.start !== 1 || shot.voice_slot_relative.end !== 6.091) {
  throw new Error('CL14 candidate differs from locked plan or TTS.');
}
const english = await readFile(at(candidate.prompts.video), 'utf8');
const korean = await readFile(at(candidate.video_prompt_korean_translation.path), 'utf8');
if (sha(english) !== candidate.prompt_sha256.video ||
    sha(korean) !== candidate.video_prompt_korean_translation.sha256 ||
    !english.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !english.includes('Generate synchronized NONVERBAL sound effects') ||
    !korean.includes('음성 생성 금지 — 효과음은 유지')) {
  throw new Error('CL14 bilingual prompt hash or audio rule changed.');
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL14 영상 프롬프트 v3</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Segoe UI",sans-serif;background:#0d171e;color:#f2efe8}*{box-sizing:border-box}body{margin:0;line-height:1.65}header{padding:42px max(24px,calc((100vw - 1080px)/2));background:linear-gradient(110deg,#203340,#101a22);border-bottom:1px solid #51636b}main{max-width:1080px;margin:auto;padding:30px 24px 80px}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 9px}.eyebrow{color:#e9bd79;letter-spacing:.15em;font-weight:800;font-size:.82rem}.lead{max-width:900px;color:#d0d9dc}.pill{display:inline-block;border:1px solid #a88452;background:#2a2a22;color:#f5d99e;padding:5px 12px;border-radius:99px}.card{background:#1b2a33;border:1px solid #455962;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:3px solid #e5b875;padding:14px 18px;background:#20313b;margin:18px 0}h2{margin:0 0 12px;font-size:1.35rem}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}button{background:#e8b975;color:#12212b;border:0;border-radius:7px;padding:10px 16px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,monospace;background:#0d181f;border:1px solid #536875;border-radius:8px;padding:18px;margin:12px 0}code,a{color:#f3c984}.beats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:22px 0}.beats div{padding:12px;background:#233844;border-top:3px solid #dcae6c;font-size:.9rem}.beats b{display:block;color:#f2c783}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;border:1px solid #4a616d;border-radius:7px}@media(max-width:760px){header{padding:30px 24px}.beats,.boards{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC04 / CL14 / V3</div><h1>CL14 영상 생성 프롬프트</h1><p class="lead">CL13의 후방 객실에서 별도의 조종실 화면으로 컷합니다. 하나의 계기판을 따라 짧게 전진하고 계단 표시등 하나가 켜지는 순간에 정착합니다.</p><span class="pill">2D 잉크 누아르 · 16:9 · 10초 생성 / 앞 9초 사용 · 효과음 포함</span></header>
<main><p class="notice"><strong>START 출처:</strong> <a href="${candidate.start_binding.start_path}">CL14_START_v3.png</a>는 새로 생성하는 독립 조종실 이미지입니다. CL13.mp4에서 추출하지 않습니다. 기존 CL13 v3 영상은 수화기 중복으로 <a href="evidence/CL13_v3_visual-qc.json">시각 검수 제외</a> 상태입니다.</p>
<p class="notice"><strong>END 설계 차이:</strong> 잠긴 기본 계획은 START 하나만 쓰는 SINGLE 방식입니다. 요청에 따라 <a href="${candidate.prompts.end}">선택적 END 목표</a>를 후보로 추가했습니다. 이는 기본 계획의 승인 변경이 아니며 CL15 START도 이 이미지가 아닌 CL14 영상의 실제 앞 9초 종료 프레임에서 추출합니다.</p>
<p class="notice"><strong>음성 생성 금지, 효과음 생성:</strong> 사람 목소리는 만들지 않습니다. 회선 잡음, 표시등 클릭, 기내 저음은 생성하고 승인된 한국어 TTS는 편집에서 넣습니다.</p>
<div class="beats"><div><b>START</b>고정 인터폰과 꺼진 표시등</div><div><b>한 경로</b>표시등으로 짧고 빠르게 전진</div><div><b>END</b>표시등 한 번 점등 후 유지</div></div>
<section class="card"><h2>VS Code 실행 순서</h2><p><code>apps/editor</code>에서 실행하세요. START와 END를 각각 열어 수화기가 정확히 하나인지 확인한 뒤 Google Flow에 첨부합니다. 전체 빌드·테스트는 반복하지 않습니다.</p><pre>node scripts/generate-db-cooper-cl14-images.mjs --check
node scripts/generate-db-cooper-cl14-images.mjs --generate-start
# START 확인 후
node scripts/generate-db-cooper-cl14-images.mjs --generate-end</pre><p>START 지시문: <a href="${candidate.prompts.start}">CL14_v3_START.prompt.txt</a><br>END 지시문: <a href="${candidate.prompts.end}">CL14_v3_END.prompt.txt</a><br><a href="CL14-v3-chain-candidate.json">연결·해시 후보 기록</a></p></section>
<section class="card"><div class="top"><h2>영상 프롬프트 · 영문 원문</h2><button id="copy" type="button">영문 프롬프트 복사</button></div><p>Google Flow에 검수한 START·END를 첨부하고 아래 영문을 사용하세요. 결과는 <code>clips/CL14.mp4</code>로 저장합니다.</p><pre id="english">${escape(english)}</pre><p><a href="${candidate.prompts.video}">영문 TXT</a></p></section>
<section class="card"><h2>영상 프롬프트 · 한국어 전체 번역</h2><p>검토용 번역입니다. Google Flow에는 영문 원문을 사용하세요.</p><pre>${escape(korean)}</pre><p><a href="${candidate.video_prompt_korean_translation.path}">한국어 TXT</a></p></section>
<section class="card"><h2>대본·TTS 연결</h2><p>승인된 내레이션: “${escape(candidate.narration)}” TTS는 사용 구간 내 1.000~6.091초에 배치합니다. 표시등이 켜졌다는 사실과 계단의 정확한 상태를 직접 봤다는 주장을 구분합니다.</p></section>
<section class="card"><h2>마스터 보드</h2><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드"></div></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('english').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영문 프롬프트 복사',1600)});</script></body></html>`;
const target = at('CL14-video-prompt-v3.html');
await writeFile(target, html, 'utf8');
console.log(target);
