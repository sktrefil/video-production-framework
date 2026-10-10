import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const project = resolve(root, 'output/db-cooper-v3');
const review = resolve(project, 'review');
const paths = {
  script: 'D:/컴폴더/다운로드/DB_Cooper_4min30_script_v3.md',
  tts: resolve(project, 'inputs/DB_Cooper_4min30_script_v3_TTS.txt'),
  preview: resolve(project, 'tts-preview-v1/preview-plan.json'),
  timing: resolve(project, 'tts-preview-v1/timing-report.json'),
  manifest: resolve(review, 'shot-manifest-candidate-v5.json'),
  plan: resolve(review, '270s-motion-sound-replan-v3.json'),
  scenes: resolve(review, 'scene-graph-candidate-v4.json'),
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path)])));
const script = bytes.script.toString('utf8');
const [preview, timing, manifest, plan, sceneGraph] = ['preview', 'timing', 'manifest', 'plan', 'scenes'].map(key => JSON.parse(bytes[key].toString('utf8')));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const compact = value => value.replace(/\s+/g, '');
const fail = message => {throw new Error(message);};
const checks = [];
const check = (name, condition) => {if (!condition) fail(name); checks.push(name);};
check('script_hash_matches_scene_graph', hash(bytes.script) === sceneGraph.script_sha256);
check('manifest_parent_matches_original', manifest.parent_manifest_sha256 === plan.source_manifest_sha256);
check('manifest_plan_hash_matches', manifest.directing_plan_sha256 === hash(bytes.plan));
check('scene_graph_plan_hash_matches', sceneGraph.directing_plan_sha256 === hash(bytes.plan));
check('scene_graph_manifest_hash_matches', sceneGraph.shot_manifest_candidate_sha256 === hash(bytes.manifest));
check('all_counts_match', manifest.shots.length === 30 && plan.shots.length === 30 && sceneGraph.scenes.length === 7 && timing.scenes.length === 7);
check('270_second_timeline', plan.shots.reduce((sum, shot) => sum + shot.used_seconds, 0) === 270 && manifest.target_duration_seconds === 270);
check('all_source_tts_matches_preview', compact(preview.scenes.map(scene => scene.text).join('')) === compact(bytes.tts.toString('utf8')));
check('style_is_nonrealistic', sceneGraph.style_mode === 'NON_REALISTIC_STYLIZED' && manifest.shots.every(shot => shot.i2v_prompt_en.includes('NON_REALISTIC_STYLIZED')));
let last = 0;
for (const shot of plan.shots) {
  const source = manifest.shots.find(item => item.id === shot.id);
  check(`${shot.id}_script_voice_timing`, source?.tts === shot.narrator_text && shot.voice_slot_relative.end <= shot.used_seconds && shot.timeline_start === last);
  check(`${shot.id}_directing_overlay`, source.directing_cues_v3?.viewer_gain === shot.viewer_gain && source.directing_cues_v3?.during_voice === shot.during_voice);
  last = shot.timeline_end;
}
check('timeline_end_270', last === 270);
for (const scene of sceneGraph.scenes) {
  const section = script.match(new RegExp(`## ${scene.scene_id}[^\\n]*\\n[\\s\\S]*?### TTS[^\\n]*\\n([\\s\\S]*?)\\n### 카메라`));
  if (!section) fail(`Script TTS section missing ${scene.scene_id}`);
  const spoken = manifest.shots.filter(shot => shot.scene === scene.scene_id).map(shot => shot.tts).join('');
  check(`${scene.scene_id}_script_matches_manifest`, compact(section[1]) === compact(spoken));
  const timingScene = timing.scenes.find(item => item.scene_id === scene.scene_id);
  check(`${scene.scene_id}_timing_matches_scene_graph`, scene.preview_voice_seconds_at_1p1 === timingScene.preview_seconds_at_1p1 && scene.planned_seconds === timingScene.planned_seconds);
}
check('cl01_exit_black', /검은|black/i.test(manifest.shots[0].target) && /6.?8/.test(manifest.shots[0].i2v_prompt_en));
check('cl29_uses_new_start', manifest.shots[28].image_mode === 'SINGLE' && /6.?8/.test(manifest.shots[28].start_source) && !/CL01 TARGET\/EXIT/.test(manifest.shots[28].start));
const windows = Array.from({length: 9}, (_, index) => {
  const start = index * 30, end = start + 30;
  const overlapping = plan.shots.filter(shot => shot.timeline_start < end && shot.timeline_end > start);
  return {start, end, shot_ids: overlapping.map(shot => shot.id), attention_events: overlapping.length};
});
check('each_30s_window_has_attention_changes', windows.every(window => window.attention_events >= 3));
const result = {
  schema: 'db-cooper-directing-preflight-structural-validation.v1',
  status: 'STRUCTURAL_PASS_SEMANTIC_REVIEW_SEPARATE',
  source_sha256: Object.fromEntries(Object.entries(bytes).map(([key, value]) => [key, hash(value)])),
  checks_passed: checks.length,
  windows,
  no_final_tts_or_canonical_gate_change: true,
};
const output = resolve(review, 'directing-preflight-structural-validation-v1.json');
const value = JSON.stringify(result, null, 2) + '\n';
try {
  if ((await readFile(output, 'utf8')) !== value) fail('Existing validation differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(output, value, {flag: 'wx'});
}
console.log(`STRUCTURAL PASS: ${checks.length} checks, ${windows.length} windows`);
