import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../output/db-cooper-v3/storyboard-lock-v1');
const version = process.argv[2] ?? 'v4';
if (!['v3', 'v4'].includes(version)) throw new Error('Usage: node scripts/build-db-cooper-cl03-html.mjs [v3|v4]');
const promptPath = `prompts/CL03_${version}_VIDEO.prompt.txt`;
const prompt = await readFile(resolve(root, promptPath), 'utf8');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>D.B. Cooper | CL03 동영상 프롬프트 ${version}</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0e171e;color:#f2efe7}*{box-sizing:border-box}body{margin:0;line-height:1.55}header{padding:44px max(24px,calc((100vw - 1060px)/2));background:linear-gradient(120deg,#1e303a,#10191f);border-bottom:1px solid #49606a}.eyebrow{color:#e8b873;letter-spacing:.15em;font-weight:800;font-size:.83rem}h1{font-size:clamp(2rem,5vw,3.3rem);margin:6px 0 12px;line-height:1.15}.lead{max-width:810px;color:#d0d9d9}main{max-width:1060px;padding:30px 24px 80px;margin:auto}.pill{display:inline-block;padding:5px 12px;border:1px solid #a8834e;border-radius:99px;color:#f4d69e;background:#2a291f;font-size:.85rem}.notice{border-left:3px solid #e4b56d;background:#1c2a31;padding:12px 16px;color:#dce4e3;margin:22px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:25px 0}.grid div{background:#22343e;border-top:3px solid #d8a863;padding:11px;font-size:.87rem}.grid b{display:block;color:#f2c581}.card{background:#1b2a33;border:1px solid #455a63;border-radius:12px;padding:24px;margin:20px 0}.card-top{display:flex;justify-content:space-between;align-items:center;gap:15px}h2{margin:0;font-size:1.4rem}button{border:0;background:#e1b36c;color:#10202b;padding:10px 15px;border-radius:6px;font-weight:800;cursor:pointer}button:hover{background:#f3ca86}.meta{color:#c7d1d2}code{color:#f2c581}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:14px 0 0;padding:18px;background:#0d181e;border:1px solid #526773;border-radius:8px;color:#e9eff0;font:14px/1.7 Consolas,monospace}a{color:#f1c580}.boards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.boards img{width:100%;display:block;border:1px solid #49606a;border-radius:7px}h3{margin-top:38px}@media(max-width:720px){header{padding:30px 24px}.grid,.boards{grid-template-columns:1fr}.card-top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<header><div class="eyebrow">D.B. COOPER / SC02 / SHOT 03 / ${version.toUpperCase()}</div><h1>CL03 동영상 프롬프트</h1><p class="lead">탑승권을 따라 객실 안으로 이동하다가 접힌 쪽지의 밝은 모서리로 끝나는 10초 원본입니다. 편집에는 앞 9초만 사용합니다.</p><span class="pill">NON_REALISTIC_STYLIZED · 16:9 · 10초 원본 / 9초 사용</span></header>
<main>
<p class="notice">START와 END 이미지를 입력하고 아래 프롬프트만 복사해 영상 생성에 사용하세요. ${version === 'v4' ? '영상에서는 얼굴과 신원을 묘사하지 않습니다. 이름·대사는 기존 TTS를 편집할 때 넣습니다. ' : ''}CL02와의 연결은 실제 CL02 영상의 8초 종료 프레임을 확인한 뒤 확정합니다.</p>
<div class="grid"><div><b>0–0.7초</b>탑승권과 종이 소리</div><div><b>0.7–6초</b>좌→우 추적, 좌석 등받이 통과</div><div><b>6–9초</b>접힌 쪽지의 밝은 모서리 등장</div><div><b>9–10초</b>종료 구도 유지 · 편집 제외</div></div>
<section class="card"><div class="card-top"><h2>영상 생성 프롬프트</h2><button id="copy" type="button">프롬프트 복사</button></div><p class="meta">START: <code>assets/CL03_START_v3.png</code><br>END/TARGET: <code>assets/CL03_END_TARGET_v3.png</code><br>출력: <code>clips/CL03.mp4</code></p><pre id="prompt">${escape(prompt)}</pre><p><a href="${promptPath}">원본 프롬프트 파일 열기</a></p></section>
<section class="card"><h2>VS Code 이미지 준비</h2><p>작업 위치: <code>apps/editor</code>. START를 확인한 뒤 END를 생성합니다.</p><pre>node scripts/generate-db-cooper-cl03-images.mjs --check
node scripts/generate-db-cooper-cl03-images.mjs --generate-start
node scripts/generate-db-cooper-cl03-images.mjs --generate-end</pre></section>
<h3>마스터 보드</h3><div class="boards"><img src="boards/BOARD01_STYLE.png" alt="메인 스타일 보드" loading="lazy"><img src="boards/BOARD02_MOTION.png" alt="카메라 모션 보드" loading="lazy"><img src="boards/BOARD03_SCENE.png" alt="핵심 장면 보드" loading="lazy"></div>
</main>
<script>document.getElementById('copy').addEventListener('click',async()=>{const button=document.getElementById('copy');const value=document.getElementById('prompt').textContent;try{await navigator.clipboard.writeText(value)}catch{const area=document.createElement('textarea');area.value=value;document.body.append(area);area.select();document.execCommand('copy');area.remove()}button.textContent='복사 완료';setTimeout(()=>button.textContent='프롬프트 복사',1600)});</script>
</body></html>
`;
const target = resolve(root, `CL03-video-prompt-${version}.html`);
await writeFile(target, html, 'utf8');
console.log(target);
