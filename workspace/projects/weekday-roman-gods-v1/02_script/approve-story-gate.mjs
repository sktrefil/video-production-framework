import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteStoryRepository } from '@vpf/storage';
import { StoryGenerationService, StoryPipeline } from '@vpf/story';

const projectId = 'weekday-roman-gods-v1';
const root = resolve('workspace/projects', projectId);
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const scripts = [1, 2, 3, 4].map((n) => readJson(`02_script/script-draft-r0${n}.json`));
const current = scripts.at(-1);
const lock = readJson('02_script/script-directing-lock-sdl-r04.json');
const qc = readJson('02_script/manager-script-qc-mqc01.json');
const skeleton = readJson('04_visual_identity/visual-skeleton-vs03.json');
const sequenceQc = readJson('04_visual_identity/sequence-qc-sqc03.json');
const brief = readFileSync(resolve(root, '01_research/research-lock-candidate.md'), 'utf8');
const units = current.units;
const unitIds = units.map((unit) => unit.unit_id);
const bodyOf = (script) => script.units.map((unit) => unit.tts_text).join('\n');

assert.equal(current.script_revision, 'r04');
assert.equal(current.script_hash, lock.script_hash);
assert.equal(qc.status, 'PASS');
assert.equal(qc.script_hash, current.script_hash);
assert.equal(skeleton.status, 'PASS');
assert.equal(skeleton.input_script_hash, current.script_hash);
assert.equal(skeleton.visual_skeleton_hash, lock.visual_skeleton_hash);
assert.equal(sequenceQc.status, 'PASS');
assert.deepEqual(unitIds, lock.locked_unit_ids);
assert.deepEqual(unitIds, skeleton.units.map((unit) => unit.unit_id));
assert.equal(units.length, 19);
assert.equal(units[0].start_sec, 0);
assert.equal(units.at(-1).end_sec, 180);
for (let index = 0; index < units.length; index += 1) {
  const unit = units[index];
  assert.equal(unit.start_sec, index === 0 ? 0 : units[index - 1].end_sec);
  assert.ok(unit.end_sec > unit.start_sec);
  assert.equal(unit.tts_text.trim().length > 0, true);
}
assert.ok(brief.includes('RESEARCH_LOCKED'));
assert.equal(lock.unresolved_revision_count, 0);
assert.equal(lock.final_tts_generated, false);

const sources = [
  ['Salzman Thursday (dies Iovis) in the Later Roman Empire', 'PAPER', 'https://www.cambridge.org/core/journals/papers-of-the-british-school-at-rome/article/thursday-dies-iovis-in-the-later-roman-empire/762662203AE6A5DB8D486D7D8D964BD6'],
  ['Liu and Shin The Acquisition of Time Words in Mandarin Chinese and Korean', 'PAPER', 'https://web.stanford.edu/group/cslipublications/cslipublications/ja-ko-contents/JK23/04Liu-Shin.pdf'],
  ['Online Etymology Dictionary Tuesday', 'WEB', 'https://www.etymonline.com/word/Tuesday'],
  ['Online Etymology Dictionary Friday', 'WEB', 'https://www.etymonline.com/word/Friday']
];
const factSources = { 'F-01': [0], 'F-02': [0], 'F-03': [0], 'F-04': [2, 3], 'F-05': [1] };
const factStatements = {
  'F-01': '로마 세계 제정기 초기에 행성 요일 관습이 확산되었다.',
  'F-02': '라틴어 요일 이름에는 달, 행성, 신명이 연결된다.',
  'F-03': '로마 세계의 7일 주간과 행성 요일은 점진적으로 정착했다.',
  'F-04': 'Monday는 달과, Tuesday는 Tiw와, Friday는 Frigg와 연결된다.',
  'F-05': '한국어 요일은 해와 달 및 오행에 연결된 천체 표기를 쓴다.'
};

const chapters = [
  ['part1', '달력에서 시작하는 질문', '일상 달력에서 로마 행성 요일의 실마리를 발견한다.'],
  ['part2', '로마의 요일 이름', '달과 화성 이름을 설명하고 이름으로 사건을 추론하지 않는다.'],
  ['part3', '다른 언어의 요일', '라틴어, 영어, 한국어의 이름 전통을 비교한다.'],
  ['part4', '오늘의 달력으로 돌아오기', '일곱 칸과 서로 다른 이름의 관계를 정리한다.']
];
const decisions = {
  async designStructure() {
    return { chapters: chapters.map(([key, title], index) => ({ key, displayNumber: index + 1, title })) };
  },
  async designSequences() {
    return { sequences: chapters.map(([key, title, storyPurpose]) => ({
      key: `sequence_${key}`, chapterKey: key, displayNumber: 1, title, storyPurpose
    })) };
  },
  async designScenes() {
    return { scenes: units.map((unit, index) => {
      const visual = skeleton.units[index];
      const previous = index === 0
        ? '현대 달력을 처음 보는 상태'
        : `컷 ${units[index - 1].unit_id}: ${skeleton.units[index - 1].transition_handoff_intent}`;
      return {
        key: unit.unit_id,
        sequenceKey: `sequence_${unit.part_id}`,
        displayNumber: units.slice(0, index + 1).filter((candidate) => candidate.part_id === unit.part_id).length,
        scriptSegment: unit.tts_text,
        stateIn: previous,
        stateCurrent: visual.story_event,
        stateOut: `컷 ${unit.unit_id}: ${visual.transition_handoff_intent}`,
        primaryVisualIdea: visual.visual_note,
        mustBeSeen: [visual.story_event],
        canBeNarrated: [],
        canBeImplied: [],
        requiredIdentityAnchorIds: []
      };
    }) };
  }
};

const mode = process.argv[2];
assert.ok(['--check', '--approve'].includes(mode), 'Use --check or --approve');
if (mode === '--check') {
  console.log(JSON.stringify({ status: 'READY', scriptRevision: 'r04', scriptHash: current.script_hash, unitCount: units.length, durationSec: 180, chapterCount: 4, sequenceCount: 4 }, null, 2));
  process.exit(0);
}

const repository = new SqliteStoryRepository(resolve(root, 'project.db'));
const clock = { nowIso: () => new Date().toISOString() };
const ids = { next: (prefix) => `${prefix}_${randomUUID()}` };
const pipeline = new StoryPipeline(repository, clock, ids);
const generation = new StoryGenerationService(repository, decisions, clock, ids);
try {
  assert.equal((await repository.listScripts(projectId)).length, 0, 'Canonical scripts already exist; inspect before rerunning');
  assert.equal((await repository.listActiveStory(projectId)).scenes.length, 0, 'Canonical scenes already exist; inspect before rerunning');
  const sourceIds = [];
  for (const [title, sourceType, url] of sources) {
    const source = await pipeline.addResearchSource({ projectId, title, sourceType, url, citation: 'Research lock RL01' });
    sourceIds.push(source.id);
  }
  for (const [factKey, indices] of Object.entries(factSources)) {
    const fact = await pipeline.addFact({ projectId, statement: factStatements[factKey], classification: 'FACT', sourceIds: indices.map((index) => sourceIds[index]) });
    await pipeline.approveFact(projectId, fact.id);
  }
  let script = await pipeline.createScript({ projectId, body: bodyOf(scripts[0]), kind: 'DRAFT' });
  for (let index = 1; index < scripts.length; index += 1) {
    script = await pipeline.reviseScript({ projectId, scriptId: script.id, body: bodyOf(scripts[index]), kind: index === 3 ? 'FINAL' : 'DRAFT' });
  }
  assert.equal(script.revision, 4);
  const scriptApproval = await pipeline.approveFinalScript({ projectId, scriptId: script.id, approvedById: 'user-story-gate-2026-10-10' });
  const graph = await generation.generate({ projectId, format: 'LONGFORM' });
  assert.equal(graph.scenes.length, 19);
  assert.deepEqual(graph.scenes.map((scene) => scene.scriptSegment), units.map((unit) => unit.tts_text));
  const structureApproval = await generation.approveStructure({ projectId, approvedById: 'user-story-gate-2026-10-10' });
  await generation.approveScenes({ projectId, sceneIds: graph.scenes.map((scene) => scene.id), approvedById: 'user-story-gate-2026-10-10' });
  const approved = await repository.listActiveStory(projectId);
  assert.equal(approved.scenes.length, 19);
  assert.ok(approved.scenes.every((scene) => scene.sceneStatus === 'APPROVED' && scene.scriptRef.scriptRevision === 4));
  const sceneGraph = {
    chapters: approved.chapters.map(({ id, revision, title, sequenceIds }) => ({ id, revision, title, sequenceIds })),
    sequences: approved.sequences.map(({ id, revision, chapterId, title, sceneIds }) => ({ id, revision, chapterId, title, sceneIds })),
    scenes: units.map((unit, index) => {
      const scene = approved.scenes.find((item) => item.scriptSegment === unit.tts_text);
      assert.ok(scene, `Approved scene missing for ${unit.unit_id}`);
      return { unitId: unit.unit_id, startSec: unit.start_sec, endSec: unit.end_sec, evidenceIds: unit.evidence_ids, ...scene };
    })
  };
  const graphRevision = 'SG01';
  const graphHash = sha256(JSON.stringify(sceneGraph));
  const report = {
    project_id: projectId,
    gate_id: 'MSTG-weekday-roman-gods-v1-01',
    status: 'PASS',
    approver: 'Agent1',
    user_authorization: 'Story Gate 승인하자',
    script_directing_lock_id: lock.lock_id,
    approved_script_id: script.id,
    approved_script_db_revision: script.revision,
    approved_script_revision: current.script_revision,
    approved_script_hash: current.script_hash,
    approved_script_body_hash: sha256(script.body),
    approved_scene_graph_revision: graphRevision,
    approved_scene_graph_hash: graphHash,
    scene_count: approved.scenes.length,
    sequence_count: approved.sequences.length,
    chapter_count: approved.chapters.length,
    script_approval_id: scriptApproval.approval.id,
    structure_approval_id: structureApproval.id,
    tts_timing_status: 'ESTIMATED_ONLY',
    final_tts_generated: false,
    completed_at: clock.nowIso()
  };
  writeFileSync(resolve(root, '02_script/approved-scene-graph-sg01.json'), `${JSON.stringify({ project_id: projectId, revision: graphRevision, hash: graphHash, ...sceneGraph }, null, 2)}\n`);
  writeFileSync(resolve(root, '02_script/manager-story-gate-mstg01.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  repository.close();
}
