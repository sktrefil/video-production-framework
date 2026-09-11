# TEST-11 Result — Legacy Isolation Hardening

Status: PASS

Branch: `validation/full-system-v1`
Validated code lineage includes TEST-10 repair HEAD `e1f3aee5002f58eed2a05eb2fe94a8155511bcb9` and validation status HEAD `c6167d5d8db7d41a2913e3be081a2d5ef73bfe94`.

## Attack coverage

- Missing, malformed, legacy-enabled and legacy-pipeline project policies fail closed with `LEGACY_RUNTIME_FORBIDDEN`.
- Runtime executor registration/execution rejects legacy provider/control-plane/resource references before state transition.
- Resource Registry rejects legacy resource IDs, nested legacy operational references and resource symlink escapes.
- Workspace helpers reject traversal, absolute project-relative paths, sibling-prefix escapes and unsafe project IDs.
- Filesystem isolation rejects symlink escapes before unsafe resource/media consumption.
- Image runtime rejects symlinked references and legacy provider execution identifiers before provider adapter invocation while leaving semantic prompt prose untouched.
- Generic Editor materialization rejects legacy project renderer references and symlinked media.
- Unified CLI rejects legacy control-plane and old-repository execution commands before dispatch.
- Manual audio import now validates explicit unified project policy before source stat/probe/hash/copy. TEST-10 added a regression proving a missing/legacy policy wins even when the source file itself is missing.
- `scripts/check-no-legacy-paths.mjs` scans production packages/runtimes/apps/cli/resources/scripts/workflows for known legacy categories and old repository absolute paths; root `npm test` runs this boundary gate.

## CI evidence

- Code repair run `34550382779`: Node 22/24 build + typecheck + full `npm test` PASS; E2E PASS; pilot-readiness PASS.
- Validation status run `34550618495` on `c6167d5d8db7d41a2913e3be081a2d5ef73bfe94`: E2E PASS, pilot-readiness PASS, Node 24 build/typecheck/full test PASS, Node 22 build/typecheck/full test PASS.

## Repair activity

No additional TEST-11 source defect was found after the TEST-10 audio-import ordering fix. Isolation policy was not weakened.

## Acceptance

No tested unified path can consume legacy decision state or escape approved workspace/resource boundaries.

Result: PASS
