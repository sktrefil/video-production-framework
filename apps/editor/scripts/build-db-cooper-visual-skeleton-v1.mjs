import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const review = resolve(root, 'output/db-cooper-v3/review');
const paths = {
  script: 'D:/컴폴더/다운로드/DB_Cooper_4min30_script_v3.md',
  plan: resolve(review, '270s-motion-sound-replan-v3.json'),
  scenes: resolve(review, 'scene-graph-candidate-v4.json'),
  manifest: resolve(review, 'shot-manifest-candidate-v5.json'),
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path)])));
const plan = JSON.parse(bytes.plan.toString('utf8'));
const graph = JSON.parse(bytes.scenes.toString('utf8'));
const manifest = JSON.parse(bytes.manifest.toString('utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
if (plan.shots.length !== 30 || graph.scenes.length !== 7) throw new Error('Source counts mismatch');
const skeleton = {
  schema: 'db-cooper-visual-skeleton.v1',
  project_id: graph.project_id,
  revision: 'visual-skeleton-v1-script-aligned',
  status: 'DEVELOPMENT_REVIEW_PASS_MANAGER_ONLY_NOT_CANONICAL',
  style_mode: 'NON_REALISTIC_STYLIZED',
  script_revision: graph.script_revision,
  input_script_sha256: sha256(bytes.script),
  source_scene_graph_sha256: sha256(bytes.scenes),
  source_shot_manifest_sha256: sha256(bytes.manifest),
  source_directing_plan_sha256: sha256(bytes.plan),
  scene_ids: graph.scenes.map(scene => scene.scene_id),
  scenes: graph.scenes.map(scene => ({
    id: scene.scene_id,
    sequence_id: scene.sequence_id,
    expected_duration_seconds: scene.planned_seconds,
    story_event: scene.primary_visual_idea,
    attention_events: scene.must_be_seen,
    identity_anchors: scene.identity_anchors,
    visual_mode: 'GRAPHIC_2D_INK_NOIR_WITH_KINETIC_CAMERA_AND_ABSTRACT_UNCERTAINTY',
    shots: plan.shots.filter(shot => shot.scene_id === scene.scene_id).map(shot => {
      const source = manifest.shots.find(item => item.id === shot.id);
      if (!source) throw new Error(`Missing ${shot.id}`);
      return {
        id: shot.id,
        expected_duration_seconds: shot.used_seconds,
        story_event: shot.narrator_text,
        visual_mode: source.image_mode,
        scale_intent: source.camera,
        attention_event: shot.viewer_gain,
        transition_handoff: `${source.transition}: ${source.exit}`,
        abstraction_handling: source.fact_guard,
        sound_cue: shot.sound,
      };
    }),
  })),
  canonical_approval: false,
};
const output = resolve(review, 'visual-skeleton-v1.json');
const value = JSON.stringify(skeleton, null, 2) + '\n';
try {
  if ((await readFile(output, 'utf8')) !== value) throw new Error('Existing skeleton differs');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(output, value, {flag: 'wx'});
}
console.log(`VISUAL SKELETON READY: ${output}`);
