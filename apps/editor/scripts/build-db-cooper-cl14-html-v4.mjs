import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const at = relative => resolve(root, relative);
const sha = value => createHash('sha256').update(value).digest('hex');
const candidate = JSON.parse(await readFile(at('CL14-v4-chain-candidate.json'), 'utf8'));
const planBytes = await readFile(at('chain-plan.json'));
const shot = JSON.parse(planBytes).shots.find(x => x.id === 'CL14');
if (sha(planBytes) !== candidate.base_plan_sha256 || shot?.image_mode !== 'SINGLE' ||
    shot.start_binding.kind !== 'GENERATE_START' || shot.keep_seconds !== 9 ||
    candidate.proposed_image_mode !== 'START_TARGET_OPTIONAL_END' ||
    shot.voice_slot_relative.start !== 1 || shot.voice_slot_relative.end !== 6.091) {
  throw new Error('CL14 candidate differs from the locked shot plan or FINAL TTS.');
}
const english = await readFile(at(candidate.prompts.video), 'utf8');
const korean = await readFile(at(candidate.video_prompt_korean_translation.path), 'utf8');
if (sha(english) !== candidate.prompt_sha256.video ||
    sha(korean) !== candidate.video_prompt_korean_translation.sha256 ||
    !english.includes('NO GENERATED VOICES') || !english.includes('NONVERBAL sound effects') ||
    !korean.includes('음성 생성 금지') || !korean.includes('효과음은 유지')) {
  throw new Error('CL14 bilingual prompt provenance or audio instructions changed.');
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL14 영상 프롬프트 v4</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Segoe UI",sans-serif;background:#0d171e;color:#f2efe8}*{box-sizing:border-box}body{margin:0;line-height:1.65}header{padding:42px max(24px,calc((100vw - 1080px)/2));background:linear-gradient(110deg,#203340,#101a22);border-bottom:1px solid #51636b}main{max-width:1080px;margin:auto;padding:30px 24px 80px}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 9px}.eyebrow{color:#e9bd79;letter-spacing:.15em;font-weight:800;font-size:.82rem}.lead{max-width:900px;color:#d0d9dc}.pill{display:inline-block;border:1px solid #a88452;background:#2a2a22;color:#f5d99e;padding:5px 12px;border-radius:99px}.card{background:#1b2a33;border:1px solid #455962;border-radius:12px;padding:22px;margin:20px 0}.notice{border-left:3px solid #e5b875;padding:14px 18px;background:#20313b;margin:18px 0}h2{margin:0 0 12px;font-size:1.35rem}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}button{background:#e8b975;color:#12212b;border:0;border-radius:7px;padding:10px 16px;font-weight:800;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,monospace;background:#0d181f;border:1px solid #536875;border-radius:8px;padding:18px;margin:12px 0}code,a{color:#f3c984}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;border:1px solid #4a616d;border-radius:7px}@media(max-width:760px){header{padding:30px 24px}.boards{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC04 / CL14 / V4</div><h1>CL14 영상 생성 프롬프트</h1><p class="lead">CL13의 닫힌 후방 패널에서 조종실로 컷합니다. 고정된 스피커 그릴에서 계단 표시등으로 빠르게 전진하고, 표시등 하나가 한 번 켜집니다.</p><span class="pill">손그림 2D 잉크 누아르 · 16:9 · 생성 10초 / 편집 9초 · 비언어 효과음</span></header>
<main><p class="notice"><strong>START 출처:</strong> <a href="${candidate.start_binding.start_path}">CL14_START_v4.png</a>는 새로 생성하는 조종실 이미지입니다. CL13.mp4에서 추출하지 않습니다. 화면 전환은 의도적인 공간 컷입니다.</p>
<p class="notice"><strong>END 상태:</strong> 잠긴 기본 계획은 이미지 한 장을 쓰는 SINGLE 방식입니다. 요청에 따라 END 목표 이미지를 별도 연출 후보로 준비했습니다. 이는 기본 계획의 승인 변경이 아닙니다. CL15 START는 이 목표 이미지가 아닌 CL14.mp4에서 실제로 사용하는 앞 9초의 마지막 프레임에서 추출합니다.</p>
<p class="notice"><strong>음성 생성 금지, 효과음 유지:</strong> 사람 목소리와 대사는 생성하지 않습니다. 낮은 기내 진동, 인터폰 회선 잡음, 표시등 클릭 등 비언어 효과음은 생성합니다. 승인된 TTS는 편집에서 배치합니다.</p>
<section class="card"><h2>VS Code 실행 순서</h2><p><code>apps/editor</code> 터미널에서 실행하세요. START를 눈으로 확인한 뒤 END를 생성하세요. 전체 빌드와 테스트는 실행하지 않습니다.</p><pre>node scripts/generate-db-cooper-cl14-images-v4.mjs --check
node scripts/generate-db-cooper-cl14-images-v4.mjs --generate-start
node scripts/generate-db-cooper-cl14-images-v4.mjs --generate-end</pre><p><a href="${candidate.prompts.start}">START 이미지 프롬프트</a> · <a href="${candidate.prompts.end}">END 이미지 프롬프트</a> · <a href="CL14-v4-chain-candidate.json">프롬프트·보드 해시 기록</a></p></section>
<section class="card"><div class="top"><h2>Google Flow 영상 프롬프트 · 영어 원문</h2><button id="copy" type="button">영어 프롬프트 복사</button></div><p>검수한 START와 END를 첨부하고 아래 영어 프롬프트를 사용하세요. 결과 파일은 <code>clips/CL14.mp4</code>로 저장합니다.</p><pre id="english">${escape(english)}</pre><p><a href="${candidate.prompts.video}">영어 TXT</a></p></section>
<section class="card"><h2>영상 프롬프트 · 한국어 전체 번역</h2><pre>${escape(korean)}</pre><p><a href="${candidate.video_prompt_korean_translation.path}">한국어 TXT</a></p></section>
<section class="card"><h2>대본·TTS 타이밍</h2><p>승인된 내레이션: “${escape(candidate.narration)}” 편집에서 사용할 앞의 9초 중 1.000~6.091초에 TTS를 배치합니다. 표시등은 계단 상태를 추론하게 할 뿐 실제 계단의 위치를 직접 보여주지 않습니다.</p></section>
<section class="card"><h2>마스터 보드</h2><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드"></div></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('english').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영어 프롬프트 복사',1600)});</script></body></html>`;
const target = at('CL14-video-prompt-v4.html');
await writeFile(target, html, 'utf8');
console.log(target);
