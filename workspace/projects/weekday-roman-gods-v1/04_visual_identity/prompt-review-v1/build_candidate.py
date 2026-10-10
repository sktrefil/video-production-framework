"""Build review artifacts only; this module has no generation or database API."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re

OUT = Path(__file__).resolve().parent
PROJECT = OUT.parents[1]
ROOT = PROJECT.parents[2]
GUIDE = Path('D:/컴폴더/다운로드/ai_longform_video_production_guide_v2.html')
BOARD = Path('D:/컴폴더/다운로드/파트 A,B,C,D기준 보드.png')

def read(rel):
    return json.loads((PROJECT / rel).read_text(encoding='utf-8-sig'))

def sha(p):
    return 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest()

script = read('02_script/script-draft-r04.json')
graph = read('02_script/approved-scene-graph-sg01.json')
skeleton = read('04_visual_identity/visual-skeleton-vs03.json')
preflight = read('04_visual_identity/directing-preflight-pf04.yaml')
global_constants = read('04_visual_identity/global-image-prompt-constants-v1.json')
manager = read('02_script/manager-story-gate-mstg01.json')
lock = read('02_script/script-directing-lock-sdl-r04.json')
unitmap = {u['unit_id']: u for u in script['units']}
scene_map = {s['unitId']: s for s in graph['scenes']}
visualmap = {u['unit_id']: u for u in skeleton['units']}
pfmap = {u['unit_id']: u for u in preflight['unit_reviews']}

# Each row describes the ENTRY still and a usable edited interval, not a generated asset.
SHOT_DATA = [
 dict(key='cut1_1', title='익숙한 달력 발견', boards='A', mode='INDEPENDENT',
  image='One illustrated blue-gray smartphone rests diagonally, its top edge pointing toward the upper right, on a simple dark indigo desk with broad painted planes. Three-quarter overhead medium close view; the whole device and one desk edge are visible. Place the phone at 60% frame width, leaving calm dark space at the left. Its inactive screen contains a small blank calendar-icon plate, prepared for an editorial reveal. Amber edge light enters from upper left, with cool blue-gray shadows. Use hard-edged painted shading, visibly drawn bevels and separated foreground/desk layers; avoid photographic materials. This first image contains only the familiar present-day object; no Roman objects or cosmic clues.',
  motion='0.0–1.0s: begin with the full device readable and make a purposeful diagonal dolly toward its screen; at 1.0s reveal the calendar icon with a simple editorial brightness cue. 1.0–4.0s: continue a 15–20% scale increase with a slight desk-edge parallax. 4.0–5.0s: ease the camera into a stable screen-focused exit. The phone stays fixed; the small icon opening is composited in editing, not an invented interface animation.',
  exit='Keep the same device orientation and light direction; end with the calendar area large enough for the next shot to inspect its weekday cells.',
  negatives='No hands, people, extra phones, logos, charging cables, cosmic particles, Roman objects or premature answer reveal.',
  summary='책상과 휴대폰을 먼저 읽히고 1초에 달력 아이콘을 발견한다. 로마·우주 단서는 아직 숨긴다.', overlays=['달력 아이콘(편집 제작)'], sfx='작은 앱 열림 클릭 1회; 과장된 마법음 없음.'),
 dict(key='cut1_2', title='월·화·금의 질문', boards='A', mode='CONTINUATION',
  image='Close view of the same illustrated smartphone calendar surface, keeping the upper-right device orientation, blue-gray bezel and amber light from upper left. Show a clean seven-cell weekday row with blank text locations; mark three discrete cell positions through slightly brighter borders for later Korean labels. Maintain a sliver of the same desk and phone edge at the lower side so the view remains grounded in one object. Camera-ready diagonal depth permits a single lateral scan, with the first target nearest the left. This image supplies geometry; all required weekday lettering will be typeset later.',
  motion='0.0–1.0s: start on the inherited calendar area and begin one continuous left-to-right oblique tracking move. 1.0–3.8s: pass the three editorially labeled target cells in spoken order; alter the composited emphasis, not the screen geometry, while maintaining one camera trajectory. 3.8–5.0s: settle on the final rectangular cell boundary and let its shape become the handoff. Do not perform three separate zoom punches.',
  exit='A single clear calendar rectangle fills the visual center; retain its angle for the phone-to-tablet graphic match in cut1_3.',
  negatives='No letter generation or mutation, Roman names on the Korean screen, extra screens, new iconography or repeated zoom pulses.',
  summary='월·화·금 세 칸을 한 방향으로 훑는다. 글자는 편집 합성이며 한국어가 로마 신명으로 변하는 효과는 넣지 않는다.', overlays=['월', '화', '금'], sfx='세 개의 아주 짧은 강조음; 나레이션보다 작게.'),
 dict(key='cut1_3', title='사각형에서 석판으로', boards='A → B', mode='MATCH_TRANSITION',
  image='Extreme close composition of one blank rectangular plane originating from the same smartphone calendar cell, tilted on the inherited diagonal. The rectangle is clearly an illustrated editorial transition surface, with a few crisp paperlike facets beginning to lift from its outer edge. Behind it, a blue-gray uninscribed sculptural tablet silhouette is partly concealed in dark negative space. Foreground rectangular facets, middle transition plane and background tablet form three distinct depth layers. Amber seam light from upper left follows the rectangle; its surface must remain blank, without invented ancient writing. The still marks the beginning of an overt graphic transformation, not a discovered historical relic.',
  motion='0.0–1.2s: enter with the prior rectangular cell occupying the frame; move backward enough to expose its border. At 1.2s begin a controlled paper-facet separation. 1.2–4.8s: the same few rectangular planes fold and reassemble into a blue-gray tablet outline while the camera pulls to a medium view. 4.8–6.0s: settle on the blank tablet face. Keep the motion legible and finite; no uncontrolled shattering or multiplying fragments.',
  exit='The blank tablet and its edges are fully readable, ready for separate modern explanatory plates in cut1_4.',
  negatives='No authentic-looking inscriptions, runes, date claims, new people, antiquarian reconstruction, or realistic stone-chip debris.',
  summary='휴대폰의 한 사각 면을 종이 같은 그래픽 조각으로 분해해 석판 외곽으로 결합한다. 과거 실물 유물이 아니라 편집적 시대 전환이다.', overlays=[], sfx='종이 면 접힘과 짧은 낮은 전환음.'),
 dict(key='cut1_4', title='라틴어와 천체의 세 연결', boards='B', mode='CONTINUATION',
  image='Medium frontal-oblique view of the same blue-gray uninscribed tablet, occupying the middle right of the frame. In front of it place three clearly modern blank explanatory plates at slightly different depths, with one illustrated moon shape, one muted red Mars disc and one amber Venus disc associated with their respective plate. These are modern diagram elements, never lettering carved into the tablet. Give each plate generous blank space for editorial Latin labels. Maintain a compact three-item grouping with strong focal hierarchy and dark blue background; amber rim light catches the plate edges and a narrow seam in the tablet. No seven-line text wall.',
  motion='0.0–1.0s: approach the three-item grouping from the inherited tablet view; at 1.0s reveal the grouped moon/Mars/Venus relationships through one editorial reveal. 1.0–5.8s: make a restrained 10-degree camera arc, providing shallow parallax between the plates and tablet while allowing the composited labels to remain readable. 5.8–7.0s: redirect attention to the narrow illuminated seam behind the group. The symbols do not orbit or become gods.',
  exit='Keep the tablet seam near the frame center as a clear portal-shaped editorial handoff to cut1_5; no answer to the English/Korean comparison yet.',
  negatives='No fake Latin inscriptions, seven crowded rows, god faces, anatomical deity forms, magical historical rituals or documentary relic staging.',
  summary='달·화성·금성과 라틴어 세 어구만 보여준다. 라틴 문자는 석판 비문이 아니라 현대 설명판 위에 합성한다.', overlays=['dies Lunae', 'dies Martis', 'dies Veneris', '현대 설명 그래픽(필요시 작은 표기)'], sfx='세 관계를 한 번에 밝히는 작은 톤.'),
 dict(key='cut1_5', title='틈을 통과해 달밤으로', boards='C → D', mode='MATCH_TRANSITION',
  image='A narrow star-colored graphic seam divides the same blue-gray tablet in extreme foreground. Through that seam, reveal only a sliver of an oversized crescent and two abstract arch layers suggesting the Colosseum silhouette. Build a clearly painted fantasy space: angular indigo planes, a crisp amber seam edge and muted silver-blue crescent light. The tablet edges frame a traversable opening with foreground, midground arch and distant moon layers. Keep the far space mostly concealed in the ENTRY image so the later scale reveal is earned. The architecture is an editorial silhouette, not a reconstruction of ancient Rome.',
  motion='0.0–1.5s: advance rapidly but smoothly into the graphic seam; at 1.5s cross the near plane and reveal the large moon-space. 1.5–5.5s: accelerate through the layered opening, then widen to an extreme-wide crescent above separated Colosseum-like silhouettes with clear parallax. 5.5–7.0s: decelerate and fix attention on the crescent. Do not create a realistic city or a historical ceremony.',
  exit='The crescent remains in the upper-middle region, larger than the silhouetted arches; give cut2_1 a stable moon and arch orientation to continue.',
  negatives='No live city streets, people, historically exact building textures, god names, English/Korean answers, or random galaxy-particle overload.',
  summary='석판 틈 통과 후 달과 콜로세움 실루엣을 큰 스케일로 공개한다. 이 공간은 역사 재현이 아니라 질문을 확장하는 상징이다.', overlays=[], sfx='짧은 공간 통과음; 도착 뒤 숨을 둔다.'),
 dict(key='cut2_1', title='루나, 달의 날', boards='D', mode='CONTINUATION',
  image='Retain the prior enormous silver-blue crescent above the same two separated dark-indigo arch layers. Begin at a medium framing with an arch edge in the foreground and the moon clear in the upper center. A small modern blank explanation plate is tucked into a lower foreground plane, initially visually subordinate. Moonlight is cool blue; amber exists only as a subdued plate-edge accent, never golden-hour sunlight. The sculptural crescent and painted arches must stay visibly graphic. Prepare a camera path from the arch toward a moon close view without obstructing the moon silhouette.',
  motion='0.0–1.0s: shift attention from the arch edge to the crescent using a forward/upward dolly; the first moon focus lands at 1.0s. 1.0–4.8s: enlarge the crescent steadily with two-layer parallax. At 5.0s, reveal the editorial Latin and Korean explanation on the modern plate as a secondary reading cue. 5.0–8.0s: maintain the moon-to-label relationship with a slow settling arc, allowing pronunciation time.',
  exit='Keep the exact crescent shape and lower explanatory plate geometry available for the Latin/Monday comparison.',
  negatives='No moon goddess face, reconstructed statue, gold sunset, orbital animation, letter morphs or fake ancient caption.',
  summary='달을 먼저 읽히고 5초에 dies Lunae와 달의 날을 공개한다. D의 푸른 달빛을 유지한다.', overlays=['dies Lunae', '달의 날', 'Luna'], sfx='달 강조 시 은은한 단음; 공간음은 작게.'),
 dict(key='cut2_2', title='Monday도 달의 날', boards='D / B의 설명판 형태', mode='MATCH_TRANSITION',
  image='A modern two-column comparison on two grounded illustrated cards: the left blank Latin plate carries the established moon symbol, while the right blank English plate carries a matching moon silhouette. The two cards share a simple midnight-blue display surface and slightly different depths; they are not a map or historical timeline. Begin with the left card visually dominant and the right card partly revealed beyond it. Keep ample blank typesetting zones and the inherited crescent proportions. Cool blue shadows and amber card-edge accents provide clear separation.',
  motion='0.0–1.5s: track gently from the established crescent toward the left card; at 1.5s reveal the matching moon shape beside the right card. 1.5–4.8s: follow one left-to-right camera path across the two shapes, allowing the modern labels to be read. At 5.0s transfer editorial emphasis to Monday. 5.0–8.0s: settle into a balanced two-card view; avoid implying one language is literally transformed into the other.',
  exit='End on a stable rectangular card edge that can match to the corner of the paper document in cut2_3.',
  negatives='No migration arrows, god face morphing, moving text, proliferating week grids or historical transmission map.',
  summary='같은 달 모양을 좌우 비교한다. Monday는 오른쪽 카드에 후반 공개하고 언어 전파 경로를 그리지 않는다.', overlays=['dies Lunae', 'Monday', '달의 날'], sfx='두 달 모양 매치에 작은 확인음.'),
 dict(key='cut2_3', title='점진적으로 쓰인 행성 주간', boards='B의 문서 형태 / A의 책상', mode='MATCH_TRANSITION',
  image='Close oblique view of one illustrated paper document corner on a dark-indigo editorial desk. Its first calendar cell is visible, with blank modern typesetting space; a muted red circular marker sits at the far document margin for a later Mars match. Two other separate paper documents already exist outside the initial camera crop; their corners may be glimpsed only at the image edge. Use drawn paper thickness, broad sculptural planes and amber side light from upper left. This is a present-day explanatory tabletop staging, not an ancient room, recovered manuscript or proof of a specific spread route. Establish spatial room for a later wide view of all three distinct objects.',
  motion='0.0–1.0s: travel along the document corner until its first calendar cell is readable. 1.0–5.3s: maintain a shallow diagonal move over the single document, with restrained paper-edge parallax. At 5.5s begin a decisive backward camera expansion to reveal the two previously offscreen documents separately on the same desk. 5.5–8.2s: hold their coexistence as a symbol of gradual adoption. 8.2–9.0s: redirect to the red margin marker for the next graphic match. No documents spawn or clone.',
  exit='Leave the red circular marker readable and the separate documents grounded; its color and circular shape match the next Mars disc.',
  negatives='No repeated calendar-grid cloning, spread arrows, historical route map, emperor, invented manuscript writing, seals or exact archaeological artifact claims.',
  summary='한 문서 모서리에서 5.5초에 책상 폭으로 확대해 다른 문서들을 발견한다. 문서 복제나 전파 화살표로 확산을 단정하지 않는다.', overlays=['행성 요일', '점진적 정착(현대 설명층)'], sfx='종이 가장자리의 짧은 마찰음; 확대 시 낮은 공간음.'),
 dict(key='cut2_4', title='마르스와 화성', boards='B / C의 원형 연결', mode='MATCH_TRANSITION',
  image='A large illustrated muted-red Mars disc occupies the left-middle of a dark blue graphic space. Behind and slightly to the right, place one modern blue-gray blank nameplate with an abstract angular Mars emblem composed of two flat geometric planes, explicitly editorial and without historical costume details. Keep the disc round and matte-painted, with strong silhouette; maintain a restrained amber edge highlight consistent with the red marker handoff. The near disc and farther plate offer a clear shallow arc camera path. Leave the plate blank for editorial Latin and explanatory labels.',
  motion='0.0–1.0s: match the red margin marker to the Mars disc and reveal its full circular outline at 1.0s. 1.0–4.8s: make a short 12-degree camera arc around the near disc, exposing the farther nameplate without orbiting the planet. At 5.0s shift the editorial focus to the dies Martis plate. 5.0–8.0s: settle with the disc and abstract emblem side by side. The disc remains one symbolic object, not an actual celestial observation.',
  exit='End with the modern nameplate rectangle dominant enough to continue into the evidence-limit comparison.',
  negatives='No historical armor reconstruction, Mars deity anatomy, battlefield, soldiers, blood, weapons in action or war-calendar causal arrows.',
  summary='화성 원반과 추상 마르스 표지를 병치한다. 얼굴·갑옷·전투를 만들지 않고 이름 관계만 설명한다.', overlays=['dies Martis', 'Mars / 화성의 날'], sfx='짧은 붉은 원반 매치음; 전쟁 효과음 없음.'),
 dict(key='cut2_5', title='이름은 전쟁 기록이 아니다', boards='B의 현대 설명판', mode='CONTINUATION',
  image='Two modern explanatory fields sit on the same grounded blue-gray board: one blank weekday-name plate on the left and one conspicuously empty event-record field on the right. A thin connector between them is prepared with a clear central gap, currently emphasized only faintly. Frame close on the empty record field, retaining the left nameplate edge as context. These are modern editorial diagram objects, with no manuscript realism. Deep blue negative space and restrained amber edge light direct attention to the absence. The record field contains no scene, silhouettes or hidden battle imagery.',
  motion='0.0–1.0s: enter the empty record field and allow the viewer to inspect its absence. 1.0–5.3s: pull back gently to show the nameplate and event field in one frame. At 5.5s accentuate the predesigned connector gap through an editorial line cue, making the missing inference explicit. 5.5–9.0s: hold the two fields readable with small parallax, then settle toward the desk edge for the return to the phone. The empty field remains empty throughout.',
  exit='Maintain a stable rectangular plate and desk plane; yield a clean match to the physical smartphone in cut2_6.',
  negatives='No battle montage, smoke, screams, bodies, red blood effects, violence silhouettes or visual claim that no wars ever occurred.',
  summary='빈 사건 기록 칸과 끊긴 연결선으로 추론의 한계를 드러낸다. 요일명으로 전쟁을 증명할 수 없다는 뜻이며 역사 전체의 전쟁 부재를 뜻하지 않는다.', overlays=['요일명', '사건 기록', '이름만으로 입증 불가'], sfx='5.5초 선 끊김에 작은 건조한 클릭; 공포음 없음.'),
 dict(key='cut2_6', title='휴대폰으로 돌아와 Friday를 발견', boards='A', mode='MATCH_TRANSITION',
  image='Return to the same illustrated blue-gray smartphone at the same diagonal angle on the same dark-indigo desk, seen from a medium three-quarter overhead position. The device body is partly outside the initial crop but must be spatially established for a full-form reveal. A single real-in-the-editorial-space paper language card rests separately on the desk, never floating. The calendar screen has a blank seven-cell layout and an amber target cell awaiting a Friday label. Keep the upper-left amber light, original bezel proportions and desk edge. This is an English comparison screen on the same device, not the Korean opening screen magically relabeled in place.',
  motion='0.0–1.0s: reorient outward from the prior rectangle to reveal the entire phone body by 1.0s. 1.0–4.8s: follow one diagonal tabletop move toward the calendar surface. At 5.0s, use a deliberate editorial page-turn within the screen to reveal the English comparison page and Friday cell. 5.0–8.0s: ease into a close view of the amber cell. Keep the physical phone and paper card fixed; the page animation is a composited layer.',
  exit='The amber Friday cell provides one clean circular-color handoff to the Venus disc of cut3_1.',
  negatives='No floating word panels, hands, device replacement, Korean-letter-to-god-name mutation, automatic spawning cards or whole-screen glitch.',
  summary='1초에 스마트폰 몸체를 다시 발견하고 5초에 설명용 영어 페이지의 Friday 칸을 공개한다. 언어 카드는 책상 위 종이 물체로 둔다.', overlays=['Friday'], sfx='화면 페이지 넘김 한 번.'),
 dict(key='cut3_1', title='라틴어 금요일과 비너스', boards='B / C', mode='MATCH_TRANSITION',
  image='An amber illustrated Venus disc and one simple Venus symbol form the primary foreground subject in a dark blue editorial space. The established uninscribed tablet silhouette and a separate modern blank dies Veneris explanation plate sit farther back to the right. Start close enough that the disc dominates but leave its circular boundary fully visible. Use visibly painted sculptural facets, muted amber highlights and cool blue shade; the plate remains blank until typesetting. Reserve a shallow lateral camera path from disc to label. The symbolism explains a name; it does not depict a goddess, palace or ancient event.',
  motion='0.0–1.0s: match the prior amber cell to a single Venus disc, revealing the disc and its symbolic sign. 1.0–5.3s: travel along a shallow lateral arc to expose the separate modern explanation plate. At 5.5s shift emphasis to dies Veneris. 5.5–9.0s: let the phrase and Venus relationship remain readable with minimal residual parallax. 9.0–10.0s: settle on the plate rectangle for the next English comparison. This 10s use interval is an emphasis exception, not a default pacing rule.',
  exit='Preserve the modern plate format and tablet silhouette; the next cut introduces two different English-name rows rather than deity morphing.',
  negatives='No sensual goddess portrait, palace, banquet, assassination, historical rituals, seven-column deity board or photoreal planet rendering.',
  summary='금성 기호를 먼저 보여주고 5.5초에 dies Veneris로 초점을 옮긴다. 10초는 낭독 밀도 때문에 유지한 강조 컷이며 실측 뒤 다시 검토한다.', overlays=['dies Veneris', 'Venus / 금성의 날'], sfx='밝고 작은 원반 강조음; 과도한 신비 효과 없음.'),
 dict(key='cut3_2', title='Tuesday/Tiw와 Friday/Frigg', boards='B의 설명판 구도', mode='MATCH_TRANSITION',
  image='One stable modern comparison board with exactly two rows, placed on a grounded dark blue editorial surface. Each row has two generous blank typesetting zones, a small abstract emblem and no human or deity portrait. The upper-row emblem uses an angular notch; the lower-row emblem uses an offset loop, making them visibly distinct without claiming historical iconography. Leave the lower row subtly subordinate in the ENTRY image. Use a medium oblique framing with very shallow layer depth, blue-gray board material and restrained amber edge light; the board geometry must allow static editorial typography.',
  motion='0.0–1.5s: settle into the single comparison board; at 1.5s reveal the Tuesday/Tiw row by composited emphasis. 1.5–5.3s: retain a gentle 8% forward camera approach while the first row reads. At 5.5s move editorial emphasis to the Friday/Frigg row, with a small downward camera adjustment. 5.5–9.3s: keep both rows in one stable frame for the contrast. 9.3–10.0s: settle, preserving rectangular paper-plane geometry for the next shot. No gods or names morph into one another.',
  exit='Both distinct rows remain legible; hand off their rectangular comparison geometry to two separate language cards on the desk.',
  negatives='No additional Germanic deity roster, Roman/Germanic identity equivalence, god faces, face morphing, automatic letters or repeated zooms.',
  summary='두 행에서 Tuesday/Tiw 다음 Friday/Frigg를 읽힌다. 이 한 컷에서만 해당 대비를 전개하고 로마 신과 같은 인물로 그리지 않는다.', overlays=['Tuesday / Tiw', 'Friday / Frigg', '서로 다른 이름 전통'], sfx='행 전환 시 작은 톤 2개.'),
 dict(key='cut3_3_A', title='분리된 카드, 같은 요일 위치', boards='A / B의 종이 형태', mode='MATCH_TRANSITION',
  image='Close oblique view of two separate illustrated paper language cards on the familiar dark-indigo desk, one Latin comparison card and one English comparison card. Their rectangular edges are offset, exposing distinct paper thicknesses; blank printed-label zones and one corresponding weekday position on each card are clearly separated. Neither card is a full cloned seven-cell board. Keep the two cards partly apart at ENTRY so an later overlap can reveal their positional relationship. The original smartphone exists outside this close crop to the right. Upper-left amber desk light and cool blue-gray painted shadows maintain the established environment.',
  motion='0.0–1.0s: move along the two different paper edges and reveal their separation at 1.0s. 1.0–5.3s: take one shallow lateral camera path with the card edges acting as parallax anchors. At parent 5.5s, slide the two already-present cards a short distance to partially overlap, exposing the correspondence of one weekday position while their labels remain distinct. 5.5–7.5s: hold the overlap relation and begin a gentle pullback toward the unseen phone. The cards remain two physical editorial props.',
  exit='End on two partially overlapping cards with the rightward desk area opening into view; cut3_3_B starts from the actual used exit frame if production is approved.',
  negatives='No floating letters, repeated color-swapping week-grid motif, god-name morph, direct transmission arrows, extra cards or spontaneous device arrival.',
  summary='100–107.5초 제안. 분리된 종이 카드가 105.5초에 겹쳐 같은 요일 위치와 다른 이름을 드러낸다.', overlays=['라틴어', '영어', '서로 다른 이름 / 같은 요일 위치'], sfx='105.5초 짧은 종이 미끄러짐.'),
 dict(key='cut3_3_B', title='카드에서 일상 스마트폰으로', boards='A', mode='CONTINUATION',
  image='Start from the candidate overlap state of the two grounded language cards on the same desk, framed slightly wider than the preceding close view. The same blue-gray smartphone is physically present at the right edge, with its full body mostly concealed beyond the initial crop. Its Korean calendar page has blank stable typography zones and the same device proportions, diagonal angle and amber upper-left light as the opening. The paper cards stay separate objects with visible thickness. Layering must support a camera pullback that reveals the actual device and desk instead of returning to an abstract full-screen diagram.',
  motion='Local 0.0–2.4s (parent 7.5–9.9s): continue the prior pullback slowly while keeping the overlapping cards readable. At local 2.5s (parent 10.0s), clearly reveal the full original smartphone body and the desk area beside it. Local 2.5–6.5s: travel slightly rightward, settling on the Korean calendar page without altering any names. Local 6.5–7.5s: pause on the familiar object, preparing the next cut to explain the sun/moon and five-element celestial groupings. The parent narration continues without a new audio segment.',
  exit='The familiar device and desk become the focal anchor; leave its screen calendar clear for cut3_4_A.',
  negatives='No new spoken text, audio split assumption, device change, Latin-to-Korean genealogical morph, cosmic prop spawning or detached overlay panels.',
  summary='107.5–115초 제안. 원래 잠금의 110초 스마트폰 공개를 그대로 유지한다. 부모 음성은 끊거나 다시 녹음하지 않는다.', overlays=['한국어 달력(정확한 글자 후반 합성)'], sfx='카메라 확대에는 아주 낮은 책상 공간음.'),
 dict(key='cut3_4_A', title='한국어 해·달, 이어 다섯 천체', boards='A', mode='CONTINUATION',
  image='A medium-close oblique view of the same smartphone calendar on the same desk. Its seven weekday positions are stable blank typesetting targets. Two positions are paired with a clean sun disc and the established crescent as a modern editorial meaning overlay, while five other positions are initially lower contrast. Keep all symbols on one explanatory plane tied to the phone screen, not hovering in an imagined ancient sky. Use simple line and painted graphic forms, blue-gray device edges and amber left light. Reserve a separate lower margin for later modern meaning labels without changing the actual Korean weekday text.',
  motion='0.0–1.0s: retain the inherited phone frame and reveal the sun/moon meaning pair at parent 1.0s with editorial emphasis. 1.0–4.8s: make a single shallow diagonal approach, keeping the two highlighted weekday positions readable. At parent 5.0s reveal the five remaining positions as one grouped modern explanatory graphic for the five-element celestial names. 5.0–7.5s: shift attention to this second group and settle. Camera scale changes are restrained so the information stays legible.',
  exit='The same phone calendar carries two clearly distinguished meaning groups; pass the exact used frame to cut3_4_B before any wider synthesis.',
  negatives='No literal elemental fire/water spectacle, Roman deity substitution, religion claims, five competing flying planets, historical spread routes or fake Korean letters.',
  summary='115–122.5초 제안. 116초 해·달, 120초 나머지 다섯 칸을 공개한다. 현대 의미 비교이며 로마에서 한국으로의 이동은 그리지 않는다.', overlays=['日 / 일 / 해', '月 / 월 / 달', '火 / 화', '水 / 수', '木 / 목', '金 / 금', '土 / 토'], sfx='그룹 공개 시 단순한 두 개의 강조음.'),
 dict(key='cut3_4_B', title='한국어 표기 의미를 회수', boards='A', mode='CONTINUATION',
  image='Continuation state of the identical smartphone calendar after the two meaning groups have been established. Retain the sun/moon symbols and five stable blank-label positions on one modern explanatory plane; the device and desk remain clearly visible. Start with the five-position group nearest the camera, allowing a later pullback to reveal all seven positions together. Use no additional icons beyond the established grouping. Drawn device bevels, painted desktop planes and cool shadows maintain the non-realistic style.',
  motion='Local 0.0–3.0s (parent 7.5–10.5s): continue a short lateral traverse across the already-revealed five-position group, preserving all typeset labels. Local 3.0–6.0s: broaden the view to bring the sun/moon and five-name groups back into one clear calendar frame. Local 6.0–7.5s: settle and let the concluding Korean naming statement read. This is a recovery of already introduced relationships, not a new disclosure or historical origin claim.',
  exit='Keep the original phone and common calendar positions visible, then match to the physical tabletop language cards in cut4_1_A.',
  negatives='No expanding seven-cell clone boards, new historical map, name mutation into Latin, flying deity icons, fictitious ancient interiors or voice speedup.',
  summary='122.5–130초 제안. 새 정보를 더하지 않고 두 그룹을 한 달력으로 회수해 한국어 이름의 의미를 정리한다.', overlays=['해·달 / 오행에 연결된 천체 표기', '로마 신 이름의 음역이 아님'], sfx='추가 효과음 없이 정보 읽기 시간을 둔다.'),
 dict(key='cut4_1_A', title='이미 설명한 세 이름 전통', boards='A / B의 카드 형태', mode='MATCH_TRANSITION',
  image='Detail view of three modern explanatory paper cards grounded on the familiar desk, with generous blank label zones for Latin, English and Korean name traditions. Use the same compact set of cards already established in the sequence, never a four-panel montage of boards A/B/C/D. Begin close enough that the card surfaces and their different headings dominate; the original phone and one calendar card already occupy an offscreen part of the same desk. Each card has equal physical stature. Preserve upper-left amber light and cool blue-gray painted shadows, leaving one clean camera path outward to the full device.',
  motion='0.0–1.0s: reorient to the modern language-card details and begin composited heading emphasis at parent 1.0s. 1.0–5.3s: follow one lateral scan that recalls the three already-taught naming traditions; no new tableau appears. At parent 5.5s begin a clear camera pullback to expose the calendar card and full smartphone in the same space, introducing the second and final reading state. 5.5–6.0s: continue this movement across the proposed subshot boundary.',
  exit='Leave the second reading state opening, with the phone body and calendar card entering the frame; cut4_1_B continues the actual used motion state.',
  negatives='No four-board simultaneous montage, hierarchy of card sizes, new god roster, floating explanation panels or three repeated zoom hits.',
  summary='130–136초 제안. 3개 이름 전통을 같은 책상 카드로 회수하고 135.5초에 두 번째 읽기 상태로 확대를 시작한다.', overlays=['라틴어: 신명·행성명', '영어: 일부 다른 신명', '한국어: 천체 표기'], sfx='회수 강조음은 작은 한 계열로 통일.'),
 dict(key='cut4_1_B', title='같은 일곱 칸을 빛 하나로', boards='A', mode='CONTINUATION',
  image='Wider continuation of the same three paper language cards, one calendar card and original smartphone on the same illustrated desk. The phone is fully visible and the calendar positions are prepared as static blank text locations. Keep precisely the previous object placement and light direction. Give the shared weekday position a clean subtle amber line cue as an editorial overlay target, with no extra diagrams. The cards and phone occupy one coherent tabletop space with clear drawn thickness and perspective.',
  motion='Local 0.0–2.4s (parent 6.0–8.4s): finish the inherited pullback, revealing the full phone and calendar-card relationship. At local 2.5s (parent 8.5s), use one restrained editorial light cue to collect the common weekday position across the existing objects. Local 2.5–5.0s: hold this second reading state and allow the synthesis to land. Local 5.0–6.0s: settle on the desk plane and separated card objects for the next comparison. Do not add a third reading state.',
  exit='Keep the same cards grounded and separately readable; next cut explores their equal coexistence rather than introducing a new space.',
  negatives='No orbit rings, animated geographic arrows, direct Roman-to-Korean descent line, card cloning, montage or new background.',
  summary='136–142초 제안. 원래 138.5초 공통 위치의 빛 회수를 유지한다. 첫 컷과 합쳐 두 읽기 상태만 사용한다.', overlays=['공통된 일곱 칸 / 서로 다른 이름'], sfx='138.5초 단음 하나; 확대 잔향은 작게.'),
 dict(key='cut4_2_A', title='동등한 이름 카드의 공존', boards='A / B의 설명 카드', mode='CONTINUATION',
  image='Medium oblique view across the same tabletop, initially focused on one modern language card. Latin, English and Korean explanatory cards all have equal dimensions and lie separately on the same plane; the other two are already present just beyond the initial crop. The original smartphone is farther right, also physically present. A slab-shaped graphic printed on one paper card recalls board B without turning it into an authentic artifact. Draw broad painted desk planes, visible card thickness and cool shadows under upper-left amber light. No radial source layout or central dominant origin card.',
  motion='0.0–1.0s: inspect the first equal-sized card, reaching its clear reading angle by parent 1.0s. 1.0–5.3s: travel laterally along its edge with a deliberate low tabletop camera path. At parent 5.5s widen the lateral field to discover the other two equal cards. 5.5–6.0s: continue this same movement across the proposed subshot boundary; do not recompose into a hierarchy.',
  exit='The first and second card edges remain aligned on the same desk plane; cut4_2_B continues the lateral discovery.',
  negatives='No Roman root-tree diagram, hub-and-spoke layout, center/periphery hierarchy, orbital ring, spread map, propagation arrows or authentic inscription.',
  summary='142–148초 제안. 한 카드를 먼저 읽고 147.5초에 동등한 다른 카드로 시야를 넓힌다. 로마 단일 기원처럼 보이는 위계는 만들지 않는다.', overlays=['라틴어', '영어', '한국어'], sfx='종이 공간의 아주 작은 이동음.'),
 dict(key='cut4_2_B', title='다른 카드와 현대 달력을 함께', boards='A', mode='CONTINUATION',
  image='Wider same-space view of the equal Latin, English and Korean paper cards, all separate and grounded. The original smartphone rests at the far right, matching its opening geometry. A modern paper card bearing a blank slab-shaped diagram has an edge angled to match the phone outline in the next shot. No card occupies a privileged central origin position. Cool blue-gray shadows and upper-left amber rim highlights keep one graphic environment. Frame with enough rightward space for camera attention to move from cards to the coexisting device.',
  motion='Local 0.0–2.8s (parent 6.0–8.8s): continue the inherited lateral widening until the equal cards coexist clearly. At local 3.0s (parent 9.0s), redirect attention to the original smartphone beside the cards. Local 3.0–5.2s: let the camera settle on their shared desk placement. Local 5.2–6.0s: favor the slab-shaped paper-card edge and phone outline for the following graphic match. Maintain one spatial path and do not imply a historical transportation route.',
  exit='Finish with the slab-shaped explanation-card rectangle matching the original phone outline, ready for cut4_3_A.',
  negatives='No direct transmission arrow, multiplying cards, celestial orbit rings, antiquarian document realism, letter transformation or new physical setting.',
  summary='148–154초 제안. 151초에 스마트폰으로 관심을 옮기고 설명 카드의 사각형으로 다음 매치 컷을 준비한다.', overlays=['이름은 이어지거나 달라진다'], sfx='추가 정보 전환음 없이 여유를 둔다.'),
 dict(key='cut4_3_A', title='휴대폰 사각형으로 다시 매치', boards='B → A / C의 의미 빛', mode='MATCH_TRANSITION',
  image='Close diagonal framing of the same slab-shaped modern paper explanation card adjacent to the original smartphone. Their rectangular outer edges share the same angle, preparing a precise editorial shape match. The phone screen contains stable blank text locations for the actual Korean weekday labels; a narrow amber light path is prepared along small moon/planet meaning-symbol positions on a separate explanatory layer. Preserve the phone, desk plane and blue-gray/amber palette. This entry image is a present-day graphic construction, not an ancient tablet turning literally into a device.',
  motion='0.0–1.0s: align the slab-shaped card outline with the smartphone rectangle, completing the graphic attention match at parent 1.0s through an editorial cut. 1.0–5.3s: approach the stable Korean calendar screen using one diagonal dolly. At parent 5.5s shift emphasis to the meaning-symbol layer and send one controlled editorial light trace along the existing symbols. 5.5–7.0s: keep the Korean letters entirely fixed while the light settles. The overlay expresses naming associations, not identity replacement.',
  exit='Keep the original screen labels stable and the single light trace quiet; cut4_3_B continues toward a wide view of the ordinary desk.',
  negatives='No Korean characters changing into deity names, actual time travel, cosmic objects breaking the screen, phone reshaping or extra portal layers.',
  summary='154–161초 제안. 사각형 매치 후 159.5초에 의미 기호로 초점을 옮긴다. 한국어 글자 자체는 바꾸지 않는다.', overlays=['원래 한국어 요일명(고정)', '달·행성 등 의미 기호(별도 설명층)'], sfx='매치에 짧은 클릭, 의미 빛에는 작은 일회성 톤.'),
 dict(key='cut4_3_B', title='새 의미를 안고 일상 책상으로', boards='A / D의 푸른 반사색', mode='CONTINUATION',
  image='Continuation close state of the same smartphone on the same dark-indigo desk, with stable Korean weekday labels reserved for editorial compositing and the already introduced meaning symbols fading in visual prominence. The familiar paper explanation card remains nearby. Cool crescent-blue reflection on the phone edge recalls board D while retaining the upper-left amber desk-light structure. Prepare a wider layer layout so the camera can reveal the full original desk at the approved parent 10-second beat. No new objects or alternate device geometry.',
  motion='Local 0.0–2.9s (parent 7.0–9.9s): continue the gentle backward movement from the symbol emphasis and let the light trace settle; do not add new meaning graphics. At local 3.0s (parent 10.0s), broaden to the full ordinary desk and full original phone. Local 3.0–6.0s: ease farther back, keeping the blue reflection as a modest visual memory of the moon-space. Local 6.0–7.0s: hold quiet negative space for the viewer question and a stable ending handoff.',
  exit='End on the familiar smartphone/desk wide view with a restrained crescent-blue reflection, ready for the next-day calendar move.',
  negatives='No return to historical reenactment, replacement of weekday names, cosmic spectacle, new props, automatic captions or sudden camera direction reversal.',
  summary='161–168초 제안. 원래 164초 책상 전체 공개를 유지하고 D의 푸른색은 작은 반사 기억으로만 회수한다.', overlays=['익숙한 요일 이름을 다시 본다(선택적 편집 제목)'], sfx='효과음은 줄이고 나레이션을 앞에 둔다.'),
 dict(key='cut4_4_A', title='달의 기억에서 다음 달력 칸으로', boards='D → A', mode='CONTINUATION',
  image='Same smartphone and desk in the prior wide composition, with a small crescent-shaped blue reflection on the device edge as an editorial echo of the stylized moon. The screen calendar has stable weekday typesetting targets and one current-position highlight, prepared to move only one cell. Keep quiet dark space to the left, the original device angle and the restrained amber desk light. The moon echo is visibly graphic and does not introduce a new real night exterior. Keep the ending composition free of new characters and clutter.',
  motion='0.0–1.0s: redirect from the crescent-blue reflection to the calendar screen, landing on the current position at parent 1.0s. 1.0–5.3s: make a short controlled diagonal camera move while the final narration begins. At parent 5.5s advance the editorial calendar position by exactly one cell, keeping all weekday lettering intact. 5.5–6.0s: settle on that next-cell state for cut4_4_B. Do not reset the camera at the subshot boundary.',
  exit='The next weekday cell is selected on the same calendar; retain this stable state for the last symbolic release and quiet question.',
  negatives='No lyric singing, day-counter acceleration, multiple page flips, new deity words, real moon exterior, confetti or loud climax.',
  summary='168–174초 제안. 169초 달력으로 초점 이동, 173.5초 다음 한 칸으로 이동한다. 노래 대신 승인 문장을 차분히 읽는다.', overlays=['실제 한국어 요일명', '다음 칸 강조(편집)'], sfx='173.5초 작고 한 번의 달력 칸 이동음.'),
 dict(key='cut4_4_B', title='질문과 여백, 180초 종료', boards='A / C의 마지막 별빛', mode='CONTINUATION',
  image='Quiet continuation of the identical smartphone calendar with the next cell selected, resting on the established dark-indigo desk. Preserve all screen weekday labels as static blank typesetting zones in the source image. A few understated illustrated star marks are prepared only on the separate meaning-symbol layer, not on the actual phone lettering. Leave broad dark negative space at the left for an optional final editorial question. The camera-ready composition remains open and calm, with cool blue reflection and a faint amber device edge; it has not faded to black yet.',
  motion='Local 0.0–3.0s (parent 6.0–9.0s): ease the camera to a quiet wider framing; release only the explanatory symbols and optional editorial title into a few drawn star marks. Keep the actual Korean screen text intact. Local 3.0–5.0s: settle and preserve reading space while the final spoken question ends. At local 5.0s (absolute 179.0s), begin the final fade in the editor, reaching black at 180.0s only after verifying the measured narration has finished. Do not render any fade inside the generated clip; the usable source must retain handles.',
  exit='A stable quiet phone/desk image before the editorial fade; archive the actual used exit frame, then apply the measured end fade and music tail.',
  negatives='No dissolving real phone characters into Roman names, new information, lyric vocals, automatic fade baked into I2V, abrupt sound cutoff or effect overload.',
  summary='174–180초 제안. 흩어지는 것은 별도 의미 기호·편집 제목이며 실제 달력 글자는 유지한다. 179초 페이드는 TTS 종료 실측 뒤 편집에서 적용한다.', overlays=['당신의 하루에는 어떤 시간의 흔적이 남아 있습니까?(선택적 제목)'], sfx='미세한 별빛 잔향; 마지막 질문 아래 가사 없는 BGM만.'),
]

GLOBAL_NEGATIVE = ('No photorealism, live-action look, documentary reenactment, hyperreal skin or realistic cinematic reconstruction. '
 'No invented historical faces, garments, interior details, rituals, killings, invasion alerts or weekday-event claims. '
 'No faux ancient Latin lettering, watermarks, logos or generated required typography. No vertical framing, shortform central-band crop, persistent header or baked subtitles. '
 'Keep all exact lettering in a separate modern editorial layer.')

split_lengths = {'cut3_3': [7.5,7.5], 'cut3_4': [7.5,7.5], 'cut4_1': [6.0,6.0], 'cut4_2': [6.0,6.0], 'cut4_3': [7.0,7.0], 'cut4_4': [6.0,6.0]}
source_files = [
 '02_script/script-draft-r04.json', '02_script/approved-scene-graph-sg01.json',
 '02_script/script-directing-lock-sdl-r04.json', '02_script/manager-story-gate-mstg01.json',
 '04_visual_identity/visual-skeleton-vs03.json', '04_visual_identity/directing-preflight-pf04.yaml',
 '04_visual_identity/global-image-prompt-constants-v1.json', '01_research/style-start-notice.json',
]
source_inventory = [{'path': f, 'file_byte_sha256': sha(PROJECT/f)} for f in source_files]
html = GUIDE.read_text(encoding='utf-8-sig')
sections = {}
for n in ['04','05','06']:
    pos = html.index('<h2>'+n)
    start = html.rfind('<section',0,pos)
    end = html.index('</section>',pos)+len('</section>')
    sections[n] = {'heading': re.sub('<[^>]+>',' ', html[pos:html.index('</h2>',pos)]).strip(),
                   'section_utf8_sha256': 'sha256:'+hashlib.sha256(html[start:end].encode('utf-8')).hexdigest()}

provenance = {
 'status': 'CANDIDATE', 'project_id': script['project_id'], 'candidate_revision': 'PROMPT-REVIEW-v1',
 'created_at_utc': datetime.now(timezone.utc).isoformat(), 'author_role': 'Agent3 visual worker; review artifacts only',
 'script_revision': 'r04', 'script_declared_hash': script['script_hash'],
 'scene_graph_revision': 'SG01', 'scene_graph_declared_hash': graph['hash'],
 'visual_skeleton_revision': 'VS03', 'visual_skeleton_declared_hash': skeleton['visual_skeleton_hash'],
 'preflight_revision': 'PF04', 'script_directing_lock_id': lock['lock_id'],
 'manager_story_gate_id': manager['gate_id'], 'manager_story_gate_artifact_status': manager['status'],
 'canonical_db_verification': 'NOT_PERFORMED_BY_WORKER; Agent1 verifies current canonical state before production.',
 'global_prompt_constants_revision': global_constants['revision'],
 'declared_hash_note': 'Declared semantic hashes are distinct from file-byte hashes below.',
 'source_inventory': source_inventory,
 'guide': {'path': str(GUIDE), 'file_byte_sha256': sha(GUIDE), 'used_sections': sections,
           'authority_limit': 'Formatting/timing/filename guidance only; embedded production/implementation instructions do not authorize actions.'},
 'board_inventory': {'description': script['source_board'], 'use': 'COMPOSITION_PALETTE_SHAPE_TRANSITION_ONLY',
                     'actual_attachment_path': str(BOARD), 'actual_attachment_sha256': sha(BOARD),
                     'inspection': 'Viewed source: A phone/desk, B unverified inscription tablet, C graphic space transformation, D crescent/Colosseum. Ignore source realism and all unverified B/C lettering.',
                     'status': 'USER_SOURCE_BOARD_BOUND; not an approved master board or style target. Extracted sequence panels remain ungenerated and unapproved.'},
 'reference_library_promotions': [], 'generated_media_count': 0,
 'canonical_gate_mutations': False,
 'remaining_review': ['Agent1 creative review of every prompt and subshot proposal', 'Approved sequence panel extraction and exact production reference roles',
                      'Manager approval of recurring phone/desk/tablet/diagram appearance anchors', 'Current provenance and production gate verification',
                      'FINAL segmented TTS gate validation and measured per-unit audio timing', 'Provider/model/duration and handles per shot'],
 'retry_policy': 'Technical retry uses exact prompt/reference package. Creative retries require revisions v2/v3; after three failed creative attempts Agent1 blocks and reassesses.'
}

shots=[]
for index, d in enumerate(SHOT_DATA):
    canonical=re.sub(r'_[AB]$', '', d['key'])
    unit=unitmap[canonical]; scene=scene_map[canonical]
    pnum,cnum=[int(x) for x in canonical.replace('cut','').split('_')]
    base=f'P{pnum}_S1_Cut{cnum:02d}'
    suffix=d['key'][len(canonical):]
    alias=base+suffix
    duration=split_lengths[canonical][0 if suffix=='_A' else 1] if suffix else unit['end_sec']-unit['start_sec']
    offset=split_lengths[canonical][0] if suffix=='_B' else 0.0
    start=unit['start_sec']+offset
    prev=shots[-1]['shot_id'] if shots else None
    continuation=d['mode']=='CONTINUATION'
    frame_contract=('Future production requirement, after prior media exists and passes Agent1 review: use the previous shot\'s actual EDITED use-exit frame as START, with exact object geometry, desk angle and light direction. '
                    'The prose ENTRY specification below is a review target and may not replace that continuity reference.' if continuation else
                    'Future production requirement: generate and review this shot\'s START image, then use it only after Agent1 approves it. No approved START image currently exists. For a graphic match, bind the previous actual EDITED use-exit frame once available for shape/direction reference; preserve only the planned match, not a false physical continuity.')
    image_prompt=(f'Horizontal 16:9 ENTRY image, generation target 1536x864, composed for a 1920x1080 edit. '
                  f'SCENE PURPOSE: {visualmap[canonical]["story_event"]} is specified in the Korean story sheet; the English geometry below expresses that approved scene without adding claims. '
                  +d['image']+' CONTINUITY: The phone, desk, uninscribed tablet and card geometry described here are candidate appearance specifications; use their actual manager-approved reference anchors once bound. '
                  'Use user board panel(s) '+', '.join(dict.fromkeys(re.findall(r'[ABCD]',d['boards'])))+' only for composition, palette, shape and transition ideas, transformed visibly into illustrated graphic fantasy. '
                  'All required labels listed in metadata are composited later as modern explanatory text. '
                  'NEGATIVE: '+d['negatives']+' '+GLOBAL_NEGATIVE+'\n\n'+global_constants['global_style_suffix'])
    # English prompt body only; Korean story lives in the review fields rather than in executable prose.
    image_prompt=image_prompt.replace(f'SCENE PURPOSE: {visualmap[canonical]["story_event"]} is specified in the Korean story sheet;',
                                       'SCENE PURPOSE: The approved factual/narrative event is specified in the accompanying story sheet;')
    motion_prompt=('STORY: '+d['image'].split('. ')[0]+'. Communicate the event and factual limit stated in the parent story sheet; this proposed subshot adds no narration or historical claim.\n'
                   'FRAME: '+frame_contract+' The illustrated ENTRY state in the image prompt is a CANDIDATE description, not an existing approved asset. In future production retain horizontal 16:9, all object counts and visible drawing language.\n'
                   'MOTION: '+d['motion']+' Timing values are proposed EDITED-use seconds at 1.0x narration, not measured TTS or provider generation length.\n'
                   'EXIT: '+d['exit']+' Extract the actual edited use-exit at the chosen handoff timestamp, not the provider\'s final generation frame. Render no inter-shot fades, wipes or typography mutations inside I2V; planned UI/text/symbol layers are assembled in editing.\n'
                   'NEGATIVE: '+d['negatives']+' '+GLOBAL_NEGATIVE)
    transition={'type':'hard_cut' if continuation else 'match_cut','duration_sec':0.0,
                'reason_ko':'문자·휴대폰·카드의 중첩 잔상을 막고 연속 동작 또는 사각/원형 매치를 살리는 편집 예외.'}
    shot={
      'status':'CANDIDATE','canonical_unit_id':canonical,'canonical_scene_id':scene['id'],
      'canonical_scene_revision':scene['revision'],'canonical_sequence_id':scene['sequenceId'],
      'part_id':f'P{pnum}','sequence_id':'S1','cut_id':base,'shot_id':alias,
      'subshot_suffix':suffix or None,'shot_title_ko':d['title'],'review_summary_ko':d['summary'],
      'scene_purpose_ko':visualmap[canonical]['story_event'], 'evidence_ids':unit['evidence_ids'],
      'timeline':{'planned_start_sec':start,'planned_end_sec':start+duration,'planned_use_duration_sec':duration,
                  'parent_start_sec':unit['start_sec'],'parent_end_sec':unit['end_sec'],
                  'parent_local_start_sec':offset,'parent_local_end_sec':offset+duration,
                  'timing_status':'PROVISIONAL_ESTIMATE_ONLY','tts_measured_duration_sec':None,
                  'tts_speed':1.0,'generation_duration_sec':None,'generation_provider':None,'generation_model':None,
                  'head_handle_target_sec':0.3,'tail_handle_target_sec':0.3,
                  'handle_status':'PLANNING_ALLOWANCE_ONLY; provider capacity not selected or validated',
                  'handoff_target_absolute_sec':start+duration,'handoff_measured_timestamp_sec':None},
      'narration':{'exact_parent_text':unit['tts_text'],'text_sha256':'sha256:'+hashlib.sha256(unit['tts_text'].encode()).hexdigest(),
                   'estimated_parent_speech_sec':unit['estimated_speech_duration_sec'],
                   'tts_file_planned':f'03_tts/{base}.mp3','tts_revision':None,
                   'subshot_audio_slice':None,'subshot_audio_policy':'One continuous parent narration MP3; A/B are visual edit views only. Determine semantic word-aligned ranges after measured TTS.'},
      'story':{'approved_visual_note_ko':visualmap[canonical]['visual_note'],
               'directing_intent_ko':unit['directing_intent'],'state_in_ko':scene['stateIn'],
               'state_current_ko':scene['stateCurrent'],'state_out_ko':scene['stateOut'],
               'hold_back_ko':unit['reveal_policy'],'camera_reason_ko':pfmap[canonical]['camera_reason'],
               'parent_attention_event':unit['attention_event'],'parent_secondary_attention_event':unit['secondary_attention_event']},
      'image_prompt_english':image_prompt, 'image_prompt_utf8_sha256':'sha256:'+hashlib.sha256(image_prompt.encode()).hexdigest(),
      'motion_prompt_english':motion_prompt,'motion_prompt_utf8_sha256':'sha256:'+hashlib.sha256(motion_prompt.encode()).hexdigest(),
      'reference_contract':{'board_panels':d['boards'],'board_ref_planned':f'04_visual_identity/board_refs/P{pnum}_S1.png',
           'board_ref_exists_or_approved':False,'source_board_scope':'COMPOSITION_PALETTE_SHAPE_TRANSITION_ONLY',
           'previous_shot_id':prev,'previous_actual_used_exit_frame':None,
           'continuity_mode':d['mode'],'sequential_dependency_required':continuation,
           'manager_approved_appearance_anchor_ids':[],
           'appearance_status':'CANDIDATE descriptors only; no reference-library promotion',
           'factual_reference_note':'No external photographs supplied by this package. Real references, if added, are FACT/SHAPE only.'},
      'assets':{'image_candidate_planned':f'05_images/candidates/{alias}_1.png',
                'video_candidate_planned':f'06_clips/generated/{alias}_1.mp4',
                'parent_tts_planned':f'03_tts/{base}.mp3',
                'metadata_candidate_file':f'04_visual_identity/prompt-review-v1/{base}.json',
                'used_exit_frame_planned':f'06_clips/used_exits/{alias}_use_exit.png',
                'selected_image':None,'selected_video':None,'selected_tts':None,
                'candidate_index':1,'prompt_revision':'v1','tts_revision':None},
      'edit_audio':{'transition_in_candidate':transition,'transition_out_candidate':None,
                    'subtitle_policy_ko':'정확한 한국어 나레이션 자막은 실측 단어 정렬 뒤 편집층에서 제작; 이미지/I2V에 굽지 않는다.',
                    'typeset_overlays_ko':d['overlays'],'overlay_status':'PLANNED_ONLY; typography is not generated in I2V.',
                    'sfx_candidate_ko':d['sfx'],'bgm_candidate_ko':'가사 없는 낮은 앰비언트·그래픽 리듬; 나레이션보다 낮게. 컷 사이 음악은 이어간다.',
                    'qc_status':'CANDIDATE_SELF_REVIEW_ONLY'},
      'production_eligibility':'REVIEW_ONLY_PENDING_MANAGER_AND_MEASURED_TTS',
    }
    shots.append(shot)

for i,s in enumerate(shots):
    if i+1<len(shots):
        s['edit_audio']['transition_out_candidate']=shots[i+1]['edit_audio']['transition_in_candidate']
        s['next_shot_id']=shots[i+1]['shot_id']
    else:
        s['edit_audio']['transition_out_candidate']={'type':'editor_end_fade','duration_sec':1.0,'planned_start_sec':179.0,
               'condition':'Only after measured narration ends; adjust by manager if actual audio extends.'}
        s['next_shot_id']=None

cuts=[]
for unit in script['units']:
    group=[s for s in shots if s['canonical_unit_id']==unit['unit_id']]
    cut={'status':'CANDIDATE','canonical_unit_id':unit['unit_id'],'canonical_scene_id':scene_map[unit['unit_id']]['id'],
         'cut_id':group[0]['cut_id'],'canonical_scene_count_preserved':True,
         'planned_parent_start_sec':unit['start_sec'],'planned_parent_end_sec':unit['end_sec'],
         'exact_narration':unit['tts_text'],'estimated_speech_duration_sec':unit['estimated_speech_duration_sec'],
         'measured_tts_duration_sec':None,'tts_speed':1.0,'planned_tts_file':group[0]['assets']['parent_tts_planned'],
         'visual_subshot_proposal':len(group)>1,'shots':group}
    cuts.append(cut)

package={
 'status':'CANDIDATE','project_id':script['project_id'],'revision':'PROMPT-REVIEW-v1',
 'purpose_ko':'19개 승인 서사 단위의 이미지·I2V 후보 프롬프트 검토. 6개 장문 단위의 시각 분할은 제안이며 승인 Scene graph를 변경하지 않는다.',
 'style_mode':'NON_REALISTIC_STYLIZED','output_spec':global_constants['output_spec'],
 'guide_field_mapping':{'Identity':'part_id/sequence_id/cut_id/shot_id + canonical scene IDs',
                       'Timeline':'planned use range + actual TTS null + handles + per-shot provider duration null',
                       'Script':'approved state/visual event/evidence/reveal policy + Korean review summary',
                       'Narration':'exact_parent_text copied without rewriting; 19 continuous MP3s at 1.0x',
                       'Image Prompt':'English ENTRY prompt + exact GIPC01 suffix + negatives and reference limits',
                       'Motion Prompt':'English STORY/FRAME/MOTION/EXIT/NEGATIVE + local and parent beats',
                       'References':'composition-only board inventory + pending actual use-exit/appearance IDs',
                       'Edit & Audio':'match/hard cut candidates + typeset overlays + subtitles/SFX/BGM + candidate QC'},
 'timing_policy':{'parent_units':19,'visual_shots':25,'split_parent_units':list(split_lengths),
                  'planned_editor_duration_sec':180,'planned_shot_duration_sum_sec':sum(s['timeline']['planned_use_duration_sec'] for s in shots),
                  'maximum_planned_edited_shot_sec':max(s['timeline']['planned_use_duration_sec'] for s in shots),
                  'tts_speed':1.0,'actual_tts_duration_sec':None,'generation_length_equals_use_length':False,
                  'default_external_guide_transition':{'type':'cross_dissolve','duration_sec':0.3},
                  'candidate_transition_overlap_sum_sec':0.0,
                  'candidate_length_formula':'180.0s used clip sum - 0.0s inter-shot overlap = 180.0s provisional picture. Final end fade is applied inside the last interval.',
                  'dissolve_adoption_rule':'If any boundary uses a 0.3s dissolve, recompute sum(use)-sum(overlap) and add adequate handles/use ranges. Do not shorten or speed narration to force 180s.',
                  'pacing_exceptions_ko':'기존 승인 단위 8–10초는 핵심 어구·근거/한계 읽기 때문에 유지한 검토 예외. cut3_1/2는 10초 상한이며 실측 후 8초 초과 정당성 재검토. 오프닝 5–7초도 잠금된 30초 훅 구간 보존; guide 권장 2–4초로 임의 축약하지 않음.'},
 'asset_naming_policy':{'part_mapping':'part1..4 -> P1..P4; one canonical sequence per part -> S1',
      'cut_mapping':'cut{part}_{ordinal} -> P{part}_S1_Cut{ordinal:02d}',
      'image_video_candidate_suffix':'Trailing _1/_2/_3 is asset candidate index, not TTS revision or subshot ID.',
      'subshots':'_A/_B appears before image/video candidate index; e.g. P3_S1_Cut03_A_1.png.',
      'audio':'Parent P3_S1_Cut03.mp3 shared across A/B; no A/B MP3 and no merged narration.mp3.',
      'tts_revision_example':'P3_S1_Cut03_tts_v02.mp3; image variant index independent.',
      'paths_are':'Future logical paths only. These files do not exist and are not selected or approved.'},
 'fact_guardrails':script['fact_guardrails'],'provenance':provenance,'cuts':cuts,
}

def dump(name,data):
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

dump('prompt-review-package-v1.json',package)
dump('provenance-v1.json',provenance)

def clock(sec):
    return f'{int(sec)//60:02d}:{sec%60:04.1f}'

for c in cuts:
    dump(c['cut_id']+'.json',c)
    first=c['shots'][0]
    unit=unitmap[c['canonical_unit_id']]
    md=[f'# {c["cut_id"]} — {first["scene_purpose_ko"]}', '',
        '**상태: CANDIDATE · 사용자/Agent1 검토용 · 실제 이미지/음성/비디오 없음**', '',
        '## Identity / Script', '',
        f'- 원본 단위 `{c["canonical_unit_id"]}` → 승인 장면 `{c["canonical_scene_id"]}`. Part `{first["part_id"]}` / Sequence `S1`.',
        f'- 서사 사건: {first["scene_purpose_ko"]}',
        f'- 전후 상태: {first["story"]["state_in_ko"]} → {first["story"]["state_current_ko"]} → {first["story"]["state_out_ko"]}',
        f'- 연출 의도: {first["story"]["directing_intent_ko"]}',
        f'- 카메라 이유(PF04): {first["story"]["camera_reason_ko"]}',
        f'- 원본 장면 제약: {first["story"]["approved_visual_note_ko"]}',
        f'- 공개 순서/보류: {first["story"]["hold_back_ko"]}',
        f'- 근거 ID: {", ".join(first["evidence_ids"])}', '',
        '## 04 Timeline / Narration', '',
        f'부모 단위 계획 `{clock(c["planned_parent_start_sec"])}–{clock(c["planned_parent_end_sec"])}`. 낭독 추정 {c["estimated_speech_duration_sec"]}초, **TTS 실측 미생성/미확인(null)**. 속도 1.0×. 컷 경계·모션 비트·종료는 실측 뒤 다시 맞춘다.', '',
        '> '+c['exact_narration'], '',
        f'계획 오디오 `{c["planned_tts_file"]}`. 위 문장 그대로 한 부모 MP3를 유지한다. A/B 분할이 있어도 별도 TTS를 만들지 않으며 의미가 완결되는 단어 구간은 실측 정렬로 결정한다.', '',
        '|시각 샷|계획 구간|사용 길이|부모 내 구간|', '|---|---|---:|---|']
    for s in c['shots']:
        t=s['timeline']
        md.append(f'|`{s["shot_id"]}`|{clock(t["planned_start_sec"])}–{clock(t["planned_end_sec"])}|{t["planned_use_duration_sec"]}초|{t["parent_local_start_sec"]}–{t["parent_local_end_sec"]}초|')
    md+=['', '생성 길이/도구/모델은 미선택(null). 머리·꼬리 핸들 각 0.3초는 계획 여유이며 도구의 실제 지원 길이가 아니다. 위 시간은 사용 구간; 생성 길이와 동일하다고 가정하지 않는다.', '',
         '## 05 컷별 상세 제작 시트', '']
    for s in c['shots']:
        md += [f'<a id="{s["shot_id"].lower()}"></a>', '', f'### {s["shot_id"]} — {s["shot_title_ko"]}', '',s['review_summary_ko'], '',
            '**IMAGE PROMPT — English / GPT ENTRY image candidate**', '', '```text', s['image_prompt_english'], '```','',
            '**I2V MOTION GUIDE — English / STORY · FRAME · MOTION · EXIT**', '', '```text', s['motion_prompt_english'], '```','',
            '**References / continuity**', '',
            f'- A–D 참조 범위: `{s["reference_contract"]["board_panels"]}` — 구도·색감·형태·전환 아이디어만. 최종 스타일 타깃은 비실사 그래픽 판타지.',
            f'- 실제 사용자 보드: `{BOARD}` / `{sha(BOARD)}`. 이 원본은 master board 승인이나 실사 스타일 승인을 뜻하지 않는다. 추출 패널 경로는 미생성·미승인 placeholder이고 승인 외형 앵커 ID는 아직 없다. 후보 소품 설명을 승인 Reference library 항목으로 취급하지 않는다.',
            f'- 연결 유형 `{s["reference_contract"]["continuity_mode"]}` / 이전 샷 `{s["reference_contract"]["previous_shot_id"]}`. 실제 **편집 사용 종료 프레임**은 미생성(null). CONTINUATION은 해당 프레임 검수 뒤 순차 연결한다.',
            '- ENTRY 텍스트와 예시 경로는 검토 사양이다. 실제 생성 전 manager가 승인한 이미지·정확한 참조 인벤토리·현재 provenance를 결합한다.', '',
            '**Edit & Audio / QC**', '',
            f'- 후보 입력 전환: `{s["edit_audio"]["transition_in_candidate"]["type"]}` 0초. 문자·기하 중첩 방지를 위한 가이드 기본 0.3초 디졸브의 명시적 예외.',
            f'- 합성 글자/기호: {" / ".join(s["edit_audio"]["typeset_overlays_ko"]) or "필수 문자 없음"}. 이미지·I2V가 생성하는 글자가 아니라 편집층.',
            f'- SFX: {s["edit_audio"]["sfx_candidate_ko"]}',
            f'- BGM: {s["edit_audio"]["bgm_candidate_ko"]}',
            '- 나레이션 자막은 단어 정렬 실측 뒤 별도 편집층에 합성. SHORTFORM 고정 헤더·중앙 띠 규칙 없음.',
            '- 검수할 항목: 부모 서사·근거·공개 시점, 물체 수/모양, 스타일, 시작/사용 종료 인계, 화면 문자 정확성, TTS와 사용 길이, 이전·다음 샷 연속성. 현재 QC는 후보 자체 점검이며 승인 없음.', '',
            '**06 Asset filename / matching — 계획 경로, 파일 없음**', '',
            '|종류|경로|', '|---|---|',
            f'|이미지 1안|`{s["assets"]["image_candidate_planned"]}`|',
            f'|I2V 1안|`{s["assets"]["video_candidate_planned"]}`|',
            f'|부모 TTS|`{s["assets"]["parent_tts_planned"]}`|',
            f'|실제 사용 종료 프레임|`{s["assets"]["used_exit_frame_planned"]}`|',
            f'|후보 메타데이터|`{s["assets"]["metadata_candidate_file"]}`|','']
    md += ['## Provenance / approval boundary','',
           '`r04 / SG01 / VS03 / PF04 / GIPC01 / SDL-weekday-roman-gods-v1-r04 / MSTG-weekday-roman-gods-v1-01`에 묶인 검토 후보. 원본 파일 바이트 해시는 [provenance-v1.json](provenance-v1.json)에 보존한다. 소스의 선언 해시는 바이트 해시와 구별한다. script, scene graph, development lock, project.db는 이 패키지로 바꾸지 않았다.', '',
           '시각 분할을 생산에 적용할지와 실제 TTS 길이에 따른 변경 범위는 Agent1이 판단한다. 원본 의미·시간 가정·Scene graph를 바꾸는 결정이면 재검토/잠금·downstream invalidation 절차를 따른다. 이 문서는 생성 작업 지시나 승인 게이트가 아니다.', '']
    (OUT/(c['cut_id']+'.md')).write_text('\n'.join(md),encoding='utf-8')

overview=['# 요일과 로마 신 — 19컷 이미지·I2V 후보 검토 v1','',
 '**CANDIDATE · 생산 승인 아님 · 19 부모 단위 / 25 시각 샷 제안 · 실제 미디어 0개**','',
 '현재 r04·SG01 19장면·VS03·PF04를 보존한 상세 검토 패키지다. 첨부 HTML의 04(컷·TTS·타임라인), 05(상세 제작 시트), 06(파일명·매칭)을 각 컷 문서에 적용했다. 강한 판타지·그래픽 방향과 목적 있는 카메라 움직임을 쓰는 `NON_REALISTIC_STYLIZED`, 16:9이며 실사·다큐 재연·사실적 복원은 금지한다. 이미지 목표 1536×864, 편집/렌더 1920×1080.', '',
 'TTS는 아직 실측하지 않았다. 모든 시작·끝·사용 길이·모션 시점은 **계획값**이고 내레이션은 1.0×를 유지한다. 6개 10초 초과 부모 단위에만 A/B 시각 샷을 제안한다. 대본 문장·순서·근거·부모 장면 ID를 분할하거나 변경하지 않는다. A/B에는 공통 부모 MP3 한 개를 연결한다.', '',
 '## 04 컷·TTS·타임라인 개요', '',
 '|원본 단위 / 상세 시트|계획 구간|TTS 추정 / 실측|시각 샷 제안|검토 핵심|',
 '|---|---|---|---|---|']
for c in cuts:
    durations=' + '.join(f'{s["timeline"]["planned_use_duration_sec"]:g}초' for s in c['shots'])
    overview.append(f'|`{c["canonical_unit_id"]}` / [{c["cut_id"]}]({c["cut_id"]}.md)|{clock(c["planned_parent_start_sec"])}–{clock(c["planned_parent_end_sec"])}|{c["estimated_speech_duration_sec"]}초 / 미확인|{durations}|{c["shots"][0]["scene_purpose_ko"]}|')
overview += ['',
 '6개 분할 부모: `cut3_3` 7.5+7.5초, `cut3_4` 7.5+7.5초, `cut4_1` 6+6초, `cut4_2` 6+6초, `cut4_3` 7+7초, `cut4_4` 6+6초. 승인된 5/5.5/8.5/9/10초 부모 비트는 서브샷 로컬 시간으로 옮겨 적어 보존했다. A/B 경계는 음성 실측 전 후보이며 말 중간의 시각 전환으로 의미를 훼손하지 않는지 manager가 재검토한다.', '',
 'guide 권장은 일반 4–6초, 핵심 정보 6–8초, 절대 상한 10초다. 25개 제안 샷은 모두 10초 이하이고 cut3_1/2의 10초는 어구·이름 비교를 읽는 강조 예외다. 기존 30초 오프닝과 8–9초 설명 컷도 잠금된 서사 시간창을 보존하는 예외로 표시했으며 실측 후 호흡을 검토한다. guide 권장값만으로 대본을 압축하거나 TTS를 1.1×로 빠르게 하지 않는다.', '',
 '현재 전환은 연속 동작/정확한 사각형·원형·문자 매치를 위한 hard/match cut 0초 후보다. guide 기본 0.3초 디졸브는 문자열 이중상 위험 때문에 각 경계에서 예외로 표시했다. **180초 사용 합 − 0초 오버랩 = 180초 계획 영상**. 디졸브를 실제 적용하면 사용 길이와 핸들·오버랩을 다시 계산한다. 마지막 페이드는 179–180초 사용 구간 안의 편집 효과이며 실제 음성이 끝났는지 확인 뒤 적용한다.', '',
 '## 05 상세 프롬프트 구조', '',
 '각 상세 시트는 Identity / Timeline / Script / Narration / Image Prompt / Motion Prompt / References / Edit & Audio 필드를 갖춘다. 이미지용 영어 프롬프트에는 피사체·공간·화각·ENTRY 상태·빛·팔레트·깊이·연속성·금지 요소와 GIPC01의 정확한 전역 스타일 문구를 넣었다. I2V용 영어 문서는 STORY → FRAME → MOTION(시간 비트) → EXIT → NEGATIVE 순서다. 필수 문자는 이미지/영상 모델이 그리지 않고 편집에서 합성한다.', '',
 '보드 A–D는 구도·색감·형태·전환 참고만이다. 실제 첨부 `D:\\컴폴더\\다운로드\\파트 A,B,C,D기준 보드.png`를 보고 원본 SHA-256을 provenance에 결합했다. 원본의 실사 외관과 B/C 미검증 글자는 최종 스타일·사료로 재사용하지 않는다. 이 원본은 승인 master board가 아니며 추출 시퀀스 패널도 미생성·미승인이다. 반복 휴대폰·책상·석판 외형 설명은 후보이고 Reference library 승격에는 Agent1 승인이 필요하다. 연속 샷은 생성 전체의 끝이 아니라 **실제 편집 사용 종료 프레임**을 다음 START로 연결해야 한다.', '',
 '### 25샷 검토 색인', '',
 '|시각 샷 / 상세 링크|구간 / 사용 길이|핵심 동작·검토점|상태|',
 '|---|---|---|---|']
for s in shots:
    t=s['timeline']
    overview.append(f'|[{s["shot_id"]}]({s["cut_id"]}.md#{s["shot_id"].lower()})|{clock(t["planned_start_sec"])}–{clock(t["planned_end_sec"])} / {t["planned_use_duration_sec"]:g}초|{s["review_summary_ko"]}|CANDIDATE|')
overview += ['',
 '각 링크는 해당 부모 상세 시트의 샷별 IMAGE PROMPT/I2V MOTION GUIDE 카드로 연결된다. 보드 패널 경로는 미생성·미승인 placeholder다. 상위 프로젝트 설명은 [컷·TTS·이미지·모션 가이드](../cut-tts-image-motion-guide-v1.md)를 함께 참조한다.', '',
 '## 06 자산 파일명·매칭', '',
 '|개념|프로젝트 적용|', '|---|---|',
 '|Part/Sequence|`part1..4 → P1..P4`, 각 Part의 기존 canonical sequence 하나를 `S1` 별칭으로 매핑|',
 '|부모 Cut|`cut1_1 → P1_S1_Cut01` (JSON에 원본 scene/sequence UUID도 보존)|',
 '|일반 이미지/영상 1안|`P1_S1_Cut01_1.png` / `P1_S1_Cut01_1.mp4`|',
 '|분할 이미지/영상 1안|`P3_S1_Cut03_A_1.png`, `P3_S1_Cut03_B_1.mp4`|',
 '|부모 TTS|`P3_S1_Cut03.mp3` 하나를 A/B 모두 사용; `_A`/`_B`/이미지 시안번호 없음|',
 '|TTS 수정 버전|`P3_S1_Cut03_tts_v02.mp3`; 이미지 시안 번호와 별개|',
 '|현재 후보 시트/메타데이터|`P3_S1_Cut03.md` / `P3_S1_Cut03.json`|',
 '|미래 자산 폴더|`05_images/candidates/`, `06_clips/generated/`, `03_tts/`, `06_clips/used_exits/` — 경로 계획이며 미디어 파일 없음|', '',
 '## 검토 및 provenance', '',
 '- [전체 JSON 패키지](prompt-review-package-v1.json): 19컷·25샷·영어 전문·파일 매핑·가드레일.',
 '- [출처와 해시](provenance-v1.json): r04/SG01/VS03/PF04/SDL/MSTG/GIPC01 원본 바이트 해시, guide 파일·세 섹션 해시.',
 '- [후보 자체 검수](candidate-self-qc-v1.json): 수량·원문·시간창·비트·스타일 suffix·고유 ID·출처 일치의 구조 검수. Agent1 승인 대신 사용할 수 없다.', '',
 '다음 생산 전에 Agent1의 프롬프트·A/B 제안 검토, 원본을 비실사 방향으로 변환한 시퀀스 패널 검토, 외형 앵커 승인, 최신 canonical provenance, FINAL segmented TTS gate 및 실측/정렬, 샷별 도구·모델·생성 길이·핸들 결합이 필요하다. 실제 음성은 부모 19 MP3로 남겨 전체 narration.mp3로 합치지 않는다. 기술 재시도는 같은 프롬프트/참조, 창의 재생성은 v2/v3로 올리고 세 번 실패하면 manager가 BLOCK·재평가한다.', '']
(OUT/'README.md').write_text('\n'.join(overview),encoding='utf-8')

# Structural self-QC is artifact consistency checking, not a canonical approval.
assert len(cuts)==19 and len(shots)==25
assert len({s['shot_id'] for s in shots})==25
assert len({s['assets']['image_candidate_planned'] for s in shots})==25
assert len({s['assets']['parent_tts_planned'] for s in shots})==19
assert manager['approved_script_hash']==script['script_hash']==skeleton['input_script_hash']==preflight['input_script_hash']
assert manager['approved_scene_graph_hash']==graph['hash']
assert all(c['exact_narration']==unitmap[c['canonical_unit_id']]['tts_text']==scene_map[c['canonical_unit_id']]['scriptSegment'] for c in cuts)
assert all(s['image_prompt_english'].endswith(global_constants['global_style_suffix']) for s in shots)
assert all(all(k+':' in s['motion_prompt_english'] for k in ['STORY','FRAME','MOTION','EXIT','NEGATIVE']) for s in shots)
assert all(s['timeline']['tts_measured_duration_sec'] is None for s in shots)
assert all(0 < s['timeline']['planned_use_duration_sec']<=10 for s in shots)
assert sum(s['timeline']['planned_use_duration_sec'] for s in shots)==180
assert all(shots[i]['timeline']['planned_end_sec']==shots[i+1]['timeline']['planned_start_sec'] for i in range(24))
assert all(sum(s['timeline']['planned_use_duration_sec'] for s in c['shots'])==c['planned_parent_end_sec']-c['planned_parent_start_sec'] for c in cuts)
assert all(r['file_byte_sha256']==sha(PROJECT/r['path']) for r in source_inventory)
assert all(not re.search('[가-힣]',s['image_prompt_english']+s['motion_prompt_english']) for s in shots)
qc={'status':'CANDIDATE','self_qc_result':'PASS_STRUCTURAL_ONLY','manager_approval':None,
 'checks':{'canonical_unit_count':19,'canonical_scene_count':len(graph['scenes']),'visual_shot_proposal_count':25,
           'long_parent_units_split':6,'unique_shot_and_image_names':True,'unique_parent_narration_names':19,
           'narration_exact_r04_and_scene_graph_match':True,'parent_scene_time_windows_preserved':True,
           'all_edited_shots_lte_10sec':True,'planned_used_picture_duration_sec':180,
           'intershot_overlap_candidate_sec':0.0,'tts_actual_is_null_everywhere':True,'tts_speed':1.0,
           'english_only_prompt_text':True,'exact_global_suffix_every_image':True,'motion_required_fields_every_shot':True,
           'r04_sg01_vs03_pf04_provenance_match':True,'source_bytes_unchanged_after_build':True,
           'parent_attention_events_preserved_in_metadata':True,'generated_media_count':0},
 'unresolved':['Measured timing/word alignment','Approved sequence panel extraction','Approved recurring appearance anchors',
               'Provider/model/generation duration and handle capacity','Agent1 creative/continuity approval and canonical DB verification'],
 'style_review_note':'Explicit illustrated geometry and common non-realistic negatives in every shot; this is prose review, not generated-image QC.',
 'approval_boundary':'No approval record written; no canonical gate advanced; no images/TTS/video generated.'}
dump('candidate-self-qc-v1.json',qc)
print(json.dumps({'output':str(OUT),'cuts':19,'shots':25,'status':'CANDIDATE','structural_self_qc':'PASS'},ensure_ascii=False))
