import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const candidate = JSON.parse(await readFile(resolve(root, 'CL08-v6-chain-candidate.json'), 'utf8'));
const prompt = await readFile(resolve(root, candidate.prompts.video), 'utf8');
const translationPath = candidate.video_prompt_korean_translation?.path;
if (!translationPath) throw new Error('CL08 Korean video-prompt translation is required.');
const translation = await readFile(resolve(root, translationPath), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (sha256(Buffer.from(prompt)) !== candidate.prompt_sha256.video ||
    !prompt.includes('NO GENERATED VOICES — KEEP SOUND EFFECTS.') ||
    !prompt.includes('Generate synchronized NONVERBAL sound effects')) {
  throw new Error('CL08 video prompt/hash or voice-free sound-effects rule is missing.');
}
if (sha256(Buffer.from(translation)) !== candidate.video_prompt_korean_translation.sha256 ||
    !translation.includes('음성 생성 금지, 효과음 유지') ||
    !translation.includes('0~1.5초') || !translation.includes('6.5~10초') ||
    !translation.includes('clips/CL08.mp4')) {
  throw new Error('CL08 Korean translation/hash or required timing and audio content is missing.');
}
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D.B. Cooper | CL08 영상 패키지 v6 · 영문/한글</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0e171e;color:#f2efe7}*{box-sizing:border-box}body{margin:0;line-height:1.6}header{padding:42px max(24px,calc((100vw - 1060px)/2));background:linear-gradient(120deg,#1e303a,#10191f);border-bottom:1px solid #49606a}.eyebrow{color:#e8b873;letter-spacing:.15em;font-weight:800;font-size:.82rem}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 12px}.lead{max-width:850px;color:#d0d9d9}main{max-width:1060px;padding:30px 24px 80px;margin:auto}.pill{display:inline-block;padding:5px 12px;border:1px solid #a8834e;border-radius:99px;color:#f4d69e;background:#2a291f;font-size:.85rem}.notice{border-left:3px solid #e4b56d;background:#1c2a31;padding:13px 17px;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:25px 0}.grid div{background:#22343e;border-top:3px solid #d8a863;padding:11px;font-size:.86rem}.grid b{display:block;color:#f2c581}.card{background:#1b2a33;border:1px solid #455a63;border-radius:12px;padding:23px;margin:20px 0}.card-top{display:flex;justify-content:space-between;align-items:center;gap:15px}h2{margin:0 0 12px;font-size:1.35rem}button{border:0;background:#e1b36c;color:#10202b;padding:10px 15px;border-radius:6px;font-weight:800;cursor:pointer}button:hover{background:#f3ca86}.meta{color:#c7d1d2}code{color:#f2c581}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:14px 0 0;padding:18px;background:#0d181e;border:1px solid #526773;border-radius:8px;color:#e9eff0;font:14px/1.7 Consolas,monospace}a{color:#f1c580}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;display:block;border:1px solid #49606a;border-radius:7px}@media(max-width:720px){header{padding:30px 24px}.grid,.boards{grid-template-columns:1fr}.card-top{align-items:flex-start;flex-direction:column}}
</style></head><body>
<header><div class="eyebrow">D.B. COOPER / SC03 / SHOT 08 / V6</div><h1>CL08 영상 프롬프트 · 영문/한글</h1><p class="lead">새 CL07의 닫힌 조종실 문 화면에서 시애틀 공항 외부로 전환합니다. 정지한 727을 따라 이동해 현금 가방과 낙하산이 기체로 들어가는 행동을 보여줍니다.</p><span class="pill">2D 잉크 누아르 · 16:9 · 10초 생성 / 10초 사용 · 효과음 포함</span></header>
<main><p class="notice"><strong>CL08 START는 새로 생성합니다.</strong> 새 CL07.mp4의 실제 사용 종료 프레임(7.958333초)은 전환 참고일 뿐 CL08 START나 이미지 생성 참조가 아닙니다. CL08 END는 START 생성·확인 후 만듭니다. <a href="CL08-v6-chain-candidate.json">v6 연결 후보안</a>은 원본 제작 승인을 변경하지 않습니다.</p>
<p class="notice"><strong>Google Flow 음성 생성 금지·효과음 생성:</strong> 내레이션·대사·사람 목소리는 만들지 마세요. 엔진·차량 바퀴·짐 손잡이 등 비언어적 효과음은 화면 행동에 맞춰 생성합니다. 확정 TTS만 편집에서 별도로 넣습니다.</p>
<div class="grid"><div><b>0–1.5초</b>시애틀 공항 · 정지한 727</div><div><b>1.5–3.5초</b>공항 차량 접근</div><div><b>3.5–6.5초</b>가방·낙하산 네 개 공개</div><div><b>6.5–10초</b>짐이 기체 문턱을 넘음</div></div>
<section class="card"><h2>이미지 생성 · VS Code 실행</h2><p>터미널 작업 위치: <code>apps/editor</code>. START를 확인한 다음 END를 생성하세요. 기존 파일은 해시로 검증하며 덮어쓰지 않습니다. 전체 빌드는 실행하지 않습니다.</p><pre>node scripts/generate-db-cooper-cl08-images.mjs --check
node scripts/generate-db-cooper-cl08-images.mjs --generate-start
# START 이미지를 눈으로 확인한 뒤
node scripts/generate-db-cooper-cl08-images.mjs --generate-end</pre><p><a href="prompts/CL08_v3_START.prompt.txt">START 이미지 프롬프트</a> · <a href="prompts/CL08_v3_END.prompt.txt">END 이미지 프롬프트</a></p><p class="meta">START: <code>assets/CL08_START.png</code><br>END: <code>assets/CL08_END_TARGET_v3.png</code></p></section>
<section class="card"><div class="card-top"><h2>영상 생성 프롬프트 · 영문 원문</h2><button id="copy" type="button">영문 프롬프트 복사</button></div><p>START와 END 두 장을 Google Flow에 첨부하고 아래 영문 원문을 사용하세요. 영상이 완성되면 <code>clips/CL08.mp4</code>로 저장하고 마지막 실제 프레임을 확인한 뒤 CL09 START를 추출합니다.</p><pre id="prompt">${escape(prompt)}</pre><p><a href="prompts/CL08_v4_VIDEO.prompt.txt">영문 프롬프트 TXT 열기</a></p></section>
<section class="card"><h2>한글 번역 · 검토용</h2><p class="meta">영문 원문의 행동·타이밍·효과음·금지 요소를 모두 옮겼습니다. Google Flow에는 위 영문 원문을 넣으세요.</p><pre id="translation">${escape(translation)}</pre><p><a href="${translationPath}">한글 번역 TXT 열기</a></p></section>
<section class="card"><h2>확정 TTS 연결</h2><p>CL08 사용 구간 0.400–7.164초에 “시애틀의 활주로. 비행기는 멈췄지만, 가장 위험한 승객은 내리지 않습니다. 공항 차량이 다가오고, 20만 달러와 낙하산 네 개가 기내로 들어옵니다.”를 배치합니다. 짐은 해당 문장이 끝나기 전에 실제로 기체 문턱을 넘기 시작해야 합니다. CL09에서 승객 하차를 이어갑니다.</p></section>
<section class="card"><h2>마스터 보드</h2><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드" loading="lazy"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드" loading="lazy"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드" loading="lazy"></div></section></main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('prompt').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='영문 프롬프트 복사',1600)});</script></body></html>
`;
const target = resolve(root, 'CL08-video-prompt-v6.html');
await writeFile(target, html, 'utf8');
console.log(target);
