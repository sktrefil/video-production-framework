# VPF Generic Editor

This app is the MIG-08 port of the validated Generic Editor / Remotion rendering path.

The app deliberately contains no project-specific Sado production code and no dependency on the old operational repository. `schemaVersion = 1`, `ProjectRenderer`, `GenericVideoEditor`, and `GenericFinalRender` are preserved. Unified project materialization and the production render runtime are completed by MIG-09.

## Commands

```bash
npm run build --workspace @vpf/editor-app
npm run typecheck --workspace @vpf/editor-app
npm run test --workspace @vpf/editor-app
npm run check:browser --workspace @vpf/editor-app
npm run studio --workspace @vpf/editor-app
```

`check:browser` intentionally spawns the Remotion CLI and asks it to enumerate compositions. This is the migration smoke test for child-process launch and the Remotion headless-browser connection.
