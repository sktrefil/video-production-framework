# Standard Image Runtime (MIG-06)

This is an execution boundary, not a planner. WF-09 compiles the prompt after
Scene, Project Style and Identity Anchor readiness. The runtime never calls a
ProductionSystemAdapter and never appends style, palette or scene text.

## Integration

1. Call `SceneAssetPipeline.createImageGenerationJob` with `execution` containing
   the explicitly approved references, output relative path, dimensions, aspect
   ratio and exact MIG-03 Format Profile resource ID/version/contentHash.
   The existing prompt-only API is retained for compatibility; prompt-only jobs
   are deliberately rejected by the new runtime as incomplete.
2. Supply an `ImageProviderAdapter` with the exact provider/profile version.
   Its `generate(request)` transports the received semantic fields unchanged and
   returns image bytes plus an optional provider request ID. Credentials belong
   in the adapter's configured environment, never RuntimeJob JSON.
3. Construct `ImageRuntimeExecutor(adapter, imageFormatResolver(resourceRegistry),
   workspaceOptions)`. The resolver uses `resolvePinned`, not latest-version lookup.
4. Register it for `IMAGE_GENERATION` in `RuntimeExecutorRegistry`.
5. Use `SqliteImageRuntimeRepository` as both persistence and target-revision port
   of `RuntimeOrchestrator`. Execute with one required output:
   `{role: "image", mediaType: "IMAGE", required: true}`.
6. Run the existing WF-09 IMAGE_QC and approval workflow on the returned candidate.

Success writes file bytes, actual PNG dimensions/MIME/size/SHA-256, request IDs,
RuntimeResult, AVAILABLE MediaArtifact and CANDIDATE_AVAILABLE Asset. Asset/job/
media/receipt/outbox changes commit atomically. Approval is not performed.
Provider failure produces FAILED plus REGENERATE_REQUIRED; WF-09 retry copies
the original payload without recompiling IMAGE_PROMPT.

## Manual external

Create a MANUAL_EXTERNAL job, call `RuntimeOrchestrator.prepareManual`, then
`ImageRuntimeExecutor.prepareManual` to obtain the exact serializable job pack.
Supply the prompt/reference files to the external provider without modification.
Place its result under the project workspace and call
`importManual(job, sourceRelativePath, expectedSha256, requestId?)`, then
`RuntimeOrchestrator.ingestManualResult`. Import verifies the file SHA-256 and
dimensions; it does not prove what a human submitted to the external service.

## Supported result encoding and limitations

The initial built-in probe accepts 8-bit, non-interlaced grayscale, RGB,
grayscale-alpha and RGBA PNG, with chunk CRC and decompressed scanline validation.
JPEG/WebP, indexed PNG and interlaced PNG are explicitly rejected; no conversion
or resizing is performed. Canonical resource bytes remain unchanged. Providers
must return this supported PNG encoding for this runtime version.

`MockImageProvider` is test-only. No vendor/model has been selected or billed,
and no concrete commercial HTTP adapter is claimed as implemented. The automated
adapter interface and manual import path are implemented. Transport adapters
must independently honor provider safety policy; runtime never rewrites a blocked
prompt or attempts safety-policy bypass.

Output paths must be unique project-relative paths. Existing files are never
overwritten. Symbolic-link components are rejected. The workspace is assumed to
be trusted against concurrent hostile filesystem mutation. Reference bytes are
read once, verified and passed to the adapter without runtime reselection.

## Verification

`npm run build`, `npm run typecheck`, `npm test` and
`npm run check:repository-boundaries` run in standard CI. On a host that prohibits
tsx CLI's local IPC socket, use the same test files with:

```
node --import tsx --test packages/*/test/*.test.ts cli/vpf/test/*.test.ts
```
