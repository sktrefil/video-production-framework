"""Build a self-contained review page from the canonical candidate prompt package."""

from __future__ import annotations

import html
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "prompt-review-package-v1.json"
OUTPUT = HERE / "all-cut-prompts-review-v1.html"


def e(value: object) -> str:
    return html.escape(str(value), quote=True)


def timestamp(seconds: float) -> str:
    minutes, remainder = divmod(float(seconds), 60)
    return f"{int(minutes):02d}:{remainder:04.1f}"


def render_asset_rows(assets: dict) -> str:
    labels = (
        ("이미지 후보", "image_candidate_planned"),
        ("비디오 후보", "video_candidate_planned"),
        ("부모 TTS", "parent_tts_planned"),
        ("실제 사용 종료 프레임 계획", "used_exit_frame_planned"),
        ("메타데이터", "metadata_candidate_file"),
    )
    return "".join(
        f"<tr><th scope='row'>{e(label)}</th><td><code>{e(assets.get(key) or '미정')}</code></td></tr>"
        for label, key in labels
    )


def render_shot(shot: dict) -> str:
    timeline = shot["timeline"]
    assets = shot["assets"]
    refs = shot["reference_contract"]
    edit = shot["edit_audio"]
    shot_id = shot["shot_id"]
    duration = timeline["planned_use_duration_sec"]
    overlay = ", ".join(edit.get("typeset_overlays_ko", [])) or "없음"
    return f"""
      <details class='shot' id='shot-{e(shot_id)}' open>
        <summary><span class='shot-id'>{e(shot_id)}</span><span>{e(shot['shot_title_ko'])}</span><span class='shot-time'>{timestamp(timeline['planned_start_sec'])}–{timestamp(timeline['planned_end_sec'])} · {e(duration)}초</span></summary>
        <div class='shot-content'>
          <p class='review-summary'>{e(shot['review_summary_ko'])}</p>
          <div class='meta-grid'>
            <div><span class='meta-label'>연결 방식</span><strong>{e(refs['continuity_mode'])}</strong><small>이전: {e(refs.get('previous_shot_id') or '없음')}</small></div>
            <div><span class='meta-label'>입력 보드</span><strong>{e(refs['board_panels'])}</strong><small>원본 A–D는 구도·색감 참고만</small></div>
            <div><span class='meta-label'>입력 전환</span><strong>{e(edit['transition_in_candidate']['type'])}</strong><small>{e(edit['transition_in_candidate']['duration_sec'])}초 후보</small></div>
            <div><span class='meta-label'>상태</span><strong>CANDIDATE</strong><small>실제 TTS·이미지·영상 없음</small></div>
          </div>
          <section class='prompt-block'>
            <div class='section-line'><h4>이미지 생성 프롬프트 · 영문 전체</h4><button class='copy' type='button' data-copy='image-{e(shot_id)}'>복사</button></div>
            <pre id='image-{e(shot_id)}'>{e(shot['image_prompt_english'])}</pre>
          </section>
          <section class='prompt-block'>
            <div class='section-line'><h4>비디오 모션 가이드 · 영문 전체</h4><button class='copy' type='button' data-copy='motion-{e(shot_id)}'>복사</button></div>
            <pre id='motion-{e(shot_id)}'>{e(shot['motion_prompt_english'])}</pre>
          </section>
          <div class='support-grid'>
            <section><h4>06 자산 파일명</h4><table class='asset-table'><tbody>{render_asset_rows(assets)}</tbody></table></section>
            <section><h4>편집·음향 참고</h4><p><b>합성 문자:</b> {e(overlay)}</p><p><b>SFX:</b> {e(edit['sfx_candidate_ko'])}</p><p><b>BGM:</b> {e(edit['bgm_candidate_ko'])}</p><p class='subtle'>자막은 실제 TTS 정렬 후 편집층에 합성합니다. 현재 종료 프레임은 생성되지 않았습니다.</p></section>
          </div>
        </div>
      </details>"""


def render_cut(cut: dict) -> str:
    name = cut["cut_id"]
    shot_count = len(cut["shots"])
    est = cut["estimated_speech_duration_sec"]
    shots = "".join(render_shot(shot) for shot in cut["shots"])
    return f"""
    <article class='cut-card' id='cut-{e(name)}' data-search='{e(name + ' ' + cut['canonical_unit_id'] + ' ' + cut['exact_narration'] + ' ' + ' '.join(shot['shot_title_ko'] for shot in cut['shots']))}'>
      <div class='cut-heading'><div><span class='eyebrow'>PART {e(name[1])} · {e(cut['canonical_unit_id'])}</span><h2>{e(name)} <small>{'A/B 분할' if shot_count == 2 else '단일 영상 샷'}</small></h2></div><span class='time-chip'>{timestamp(cut['planned_parent_start_sec'])}–{timestamp(cut['planned_parent_end_sec'])}</span></div>
      <div class='cut-facts'><span>승인 Scene <code>{e(cut['canonical_scene_id'])}</code></span><span>TTS 추정 {e(est)}초 · 실측 전</span><span>속도 {e(cut['tts_speed'])}×</span><span>샷 {shot_count}개</span></div>
      <div class='narration'><b>정확한 TTS 원문</b><p>{e(cut['exact_narration'])}</p><code>{e(cut['planned_tts_file'])}</code></div>
      {shots}
    </article>"""


def main() -> None:
    package = json.loads(SOURCE.read_text(encoding="utf-8"))
    cuts = package["cuts"]
    assert package["status"] == "CANDIDATE" and len(cuts) == 19
    assert sum(len(cut["shots"]) for cut in cuts) == 25

    nav = "".join(
        f"<a href='#cut-{e(cut['cut_id'])}'><span>{e(cut['cut_id'])}</span><small>{timestamp(cut['planned_parent_start_sec'])}</small></a>"
        for cut in cuts
    )
    cards = "".join(render_cut(cut) for cut in cuts)
    html_text = f"""<!doctype html>
<html lang='ko'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>요일과 로마 신 · 전체 컷 프롬프트 검토</title>
  <style>
    :root{{--bg:#0d1420;--panel:#172436;--panel2:#1d3046;--line:#36516b;--ink:#ecf3f7;--muted:#afc3d1;--accent:#eebc7d;--teal:#91d2d3}}
    *{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,'Malgun Gothic',sans-serif}}
    a{{color:inherit}}button,input{{font:inherit}}button{{cursor:pointer}}aside{{position:fixed;inset:0 auto 0 0;width:250px;overflow:auto;padding:24px 16px;background:#111e2e;border-right:1px solid var(--line)}}
    aside h2{{font-size:16px;line-height:1.35;margin:0 0 8px}}aside p{{font-size:12px;color:var(--muted);margin:0 0 20px}}nav{{display:grid;gap:3px}}nav a{{display:flex;justify-content:space-between;text-decoration:none;padding:7px 9px;border-radius:6px;font-size:12px}}nav a:hover,nav a:focus{{background:var(--panel2)}}nav small{{color:var(--muted)}}
    main{{margin-left:250px;padding:0 34px 70px;max-width:1500px}}header{{padding:40px 0 27px;border-bottom:1px solid var(--line)}}.eyebrow{{font-size:11px;color:var(--teal);font-weight:700;letter-spacing:.1em}}h1{{margin:5px 0 8px;font-size:clamp(28px,3vw,44px);line-height:1.2}}header p{{color:var(--muted);max-width:900px;margin:6px 0}}.stats{{display:flex;flex-wrap:wrap;gap:8px;margin:19px 0}}.stats span,.time-chip{{background:#294259;border:1px solid #4a6b85;border-radius:18px;padding:3px 11px;font-size:12px}}.status{{color:#f6d29e}}
    .toolbar{{position:sticky;top:0;z-index:10;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:11px 0;background:#0d1420ee;border-bottom:1px solid var(--line)}}.toolbar input{{flex:1;min-width:190px;background:#17283b;border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:8px 11px}}.toolbar button,.copy{{background:#2b465f;color:var(--ink);border:1px solid #64849a;border-radius:6px;padding:7px 10px}}.toolbar button:hover,.copy:hover{{background:#3d6079}}#result-count{{font-size:12px;color:var(--muted)}}
    .cut-card{{margin:27px 0 38px;padding:26px;background:var(--panel);border:1px solid var(--line);border-radius:12px;scroll-margin-top:70px}}.cut-heading{{display:flex;justify-content:space-between;gap:12px;align-items:start}}.cut-heading h2{{font-size:27px;margin:0 0 10px}}.cut-heading h2 small{{font-size:12px;color:var(--muted);font-weight:400}}.cut-facts{{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:12px}}.cut-facts span{{background:#20344a;border-radius:5px;padding:3px 7px}}code,pre{{font:12px/1.65 Consolas,'Courier New',monospace}}code{{overflow-wrap:anywhere;color:#c7dfeb}}.narration{{padding:14px 17px;margin:19px 0;background:#243849;border-left:3px solid var(--accent);border-radius:0 8px 8px 0}}.narration b{{font-size:12px;color:var(--accent)}}.narration p{{margin:5px 0 4px;font-size:16px}}
    details.shot{{margin:14px 0;background:#122132;border:1px solid #3b5970;border-radius:9px;scroll-margin-top:70px}}details.shot summary{{display:flex;gap:9px;align-items:center;flex-wrap:wrap;list-style:none;cursor:pointer;padding:12px 16px;font-weight:650}}details.shot summary::-webkit-details-marker{{display:none}}details.shot summary::before{{content:'▸';color:var(--accent)}}details.shot[open] summary::before{{content:'▾'}}.shot-id{{font-family:Consolas,monospace;color:var(--teal)}}.shot-time{{margin-left:auto;font-weight:400;color:var(--muted);font-size:12px}}.shot-content{{padding:0 16px 18px}}.review-summary{{margin:0 0 14px;color:#d8e5ed}}.meta-grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}}.meta-grid div{{padding:10px;background:#1b3044;border-radius:6px;min-width:0}}.meta-grid span,.meta-grid small{{display:block;color:var(--muted);font-size:11px}}.meta-grid strong{{display:block;font-size:13px;overflow-wrap:anywhere}}.prompt-block{{margin-top:22px}}.section-line{{display:flex;justify-content:space-between;align-items:center;gap:8px}}h4{{margin:0 0 8px;color:var(--accent);font-size:14px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;background:#091621;border:1px solid #324c62;border-radius:7px;padding:16px;color:#dcebf2;max-height:490px;overflow:auto}}.support-grid{{display:grid;grid-template-columns:1.3fr 1fr;gap:15px;margin-top:20px}}.support-grid section{{background:#1b3044;padding:15px;border-radius:7px;min-width:0}}.support-grid p{{font-size:12px;margin:4px 0 9px}}.subtle{{color:var(--muted)}}.asset-table{{width:100%;border-collapse:collapse;font-size:12px}}.asset-table th,.asset-table td{{text-align:left;padding:5px;border-bottom:1px solid #36516b;vertical-align:top}}.asset-table th{{color:var(--muted);width:145px;font-weight:500}}footer{{font-size:12px;color:var(--muted);padding:16px 0}}
    @media(max-width:1050px){{aside{{display:none}}main{{margin-left:0}}}}@media(max-width:700px){{main{{padding:0 13px 40px}}.cut-card{{padding:16px}}.meta-grid{{grid-template-columns:repeat(2,1fr)}}.support-grid{{grid-template-columns:1fr}}.shot-time{{margin-left:0}}}}@media print{{aside,.toolbar,.copy{{display:none!important}}main{{margin:0;padding:0;max-width:none}}body{{background:#fff;color:#111}}header,.cut-card,details.shot{{background:#fff;color:#111;border-color:#aaa}}details.shot{{display:block}}details.shot .shot-content{{display:block!important}}pre{{color:#111;background:#fff;max-height:none;overflow:visible;border-color:#bbb}}.narration,.support-grid section,.meta-grid div{{background:#fff;color:#111}}}}
  </style>
</head>
<body>
<aside><h2>요일과 로마 신<br>컷별 제작 검토</h2><p>19컷 · 25영상 샷<br>원문·프롬프트·파일명</p><nav aria-label='컷 이동'>{nav}</nav></aside>
<main>
<header><span class='eyebrow'>PROMPT REVIEW · V1</span><h1>전체 컷별 상세 프롬프트</h1><p>Story Gate 승인 r04/SG01을 바탕으로 만든 <b class='status'>CANDIDATE</b> 검토 화면입니다. 실제 TTS·이미지·영상은 아직 생성되지 않았습니다. 시간은 계획값이며, 이미지 생성용 문장과 비디오 모션 가이드의 영문 전체를 각 샷에서 확인할 수 있습니다.</p><div class='stats'><span>19개 부모 컷</span><span>25개 시각 샷</span><span>180초 계획</span><span>TTS 1.0× · 미실측</span><span>16:9 비실사 그래픽</span></div><p>보드 A–D는 구도·색감·형태·전환 참고만 사용합니다. 문자·자막은 편집에서 합성하고, 10초 초과 6컷의 A/B 분할은 실제 TTS 길이에 맞춰 재검토합니다.</p></header>
<div class='toolbar'><input id='search' type='search' placeholder='컷 ID, 장면 이름, 대본 검색…' aria-label='컷 검색'><button type='button' id='expand'>모두 펼치기</button><button type='button' id='collapse'>모두 접기</button><button type='button' onclick='window.print()'>인쇄 / PDF</button><span id='result-count'>19개 컷 표시</span></div>
{cards}
<footer>출처: prompt-review-package-v1.json · 외부 제작 가이드 04/05/06 적용 · 모든 파일명은 계획값 · 프로젝트 정식 승인 상태는 project.db 기준</footer>
</main>
<script>
  const cards = [...document.querySelectorAll('.cut-card')];
  const search = document.getElementById('search');
  const count = document.getElementById('result-count');
  search.addEventListener('input', () => {{
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {{
      const show = !query || card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !show;
      if (show) visible += 1;
    }}
    count.textContent = `${{visible}}개 컷 표시`;
  }});
  document.getElementById('expand').addEventListener('click', () => document.querySelectorAll('details.shot').forEach(item => item.open = true));
  document.getElementById('collapse').addEventListener('click', () => document.querySelectorAll('details.shot').forEach(item => item.open = false));
  document.querySelectorAll('button.copy').forEach(button => button.addEventListener('click', async () => {{
    const value = document.getElementById(button.dataset.copy).textContent;
    try {{
      await navigator.clipboard.writeText(value);
    }} catch {{
      const text = document.createElement('textarea');
      text.value = value; document.body.appendChild(text); text.select(); document.execCommand('copy'); text.remove();
    }}
    const old = button.textContent; button.textContent = '복사됨'; setTimeout(() => button.textContent = old, 1600);
  }}));
</script>
</body></html>"""
    OUTPUT.write_text(html_text, encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(cuts)} cuts, {sum(len(c['shots']) for c in cuts)} shots)")


if __name__ == "__main__":
    main()
