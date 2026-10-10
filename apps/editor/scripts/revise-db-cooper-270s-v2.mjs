import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, 'output/db-cooper-v3/review');
const input = resolve(review, '270s-motion-sound-replan-v1.json');
const output = resolve(review, '270s-motion-sound-replan-v2.json');
const notes = resolve(review, '270s-motion-sound-replan-v2.md');
const bytes = await readFile(input);
const plan = JSON.parse(bytes.toString('utf8'));
if (plan.shots.length !== 30 || plan.target_seconds !== 270) throw new Error('Unexpected base plan');
const changes = {
  CL10: {
    after_voice: '5.0초부터 좌석 등받이 세 줄이 빠르게 화면을 가리며 시선이 객실 뒤쪽으로 이동한다. 마지막에는 쿠퍼의 검은 넥타이만 남겨 다음 후방 계단 위치로 그래픽 매치한다.',
    sound: '객실 룸톤을 좌석 차폐마다 단계적으로 낮추고 마지막엔 엔진 저음만 남긴다; 가짜 대사 금지',
  },
  CL15: {
    after_voice: '5.5초 경고등 1회 점등→6.5초 그림자가 패널을 가림→8초 점등 모양이 커튼 주름으로 그래픽 매치된다. 세 정보 변화가 끝날 때까지 경고등만 반복하지 않는다.',
    sound: '경고등 클릭 한 번→엔진 저음이 짧게 비워짐→커튼 쪽 바람으로 연결; 사이렌 금지',
  },
  CL16: {
    after_voice: '커튼 앞 정지 뒤 바람에 천이 한 번 부풀고 다시 닫힌다. 관객에게 안쪽을 보여주지 않은 채 인터폰의 마지막 잡음만 남겨 다음 컷의 교신 단절로 넘긴다.',
    sound: '빠른 발소리 감쇠→천 스침 1회→인터폰 잡음 1회→짧은 절제; 뒤편 인물 소리 금지',
  },
  CL24: {
    after_voice: '6초 전에는 젖은 모래의 색 차만 보인다. 6~7초 물결이 덮었다 걷히고, 7~9초에 지폐 모서리가 또렷해지며 다음 묶음 컷으로 빠르게 넘어간다.',
    sound: '잔잔한 강물→물결 근접→젖은 종이 마찰; 발견자의 대사·손동작은 추가하지 않는다',
  },
};
for (const [id, patch] of Object.entries(changes)) {
  const shot = plan.shots.find(item => item.id === id);
  if (!shot) throw new Error(`Missing ${id}`);
  Object.assign(shot, patch);
}
plan.schema = 'db-cooper-270s-motion-sound-replan.v2';
plan.revision = 'v2-after-structural-gap-review';
plan.parent_sha256 = createHash('sha256').update(bytes).digest('hex');
plan.qc_note = 'Four long nonvoice transitions now have timed visible state changes and corresponding sound cues; the cue-card preview still cannot prove finished camera motion or SFX quality.';
const md = [
  '# D.B. Cooper 270초 연출 재설계 v2', '',
  '상태: **연출 후보, 승인 아님**. 30개 샷/270초와 음성 위치는 v1과 동일하다. 연결 시사본의 구조 검토에서 4초 이상 이어지는 비음성 구간 중 변화가 약한 네 샷을 수정했다.', '',
  '| 샷 | 수정한 화면 사건 | 음향 큐 |', '| --- | --- | --- |',
  ...Object.entries(changes).map(([id, patch]) => `| ${id} | ${patch.after_voice} | ${patch.sound} |`), '',
  '전체 샷별 시간과 나머지 행동은 `270s-motion-sound-replan-v2.json`을 따른다. 카드 시사본에서는 효과음을 실제로 삽입하지 않았으므로 음향 큐의 질감·강약은 검증되지 않았다. 실제 영상이 없으므로 카메라 움직임과 연결 품질도 아직 미검증이다.',
].join('\n');
for (const [path, data] of [[output, JSON.stringify(plan, null, 2) + '\n'], [notes, md]]) {
  try {
    const old = await readFile(path, 'utf8');
    if (old !== data) throw new Error(`Existing revision differs: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(path, data, {flag: 'wx'});
  }
}
console.log(`REVISION READY: ${output}`);
