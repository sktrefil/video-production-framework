import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, 'output/db-cooper-v3/review');
const paths = {
  script: 'D:/컴폴더/다운로드/DB_Cooper_4min30_script_v3.md',
  preflight: resolve(review, 'directing-preflight-sequence-qc-v3.md'),
  skeleton: resolve(review, 'visual-skeleton-v1.json'),
  scenes: resolve(review, 'scene-graph-candidate-v4.json'),
  manifest: resolve(review, 'shot-manifest-candidate-v5.json'),
  directing: resolve(review, '270s-motion-sound-replan-v3.json'),
  structural: resolve(review, 'directing-preflight-structural-validation-v1.json'),
  style: resolve(review, 'style-start-notice-v1.json'),
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path)])));
const sha = value => createHash('sha256').update(value).digest('hex');
const script = bytes.script.toString('utf8');
const skeleton = JSON.parse(bytes.skeleton.toString('utf8'));
const scenes = JSON.parse(bytes.scenes.toString('utf8'));
const manifest = JSON.parse(bytes.manifest.toString('utf8'));
const plan = JSON.parse(bytes.directing.toString('utf8'));
const structural = JSON.parse(bytes.structural.toString('utf8'));
const style = JSON.parse(bytes.style.toString('utf8'));
const unitIds = scenes.scenes.map(scene => scene.scene_id);
if (unitIds.length !== 7 || skeleton.scene_ids.join('|') !== unitIds.join('|') || plan.shots.length !== 30) throw new Error('Unit/shot mismatch');
if (scenes.script_sha256 !== sha(bytes.script) || skeleton.input_script_sha256 !== sha(bytes.script)) throw new Error('Script provenance mismatch');
if (scenes.directing_plan_sha256 !== sha(bytes.directing) || skeleton.source_scene_graph_sha256 !== sha(bytes.scenes)) throw new Error('Directing provenance mismatch');
if (scenes.shot_manifest_candidate_sha256 !== sha(bytes.manifest) || manifest.directing_plan_sha256 !== sha(bytes.directing)) throw new Error('Manifest provenance mismatch');
if (structural.status !== 'STRUCTURAL_PASS_SEMANTIC_REVIEW_SEPARATE' || structural.checks_passed !== 87) throw new Error('Structural QC missing');
if (!bytes.preflight.toString('utf8').includes('대본·30샷·Scene graph 연출 사전 검토 및 시퀀스 QC')) throw new Error('Preflight report mismatch');
if (style.style_mode !== 'NON_REALISTIC_STYLIZED') throw new Error('Style lock mismatch');
const guardSection = script.split('## 사실·연출 분리 QC')[1]?.split('**근거 자료**')[0] ?? '';
const guards = [...guardSection.matchAll(/^([1-8])\. (.+)$/gm)].map(([, number, text]) => ({id: `FACT-G${number.padStart(2, '0')}`, sha256: sha(Buffer.from(text, 'utf8'))}));
if (guards.length !== 8) throw new Error('Fact guardrail set incomplete');
const lock = {
  lock_id: 'SDL-db_cooper_1971_4m30_v3-r1',
  project_id: 'db_cooper_1971_4m30_v3',
  development_state: 'SCRIPT_DIRECTING_LOCKED',
  created_from_revision_round: 3,
  research_revision: 'fbi-primary-source-review-v1',
  script_revision: 'v3', script_hash: sha(bytes.script),
  preflight_revision: 'directing-preflight-sequence-qc-v3',
  preflight_hash: sha(bytes.preflight),
  preflight_script_revision: 'v3', preflight_input_script_hash: sha(bytes.script),
  visual_skeleton_revision: skeleton.revision,
  visual_skeleton_hash: sha(bytes.skeleton),
  visual_skeleton_script_revision: skeleton.script_revision,
  visual_skeleton_input_script_hash: skeleton.input_script_sha256,
  scene_graph_revision: scenes.revision, scene_graph_hash: sha(bytes.scenes),
  shot_manifest_revision: manifest.revision, shot_manifest_hash: sha(bytes.manifest),
  directing_plan_revision: plan.revision, directing_plan_hash: sha(bytes.directing),
  style_notice_hash: sha(bytes.style), structural_validation_hash: sha(bytes.structural),
  narrative_spine: '1971년 하늘에서 사라진 남자: 성공한 탈출인지 끝내 알 수 없는 실종인지 질문을 유지한다.',
  locked_unit_ids: unitIds, preflight_unit_ids: unitIds, visual_skeleton_unit_ids: unitIds,
  fact_guardrail_ids: guards.map(item => item.id), fact_guardrails: guards,
  script_qc_status: 'PASS', directing_preflight_status: 'PASS',
  visual_skeleton_status: 'PASS', sequence_qc_status: 'PASS', fact_status: 'PASS',
  unresolved_revision_count: 0,
  final_tts_generated: false,
  development_tts_permission: 'GRANTED',
  canonical_manager_story_gate: 'PENDING',
  specialist_self_qc: 'UNAVAILABLE_UNKNOWN_MODEL_GPT_5_6',
  agent1_override_scope: 'DEVELOPMENT_PREFLIGHT_CROSS_ARTIFACT_QC_ONLY',
  canonical_approval: false,
  invalidation_triggers: [
    'SCRIPT_MEANING_CHANGE', 'SCRIPT_HASH_MISMATCH', 'UNIT_SPLIT_MERGE_REORDER',
    'UNIT_SET_MISMATCH', 'EVIDENCE_OR_FACT_GUARDRAIL_CHANGE',
    'PREFLIGHT_INPUT_PROVENANCE_MISMATCH', 'VISUAL_SKELETON_INPUT_PROVENANCE_MISMATCH',
    'VISUAL_SKELETON_STRUCTURAL_CHANGE', 'PREFLIGHT_REOPENED',
  ],
};
const output = resolve(review, 'script-directing-lock-v1.json');
const value = JSON.stringify(lock, null, 2) + '\n';
try {
  if ((await readFile(output, 'utf8')) !== value) throw new Error('Existing lock differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(output, value, {flag: 'wx'});
}
console.log(`LOCK CANDIDATE READY: ${output}`);
