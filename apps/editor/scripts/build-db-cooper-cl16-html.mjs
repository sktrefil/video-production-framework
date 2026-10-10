import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = JSON.parse(await readFile(at('CL16-v3-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const shot = JSON.parse(planBytes).shots.find(x => x.id === 'CL16');
const start = await readFile(at(candidate.start_path));
if (sha(planBytes) !== candidate.base_plan_sha256 ||
    shot?.start_binding.kind !== 'PREVIOUS_USED_EXIT' ||
    shot.start_binding.source_clip !== 'CL15' || shot.image_mode !== 'START_TARGET' ||
    shot.keep_seconds !== 9 || sha(start) !== candidate.start_sha256 ||
    shot.voice_slot_relative.start !== 1.2 || shot.voice_slot_relative.end !== 5.709) {
  throw new Error('CL16 candidate differs from locked plan, actual START or FINAL TTS.');
}
const english = await readFile(at(candidate.prompts.video), 'utf8');
const korean = await readFile(at(candidate.video_prompt_korean_translation.path), 'utf8');
if (sha(english) !== candidate.prompt_sha256.video ||
    sha(korean) !== candidate.video_prompt_korean_translation.sha256 ||
    !english.includes('NO GENERATED VOICES') || !english.includes('NONVERBAL sound effects') ||
    !korean.includes('음성 생성 금지') || !korean.includes('효과음은 유지')) {
  throw new Error('CL16 bilingual video prompt hash or audio instructions changed.');
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL16 영상 프롬프트 v3</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Segoe UI",sans-serif;background:#0d171e;color:#f2efe8}*{box-sizing:border-box}body{margin:0;line-height:1.65}header{padding:42px max(24px,calc((100vw - 1080px)/2));background:linear-gradient(110deg,#203340,#101a22);border-bottom:1px solid #51636b}main{max-width:1080px;margin:auto;padding:30px 24px 80px}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 9px}.eyebrow{color:#e9bd79;letter-spacing:.15em;font-weight:800;font-size:.82rem}.lead{max-width:900px;color:#d0d9dc}.pill{display:inline-block;border:1px solid #a88452;background:#2a2a22;color:#f5d99e;padding:5px 12px;border-radius:99px}.card{background:#1b2a33;border:1px solid #455962;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:3px solid #e5b875;padding:14px 18px;background:#20313b;margin:18px 0}h2{margin:0 0 12px;font-size:1.35rem}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}button{background:#e8b975;color:#12212b;border:0;border-radius:7px;padding:10px 16px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,monospace;background:#0d181f;border:1px solid #536875;border-radius:8px;padding:18px;margin:12px 0}code,a{color:#f3c984}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;border:1px solid #4a616d;border-radius:7px}@media(max-width:760px){header{padding:30px 24px}.boards{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC04 / CL16 / V3</div><h1>CL16 영상 생성 프롬프트</h1><p class="lead">CL15의 실제 사용 종료 프레임인 닫힌 커튼과 고정 스피커 그릴에서 시작합니다. 같은 벽을 따라 오른쪽으로 빠르게 이동하며 마지막 교신을 빛과 효과음으로 암시하고, 조용한 원형 계기로 끝냅니다.</p><span class="pill">손그림 2D 잉크 누아르 · 16:9 · 생성 10초 / 편집 9초 · 비언어 효과음</span></header>
<main><p class="notice"><strong>START 출처:</strong> <a href="${candidate.start_path}">CL16_START.png</a>는 <code>CL15.mp4</code>의 앞 9초를 사용할 때 보이는 마지막 원본 프레임, #${candidate.source_frame_index} (${candidate.source_frame_seconds}초)를 추출한 것입니다. 이미지 재생성 없이 바이트 그대로 사용합니다.</p>
<p class="notice"><strong>연결 방식:</strong> START는 닫힌 커튼과 화면 오른쪽의 스피커 그릴 한 개입니다. 카메라는 같은 벽을 따라 오른쪽으로 움직입니다. 커튼은 열리지 않고, 그릴은 수화기로 바뀌거나 복제되지 않습니다. END의 어두운 원형 계기는 CL17의 다음 움직임을 받습니다.</p>
<p class="notice"><strong>음성 생성 금지, 효과음 유지:</strong> 사람 목소리와 대사는 생성하지 않습니다. 낮은 기체음, 회선 잡음과 절제된 연결음 두 번 등 비언어 효과음은 생성합니다. 승인된 TTS는 편집에서 배치합니다.</p>
<section class="card"><h2>VS Code 실행</h2><p>현재 START는 추출되었습니다. <code>apps/editor</code> 터미널에서 END를 생성한 뒤 눈으로 확인하세요. 전체 빌드와 테스트는 실행하지 않습니다.</p><pre>node scripts/generate-db-cooper-cl16-end.mjs --check
node scripts/generate-db-cooper-cl16-end.mjs --generate-end</pre><p><a href="${candidate.prompts.end}">END 이미지 프롬프트</a> · <a href="CL16-v3-chain-candidate.json">프롬프트·참조 해시 기록</a></p></section>
<section class="card"><div class="top"><h2>Google Flow 영상 프롬프트 · 영어 원문</h2><button id="copy" type="button">영어 프롬프트 복사</button></div><p>START와 눈으로 검수한 END 이미지를 첨부하고 아래 영어 프롬프트를 사용하세요. 결과는 <code>clips/CL16.mp4</code>로 저장합니다.</p><pre id="english">${escape(english)}</pre><p><a href="${candidate.prompts.video}">영어 TXT</a></p></section>
<section class="card"><h2>영상 프롬프트 · 한국어 전체 번역</h2><pre>${escape(korean)}</pre><p><a href="${candidate.video_prompt_korean_translation.path}">한국어 TXT</a></p></section>
<section class="card"><h2>대본·TTS 타이밍</h2><p>승인된 내레이션: “${escape(candidate.narration)}” 앞의 9초 중 1.200~5.709초에 TTS를 얹습니다. 교신을 설명할 때는 고정 스피커 그릴과 추상적 연결 신호가 보여야 합니다. CL17 START는 CL16의 실제 사용 종료 프레임에서 추출합니다.</p></section>
<section class="card"><h2>마스터 보드</h2><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드"></div></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('english').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영어 프롬프트 복사',1600)});</script></body></html>`;
const target = at('CL16-video-prompt-v3.html');
await writeFile(target, html, 'utf8');
console.log(target);
