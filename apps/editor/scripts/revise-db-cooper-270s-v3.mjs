import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, 'output/db-cooper-v3/review');
const sourcePath = resolve(review, '270s-motion-sound-replan-v2.json');
const outputPath = resolve(review, '270s-motion-sound-replan-v3.json');
const input = await readFile(sourcePath);
const plan = JSON.parse(input.toString('utf8'));
if (plan.shots.length !== 30 || plan.target_seconds !== 270) throw new Error('Unexpected input plan');
const revisions = {
  CL09: {
    viewer_gain: '36명 하차와 쿠퍼의 재이륙·멕시코시티 요구가 한 교환 안에서 연결된다',
    during_voice: '승객들이 밖으로 나가는 반대 방향으로 카메라가 남은 쿠퍼 쪽으로 돌아와 재이륙 요구가 조종실에 전달되는 방향을 보여준다',
    after_voice: '비어가는 통로 끝의 조종실 문이 다음 비행 조건 설명으로 시선을 넘긴다',
  },
  CL10: {
    viewer_gain: '낮은 속도·내린 착륙장치·열린 후방 계단을 요구했다는 세 비행 조건',
    before_voice: '텅 빈 좌석을 한 번 가린 뒤 기체 측면 실루엣과 닫힌 계단 위치로 빠르게 이동한다',
    during_voice: '착륙장치→느린 비행선→후방 계단 순서로 3개의 그래픽 조건을 차례로 읽힌다; 계단을 내린 채 이륙한 모습은 금지',
    after_voice: '후방 계단의 닫힌 윤곽에서 멈추며 조종실의 불가능하다는 답을 다음 클립에 남긴다',
    sound: '객실 룸톤→엔진 저음 감속→닫힌 계단의 금속음; 실제 비행 조건의 수치·가짜 교신 대사 금지',
  },
  CL11: {
    viewer_gain: '계단을 내린 채 이륙할 수 없어서 이륙 뒤에 내리기로 하고 다시 밤하늘로 오른다',
    before_voice: '닫힌 하부 계단과 기체 바퀴를 같은 축에서 보여 이륙 전 상태를 고정한다',
    during_voice: '불가능하다는 답의 순간 닫힌 계단을 강조하고, 그 상태로 기체가 활주로를 벗어나는 상승 경로를 따라간다',
    after_voice: '완전히 밤하늘로 올라간 뒤 돈가방을 향해 내부로 컷한다',
  },
  CL13: {
    viewer_gain: '쿠퍼의 후방 계단 조작이 잘되지 않아 조종실에 연락한다',
    before_voice: '커튼 암부에서 실제 조작 구조를 특정하지 않는 손·레버 실루엣으로 진입한다',
    during_voice: '계단이 즉시 반응하지 않는 변화 뒤 인터폰 신호가 조종실로 향한다',
    after_voice: '조종실에서 인터폰 신호가 들어오는 순간으로 다음 샷을 넘긴다',
    sound: '불규칙 바람과 금속 떨림→인터폰 연결음; 임의 조작 절차나 정확한 대사 금지',
  },
  CL14: {
    viewer_gain: '조종실이 어려움을 듣고, 이어 계단 경고등이 켜지지만 인물 행방은 알 수 없다',
    before_voice: '후방에서 온 인터폰 신호를 조종실 암부에서 받는다',
    during_voice: '연락 내용을 듣는 동안 경고등 위치를 예고하고, 경고등이 켜진다는 내레이션과 함께 표시등을 한 번 밝힌다',
    after_voice: '켜진 표시등을 한 번 읽힌 뒤 빛의 모양을 닫힌 커튼의 주름으로 넘긴다',
    sound: '인터폰 잡음→짧은 금속음→표시등 클릭 한 번; 경보 사이렌 금지',
  },
  CL15: {
    viewer_gain: '커튼 때문에 조종실에서는 뒤편을 볼 수 없고 시간이 흐른다',
    before_voice: '경고등의 좁은 빛에서 닫힌 커튼으로 시선을 옮긴다',
    during_voice: '커튼이 시야를 끝까지 막는다. 조명과 객실 진동의 변화로 시간 경과를 표현하되 뒤편 인물의 행동은 만들지 않는다',
    after_voice: '커튼 앞에서 인터폰 쪽으로 시선이 돌아가고 엔진 저음만 남아 다음 질문을 기다린다',
    sound: '표시등 클릭 소거→커튼 천 스침→시간 경과를 암시하는 엔진 저음; 과장된 경고음 금지',
  },
  CL16: {
    viewer_gain: '조종실의 질문에 답이 오지만 이것이 마지막 확인된 교신이다',
    before_voice: '조종실 인터폰에 시선이 모이고 질문 신호가 전달된다',
    during_voice: '응답 신호가 한 번 돌아오고 이내 멈춘다. 정확한 원문·보이지 않는 쿠퍼의 입모양은 보여주지 않는다',
    after_voice: '인터폰 잡음이 사라지고 표시등이 정지하며 계기판 쪽으로 시선을 넘긴다',
    sound: '질문 신호→짧은 응답 잡음→연결 종료→기체 저음만; 가짜 음성 대사 금지',
  },
  CL17: {
    viewer_gain: '20시 10분 무렵의 계기 변화는 움직임의 단서일 뿐 점프를 목격한 기록이 아니다',
    before_voice: '계기판의 한 바늘을 어둠 속에서 분리한다; 계기의 정확한 형식은 사실로 특정하지 않는다',
    during_voice: '시간 언급 뒤 바늘이 한 번 움직이고 즉시 멈춘다. 움직임의 원인을 확정하는 인물 컷을 붙이지 않는다',
    after_voice: '계기 링의 검은 면을 기체 외부의 빈 밤하늘로 매치 컷한다',
    sound: '기체 저음→미세한 진동 1회→짧은 절제; 점프·충돌 효과음 금지',
  },
  CL18: {
    viewer_gain: '누구도 계단 끝을 직접 보지 못했고 비행기는 계속 남쪽으로 가 리노에 착륙한다',
    before_voice: '외부 후방 계단을 비추되 사람을 배치하지 않는다',
    during_voice: '빈 계단 구조를 스친 뒤 기체 실루엣이 어두운 하늘을 건너 리노 착륙으로 시간·공간을 옮긴다',
    after_voice: '착륙 후 어두운 객실 입구가 다음 확인 장면을 받는다',
    sound: '바람과 엔진→착륙 후 기계음; 직접 점프·착지 소리 금지',
  },
  CL19: {
    viewer_gain: '리노에서 쿠퍼·돈가방이 없고 넥타이와 열린 계단이 남았다',
    before_voice: '착륙 뒤 객실 통로로 빠르게 진입한다',
    during_voice: '쿠퍼의 빈자리→돈가방 부재→남은 넥타이→빈 후방 계단을 차례로 확인한다; 아래 숲은 단정적 지형 재연이 아닌 추상 실루엣이다',
    after_voice: '넥타이의 검은 선이 지상 수색의 넓은 숲 능선으로 이어진다',
    sound: '착륙 후 기계음→비어 있는 객실 룸톤→원거리 바람',
  },
  CL20: {
    viewer_gain: '낙하산의 조종 한계·구두·불확실한 위치가 수색을 어렵게 만든다',
    before_voice: '넥타이 선을 기록물의 낙하산·구두 실루엣으로 바꾼다',
    during_voice: '조종하기 어려운 낙하산 형상과 구두를 그래픽 사실 카드로 보여주고 특정 착륙 지점은 비워 둔다',
    after_voice: '가능한 영역이 넓어지는 추상 지도에서 확정 점을 만들지 않고 숲 수색으로 전환한다',
    sound: '객실 룸톤 감쇠→종이 넘김→넓은 바람; 생존·사망 암시 효과음 금지',
  },
  CL24: {
    viewer_gain: '1980년 강변에서 소년이 낡은 지폐 뭉치를 발견한다',
    during_voice: '소년은 먼 실루엣으로만 둔다. 물결이 걷히며 지폐 모서리가 보이고 내레이션의 발견 지점에 맞춰 낡은 묶음의 일부를 공개한다',
    after_voice: '아직 액수와 일련번호는 보여주지 않은 채 젖은 지폐 묶음의 크기로 다음 샷에 연결한다',
  },
  CL25: {
    viewer_gain: '훼손된 20달러권의 총액 5,800달러를 확인하고 일련번호 대조가 시작된다',
    before_voice: '젖은 지폐 묶음의 질감에서 시작해 규모를 읽을 공간을 만든다',
    during_voice: '20달러권 묶음과 5,800달러 합계를 편집 글자로 명확히 표시한 뒤 수사 기록의 번호 열로 이동해 대조 동작을 시작한다',
    after_voice: '번호 확인의 결과는 아직 숨기고 두 표면을 나란히 둔 채 다음 샷으로 넘긴다',
    sound: '젖은 종이 마찰→기록지 펼침→번호 대조의 연필 한 획; 가짜 역사적 일련번호 금지',
  },
  CL26: {
    viewer_gain: '번호 일치로 몸값 일부임은 확인되지만 발견 장소가 착륙 지점은 아니다',
    before_voice: '지폐와 기록지의 번호 열을 같은 축으로 맞추되 실제 번호는 가짜로 만들지 않는다',
    during_voice: '일치 확인을 추상적인 선 연결과 편집 글자로 보여준 뒤 곧바로 강변을 멀리 보여 착륙 지점 단정을 차단한다',
    after_voice: '강변의 빈 공간을 다음 미해결 질문으로 넘긴다',
    sound: '짧은 종이 맞물림→원거리 강물; 확정 착륙음을 만들지 않는다',
  },
};
for (const [id, update] of Object.entries(revisions)) {
  const shot = plan.shots.find(item => item.id === id);
  if (!shot) throw new Error(`Missing ${id}`);
  Object.assign(shot, update);
}
plan.schema = 'db-cooper-270s-motion-sound-replan.v3';
plan.revision = 'v3-script-aligned-directing-preflight';
plan.parent_sha256 = createHash('sha256').update(input).digest('hex');
plan.revision_reason = 'Align each visual information reveal with the narration in its own shot, especially CL09-11, CL13-20 and CL24-26; preserve 270 seconds and the preview TTS audio.';
const value = JSON.stringify(plan, null, 2) + '\n';
try {
  if ((await readFile(outputPath, 'utf8')) !== value) throw new Error('Existing revision differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(outputPath, value, {flag: 'wx'});
}
console.log(`SCRIPT-ALIGNED PLAN READY: ${outputPath}`);
