# Generic Editor

MIG-08 ports the shared Remotion renderer and Studio editor from source HEAD
`bf8b5c727e522924c8c89c1e72a910e2b60b8855`.

From the unified repository root:

```sh
npm install
npm run editor:dev
npm run editor:check
npm run editor:bundle
```

The app registers `GenericVideoEditor` and `GenericFinalRender`, both using
`ProjectRenderer`. Both accept a schemaVersion 1 `project` prop. The default
fixture in `test/fixtures/edit_project.json` uses an embedded image and system
font, so preview needs no project media or network downloads. The original
generic sample is retained only for renderer/timeline contract tests.

MIG-09 owns project.db materialization, persistence, media import, subtitle
service and production render orchestration. Those controls currently report
an unconfigured API. The future host must set `globalThis.__VPF_EDITOR_API_BASE__`
before mounting Studio. No default connection to the former repository's
server is made. In-memory editing, undo/redo and rendering props remain available.
JSON is an exchange snapshot, not a new authoritative store.

Projects selecting VITRO must supply `public/shared/fonts/VITRO-CORE-TTF.ttf`
as part of their licensed runtime resources. No project-specific fonts or media
are copied in this port.

## Validation scope

The state, renderer, timeline, video, audio, subtitle, overlay, BGM/SFX,
persistence client, production gate and WF-16 checks are ported. WF-17 retains
technical QC validation and the Studio delivery contract. Assertions about the
old monolithic server and render runner belong to MIG-09; WF-18 packaging tests
also remain there. Removed server assertions are explicitly marked in the checks.
No Sado composition, old workbench or old local state is included.

MIG-08 is not accepted until dependency installation, all checks, TypeScript,
ESLint, bundle and Framework regression pass. See the migration report for
the current environment's verification results.
