import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = JSON.parse(await readFile(at('CL10-v5-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const shot = JSON.parse(planBytes).shots.find(value => value.id === 'CL10');
if (sha(planBytes) !== candidate.base_plan_sha256 || shot?.keep_seconds !== 10 ||
    shot?.voice_slot_relative.start !== 1.8 || shot?.voice_slot_relative.end !== 6.866) {
  throw new Error('CL10 plan or voice timing changed.');
}
const english = await readFile(at(candidate.prompts.video), 'utf8');
const korean = await readFile(at(candidate.video_prompt_korean_translation.path), 'utf8');
if (sha(english) !== candidate.prompt_sha256.video ||
    sha(korean) !== candidate.video_prompt_korean_translation.sha256 ||
    !english.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !english.includes('Generate synchronized NONVERBAL sound effects') ||
    !korean.includes('음성 생성 금지 — 효과음은 유지')) {
  throw new Error('Bilingual prompt hashes or sound rule changed.');
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL10 영상 프롬프트 v5</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Segoe UI",sans-serif;background:#0d171e;color:#f2efe8}*{box-sizing:border-box}body{margin:0;line-height:1.65}header{padding:42px max(24px,calc((100vw - 1080px)/2));background:linear-gradient(110deg,#203340,#101a22);border-bottom:1px solid #51636b}main{max-width:1080px;margin:auto;padding:30px 24px 80px}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 9px}.eyebrow{color:#e9bd79;letter-spacing:.15em;font-weight:800;font-size:.82rem}.lead{max-width:900px;color:#d0d9dc}.pill{display:inline-block;border:1px solid #a88452;background:#2a2a22;color:#f5d99e;padding:5px 12px;border-radius:99px}.card{background:#1b2a33;border:1px solid #455962;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:3px solid #e5b875;padding:14px 18px;background:#20313b;margin:18px 0}h2{margin:0 0 12px;font-size:1.35rem}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}button{background:#e8b975;color:#12212b;border:0;border-radius:7px;padding:10px 16px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,monospace;background:#0d181f;border:1px solid #536875;border-radius:8px;padding:18px;margin:12px 0}code{color:#f3c984}a{color:#f3c984}.beats{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:22px 0}.beats div{padding:12px;background:#233844;border-top:3px solid #dcae6c;font-size:.9rem}.beats b{display:block;color:#f2c783}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;border:1px solid #4a616d;border-radius:7px}@media(max-width:760px){header{padding:30px 24px}.beats,.boards{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC03 / CL10 / V5</div><h1>CL10 영상 생성 프롬프트</h1><p class="lead">이미 생성한 객실 START를 사용합니다. 카메라는 한 경로로 문까지 빠르게 밀고 들어간 뒤 감속합니다. 세 비행 조건의 작은 그래픽은 TTS에 맞춰 Remotion 편집에서 별도로 얹습니다.</p><span class="pill">2D 잉크 누아르 · 16:9 · 10초 생성 / 10초 사용 · 효과음 포함</span></header>
<main><p class="notice"><strong>START 출처:</strong> 이미 생성된 <a href="assets/CL10_START_v3.png">CL10_START_v3.png</a>를 그대로 사용합니다. CL09의 실제 종료 프레임과 같은 객실 공간이며, START를 다시 생성하지 않습니다. <a href="CL10-v5-chain-candidate.json">연결·해시 후보 기록</a>.</p>
<p class="notice"><strong>음성 생성 금지, 효과음 생성:</strong> Google Flow에서 내레이션·대화·무선 교신을 만들지 않습니다. 객실 저음과 빠른 전진의 공기·좌석 스침은 생성합니다. 승인된 한국어 TTS와 조건 그래픽은 Remotion 편집에서 별도로 넣습니다.</p>
<div class="beats"><div><b>0~0.8초</b>남자와 닫힌 문 확인</div><div><b>0.8~3.8초</b>통로를 따라 빠른 전진</div><div><b>3.8~7초</b>같은 경로로 감속</div><div><b>7~10초</b>닫힌 문 앞에서 수렴</div><div><b>편집 단계</b>세 조건 강조 그래픽</div></div>
<section class="card"><h2>VS Code 실행</h2><p>작업 위치: <code>apps/editor</code>. 기존 START를 눈으로 확인하고 새 END 목표 이미지를 생성하세요. 전체 빌드나 테스트는 다시 돌리지 않습니다.</p><pre>node scripts/generate-db-cooper-cl10-end-v5.mjs --check
node scripts/generate-db-cooper-cl10-end-v5.mjs --generate-end</pre><p>END 지시문: <a href="${candidate.prompts.end}">CL10_v5_END.prompt.txt</a><br>START: <code>${candidate.start_binding.start_path}</code><br>END: <code>${candidate.end_target_path}</code></p></section>
<section class="card"><div class="top"><h2>영상 프롬프트 · 영문 원문</h2><button id="copy" type="button">영문 프롬프트 복사</button></div><p>Google Flow에 생성한 START와 END를 첨부하고 아래 영문 원문을 사용하세요. 결과는 <code>clips/CL10.mp4</code>에 저장합니다.</p><pre id="english">${escape(english)}</pre><p><a href="${candidate.prompts.video}">영문 TXT</a></p></section>
<section class="card"><h2>영상 프롬프트 · 한국어 전체 번역</h2><p>검토용 번역입니다. Google Flow에는 위 영문 원문을 복사하세요.</p><pre id="korean">${escape(korean)}</pre><p><a href="${candidate.video_prompt_korean_translation.path}">한국어 TXT</a></p></section>
<section class="card"><h2>대본·TTS 연결</h2><p>CL10의 승인된 내레이션: “${escape(candidate.narration)}” TTS 배치 구간은 클립 내 1.800~6.866초입니다. 영상은 한 번의 빠른 카메라 전진에 집중합니다. 착륙장치·저속·후방 계단 요구는 편집에서 작은 그래픽을 하나씩 얹습니다.</p></section>
<section class="card"><h2>마스터 보드</h2><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드"></div></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('english').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영문 프롬프트 복사',1600)});</script></body></html>`;
const target = at('CL10-video-prompt-v5.html');
await writeFile(target, html, 'utf8');
console.log(target);
