# MIG-08 — Generic Editor Port

Status: **WORK ORDER / NOT YET EXECUTED**

## WORK ITEM

`MIG-08`

## GOAL

Move the validated Generic Editor/Remotion application into the unified
repository while preserving its current rendering contracts.

## WHY

WF-14~WF-18 already target this editor. Keeping it in a second operational
repository defeats the unified framework goal.

## SOURCE

Repository:
```
sktrefil/video-production
```

Primary source:
```
Youtubu_projects/
```

## TARGET

```
apps/editor/
```

## CLASSIFICATION

```
PORT + ADAPT
```

## DEPENDENCIES

- MIG-01 ... MIG-07 PASS.

## FILES TO READ FIRST

Source:
- `Youtubu_projects/package.json`
- `Youtubu_projects/src/editor/**`
- `Youtubu_projects/src/studio/editor/**`
- `Youtubu_projects/src/Root.tsx`
- `Youtubu_projects/src/index.ts`
- `Youtubu_projects/remotion.config.ts`
- `Youtubu_projects/scripts/check-editor-*.mjs`

Target:
- `packages/editor-timeline/**`
- `docs/WF-14_IMPLEMENTATION.md`
- `docs/WF-15_IMPLEMENTATION.md`
- `docs/WF-16_IMPLEMENTATION.md`

## IN SCOPE

Port/adapt:
- GenericEditorComposition,
- ProjectRenderer,
- GenericFinalRender,
- VideoItemRenderer,
- AudioItemRenderer,
- TextItemRenderer,
- GraphicItemRenderer,
- Studio editor state/reducer/selector,
- timeline UI,
- subtitle/audio/overlay panels needed by Generic Editor,
- media source resolver,
- Remotion root/config,
- editor regression checks,
- dependencies required by these generic paths.

### Schema

Preserve:
```
schemaVersion = 1
```

Item types:
```
VIDEO
IMAGE
TTS
CLIP_AUDIO
BGM
SFX
SUBTITLE
TEXT
GRAPHIC
```

Track types:
```
VIDEO
AUDIO
TEXT
GRAPHIC
```

### Motion

Preserve deterministic IMAGE:
```
motion.from
motion.to
easing
```

Preview and Final Render must use the same ProjectRenderer.

## OUT OF SCOPE

- project-specific Sado editor,
- migration scripts specific only to Sado,
- old history audio workstations outside Generic Editor,
- editor materialization/render path rewrite beyond minimum needed to make the
  port build; full runtime handoff is MIG-09.

## PORT ITEMS

Port generic source with minimal behavior changes.

## ADAPT ITEMS

Adapt:
- package/workspace paths,
- public path assumptions,
- scripts/root resolution,
- generated active-project lookup,
- dependency declarations,
- unified CI commands.

## NEW BUILD ITEMS

Only integration glue required to:
- register the editor app in root build,
- accept future materialized unified projects,
- expose stable app commands.

Do not redesign editor features in this migration.

## LEGACY / DO NOT PORT

Exclude from canonical production app:
- `src/sado_prince/**`,
- Sado-specific generated manifests,
- Sado migration script,
- old `.local` project state,
- user asset examples,
- historical test project media.

They may be retained as external fixtures only when legally/technically needed.

## CONTRACTS THAT MUST NOT CHANGE

- Generic Editor schemaVersion 1.
- existing renderer routing.
- V1 visual duration authority.
- image motion semantics.
- WF-16 track mapping.
- Preview/Final shared ProjectRenderer.
- production gate remains later acceptance boundary.

## IMPLEMENTATION STEPS

1. Inventory Generic vs project-specific files.
2. Copy Generic Editor app into `apps/editor`.
3. Rebuild imports and package paths.
4. Register app with root workspace/build strategy.
5. Port editor check scripts.
6. Replace source-repo root assumptions with app/unified workspace resolver
   interfaces, but defer full materializer implementation to MIG-09.
7. Create a small schemaVersion 1 fixture inside target tests.
8. Run editor state/renderer/timeline/video/audio/subtitle/overlay checks.
9. Run TypeScript/ESLint.
10. Run Remotion bundle.
11. Run Framework editor-timeline contract regression.
12. Verify no Sado production dependency.

## TESTS

At minimum port/run:
- editor-state,
- editor-renderer,
- editor-timeline,
- editor-video,
- editor-audio,
- editor-subtitles,
- editor-overlays,
- editor-bgm-sfx,
- editor-persistence,
- editor-production,
- WF16/WF17/WF18-compatible checks where still applicable,
- Remotion bundle.

## ACCEPTANCE CRITERIA

```
Generic Editor opens/builds from unified repo       PASS
schemaVersion 1                                     PASS
ProjectRenderer                                     PASS
GenericFinalRender registration                     PASS
image motion                                        PASS
audio/text/graphic routing                          PASS
Remotion bundle                                     PASS
Sado production dependency                          ZERO
old repo operational dependency                     ZERO
Framework regression                                PASS
```

## ROLLBACK

Remove `apps/editor` port and root wiring, return to MIG-07 accepted HEAD.
Source editor remains intact in old repository.

## BRANCH

```
migration/mig-08-generic-editor
```

## NEXT

```
MIG-09 — Editor Materialization + Render Runtime
```
