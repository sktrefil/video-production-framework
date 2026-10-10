import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, 'output/db-cooper-v3/review');
const sourcePath = resolve(review, 'scene-graph-candidate-v3.json');
const timingPath = resolve(review, '270s-motion-sound-replan-v3.json');
const manifestPath = resolve(review, 'shot-manifest-candidate-v5.json');
const outputPath = resolve(review, 'scene-graph-candidate-v4.json');
const [source, timingBytes, manifestBytes] = await Promise.all([readFile(sourcePath), readFile(timingPath), readFile(manifestPath)]);
const sceneGraph = JSON.parse(source.toString('utf8'));
const timing = JSON.parse(timingBytes.toString('utf8'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (sceneGraph.scenes.length !== 7 || timing.scenes.length !== 7 || manifest.shots.length !== 30) throw new Error('Unexpected source counts');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
sceneGraph.revision = 'scene-candidate-v4-script-aligned';
sceneGraph.status = 'DIRECTING_REVISION_CANDIDATE';
sceneGraph.canonical_approval = false;
sceneGraph.timing_basis = 'SEVEN_SCENE_PREVIEW_TTS_ALIGNED_AT_1P1';
sceneGraph.parent_scene_graph_sha256 = sha256(source);
sceneGraph.directing_plan_sha256 = sha256(timingBytes);
sceneGraph.shot_manifest_candidate_sha256 = sha256(manifestBytes);
for (const scene of sceneGraph.scenes) {
  const measured = timing.scenes.find(item => item.id === scene.scene_id);
  if (!measured) throw new Error(`Missing ${scene.scene_id}`);
  scene.planned_seconds = measured.planned_seconds;
  scene.preview_voice_seconds_at_1p1 = measured.measured_preview_voice_seconds;
  scene.directed_nonvoice_seconds = measured.nonvoice_design_seconds;
  scene.timing_evidence = '270s-motion-sound-replan-v3.json';
  scene.approval_state = 'CANDIDATE_TIMING_MEASURED';
}
sceneGraph.blocking_issues = [
  'The 270-second timing preview has cue cards rather than produced shots; production visual QC follows the Story Gate.',
  'The native story/audio and visual/clip role runtime returned Unknown model gpt-5.6; Agent1 must record any explicit development-workflow override.',
  'Script Directing Lock and canonical Story Gate have not been approved.',
];
sceneGraph.manager_story_gate = 'NOT_ADVANCED';
const value = JSON.stringify(sceneGraph, null, 2) + '\n';
try {
  if ((await readFile(outputPath, 'utf8')) !== value) throw new Error('Existing revision differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(outputPath, value, {flag: 'wx'});
}
console.log(`SCENE CANDIDATE READY: ${outputPath}`);
