import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, 'output/db-cooper-v3/review');
const scriptPath = 'D:/컴폴더/다운로드/DB_Cooper_4min30_script_v3.md';
const [scriptBytes, sceneBytes, lockBytes] = await Promise.all([
  readFile(scriptPath),
  readFile(resolve(review, 'scene-graph-candidate-v4.json')),
  readFile(resolve(review, 'script-directing-lock-v2.json')),
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const script = scriptBytes.toString('utf8');
const sceneGraph = JSON.parse(sceneBytes.toString('utf8'));
const lock = JSON.parse(lockBytes.toString('utf8'));
if (lock.development_state !== 'SCRIPT_DIRECTING_LOCKED' ||
    lock.script_hash !== sha(scriptBytes) ||
    lock.scene_graph_hash !== sha(sceneBytes) ||
    sceneGraph.scenes.length !== 7) {
  throw new Error('Script Directing Lock or source provenance mismatch');
}

const states = [
  ['실종의 결과를 모른다', '열린 후방 계단과 착륙 후 빈 객실을 본다', '원인을 따라 과거의 탑승으로 돌아간다'],
  ['평범한 항공편에 탑승한다', '쪽지와 가방의 내용, 별도 요구가 단계적으로 드러난다', '요구가 조종실에 전달된다'],
  ['요구를 받은 비행기가 시애틀에 접근한다', '돈과 낙하산을 받고 승객이 내린다', '재이륙 후 커튼이 닫힌다'],
  ['가려진 뒤쪽 객실에서 조작이 이어진다', '경고와 계기 변화가 전달되지만 점프는 목격되지 않는다', '리노 착륙 후 빈 객실과 넥타이가 남는다'],
  ['탈출 경로가 확인되지 않았다', '넓은 숲과 강을 대상으로 수색이 진행된다', '수색 결과 없이 시간이 흐른다'],
  ['오랫동안 결정적 단서가 없었다', '강변에서 20달러 지폐가 발견되고 번호가 대조된다', '돈 일부의 발견은 확인되지만 이동 경로는 미해결이다'],
  ['실종의 결말이 밝혀지지 않았다', '수사 자원 재배분과 남은 질문을 구분한다', '첫 장면의 열린 계단으로 돌아가 미해결 상태로 끝난다'],
];
const sequences = [];
const scenes = [];
let cursor = 0;
for (const [index, candidate] of sceneGraph.scenes.entries()) {
  const sceneId = `SC${String(index + 1).padStart(2, '0')}`;
  if (candidate.scene_id !== sceneId || candidate.sequence_id !== `SQ${String(index + 1).padStart(2, '0')}`) {
    throw new Error(`Scene order mismatch at ${sceneId}`);
  }
  const section = script.match(new RegExp(`^## ${sceneId} [^\\n]*\\n([\\s\\S]*?)(?=^## SC\\d{2} |^## 사실|$(?![\\s\\S]))`, 'm'));
  if (!section) throw new Error(`Missing source section ${sceneId}`);
  const heading = section[0].split('\n')[0];
  const tts = section[1].match(/^### TTS[^\n]*\n\n([\s\S]*?)(?=^### 카메라)/m)?.[1]?.trim();
  if (!tts || !script.includes(tts)) throw new Error(`Missing exact TTS segment ${sceneId}`);
  const position = script.indexOf(tts, cursor);
  if (position < cursor) throw new Error(`TTS order mismatch ${sceneId}`);
  cursor = position + tts.length;
  const title = heading.replace(/^## SC\d{2} [—–-] /, '').replace(/ \([^)]*\)$/, '');
  sequences.push({
    key: candidate.sequence_id,
    chapterKey: 'CH01',
    displayNumber: index + 1,
    title,
    storyPurpose: candidate.primary_visual_idea,
  });
  scenes.push({
    key: sceneId,
    sequenceKey: candidate.sequence_id,
    displayNumber: 1,
    scriptSegment: tts,
    stateIn: states[index][0],
    stateCurrent: states[index][1],
    stateOut: states[index][2],
    primaryVisualIdea: candidate.primary_visual_idea,
    mustBeSeen: candidate.must_be_seen,
    canBeNarrated: [title],
    canBeImplied: [],
    requiredIdentityAnchorIds: candidate.identity_anchors,
  });
}
const plan = {
  provenance: {
    scriptSha256: sha(scriptBytes),
    sceneGraphSha256: sha(sceneBytes),
    scriptDirectingLockId: lock.lock_id,
    scriptDirectingLockSha256: sha(lockBytes),
    sourceSceneCount: sceneGraph.scenes.length,
  },
  structure: {chapters: [{key: 'CH01', displayNumber: 1, title: 'D.B. 쿠퍼: 하늘에서 사라진 남자'}]},
  sequences: {sequences},
  scenes: {scenes},
};
const output = resolve(review, 'story-gate-plan-v1.json');
await writeFile(output, JSON.stringify(plan, null, 2) + '\n');
console.log(`STORY PLAN READY: ${output} (${scenes.length} exact script segments)`);
