import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const project = resolve(root, 'output/db-cooper-v3');
const sourcePath = resolve(project, 'inputs/DB_Cooper_v3_Codex_Shot_Manifest.json');
const planPath = resolve(project, 'review/270s-motion-sound-replan-v3.json');
const outputPath = resolve(project, 'review/shot-manifest-candidate-v5.json');
const [source, planBytes] = await Promise.all([readFile(sourcePath), readFile(planPath)]);
const manifest = JSON.parse(source.toString('utf8'));
const plan = JSON.parse(planBytes.toString('utf8'));
if (manifest.shots.length !== 30 || plan.shots.length !== 30 || manifest.target_duration_seconds !== 270) throw new Error('Unexpected inputs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const byId = new Map(plan.shots.map(shot => [shot.id, shot]));
manifest.revision = 'v5-script-aligned-directing-candidate';
manifest.status = 'DIRECTING_CANDIDATE_NOT_QC_APPROVED';
manifest.canonical_approval = false;
manifest.parent_manifest_sha256 = sha256(source);
manifest.directing_plan_sha256 = sha256(planBytes);
for (const shot of manifest.shots) {
  const direction = byId.get(shot.id);
  if (!direction || shot.keep_seconds !== direction.used_seconds) throw new Error(`Timeline mismatch ${shot.id}`);
  shot.tts_assigned_estimate_only = false;
  shot.preview_voice_at_1p1_seconds = direction.preview_voice_at_1p1_seconds;
  shot.preview_voice_slot_relative = direction.voice_slot_relative;
  shot.directing_cues_v3 = {
    viewer_gain: direction.viewer_gain,
    before_voice: direction.before_voice,
    during_voice: direction.during_voice,
    after_voice: direction.after_voice,
    sound: direction.sound,
  };
  shot.i2v_prompt_en = `Create one ${shot.source_seconds}-second 16:9 NON_REALISTIC_STYLIZED 2D ink-noir shot. START: ${shot.start}. CAMERA: ${shot.camera}. Before narration: ${direction.before_voice}. During narration: ${direction.during_voice}. After narration: ${direction.after_voice}. Viewer must learn: ${direction.viewer_gain}. Sound design cue: ${direction.sound}. Use the first ${shot.keep_seconds} seconds in the edit. Preserve identity anchors and geometry. ${shot.fact_guard}. No photorealism, live action, false eyewitness jump, invented readable historical text, or definitive survival/death.`;
}
const frames = {
  CL09: ['돈과 낙하산이 기내로 향하고 승객들이 반대로 내리기 시작하는 시애틀 정차 상태', '빈 통로 끝에 쿠퍼만 남고 재이륙 요구가 조종실 방향으로 전달되는 구도', '조종실 문과 남은 쿠퍼를 한 축에 두는 방향'],
  CL10: ['승객이 내린 객실을 지나 닫힌 계단 위치가 읽히는 727 측면 구도', '내린 착륙장치·낮은 속도·후방 계단 요구를 순서대로 보이는 그래픽 공간', '이륙 전 닫힌 후방 계단의 윤곽'],
  CL11: ['닫힌 후방 계단과 바퀴가 읽히는 활주로의 727', '계단을 닫은 채 밤하늘로 이륙한 727', '밤하늘 기체 암부에서 돈가방 쪽으로 내부 컷'],
  CL13: ['닫힌 커튼 뒤에서 조작 구조를 특정하지 않는 손과 계단 부근 실루엣', '반응하지 않는 계단 상태와 인터폰 신호가 같은 축에서 읽히는 구도', '조종실 인터폰으로 이어지는 신호'],
  CL14: ['조종실의 인터폰과 아직 어두운 계단 표시등', '연락 뒤 계단 경고등이 한 번 켜진 조종실 패널', '표시등 빛이 닫힌 커튼 주름으로 넘어감'],
  CL15: ['조종실에서 보이는 닫힌 커튼과 가려진 후방 객실', '시간이 지나도 안쪽이 보이지 않는 같은 커튼', '커튼 암부에서 인터폰 쪽으로 시선 이동'],
  CL16: ['조종실 인터폰으로 질문을 보내는 순간', '마지막 응답이 끝나고 인터폰이 정지한 조종실', '조용한 계기판 한 곳에 시선 고정'],
  CL17: ['형식을 특정하지 않은 조종실 계기의 바늘과 어두운 링', '20시 10분 무렵 한 번 움직인 바늘을 추상적으로 표현한 프레임', '계기 링의 검은 면'],
  CL18: ['인물 없는 727 후방 계단의 외부 실루엣', '사람을 보여주지 않은 채 리노에 도착한 항공기 실루엣', '착륙 뒤 빈 객실의 입구'],
  CL19: ['착륙 뒤 객실 통로로 진입하는 시점', '빈 좌석과 돈가방 자리, 넥타이 전경, 빈 후방 계단이 한 축에 읽히는 구도', '넥타이 검은 선이 수색할 숲 능선으로 연결'],
  CL20: ['넥타이에서 낙하산·구두의 기록물 실루엣으로 넘어가는 그래픽 공간', '조종 한계와 험지에 맞지 않는 구두를 보여주되 착륙 지점은 비워 둔 구도', '확정 표시 없는 넓은 수색 영역'],
  CL24: ['모래톱의 물결과 아직 드러나지 않은 지폐 모서리', '소년은 먼 실루엣이며 지폐 묶음 일부가 막 드러나는 순간', '액수·번호가 보이지 않는 낡은 지폐 묶음'],
  CL25: ['젖고 훼손된 지폐 묶음', '20달러권과 편집 합계 5,800달러, 옆에 놓인 조사 기록지의 번호 열', '번호 대조 결과를 아직 숨긴 두 표면'],
  CL26: ['지폐와 기록지의 번호 열이 같은 축에 놓인 상태', '번호 일치가 확인되지만 멀리 보이는 강변은 착륙 지점으로 표시하지 않는 구도', '경로가 비어 있는 강변의 넓은 공간'],
};
const motion = {
  CL09: ['승객 하차 흐름과 반대 방향으로 트랙해 남은 쿠퍼에서 조종실 문까지 시선을 이동', '승객은 내리고 쿠퍼는 남아 조종실 방향으로 요구를 전달하는 실루엣'],
  CL10: ['빈 객실에서 기체 측면으로 그래픽 전환→착륙장치·속도선·닫힌 후방 계단을 순서대로 스케일 변경', '기체 조건 세 가지를 추상 도식으로 제시하고 실제로 열린 계단 이륙은 보여주지 않음'],
  CL11: ['닫힌 후방 계단 로우앵글→기체 전체 PULL-BACK→활주와 상승 FOLLOW', '계단은 닫힌 채 유지하고 기체만 활주·상승'],
  CL13: ['손·레버 TIGHT PUSH-IN→반응 없는 계단 상태→인터폰 신호로 그래픽 이동', '손이 한 번 조작하고 인터폰 연락으로 넘어가되 실제 조작 절차는 만들지 않음'],
  CL14: ['인터폰 CLOSE→조종실 표시등으로 짧은 컷→점등 순간 PUSH-IN', '인터폰을 받는 움직임과 표시등 한 번 점등만 보여줌'],
  CL15: ['표시등 빛과 커튼 주름을 GRAPHIC MATCH→닫힌 커튼을 따라 측면 TRACK', '커튼 뒤 인물은 숨기고 천·조명·진동만 변화'],
  CL16: ['인터폰으로 FAST PUSH-IN→응답 신호와 함께 정지→조용한 계기판으로 짧은 TRUCK', '보이지 않는 쿠퍼는 재현하지 않고 인터폰의 신호 변화만 사용'],
  CL17: ['계기 바늘 CLOSE→한 번의 미세 진동에서 급정지→검은 링으로 MATCH CUT', '정확한 계기 형식·원인을 특정하지 않고 바늘 변화만 추상화'],
  CL18: ['인물 없는 계단 외부 PARALLAX→기체 장거리 FOLLOW→리노 착륙에 맞춰 컷', '기체와 계단만 보이며 점프 인물·낙하산·착지 장면 없음'],
  CL19: ['착륙 후 객실 통로 FAST PUSH→빈 좌석·돈자리·넥타이 QUICK CUT→빈 계단으로 이동', '쿠퍼·돈가방 없이 남은 넥타이와 후방 계단만 보여줌'],
  CL20: ['넥타이 선에서 낙하산·구두의 그래픽 인서트로 MATCH→불확실한 넓은 수색 영역으로 PULL-BACK', '실제 착륙이나 생존 장면 대신 기록물 실루엣과 빈 지도만 사용'],
  CL24: ['수면 LOW SKIM→모래톱 PARALLAX→발견 지점에 맞춰 지폐 묶음 부분 PUSH-IN', '소년은 먼 실루엣으로만 두고 지폐는 내레이션의 발견 시점에 드러냄'],
  CL25: ['훼손된 지폐 묶음 REVEAL→합계 편집 글자→옆 기록지 번호 열로 LATERAL TRACK', '젖은 지폐와 조사 기록지를 한 축에 놓되 번호 일치 결과는 보류'],
  CL26: ['지폐와 기록지의 번호 열 MATCH→일치 확인 뒤 강변으로 빠른 PULL-BACK', '번호 연결은 추상 선·편집 글자로만 보이고 착륙 지점은 그리지 않음'],
};
for (const [id, [start, target, exit]] of Object.entries(frames)) {
  const shot = manifest.shots.find(item => item.id === id);
  shot.start = start;
  shot.target = target;
  shot.exit = exit;
  [shot.camera, shot.subject_motion] = motion[id];
  shot.key_event = byId.get(id).viewer_gain;
  const direction = byId.get(id);
  shot.motion_events = [
    {window: `0–${direction.voice_slot_relative.start}s`, action: direction.before_voice},
    {window: `${direction.voice_slot_relative.start}–${direction.voice_slot_relative.end}s`, action: direction.during_voice},
    {window: `${direction.voice_slot_relative.end}–${shot.keep_seconds}s`, action: direction.after_voice},
    ...(shot.source_seconds > shot.keep_seconds ? [{window: `${shot.keep_seconds}–${shot.source_seconds}s`, action: 'Discarded source tail; no required reveal'}] : []),
  ];
  shot.i2v_prompt_en = `Create one ${shot.source_seconds}-second 16:9 NON_REALISTIC_STYLIZED 2D ink-noir shot. START: ${shot.start}. TARGET: ${shot.target}. USED EXIT: ${shot.exit}. Before narration: ${direction.before_voice}. During narration: ${direction.during_voice}. After narration: ${direction.after_voice}. Viewer must learn: ${direction.viewer_gain}. Sound cue: ${direction.sound}. Use only first ${shot.keep_seconds} seconds. Preserve continuity and visual-bible identity anchors. ${shot.fact_guard}. No photorealism, live action, false eyewitness jump, invented readable historical text, or definitive survival/death.`;
}
const opening = manifest.shots[0];
opening.target = '10초 편집 종료 프레임: 계단 내부의 검은 공간이 화면을 차폐한다. 열린 계단의 하향 구조는 6~8초 도중에만 완전히 읽힌다.';
opening.i2v_prompt_en = '10-second NON_REALISTIC_STYLIZED 2D ink-noir flight shot. Begin at a distant rear-three-quarter Boeing 727 silhouette. Fast arc and low push toward the under-tail airstair. At 6–8 seconds reveal the descending stair geometry clearly; from 8 to 10 seconds move into its dark interior until the 10-second target is full black stairwell occlusion. Preserve the T-tail, center engine and stair hinge. No visible jumper, landing, or photorealism.';
opening.motion_events = [
  {window: '0–6s', action: 'Approach under-tail area with continuous aircraft geometry'},
  {window: '6–8s', action: 'Clearly reveal descending ventral stair structure'},
  {window: '8–10s', action: 'Push into dark stairwell; used exit is black occlusion'},
];
const ending = manifest.shots[28];
ending.image_mode = 'SINGLE';
ending.start_source = 'GENERATE_START using reviewed CL01 6–8s stair-reveal frame as identity/geometry reference; do not copy CL01 10s black used exit';
ending.start = '열린 후방 계단의 6~8초 공개 상태를 시각 참조로 삼아 별도 생성한 START. 같은 T-tail·중앙 엔진·계단 축을 유지하며 10초 검은 EXIT와 혼동하지 않는다.';
ending.target = '8초 사용 종료 전에 같은 후방 3/4 축의 기체가 뒤로 물러나며 빈 밤하늘이 더 넓게 드러난다.';
ending.i2v_prompt_en = '10-second NON_REALISTIC_STYLIZED 2D ink-noir return shot. Use a newly generated START guided by a reviewed CL01 6–8 second visible-stair frame, preserving Boeing 727 tail, center engine and under-tail stair geometry. Never use CL01 dark 10-second exit as this START. Slowly reverse-dolly from the empty stair; the recognition of the opening shot must occur by seconds 4–6 and the pullback must read within the first 8 used seconds. No figure jumping, no definitive outcome, no photorealism.';
ending.motion_events = [
  {window: '0–4s', action: 'Visible stair identity re-established'},
  {window: '4–6s', action: 'Recognition of opening geometry'},
  {window: '6–8s', action: 'Pullback reaches editorial used exit'},
  {window: '8–10s', action: 'Discarded source tail; no essential reveal'},
];
const value = JSON.stringify(manifest, null, 2) + '\n';
try {
  if ((await readFile(outputPath, 'utf8')) !== value) throw new Error('Existing revision differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(outputPath, value, {flag: 'wx'});
}
console.log(`CANDIDATE READY: ${outputPath}`);
